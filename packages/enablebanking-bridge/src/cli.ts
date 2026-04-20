#!/usr/bin/env node
import { once } from 'events';

import { createBridgeApp } from './app.js';
import { checkConfig, resolveConfig } from './config.js';
import {
  bootstrapKeys,
  keysStatus,
  readCertificate,
} from './crypto/bootstrap.js';
import { buildEnableBankingJwt } from './enablebanking/jwt.js';
import { createHttpServer } from './http/server.js';
import { logger } from './logging.js';

function printJson(value: unknown) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

function parseOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

async function main() {
  const [, , command = 'help', ...args] = process.argv;
  const config = resolveConfig();

  if (command === 'bootstrap') {
    printJson(await bootstrapKeys(config));
    return;
  }

  if (command === 'print-cert') {
    process.stdout.write(readCertificate(config));
    return;
  }

  if (command === 'check') {
    printJson({
      config: checkConfig(config),
      keys: keysStatus(config),
    });
    return;
  }

  if (command === 'test-auth') {
    printJson({
      tokenPreview:
        buildEnableBankingJwt(config).token.split('.').slice(0, 2).join('.') +
        '.[signature]',
      expiresAt: new Date(
        (buildEnableBankingJwt(config).payload.exp ?? 0) * 1000,
      ).toISOString(),
    });
    return;
  }

  const app = createBridgeApp(config);
  try {
    if (command === 'sync') {
      const accountId = parseOption(args, '--account') ?? args[0];
      if (!accountId) {
        throw new Error(
          'Usage: yarn enablebanking:sync --account <bank-account-id>',
        );
      }
      printJson(await app.syncService.syncAccount(accountId));
      return;
    }

    if (command === 'sync-all') {
      printJson(await app.syncService.syncAll());
      return;
    }

    if (command === 'serve') {
      const server = createHttpServer(app, logger);
      server.listen(config.bridgePort);
      await once(server, 'listening');
      app.scheduler.start();
      logger.info('Enable Banking bridge listening.', {
        url: `${config.bridgeBaseUrl.replace(/\/$/, '')}`,
        port: config.bridgePort,
      });

      const shutdown = () => {
        logger.info('Enable Banking bridge shutting down.');
        app.close();
        server.close();
      };
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
      return;
    }

    process.stdout.write(`Usage:
  yarn enablebanking:bootstrap
  yarn enablebanking:print-cert
  yarn enablebanking:check
  yarn enablebanking:test-auth
  yarn enablebanking:serve
  yarn enablebanking:sync --account <bank-account-id>
  yarn enablebanking:sync-all
`);
  } finally {
    if (command !== 'serve') {
      app.close();
    }
  }
}

main().catch(error => {
  logger.error('Enable Banking bridge command failed.', {
    error: error instanceof Error ? error.message : error,
  });
  process.exitCode = 1;
});
