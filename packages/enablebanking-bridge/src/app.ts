import { ActualBridgeClient } from './actual/actual-client.js';
import { EnableBankingAuthService } from './enablebanking/auth-service.js';
import { EnableBankingClient } from './enablebanking/client.js';
import { logger } from './logging.js';
import { BridgeScheduler } from './scheduler.js';
import { BridgeDatabase } from './storage/database.js';
import { BridgeSyncService } from './sync/sync-service.js';
import type { BridgeConfig } from './types.js';

export type BridgeApp = {
  config: BridgeConfig;
  database: BridgeDatabase;
  enableBankingClient: EnableBankingClient;
  actualClient: ActualBridgeClient;
  authService: EnableBankingAuthService;
  syncService: BridgeSyncService;
  scheduler: BridgeScheduler;
  close: () => void;
};

export function createBridgeApp(config: BridgeConfig): BridgeApp {
  const database = new BridgeDatabase(config.databasePath);
  const enableBankingClient = new EnableBankingClient(config);
  const actualClient = new ActualBridgeClient(config);
  const authService = new EnableBankingAuthService(
    enableBankingClient,
    database,
    config.enableBankingCallbackUrl,
  );
  const syncService = new BridgeSyncService(
    database,
    enableBankingClient,
    actualClient,
  );
  const scheduler = new BridgeScheduler(config, syncService, logger);
  return {
    config,
    database,
    enableBankingClient,
    actualClient,
    authService,
    syncService,
    scheduler,
    close() {
      scheduler.stop();
      database.close();
    },
  };
}
