import { describe, expect, it, vi } from 'vitest';

import { checkConfig, resolveConfig } from '../src/config.js';

describe('bridge config', () => {
  it('resolves defaults and validates required operational settings', () => {
    vi.stubEnv('ENABLE_BANKING_APP_ID', '');
    vi.stubEnv('ACTUAL_SERVER_URL', '');
    vi.stubEnv('ACTUAL_PASSWORD', '');
    vi.stubEnv('ACTUAL_SESSION_TOKEN', '');
    vi.stubEnv('ACTUAL_BUDGET_ID', '');
    const config = resolveConfig({
      enableBankingDataDir: '/tmp/enablebanking-test',
      privateKeyPath: '/tmp/enablebanking-test/private.key',
      certificatePath: '/tmp/enablebanking-test/public.crt',
      databasePath: '/tmp/enablebanking-test/bridge.db',
      actualDataDir: '/tmp/enablebanking-test/actual',
    });
    const result = checkConfig(config);

    expect(config.enableBankingEnvironment).toBe('SANDBOX');
    expect(config.enableBankingJwtTtlSeconds).toBe(900);
    expect(result.ok).toBe(false);
    expect(result.problems).toContain(
      'ENABLE_BANKING_APP_ID is required for auth and API calls.',
    );
    vi.unstubAllEnvs();
  });
});
