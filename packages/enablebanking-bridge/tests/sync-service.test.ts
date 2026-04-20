import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import { BridgeDatabase } from '../src/storage/database.js';
import { BridgeSyncService } from '../src/sync/sync-service.js';

describe('BridgeSyncService', () => {
  it('imports fetched transactions through Actual using stable imported ids', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'enablebanking-sync-'));
    const database = new BridgeDatabase(join(dir, 'bridge.db'));
    database.upsertSession({
      id: 'session-1',
      status: 'AUTHORIZED',
      accounts: ['bank-1'],
    });
    database.upsertBankAccount({
      id: 'bank-1',
      sessionId: 'session-1',
      details: { name: 'Checking', currency: 'EUR' },
    });
    database.setAccountMapping('bank-1', 'actual-1');

    const enableBankingClient = {
      getTransactions: async () => ({
        transactions: [
          {
            entry_reference: 'tx-1',
            booking_date: '2026-04-20',
            credit_debit_indicator: 'DBIT',
            transaction_amount: { amount: '4.20', currency: 'EUR' },
            creditor: { name: 'Cafe' },
            status: 'BOOK',
          },
        ],
      }),
    };
    const actualClient = {
      importTransactions: async (
        _accountId: string,
        transactions: unknown[],
      ) => {
        expect(transactions).toEqual([
          expect.objectContaining({
            imported_id: 'enablebanking:bank-1:tx-1',
            amount: -420,
          }),
        ]);
        return { added: ['actual-tx-1'], updated: [] };
      },
    };

    const service = new BridgeSyncService(
      database,
      enableBankingClient as never,
      actualClient as never,
    );
    await expect(service.syncAccount('bank-1')).resolves.toMatchObject({
      status: 'success',
      imported: 1,
      updated: 0,
    });
    database.close();
  });
});
