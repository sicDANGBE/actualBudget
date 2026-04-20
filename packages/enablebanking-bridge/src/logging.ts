const secretPatterns = [
  /Bearer\s+[A-Za-z0-9._~-]+/gi,
  /"password"\s*:\s*"[^"]*"/gi,
  /"sessionToken"\s*:\s*"[^"]*"/gi,
  /"privateKey"\s*:\s*"[^"]*"/gi,
  /-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/g,
];

export function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    return secretPatterns.reduce(
      (current, pattern) => current.replace(pattern, '[REDACTED]'),
      value,
    );
  }
  if (Array.isArray(value)) {
    return value.map(item => redact(item));
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (/password|token|secret|private|jwt|authorization/i.test(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redact(item);
      }
    }
    return result;
  }
  return value;
}

export type Logger = {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
};

function write(
  level: 'info' | 'warn' | 'error',
  message: string,
  meta?: Record<string, unknown>,
) {
  const payload = {
    level,
    message,
    ...(meta ? { meta: redact(meta) } : {}),
    timestamp: new Date().toISOString(),
  };
  const line = JSON.stringify(payload);
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger: Logger = {
  info(message, meta) {
    write('info', message, meta);
  },
  warn(message, meta) {
    write('warn', message, meta);
  },
  error(message, meta) {
    write('error', message, meta);
  },
};
