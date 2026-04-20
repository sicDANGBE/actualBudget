import { mkdirSync } from 'fs';

import type { ActualImportTransaction } from '#actual/mapper';
import { ConfigError } from '#errors';
import type { BridgeConfig } from '#types';

type ActualApiModule = {
  init(config: {
    serverURL: string;
    dataDir: string;
    password?: string;
    sessionToken?: string;
  }): Promise<unknown>;
  downloadBudget(
    budgetId: string,
    options?: { password?: string },
  ): Promise<unknown>;
  shutdown(): Promise<void>;
  getAccounts(): Promise<
    Array<{
      id: string;
      name: string;
      offbudget?: boolean;
      closed?: boolean;
    }>
  >;
  createAccount(
    account: { name: string; offbudget: boolean; closed: boolean },
    initialBalance?: number,
  ): Promise<string>;
  importTransactions(
    accountId: string,
    transactions: ActualImportTransaction[],
    options: {
      defaultCleared: boolean;
      dryRun: boolean;
      reimportDeleted: boolean;
    },
  ): Promise<ActualImportResult>;
};
export type ActualImportResult = {
  errors?: Array<{ message: string }>;
  added?: string[];
  updated?: string[];
  deleted?: string[];
  [key: string]: unknown;
};

async function loadActualApi(): Promise<ActualApiModule> {
  const moduleName: string = '@actual-app/api';
  return import(moduleName) as Promise<unknown> as Promise<ActualApiModule>;
}

export class ActualBridgeClient {
  constructor(private readonly config: BridgeConfig) {}

  async withBudget<T>(
    fn: (actualApi: ActualApiModule) => Promise<T>,
  ): Promise<T> {
    if (!this.config.actualServerUrl) {
      throw new ConfigError('ACTUAL_SERVER_URL is required.');
    }
    if (!this.config.actualPassword && !this.config.actualSessionToken) {
      throw new ConfigError(
        'ACTUAL_PASSWORD or ACTUAL_SESSION_TOKEN is required.',
      );
    }
    if (!this.config.actualBudgetId) {
      throw new ConfigError('ACTUAL_BUDGET_ID is required.');
    }

    mkdirSync(this.config.actualDataDir, { recursive: true, mode: 0o700 });
    const actualApi = await loadActualApi();
    if (this.config.actualSessionToken) {
      await actualApi.init({
        serverURL: this.config.actualServerUrl,
        dataDir: this.config.actualDataDir,
        sessionToken: this.config.actualSessionToken,
      });
    } else if (this.config.actualPassword) {
      await actualApi.init({
        serverURL: this.config.actualServerUrl,
        dataDir: this.config.actualDataDir,
        password: this.config.actualPassword,
      });
    } else {
      throw new ConfigError(
        'ACTUAL_PASSWORD or ACTUAL_SESSION_TOKEN is required.',
      );
    }

    try {
      await actualApi.downloadBudget(this.config.actualBudgetId, {
        password: this.config.actualEncryptionPassword,
      });
      return await fn(actualApi);
    } finally {
      await actualApi.shutdown();
    }
  }

  async listAccounts() {
    return this.withBudget(actualApi => actualApi.getAccounts());
  }

  async createAccount(name: string, initialBalance = 0) {
    return this.withBudget(actualApi =>
      actualApi.createAccount(
        {
          name,
          offbudget: false,
          closed: false,
        },
        initialBalance,
      ),
    );
  }

  async importTransactions(
    accountId: string,
    transactions: ActualImportTransaction[],
  ): Promise<ActualImportResult> {
    return this.withBudget(actualApi =>
      actualApi.importTransactions(accountId, transactions, {
        defaultCleared: true,
        dryRun: false,
        reimportDeleted: false,
      }),
    );
  }
}
