import { randomUUID } from 'crypto';

import { ValidationError } from '#errors';
import type { BridgeDatabase } from '#storage/database';
import type { SessionResource, StartAuthorizationRequest } from '#types';

import type { EnableBankingClient } from './client.js';

function defaultValidUntil() {
  const date = new Date();
  date.setDate(date.getDate() + 89);
  return date.toISOString();
}

function sessionAccountIds(session: SessionResource): string[] {
  const accounts = session.accounts ?? [];
  return accounts.filter(
    (account): account is string => typeof account === 'string',
  );
}

export class EnableBankingAuthService {
  constructor(
    private readonly client: EnableBankingClient,
    private readonly database: BridgeDatabase,
    private readonly redirectUrl: string,
  ) {}

  async start(request: StartAuthorizationRequest) {
    if (!request.aspsp?.name || !request.aspsp?.country) {
      throw new ValidationError('aspsp.name and aspsp.country are required.');
    }
    const state = randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const response = await this.client.startAuthorization({
      access: {
        valid_until: request.validUntil ?? defaultValidUntil(),
      },
      aspsp: request.aspsp,
      state,
      redirect_url: this.redirectUrl,
      ...(request.psuType ? { psu_type: request.psuType } : {}),
      ...(request.authMethod ? { auth_method: request.authMethod } : {}),
      ...(request.credentials ? { credentials: request.credentials } : {}),
      ...(request.language ? { language: request.language } : {}),
      ...(request.psuId ? { psu_id: request.psuId } : {}),
    });
    this.database.upsertAuthState({
      state,
      authorizationId: response.authorization_id,
      status: 'started',
      expiresAt,
    });
    return {
      ...response,
      state,
    };
  }

  async callback(code: string, state: string) {
    if (!code || !state) {
      throw new ValidationError('Callback requires code and state.');
    }
    const authState = this.database.getAuthState(state);
    if (!authState) {
      throw new ValidationError('Unknown Enable Banking auth state.');
    }
    if (new Date(authState.expiresAt).getTime() < Date.now()) {
      throw new ValidationError('Enable Banking auth state expired.');
    }
    const session = await this.client.authorizeSession(code);
    this.database.upsertSession(session);
    const sessionId = session.session_id ?? session.id;
    if (!sessionId) {
      throw new ValidationError('Enable Banking did not return a session id.');
    }
    for (const accountId of sessionAccountIds(session)) {
      const details = await this.client.getAccountDetails(accountId);
      this.database.upsertBankAccount({
        id: accountId,
        sessionId,
        details,
      });
    }
    this.database.completeAuthState(state);
    return {
      session,
      accountIds: sessionAccountIds(session),
    };
  }
}
