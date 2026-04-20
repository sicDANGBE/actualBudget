import type { ActualBridgeClient } from '#actual/actual-client';
import {
  deterministicTransactionKey,
  extractTransactions,
  importedId,
  mapEnableBankingTransaction,
} from '#actual/mapper';
import type { EnableBankingClient } from '#enablebanking/client';
import { ValidationError } from '#errors';
import type { BridgeDatabase } from '#storage/database';
import type { SyncResult } from '#types';

function syncWindow(lastSuccessAt?: string) {
  const to = new Date();
  const from = lastSuccessAt
    ? new Date(lastSuccessAt)
    : new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
  from.setDate(from.getDate() - 7);
  return {
    date_from: from.toISOString().slice(0, 10),
    date_to: to.toISOString().slice(0, 10),
  };
}

export class BridgeSyncService {
  constructor(
    private readonly database: BridgeDatabase,
    private readonly enableBankingClient: EnableBankingClient,
    private readonly actualClient: ActualBridgeClient,
  ) {}

  async syncAccount(bankAccountId: string): Promise<SyncResult> {
    const account = this.database.getBankAccount(bankAccountId);
    if (!account) {
      throw new ValidationError(`Unknown bank account: ${bankAccountId}`);
    }
    if (!account.actualAccountId) {
      throw new ValidationError(
        `Bank account ${bankAccountId} is not mapped to an Actual account.`,
      );
    }
    if (!this.database.acquireAccountLock(bankAccountId, 15 * 60)) {
      return {
        accountId: bankAccountId,
        status: 'skipped',
        imported: 0,
        updated: 0,
        skipped: 1,
        error: 'Sync already running for this bank account.',
      };
    }
    const runId = this.database.createSyncRun(bankAccountId);
    try {
      const fetched = [];
      let continuationKey: string | undefined;
      do {
        const response = await this.enableBankingClient.getTransactions(
          bankAccountId,
          {
            ...syncWindow(account.lastSuccessAt),
            continuation_key: continuationKey,
          },
        );
        fetched.push(...extractTransactions(response));
        continuationKey = response.continuation_key;
      } while (continuationKey);

      const transactions = fetched.map(transaction =>
        mapEnableBankingTransaction({
          bankAccountId,
          actualAccountId: account.actualAccountId as string,
          transaction,
        }),
      );

      if (transactions.length === 0) {
        const result: SyncResult = {
          accountId: bankAccountId,
          status: 'success',
          imported: 0,
          updated: 0,
          skipped: 0,
        };
        this.database.finishSyncRun(runId, result);
        return result;
      }

      const reconcile = await this.actualClient.importTransactions(
        account.actualAccountId,
        transactions,
      );

      for (const transaction of fetched) {
        this.database.recordImportedTransaction({
          importedId: importedId(bankAccountId, transaction),
          bankAccountId,
          bankTransactionKey: deterministicTransactionKey(
            bankAccountId,
            transaction,
          ),
          status: transaction.status ?? 'unknown',
        });
      }

      const result: SyncResult = {
        accountId: bankAccountId,
        status: 'success',
        imported: reconcile.added?.length ?? 0,
        updated: reconcile.updated?.length ?? 0,
        skipped: Math.max(
          0,
          transactions.length -
            (reconcile.added?.length ?? 0) -
            (reconcile.updated?.length ?? 0),
        ),
      };
      this.database.finishSyncRun(runId, result);
      return result;
    } catch (error) {
      const result: SyncResult = {
        accountId: bankAccountId,
        status: 'failed',
        imported: 0,
        updated: 0,
        skipped: 0,
        error: error instanceof Error ? error.message : 'Unknown sync error',
      };
      this.database.finishSyncRun(runId, result);
      return result;
    } finally {
      this.database.releaseAccountLock(bankAccountId);
    }
  }

  async syncAll(): Promise<SyncResult[]> {
    const mappedAccounts = this.database
      .listBankAccounts()
      .filter(account => Boolean(account.actualAccountId));
    const results: SyncResult[] = [];
    for (const account of mappedAccounts) {
      results.push(await this.syncAccount(account.id));
    }
    return results;
  }
}
