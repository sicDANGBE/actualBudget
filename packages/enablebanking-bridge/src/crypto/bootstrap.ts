import { execFile } from 'child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname } from 'path';
import { promisify } from 'util';

import type { BootstrapStatus, BridgeConfig } from '#types';

const execFileAsync = promisify(execFile);

async function runOpenSsl(args: string[]) {
  try {
    await execFileAsync('openssl', args, {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`OpenSSL failed: ${error.message}`);
    }
    throw error;
  }
}

export async function bootstrapKeys(
  config: BridgeConfig,
): Promise<BootstrapStatus> {
  mkdirSync(config.enableBankingDataDir, { recursive: true, mode: 0o700 });
  mkdirSync(dirname(config.privateKeyPath), { recursive: true, mode: 0o700 });
  mkdirSync(dirname(config.certificatePath), { recursive: true, mode: 0o755 });

  const privateKeyExistsBefore = existsSync(config.privateKeyPath);
  const certificateExistsBefore = existsSync(config.certificatePath);

  if (!privateKeyExistsBefore) {
    await runOpenSsl(['genrsa', '-out', config.privateKeyPath, '4096']);
    chmodSync(config.privateKeyPath, 0o600);
  }

  if (!certificateExistsBefore) {
    await runOpenSsl([
      'req',
      '-new',
      '-x509',
      '-days',
      '365',
      '-key',
      config.privateKeyPath,
      '-out',
      config.certificatePath,
      '-subj',
      '/C=FI/ST=Local/L=Local/O=Actual Budget Enable Banking Bridge/CN=actual-enablebanking-bridge.local',
    ]);
    chmodSync(config.certificatePath, 0o644);
  }

  return {
    dataDir: config.enableBankingDataDir,
    privateKeyPath: config.privateKeyPath,
    certificatePath: config.certificatePath,
    privateKeyExists: existsSync(config.privateKeyPath),
    certificateExists: existsSync(config.certificatePath),
    generatedPrivateKey: !privateKeyExistsBefore,
    generatedCertificate: !certificateExistsBefore,
  };
}

export function readCertificate(config: BridgeConfig): string {
  if (!existsSync(config.certificatePath)) {
    throw new Error(
      'Enable Banking certificate does not exist. Run yarn enablebanking:bootstrap first.',
    );
  }
  return readFileSync(config.certificatePath, 'utf8');
}

export function keysStatus(config: BridgeConfig): BootstrapStatus {
  return {
    dataDir: config.enableBankingDataDir,
    privateKeyPath: config.privateKeyPath,
    certificatePath: config.certificatePath,
    privateKeyExists: existsSync(config.privateKeyPath),
    certificateExists: existsSync(config.certificatePath),
    generatedPrivateKey: false,
    generatedCertificate: false,
  };
}
