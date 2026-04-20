# Enable Banking Bridge Architecture

## Components

- `src/http/server.ts`: HTTP API for health, bootstrap, auth, account mapping,
  manual sync, and status. The same routes are available at root and `/api/v1`.
- `src/cli.ts`: Yarn-facing CLI used by root scripts.
- `src/config.ts`: environment and `.env` loading with explicit validation.
- `src/crypto/bootstrap.ts`: RSA 4096 private key and self-signed certificate
  generation via OpenSSL.
- `src/enablebanking/jwt.ts`: short-lived RS256 JWT generation using the
  server-side private key.
- `src/enablebanking/client.ts`: Enable Banking HTTP client with timeouts,
  rate-limit handling, and redacted errors.
- `src/enablebanking/auth-service.ts`: authorization start/callback flow and
  initial account discovery.
- `src/storage/database.ts`: SQLite persistence and migrations.
- `src/actual/actual-client.ts`: isolated `@actual-app/api` integration.
- `src/actual/mapper.ts`: Enable Banking transaction to Actual import mapping,
  amount conversion, payee extraction, and stable `imported_id` generation.
- `src/sync/sync-service.ts`: account/all sync orchestration and locking.
- `src/scheduler.ts`: conservative optional scheduled sync.

## Auth Flow

1. `POST /bootstrap/keys` creates `.local/enablebanking/private.key` and
   `.local/enablebanking/public.crt` if absent.
2. The operator uploads `public.crt` to Enable Banking and sets
   `ENABLE_BANKING_APP_ID`.
3. `POST /auth/start` validates ASPSP input, stores a short-lived `state`, signs
   an Enable Banking JWT, and calls `POST /auth`.
4. The user opens the returned authorization URL.
5. Enable Banking redirects to `GET /auth/callback?code=...&state=...`.
6. The bridge validates `state`, exchanges `code` for a session with
   `POST /sessions`, stores the session, and fetches account details.

## Sync Flow

1. Bank accounts are mapped to Actual accounts through `POST /mappings` or
   `POST /actual/accounts`.
2. `POST /sync/account/:id` acquires a per-account lock.
3. The bridge fetches transactions from Enable Banking with a cautious window:
   last successful sync minus seven days, or 90 days back on first sync.
4. Transactions are normalized to Actual import entities:
   - integer cents,
   - debit/credit sign handling,
   - `cleared=false` for pending provider status,
   - stable `imported_id`.
5. The bridge calls `@actual-app/api.importTransactions` with
   `reimportDeleted=false`.
6. Sync results and errors are persisted in SQLite.

## Persistence

SQLite is stored at `.local/enablebanking/bridge.db` by default. The schema uses
`PRAGMA user_version` for simple migrations and currently stores:

- local key/value bridge config,
- auth states,
- Enable Banking sessions,
- discovered bank accounts,
- bank account to Actual account mappings,
- recent sync runs,
- imported transaction identities.

## Future Actual Integration Points

Actual can later call the bridge without needing to know Enable Banking details:

- `GET /api/v1/config/check`: display setup readiness.
- `GET /api/v1/accounts`: list available bank accounts and mapping state.
- `POST /api/v1/mappings`: persist bank-account to Actual-account mapping.
- `POST /api/v1/sync/account/:id`: trigger a manual sync.
- `POST /api/v1/sync/all`: trigger all mapped accounts.
- `GET /api/v1/sync/status`: display recent runs and errors.

The Actual UI should never receive or handle the private key, JWT, provider
tokens, or raw secrets. It should treat the bridge as a local server-side
capability.
