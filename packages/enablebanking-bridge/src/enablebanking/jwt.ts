import { createSign } from 'crypto';
import { readFileSync } from 'fs';

import { ConfigError } from '#errors';
import type { BridgeConfig } from '#types';

type JwtBuildOptions = {
  now?: Date;
  ttlSeconds?: number;
};

export type EnableBankingJwtParts = {
  token: string;
  header: {
    typ: 'JWT';
    alg: 'RS256';
    kid: string;
  };
  payload: {
    iss: 'enablebanking.com';
    aud: 'api.enablebanking.com';
    iat: number;
    exp: number;
  };
};

function base64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function buildEnableBankingJwt(
  config: Pick<
    BridgeConfig,
    'enableBankingAppId' | 'privateKeyPath' | 'enableBankingJwtTtlSeconds'
  >,
  options: JwtBuildOptions = {},
): EnableBankingJwtParts {
  if (!config.enableBankingAppId) {
    throw new ConfigError('ENABLE_BANKING_APP_ID is required to build JWT.');
  }
  const ttlSeconds =
    options.ttlSeconds ?? config.enableBankingJwtTtlSeconds ?? 900;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 3600) {
    throw new ConfigError('Enable Banking JWT TTL must be between 1 and 3600.');
  }
  const iat = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const header = {
    typ: 'JWT',
    alg: 'RS256',
    kid: config.enableBankingAppId,
  } as const;
  const payload = {
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat,
    exp: iat + ttlSeconds,
  } as const;
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const privateKey = readFileSync(config.privateKeyPath, 'utf8');
  const signature = createSign('RSA-SHA256')
    .update(signingInput)
    .end()
    .sign(privateKey);
  return {
    token: `${signingInput}.${base64Url(signature)}`,
    header,
    payload,
  };
}

export function getAccessToken(config: BridgeConfig): string {
  return buildEnableBankingJwt(config).token;
}
