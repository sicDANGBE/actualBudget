import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import { BridgeDatabase } from '../src/storage/database.js';

describe('BridgeDatabase', () => {
  it('persists sessions, accounts, mappings and sync runs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'enablebanking-db-'));
    const database = new BridgeDatabase(join(dir, 'bridge.db'));
    database.upsertSession({
      id: 'session-1',
      status: 'AUTHORIZED',
      accounts: ['account-1'],
      aspsp: { name: 'Sandbox', country: 'FI' },
    });
    database.upsertBankAccount({
      id: 'account-1',
      sessionId: 'session-1',
      details: {
        name: 'Checking',
        currency: 'EUR',
        identification_hash: 'hash-1',
      },
    });
    database.setAccountMapping('account-1', 'actual-1');
    const runId = database.createSyncRun('account-1');
    database.finishSyncRun(runId, {
      accountId: 'account-1',
      status: 'success',
      imported: 1,
      updated: 0,
      skipped: 0,
    });

    expect(database.listSessions()).toHaveLength(1);
    expect(database.getBankAccount('account-1')).toMatchObject({
      actualAccountId: 'actual-1',
      currency: 'EUR',
    });
    expect(database.listSyncRuns(1)[0]).toMatchObject({
      status: 'success',
      importedCount: 1,
    });
    database.close();
  });
});
