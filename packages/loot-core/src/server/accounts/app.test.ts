import * as db from '#server/db';
import { loadMappings } from '#server/db/mappings';
import * as prefs from '#server/prefs';
import { loadRules } from '#server/transactions/transaction-rules';

import { app } from './app';

beforeEach(async () => {
  await global.emptyDatabase()();
  await loadMappings();
  await loadRules();
  await prefs.loadPrefs();
});

describe('account-create', () => {
  test('creates a local account with imported transactions and computes the starting balance', async () => {
    await db.insertCategoryGroup({
      id: 'income-group',
      is_income: 1,
      name: 'Income',
    });
    await db.insertCategory({
      cat_group: 'income-group',
      id: 'starting-balances-category',
      is_income: 1,
      name: 'Starting Balances',
    });

    const id = await app.handlers['account-create']({
      importedBalance: 100,
      importedTransactions: [
        {
          amount: -500,
          date: '2024-01-03',
          payee_name: 'Coffee Shop',
        },
        {
          amount: 2500,
          date: '2024-01-05',
          payee_name: 'Employer',
        },
      ],
      name: 'Imported Checking',
      offBudget: false,
    });

    const transactions = await db.all<
      Pick<db.DbTransaction, 'amount' | 'date' | 'starting_balance_flag'>
    >(
      `SELECT amount, date, starting_balance_flag
         FROM transactions
        WHERE acct = ?
        ORDER BY date ASC, starting_balance_flag DESC, amount ASC`,
      [id],
    );

    expect(transactions).toEqual([
      {
        amount: 8000,
        date: 20240103,
        starting_balance_flag: 1,
      },
      {
        amount: -500,
        date: 20240103,
        starting_balance_flag: 0,
      },
      {
        amount: 2500,
        date: 20240105,
        starting_balance_flag: 0,
      },
    ]);

    const balance = await app.handlers['account-balance']({
      cutoff: '2024-01-31',
      id,
    });
    expect(balance).toBe(10000);
  });

  test('uses the renamed starting balance category when present', async () => {
    await db.insertCategoryGroup({
      id: 'income-group',
      is_income: 1,
      name: 'Revenus',
    });
    await db.insertCategory({
      cat_group: 'income-group',
      id: 'starting-balances-category',
      is_income: 1,
      name: 'Solde initial',
    });

    const id = await app.handlers['account-create']({
      balance: 100,
      name: 'Renamed Starting Balance Account',
      offBudget: false,
    });

    const transaction = await db.first<
      Pick<db.DbTransaction, 'amount' | 'category' | 'starting_balance_flag'>
    >(
      `SELECT amount, category, starting_balance_flag
         FROM transactions
        WHERE acct = ?
        ORDER BY date ASC, starting_balance_flag DESC, amount ASC
        LIMIT 1`,
      [id],
    );

    expect(transaction).toEqual({
      amount: 10000,
      category: 'starting-balances-category',
      starting_balance_flag: 1,
    });
  });
});
