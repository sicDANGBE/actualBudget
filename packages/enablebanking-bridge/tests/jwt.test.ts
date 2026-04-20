import { generateKeyPairSync } from 'crypto';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import { buildEnableBankingJwt } from '../src/enablebanking/jwt.js';

function decodeSegment(segment: string) {
  return JSON.parse(
    Buffer.from(segment, 'base64url').toString('utf8'),
  ) as Record<string, unknown>;
}

describe('buildEnableBankingJwt', () => {
  it('builds an RS256 JWT with Enable Banking header and payload', () => {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const dir = mkdtempSync(join(tmpdir(), 'enablebanking-jwt-'));
    const privateKeyPath = join(dir, 'private.key');
    writeFileSync(
      privateKeyPath,
      privateKey.export({ type: 'pkcs1', format: 'pem' }),
    );

    const jwt = buildEnableBankingJwt(
      {
        enableBankingAppId: 'app-123',
        privateKeyPath,
        enableBankingJwtTtlSeconds: 900,
      },
      { now: new Date('2026-04-20T10:00:00Z') },
    );
    const [header, payload, signature] = jwt.token.split('.');

    expect(decodeSegment(header)).toEqual({
      typ: 'JWT',
      alg: 'RS256',
      kid: 'app-123',
    });
    expect(decodeSegment(payload)).toEqual({
      iss: 'enablebanking.com',
      aud: 'api.enablebanking.com',
      iat: 1776679200,
      exp: 1776680100,
    });
    expect(signature).toBeTruthy();
  });

  it('requires an application id', () => {
    expect(() =>
      buildEnableBankingJwt({
        privateKeyPath: '/does-not-matter',
        enableBankingJwtTtlSeconds: 900,
      }),
    ).toThrow('ENABLE_BANKING_APP_ID is required');
  });
});
