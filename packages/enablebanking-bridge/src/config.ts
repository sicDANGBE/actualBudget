import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, resolve } from 'path';

import { ConfigError } from './errors.js';
import type { BridgeConfig, EnableBankingEnvironment } from './types.js';

type EnvMap = Record<string, string | undefined>;

function parseEnvFile(content: string): EnvMap {
  const result: EnvMap = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    result[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
  return result;
}

export function loadLocalEnv(cwd = process.cwd()): EnvMap {
  const candidates = [
    resolve(cwd, '.env'),
    resolve(cwd, '.env.enablebanking'),
    resolve(cwd, 'packages/enablebanking-bridge/.env'),
  ];
  const merged: EnvMap = {};
  for (const path of candidates) {
    if (existsSync(path)) {
      Object.assign(merged, parseEnvFile(readFileSync(path, 'utf8')));
    }
  }
  return merged;
}

function getEnv(env: EnvMap, key: string): string | undefined {
  return process.env[key] ?? env[key];
}

function stringValue(env: EnvMap, key: string, fallback?: string): string {
  return getEnv(env, key) ?? fallback ?? '';
}

function optionalString(env: EnvMap, key: string): string | undefined {
  const value = getEnv(env, key);
  return value && value.trim() ? value : undefined;
}

function numberValue(env: EnvMap, key: string, fallback: number): number {
  const value = getEnv(env, key);
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ConfigError(`${key} must be a positive integer.`);
  }
  return parsed;
}

function booleanValue(env: EnvMap, key: string, fallback: boolean): boolean {
  const value = getEnv(env, key);
  if (!value) {
    return fallback;
  }
  if (['true', '1', 'yes', 'on'].includes(value.toLowerCase())) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(value.toLowerCase())) {
    return false;
  }
  throw new ConfigError(`${key} must be a boolean value.`);
}

function environmentValue(env: EnvMap): EnableBankingEnvironment {
  const value = stringValue(env, 'ENABLE_BANKING_ENVIRONMENT', 'SANDBOX');
  if (value !== 'SANDBOX' && value !== 'PRODUCTION') {
    throw new ConfigError(
      'ENABLE_BANKING_ENVIRONMENT must be SANDBOX or PRODUCTION.',
    );
  }
  return value;
}

function workspaceCwd() {
  let current = process.env.INIT_CWD ?? process.cwd();
  while (true) {
    const packageJsonPath = resolve(current, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(
          readFileSync(packageJsonPath, 'utf8'),
        ) as {
          packageManager?: string;
          workspaces?: unknown;
        };
        if (
          packageJson.packageManager?.startsWith('yarn@') &&
          packageJson.workspaces
        ) {
          return current;
        }
      } catch {
        // Keep walking up.
      }
    }
    const parent = dirname(current);
    if (parent === current) {
      return process.cwd();
    }
    current = parent;
  }
}

function resolvePath(path: string): string {
  if (path.startsWith('/')) {
    return path;
  }
  if (path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2));
  }
  return resolve(workspaceCwd(), path);
}

export function resolveConfig(overrides: Partial<BridgeConfig> = {}) {
  const env = loadLocalEnv(workspaceCwd());
  const dataDir = resolvePath(
    stringValue(env, 'ENABLE_BANKING_DATA_DIR', '.local/enablebanking'),
  );
  const bridgeBaseUrl = stringValue(
    env,
    'BRIDGE_BASE_URL',
    'http://localhost:3099',
  );
  const callbackUrl =
    stringValue(env, 'ENABLE_BANKING_CALLBACK_URL') ||
    stringValue(env, 'ENABLE_BANKING_REDIRECT_URL') ||
    `${bridgeBaseUrl.replace(/\/$/, '')}/auth/callback`;
  const config: BridgeConfig = {
    enableBankingEnvironment: environmentValue(env),
    enableBankingAppId: optionalString(env, 'ENABLE_BANKING_APP_ID'),
    enableBankingRedirectUrl: stringValue(
      env,
      'ENABLE_BANKING_REDIRECT_URL',
      callbackUrl,
    ),
    enableBankingCallbackUrl: callbackUrl,
    enableBankingDataDir: dataDir,
    enableBankingApiBaseUrl: stringValue(
      env,
      'ENABLE_BANKING_API_BASE_URL',
      'https://api.enablebanking.com',
    ).replace(/\/$/, ''),
    enableBankingJwtTtlSeconds: Math.min(
      numberValue(env, 'ENABLE_BANKING_JWT_TTL_SECONDS', 900),
      3600,
    ),
    privateKeyPath: resolvePath(
      stringValue(
        env,
        'ENABLE_BANKING_PRIVATE_KEY_PATH',
        `${dataDir}/private.key`,
      ),
    ),
    certificatePath: resolvePath(
      stringValue(
        env,
        'ENABLE_BANKING_CERTIFICATE_PATH',
        `${dataDir}/public.crt`,
      ),
    ),
    databasePath: resolvePath(
      stringValue(env, 'ENABLE_BANKING_DATABASE_PATH', `${dataDir}/bridge.db`),
    ),
    actualServerUrl: optionalString(env, 'ACTUAL_SERVER_URL'),
    actualPassword: optionalString(env, 'ACTUAL_PASSWORD'),
    actualSessionToken: optionalString(env, 'ACTUAL_SESSION_TOKEN'),
    actualBudgetId: optionalString(env, 'ACTUAL_BUDGET_ID'),
    actualEncryptionPassword: optionalString(env, 'ACTUAL_ENCRYPTION_PASSWORD'),
    actualDataDir: resolvePath(
      stringValue(env, 'ACTUAL_DATA_DIR', `${dataDir}/actual-data`),
    ),
    bridgePort: numberValue(env, 'BRIDGE_PORT', 3099),
    bridgeBaseUrl,
    schedulerEnabled: booleanValue(env, 'SCHEDULER_ENABLED', false),
    schedulerDefaultCron: stringValue(
      env,
      'SCHEDULER_DEFAULT_CRON',
      '0 */6 * * *',
    ),
  };
  return {
    ...config,
    ...overrides,
  } satisfies BridgeConfig;
}

export function checkConfig(config: BridgeConfig) {
  const problems: string[] = [];
  if (!config.enableBankingAppId) {
    problems.push('ENABLE_BANKING_APP_ID is required for auth and API calls.');
  }
  if (!config.actualServerUrl) {
    problems.push('ACTUAL_SERVER_URL is required to sync into Actual server.');
  }
  if (!config.actualPassword && !config.actualSessionToken) {
    problems.push('ACTUAL_PASSWORD or ACTUAL_SESSION_TOKEN is required.');
  }
  if (!config.actualBudgetId) {
    problems.push('ACTUAL_BUDGET_ID is required.');
  }
  return {
    ok: problems.length === 0,
    problems,
    dataDir: config.enableBankingDataDir,
    privateKeyPath: config.privateKeyPath,
    certificatePath: config.certificatePath,
    databasePath: config.databasePath,
  };
}

export function requireEnableBankingAppId(config: BridgeConfig): string {
  if (!config.enableBankingAppId) {
    throw new ConfigError('ENABLE_BANKING_APP_ID is required.');
  }
  return config.enableBankingAppId;
}
