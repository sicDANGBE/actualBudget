import { mkdirSync } from 'fs';
import { dirname } from 'path';

import Database from 'better-sqlite3';

import type {
  AccountDetails,
  SessionResource,
  StoredBankAccount,
  SyncResult,
} from '#types';

type SqliteDatabase = Database.Database;

export type AuthStateRow = {
  state: string;
  authorizationId?: string;
  status: string;
  createdAt: string;
  expiresAt: string;
};

export type SyncRunRow = {
  id: number;
  bankAccountId?: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  error?: string;
};

export class BridgeDatabase {
  private readonly db: SqliteDatabase;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  close() {
    this.db.close();
  }

  private migrate() {
    const version = this.db.pragma('user_version', {
      simple: true,
    }) as number;
    if (version < 1) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS bridge_config (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS auth_states (
          state TEXT PRIMARY KEY,
          authorization_id TEXT,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          aspsp_name TEXT,
          aspsp_country TEXT,
          psu_type TEXT,
          valid_until TEXT,
          raw_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS bank_accounts (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          name TEXT,
          currency TEXT,
          identification_hash TEXT,
          actual_account_id TEXT,
          last_success_at TEXT,
          last_failure_at TEXT,
          last_error TEXT,
          sync_lock_until TEXT,
          raw_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS sync_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          bank_account_id TEXT,
          status TEXT NOT NULL,
          started_at TEXT NOT NULL,
          finished_at TEXT,
          imported_count INTEGER NOT NULL DEFAULT 0,
          updated_count INTEGER NOT NULL DEFAULT 0,
          skipped_count INTEGER NOT NULL DEFAULT 0,
          error TEXT,
          FOREIGN KEY(bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS imported_transactions (
          imported_id TEXT PRIMARY KEY,
          bank_account_id TEXT NOT NULL,
          bank_transaction_key TEXT NOT NULL,
          status TEXT NOT NULL,
          booked_imported_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(bank_account_id) REFERENCES bank_accounts(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_bank_accounts_actual
          ON bank_accounts(actual_account_id);
        CREATE INDEX IF NOT EXISTS idx_imported_transactions_bank_key
          ON imported_transactions(bank_account_id, bank_transaction_key);
      `);
      this.db.pragma('user_version = 1');
    }
  }

  upsertAuthState(input: {
    state: string;
    authorizationId?: string;
    status: string;
    expiresAt: string;
  }) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT INTO auth_states (state, authorization_id, status, created_at, expires_at)
        VALUES (@state, @authorizationId, @status, @createdAt, @expiresAt)
        ON CONFLICT(state) DO UPDATE SET
          authorization_id = excluded.authorization_id,
          status = excluded.status,
          expires_at = excluded.expires_at
      `,
      )
      .run({
        state: input.state,
        authorizationId: input.authorizationId ?? null,
        status: input.status,
        createdAt: now,
        expiresAt: input.expiresAt,
      });
  }

  getAuthState(state: string): AuthStateRow | undefined {
    const row = this.db
      .prepare(
        `
        SELECT state, authorization_id AS authorizationId, status, created_at AS createdAt,
          expires_at AS expiresAt
        FROM auth_states
        WHERE state = ?
      `,
      )
      .get(state) as AuthStateRow | undefined;
    return row;
  }

  completeAuthState(state: string) {
    this.db
      .prepare('UPDATE auth_states SET status = ? WHERE state = ?')
      .run('completed', state);
  }

  upsertSession(session: SessionResource) {
    const sessionId = session.session_id ?? session.id;
    if (!sessionId) {
      throw new Error('Enable Banking session response did not include id.');
    }
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT INTO sessions (
          id, status, aspsp_name, aspsp_country, psu_type, valid_until,
          raw_json, created_at, updated_at
        )
        VALUES (
          @id, @status, @aspspName, @aspspCountry, @psuType, @validUntil,
          @rawJson, @createdAt, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          aspsp_name = excluded.aspsp_name,
          aspsp_country = excluded.aspsp_country,
          psu_type = excluded.psu_type,
          valid_until = excluded.valid_until,
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at
      `,
      )
      .run({
        id: sessionId,
        status: session.status ?? 'AUTHORIZED',
        aspspName: session.aspsp?.name ?? null,
        aspspCountry: session.aspsp?.country ?? null,
        psuType: session.psu_type ?? null,
        validUntil: session.access?.valid_until ?? null,
        rawJson: JSON.stringify(session),
        createdAt: now,
        updatedAt: now,
      });
  }

  listSessions(): SessionResource[] {
    const rows = this.db
      .prepare('SELECT raw_json AS rawJson FROM sessions')
      .all() as {
      rawJson: string;
    }[];
    return rows.map(row => JSON.parse(row.rawJson) as SessionResource);
  }

  upsertBankAccount(input: {
    id: string;
    sessionId: string;
    details: AccountDetails;
  }) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT INTO bank_accounts (
          id, session_id, name, currency, identification_hash, raw_json,
          created_at, updated_at
        )
        VALUES (
          @id, @sessionId, @name, @currency, @identificationHash, @rawJson,
          @createdAt, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          session_id = excluded.session_id,
          name = excluded.name,
          currency = excluded.currency,
          identification_hash = excluded.identification_hash,
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at
      `,
      )
      .run({
        id: input.id,
        sessionId: input.sessionId,
        name: input.details.name ?? input.details.details ?? null,
        currency: input.details.currency ?? null,
        identificationHash: input.details.identification_hash ?? null,
        rawJson: JSON.stringify(input.details),
        createdAt: now,
        updatedAt: now,
      });
  }

  listBankAccounts(): StoredBankAccount[] {
    const rows = this.db
      .prepare(
        `
        SELECT id, session_id AS sessionId, name, currency,
          identification_hash AS identificationHash,
          actual_account_id AS actualAccountId,
          last_success_at AS lastSuccessAt,
          last_failure_at AS lastFailureAt,
          last_error AS lastError,
          raw_json AS rawJson
        FROM bank_accounts
        ORDER BY name, id
      `,
      )
      .all() as StoredBankAccount[];
    return rows;
  }

  getBankAccount(id: string): StoredBankAccount | undefined {
    return this.db
      .prepare(
        `
        SELECT id, session_id AS sessionId, name, currency,
          identification_hash AS identificationHash,
          actual_account_id AS actualAccountId,
          last_success_at AS lastSuccessAt,
          last_failure_at AS lastFailureAt,
          last_error AS lastError,
          raw_json AS rawJson
        FROM bank_accounts
        WHERE id = ?
      `,
      )
      .get(id) as StoredBankAccount | undefined;
  }

  setAccountMapping(bankAccountId: string, actualAccountId: string) {
    const result = this.db
      .prepare(
        `
        UPDATE bank_accounts
        SET actual_account_id = ?, updated_at = ?
        WHERE id = ?
      `,
      )
      .run(actualAccountId, new Date().toISOString(), bankAccountId);
    if (result.changes === 0) {
      throw new Error(`Unknown bank account: ${bankAccountId}`);
    }
  }

  acquireAccountLock(bankAccountId: string, lockSeconds: number) {
    const now = new Date();
    const lockUntil = new Date(
      now.getTime() + lockSeconds * 1000,
    ).toISOString();
    const result = this.db
      .prepare(
        `
        UPDATE bank_accounts
        SET sync_lock_until = ?, updated_at = ?
        WHERE id = ?
          AND (sync_lock_until IS NULL OR sync_lock_until < ?)
      `,
      )
      .run(lockUntil, now.toISOString(), bankAccountId, now.toISOString());
    return result.changes === 1;
  }

  releaseAccountLock(bankAccountId: string) {
    this.db
      .prepare(
        `
        UPDATE bank_accounts
        SET sync_lock_until = NULL, updated_at = ?
        WHERE id = ?
      `,
      )
      .run(new Date().toISOString(), bankAccountId);
  }

  createSyncRun(bankAccountId?: string) {
    const result = this.db
      .prepare(
        `
        INSERT INTO sync_runs (bank_account_id, status, started_at)
        VALUES (?, 'running', ?)
      `,
      )
      .run(bankAccountId ?? null, new Date().toISOString());
    return Number(result.lastInsertRowid);
  }

  finishSyncRun(runId: number, result: SyncResult) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        UPDATE sync_runs
        SET status = ?, finished_at = ?, imported_count = ?, updated_count = ?,
          skipped_count = ?, error = ?
        WHERE id = ?
      `,
      )
      .run(
        result.status,
        now,
        result.imported,
        result.updated,
        result.skipped,
        result.error ?? null,
        runId,
      );
    if (result.accountId) {
      this.db
        .prepare(
          `
          UPDATE bank_accounts
          SET last_success_at = CASE WHEN ? = 'success' THEN ? ELSE last_success_at END,
            last_failure_at = CASE WHEN ? = 'failed' THEN ? ELSE last_failure_at END,
            last_error = CASE WHEN ? = 'failed' THEN ? ELSE NULL END,
            updated_at = ?
          WHERE id = ?
        `,
        )
        .run(
          result.status,
          now,
          result.status,
          now,
          result.status,
          result.error ?? null,
          now,
          result.accountId,
        );
    }
  }

  listSyncRuns(limit = 20): SyncRunRow[] {
    return this.db
      .prepare(
        `
        SELECT id, bank_account_id AS bankAccountId, status,
          started_at AS startedAt, finished_at AS finishedAt,
          imported_count AS importedCount, updated_count AS updatedCount,
          skipped_count AS skippedCount, error
        FROM sync_runs
        ORDER BY id DESC
        LIMIT ?
      `,
      )
      .all(limit) as SyncRunRow[];
  }

  recordImportedTransaction(input: {
    importedId: string;
    bankAccountId: string;
    bankTransactionKey: string;
    status: string;
    bookedImportedId?: string;
  }) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT INTO imported_transactions (
          imported_id, bank_account_id, bank_transaction_key, status,
          booked_imported_id, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(imported_id) DO UPDATE SET
          status = excluded.status,
          booked_imported_id = excluded.booked_imported_id,
          updated_at = excluded.updated_at
      `,
      )
      .run(
        input.importedId,
        input.bankAccountId,
        input.bankTransactionKey,
        input.status,
        input.bookedImportedId ?? null,
        now,
        now,
      );
  }
}
