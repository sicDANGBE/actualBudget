// @ts-strict-ignore

import * as connection from '#platform/server/connection';
import { logger } from '#platform/server/log';
import * as db from '#server/db';
import { incrFetch, whereIn } from '#server/db/util';
import { batchMessages } from '#server/sync';
import { isNonProductionEnvironment } from '#shared/environment';
import type { Diff } from '#shared/util';
import type { PayeeEntity, TransactionEntity } from '#types/models';

import * as rules from './transaction-rules';
import * as transfer from './transfer';

function logTransactionCategoryServerDebug(
  event: string,
  payload: Record<string, unknown>,
) {
  if (!isNonProductionEnvironment()) {
    return;
  }

  logger.debug(`[category-debug/server][transactions] ${event}`, payload);
}

async function idsWithChildren(ids: string[]) {
  const whereIds = whereIn(ids, 'parent_id');
  const rows = await db.all<Pick<db.DbViewTransactionInternal, 'id'>>(
    `SELECT id FROM v_transactions_internal WHERE ${whereIds}`,
  );
  const set = new Set(ids);
  for (const row of rows) {
    set.add(row.id);
  }
  return [...set];
}

async function getTransactionsByIds(
  ids: string[],
): Promise<TransactionEntity[]> {
  // TODO: convert to whereIn
  //
  // or better yet, use ActualQL
  return incrFetch(
    (query, params) => db.selectWithSchema('transactions', query, params),
    ids,

    id => `id = '${id}'`,
    where => `SELECT * FROM v_transactions_internal WHERE ${where}`,
  );
}

async function resolveTransactionReferenceIds(
  transaction: Partial<TransactionEntity>,
) {
  let mappedCategory = transaction.category;
  let mappedPayee = transaction.payee;

  if (mappedCategory != null) {
    const categoryMapping = await db.first<Pick<db.DbCategoryMapping, 'id'>>(
      'SELECT id FROM category_mapping WHERE transferId = ?',
      [mappedCategory],
    );

    if (categoryMapping?.id) {
      mappedCategory = categoryMapping.id;
    } else {
      const category = await db.first<Pick<db.DbCategory, 'id'>>(
        'SELECT id FROM categories WHERE id = ? AND tombstone = 0',
        [mappedCategory],
      );

      if (category?.id) {
        await db.insert('category_mapping', {
          id: category.id,
          transferId: category.id,
        });
      }
    }
  }

  if (mappedPayee != null) {
    const payeeMapping = await db.first<Pick<db.DbPayeeMapping, 'id'>>(
      'SELECT id FROM payee_mapping WHERE targetId = ?',
      [mappedPayee],
    );

    if (payeeMapping?.id) {
      mappedPayee = payeeMapping.id;
    } else {
      const payee = await db.first<Pick<db.DbPayee, 'id'>>(
        'SELECT id FROM payees WHERE id = ? AND tombstone = 0',
        [mappedPayee],
      );

      if (payee?.id) {
        await db.insert('payee_mapping', {
          id: payee.id,
          targetId: payee.id,
        });
      }
    }
  }

  return {
    ...transaction,
    ...(transaction.category !== undefined ? { category: mappedCategory } : {}),
    ...(transaction.payee !== undefined ? { payee: mappedPayee } : {}),
  };
}

export async function batchUpdateTransactions({
  added,
  deleted,
  updated,
  learnCategories = false,
  detectOrphanPayees = true,
  runTransfers = true,
}: Partial<Diff<TransactionEntity>> & {
  learnCategories?: boolean;
  detectOrphanPayees?: boolean;
  runTransfers?: boolean;
}) {
  // Track the ids of each type of transaction change (see below for why)
  let addedIds = [];
  const updatedIds = updated ? updated.map(u => u.id) : [];
  const deletedIds = deleted
    ? await idsWithChildren(deleted.map(d => d.id))
    : [];

  const oldPayees = new Set<PayeeEntity['id']>();
  const accounts = await db.all<db.DbAccount>(
    'SELECT * FROM accounts WHERE tombstone = 0',
  );

  logTransactionCategoryServerDebug('batchUpdateTransactions:request', {
    learnCategories,
    detectOrphanPayees,
    runTransfers,
    added,
    updated,
    deleted,
  });

  // We need to get all the payees of updated transactions _before_
  // making changes
  if (updated) {
    const descUpdatedIds = updated
      .filter(update => update.payee)
      .map(update => update.id);

    const transactions = await getTransactionsByIds(descUpdatedIds);

    for (let i = 0; i < transactions.length; i++) {
      oldPayees.add(transactions[i].payee);
    }
  }

  // Apply all the updates. We can batch this now! This is important
  // and makes bulk updates much faster
  await batchMessages(async () => {
    if (added) {
      addedIds = await Promise.all(
        added.map(async t => {
          const resolvedTransaction = await resolveTransactionReferenceIds(t);

          // Offbudget account transactions and parent transactions should not have categories.
          const account = accounts.find(
            acct => acct.id === resolvedTransaction.account,
          );
          logTransactionCategoryServerDebug(
            'batchUpdateTransactions:add:before',
            {
              transactionId: resolvedTransaction.id,
              accountId: resolvedTransaction.account,
              offbudget: account?.offbudget === 1,
              isParent: resolvedTransaction.is_parent,
              category: resolvedTransaction.category,
              originalCategory: t.category,
              originalPayee: t.payee,
              transaction: resolvedTransaction,
            },
          );
          if (resolvedTransaction.is_parent || account?.offbudget === 1) {
            resolvedTransaction.category = null;
          }
          logTransactionCategoryServerDebug(
            'batchUpdateTransactions:add:after',
            {
              transactionId: resolvedTransaction.id,
              category: resolvedTransaction.category,
              transaction: resolvedTransaction,
            },
          );
          return db.insertTransaction(resolvedTransaction);
        }),
      );
    }

    if (deleted) {
      await Promise.all(
        // It's important to use `deletedIds` and not `deleted` here
        // because we've expanded it to include children above. The
        // inconsistency of the delete APIs is annoying and should
        // be fixed (it should only take an id)
        deletedIds.map(async id => {
          await db.deleteTransaction({ id });
        }),
      );
    }

    if (updated) {
      await Promise.all(
        updated.map(async t => {
          const resolvedTransaction = await resolveTransactionReferenceIds(t);
          const originalTransaction =
            await db.first<db.DbViewTransactionInternal>(
              'SELECT * FROM v_transactions_internal WHERE id = ?',
              [resolvedTransaction.id],
            );
          logTransactionCategoryServerDebug(
            'batchUpdateTransactions:update:before',
            {
              transactionId: resolvedTransaction.id,
              patch: resolvedTransaction,
              originalPatch: t,
              originalCategory: originalTransaction?.category,
              originalAccountId: originalTransaction?.account,
              originalTransaction,
            },
          );
          if (resolvedTransaction.account) {
            // Moving transactions off budget should always clear the
            // category. Parent transactions should not have categories.
            const account = accounts.find(
              acct => acct.id === resolvedTransaction.account,
            );
            logTransactionCategoryServerDebug(
              'batchUpdateTransactions:update:accountCheck',
              {
                transactionId: resolvedTransaction.id,
                accountId: resolvedTransaction.account,
                offbudget: account?.offbudget === 1,
                isParent: resolvedTransaction.is_parent,
                categoryBeforeNormalization: resolvedTransaction.category,
              },
            );
            if (resolvedTransaction.is_parent || account?.offbudget === 1) {
              resolvedTransaction.category = null;
            }
          }

          logTransactionCategoryServerDebug(
            'batchUpdateTransactions:update:write',
            {
              transactionId: resolvedTransaction.id,
              patch: resolvedTransaction,
            },
          );
          await db.updateTransaction(resolvedTransaction);
          const persistedTransaction =
            await db.first<db.DbViewTransactionInternal>(
              'SELECT * FROM v_transactions_internal WHERE id = ?',
              [resolvedTransaction.id],
            );
          logTransactionCategoryServerDebug(
            'batchUpdateTransactions:update:afterWrite',
            {
              transactionId: resolvedTransaction.id,
              persistedCategory: persistedTransaction?.category,
              persistedTransferId: persistedTransaction?.transfer_id,
              persistedTransaction,
            },
          );
        }),
      );
    }
  });

  // Get all of the full transactions that were changed. This is
  // needed to run any cascading logic that depends on the full
  // transaction. Things like transfers, analyzing rule updates, and
  // more
  const allAdded = await getTransactionsByIds(addedIds);
  const allUpdated = await getTransactionsByIds(updatedIds);
  const allDeleted = await getTransactionsByIds(deletedIds);

  logTransactionCategoryServerDebug('batchUpdateTransactions:postWrite', {
    addedIds,
    updatedIds,
    deletedIds,
    allAdded,
    allUpdated,
    allDeleted,
  });

  // Post-processing phase: first do any updates to transfers.
  // Transfers update the transactions and we need to return updates
  // to the client so that can apply them. Note that added
  // transactions just return the full transaction.
  const resultAdded = allAdded;
  const resultUpdated = allUpdated;
  let transfersUpdated: Awaited<ReturnType<typeof transfer.onUpdate>>[];

  if (runTransfers) {
    await batchMessages(async () => {
      await Promise.all(allAdded.map(t => transfer.onInsert(t)));

      // Return any updates from here
      transfersUpdated = (
        await Promise.all(allUpdated.map(t => transfer.onUpdate(t)))
      ).filter(Boolean);
      logTransactionCategoryServerDebug(
        'batchUpdateTransactions:transferUpdates',
        {
          transfersUpdated,
        },
      );

      await Promise.all(allDeleted.map(t => transfer.onDelete(t)));
    });
  }

  if (learnCategories) {
    // Analyze any updated categories and update rules to learn from
    // the user's activity
    const ids = new Set([
      ...(added ? added.filter(add => add.category).map(add => add.id) : []),
      ...(updated
        ? updated.filter(update => update.category).map(update => update.id)
        : []),
    ]);
    await rules.updateCategoryRules(
      allAdded.concat(allUpdated).filter(trans => ids.has(trans.id)),
    );
    logTransactionCategoryServerDebug(
      'batchUpdateTransactions:learnCategories',
      {
        ids: [...ids],
        learnedTransactions: allAdded
          .concat(allUpdated)
          .filter(trans => ids.has(trans.id)),
      },
    );
  }

  if (detectOrphanPayees) {
    // Look for any orphaned payees and notify the user about merging
    // them

    if (updated) {
      const newPayeeIds = updated.map(u => u.payee).filter(Boolean);
      if (newPayeeIds.length > 0) {
        const allOrphaned = new Set(await db.getOrphanedPayees());

        const orphanedIds = [...oldPayees].filter(id => allOrphaned.has(id));

        if (orphanedIds.length > 0) {
          connection.send('orphaned-payees', {
            orphanedIds,
            updatedPayeeIds: newPayeeIds,
          });
        }
      }
    }
  }

  return {
    added: resultAdded,
    updated: runTransfers ? transfersUpdated : resultUpdated,
    deleted: allDeleted,
    errors: ((added || []) as Partial<TransactionEntity>[])
      .concat(updated || [])
      .flatMap(t => t._ruleErrors || []),
  };
}
