export class BridgeError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly safeDetails?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    statusCode = 500,
    safeDetails?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
    this.statusCode = statusCode;
    this.safeDetails = safeDetails;
  }
}

export class ConfigError extends BridgeError {
  constructor(message: string, safeDetails?: Record<string, unknown>) {
    super('CONFIG_ERROR', message, 400, safeDetails);
    this.name = 'ConfigError';
  }
}

export class ProviderError extends BridgeError {
  constructor(
    code: string,
    message: string,
    statusCode = 502,
    safeDetails?: Record<string, unknown>,
  ) {
    super(code, message, statusCode, safeDetails);
    this.name = 'ProviderError';
  }
}

export class RateLimitError extends ProviderError {
  readonly retryAfterSeconds?: number;

  constructor(message: string, retryAfterSeconds?: number) {
    super('ENABLE_BANKING_RATE_LIMIT', message, 429, {
      retryAfterSeconds,
    });
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ValidationError extends BridgeError {
  constructor(message: string, safeDetails?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 400, safeDetails);
    this.name = 'ValidationError';
  }
}

export function toBridgeError(error: unknown): BridgeError {
  if (error instanceof BridgeError) {
    return error;
  }
  if (error instanceof Error) {
    return new BridgeError('INTERNAL_ERROR', error.message);
  }
  return new BridgeError('INTERNAL_ERROR', 'Unknown internal error');
}
