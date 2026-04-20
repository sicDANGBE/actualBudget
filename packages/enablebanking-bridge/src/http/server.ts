import { createServer } from 'http';
import type { IncomingMessage, ServerResponse } from 'http';

import type { BridgeApp } from '#app';
import { checkConfig } from '#config';
import { bootstrapKeys, keysStatus, readCertificate } from '#crypto/bootstrap';
import { toBridgeError, ValidationError } from '#errors';
import { redact } from '#logging';
import type { Logger } from '#logging';
import type { StartAuthorizationRequest } from '#types';

type RouteContext = {
  request: IncomingMessage;
  response: ServerResponse;
  params: Record<string, string>;
  url: URL;
  body: unknown;
};

type Route = {
  method: string;
  pattern: RegExp;
  handler: (context: RouteContext) => Promise<unknown> | unknown;
};

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(redact(body)));
}

function sendText(response: ServerResponse, statusCode: number, body: string) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  if (!['POST', 'PUT', 'PATCH'].includes(request.method ?? '')) {
    return undefined;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) {
      throw new ValidationError('Request body is too large.');
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ValidationError('Request body must be valid JSON.');
  }
}

function objectBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {};
  }
  return body as Record<string, unknown>;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function html(message: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Enable Banking Bridge</title></head><body><pre>${escapeHtml(
    message,
  )}</pre></body></html>`;
}

function normalizePath(pathname: string) {
  return pathname.replace(/^\/api\/v1(?=\/|$)/, '') || '/';
}

export function createHttpServer(app: BridgeApp, logger: Logger) {
  const routes: Route[] = [
    {
      method: 'GET',
      pattern: /^\/health$/,
      handler: () => ({
        ok: true,
        service: '@actual-app/enablebanking-bridge',
        schedulerEnabled: app.config.schedulerEnabled,
      }),
    },
    {
      method: 'GET',
      pattern: /^\/config\/check$/,
      handler: () => ({
        config: checkConfig(app.config),
        keys: keysStatus(app.config),
      }),
    },
    {
      method: 'POST',
      pattern: /^\/bootstrap\/keys$/,
      handler: () => bootstrapKeys(app.config),
    },
    {
      method: 'GET',
      pattern: /^\/bootstrap\/certificate$/,
      handler: ({ response }) => {
        sendText(response, 200, readCertificate(app.config));
        return undefined;
      },
    },
    {
      method: 'POST',
      pattern: /^\/auth\/start$/,
      handler: ({ body }) =>
        app.authService.start(objectBody(body) as StartAuthorizationRequest),
    },
    {
      method: 'GET',
      pattern: /^\/auth\/callback$/,
      handler: async ({ response, url }) => {
        const error = url.searchParams.get('error');
        if (error) {
          throw new ValidationError('Enable Banking authorization failed.', {
            error,
          });
        }
        const code = url.searchParams.get('code') ?? '';
        const state = url.searchParams.get('state') ?? '';
        const result = await app.authService.callback(code, state);
        response.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        response.end(
          html(
            `Enable Banking authorization completed.\nSession accounts: ${result.accountIds.join(
              ', ',
            )}`,
          ),
        );
        return undefined;
      },
    },
    {
      method: 'GET',
      pattern: /^\/sessions$/,
      handler: () => ({ sessions: app.database.listSessions() }),
    },
    {
      method: 'GET',
      pattern: /^\/accounts$/,
      handler: () => ({ accounts: app.database.listBankAccounts() }),
    },
    {
      method: 'GET',
      pattern: /^\/actual\/accounts$/,
      handler: () => app.actualClient.listAccounts(),
    },
    {
      method: 'POST',
      pattern: /^\/actual\/accounts$/,
      handler: async ({ body }) => {
        const input = objectBody(body);
        const bankAccountId = String(input.bankAccountId ?? '');
        const name = String(input.name ?? '');
        if (!bankAccountId || !name) {
          throw new ValidationError('bankAccountId and name are required.');
        }
        const initialBalance = Number(input.initialBalance ?? 0);
        if (!Number.isFinite(initialBalance)) {
          throw new ValidationError('initialBalance must be a number.');
        }
        const actualAccountId = await app.actualClient.createAccount(
          name,
          initialBalance,
        );
        app.database.setAccountMapping(bankAccountId, actualAccountId);
        return { bankAccountId, actualAccountId };
      },
    },
    {
      method: 'POST',
      pattern: /^\/mappings$/,
      handler: ({ body }) => {
        const input = objectBody(body);
        const bankAccountId = String(input.bankAccountId ?? '');
        const actualAccountId = String(input.actualAccountId ?? '');
        if (!bankAccountId || !actualAccountId) {
          throw new ValidationError(
            'bankAccountId and actualAccountId are required.',
          );
        }
        app.database.setAccountMapping(bankAccountId, actualAccountId);
        return { ok: true, bankAccountId, actualAccountId };
      },
    },
    {
      method: 'POST',
      pattern: /^\/sync\/account\/([^/]+)$/,
      handler: ({ params }) => app.syncService.syncAccount(params[0]),
    },
    {
      method: 'POST',
      pattern: /^\/sync\/all$/,
      handler: () => app.syncService.syncAll(),
    },
    {
      method: 'GET',
      pattern: /^\/sync\/status$/,
      handler: () => ({ runs: app.database.listSyncRuns() }),
    },
  ];

  return createServer(async (request, response) => {
    const url = new URL(
      request.url ?? '/',
      `${app.config.bridgeBaseUrl.replace(/\/$/, '')}/`,
    );
    const pathname = normalizePath(url.pathname);
    const route = routes.find(
      candidate =>
        candidate.method === request.method && candidate.pattern.test(pathname),
    );
    if (!route) {
      sendJson(response, 404, { error: { code: 'NOT_FOUND' } });
      return;
    }
    try {
      const match = route.pattern.exec(pathname);
      const result = await route.handler({
        request,
        response,
        params: match ? Object.fromEntries(match.slice(1).entries()) : {},
        url,
        body: await readBody(request),
      });
      if (!response.headersSent && result !== undefined) {
        sendJson(response, 200, result);
      }
    } catch (error) {
      const bridgeError = toBridgeError(error);
      logger.error('HTTP request failed.', {
        method: request.method,
        path: pathname,
        error: bridgeError.message,
        code: bridgeError.code,
      });
      if (!response.headersSent) {
        sendJson(response, bridgeError.statusCode, {
          error: {
            code: bridgeError.code,
            message: bridgeError.message,
            details: bridgeError.safeDetails,
          },
        });
      }
    }
  });
}
