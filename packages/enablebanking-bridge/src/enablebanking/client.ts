import { ProviderError, RateLimitError } from '#errors';
import type {
  AccountBalance,
  AccountDetails,
  BridgeConfig,
  SessionResource,
  StartAuthorizationResponse,
  TransactionsResponse,
} from '#types';

import { getAccessToken } from './jwt.js';

type RequestOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
  query?: Record<string, string | undefined>;
};

function buildUrl(
  baseUrl: string,
  path: string,
  query?: RequestOptions['query'],
) {
  const url = new URL(path, baseUrl + '/');
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function retryAfterSeconds(value: string | null) {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  }
  return undefined;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

export class EnableBankingClient {
  constructor(private readonly config: BridgeConfig) {}

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    const url = buildUrl(
      this.config.enableBankingApiBaseUrl,
      path.replace(/^\//, ''),
      options.query,
    );
    try {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${getAccessToken(this.config)}`,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
      const json = await readJson(response);
      if (response.status === 429) {
        throw new RateLimitError(
          'Enable Banking rate limit reached.',
          retryAfterSeconds(response.headers.get('retry-after')),
        );
      }
      if (!response.ok) {
        throw new ProviderError(
          `ENABLE_BANKING_HTTP_${response.status}`,
          `Enable Banking returned HTTP ${response.status}.`,
          response.status,
          {
            response: json,
          },
        );
      }
      return json as T;
    } catch (error) {
      if (error instanceof ProviderError || error instanceof RateLimitError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProviderError(
          'ENABLE_BANKING_TIMEOUT',
          'Enable Banking request timed out.',
          504,
        );
      }
      if (error instanceof Error) {
        throw new ProviderError('ENABLE_BANKING_NETWORK', error.message, 502);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  startAuthorization(body: unknown) {
    return this.request<StartAuthorizationResponse>('/auth', {
      method: 'POST',
      body,
    });
  }

  authorizeSession(code: string) {
    return this.request<SessionResource>('/sessions', {
      method: 'POST',
      body: { code },
    });
  }

  getSession(sessionId: string) {
    return this.request<SessionResource>(`/sessions/${sessionId}`);
  }

  getAccountDetails(accountId: string) {
    return this.request<AccountDetails>(`/accounts/${accountId}/details`);
  }

  getBalances(accountId: string) {
    return this.request<{ balances: AccountBalance[] }>(
      `/accounts/${accountId}/balances`,
    );
  }

  getTransactions(
    accountId: string,
    query: {
      date_from?: string;
      date_to?: string;
      continuation_key?: string;
      transaction_status?: string;
    },
  ) {
    return this.request<TransactionsResponse>(
      `/accounts/${accountId}/transactions`,
      {
        query,
      },
    );
  }
}
