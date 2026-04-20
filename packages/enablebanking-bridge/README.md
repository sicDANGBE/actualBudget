# Enable Banking Bridge for Actual Budget

This workspace contains a local/self-hosted bridge between Enable Banking and
Actual Budget. It is intentionally external to the Actual UI in phase 1: the
bridge exposes HTTP endpoints and CLI commands that Actual can call later
without requiring a deep fork of the native bank-sync flow.

## Location

The bridge lives in `packages/enablebanking-bridge` and is exposed from the repo
root through Yarn scripts:

```bash
yarn enablebanking:bootstrap
yarn enablebanking:print-cert
yarn enablebanking:check
yarn enablebanking:test-auth
yarn enablebanking:serve
yarn enablebanking:sync --account <bank-account-id>
yarn enablebanking:sync-all
```

Run these commands from the repository root. The repository uses Yarn 4.10.3 via
`.yarn/releases/yarn-4.10.3.cjs`; do not use pnpm or npm scripts for this
workspace.

## Security Model

- The private RSA key is generated and read only on the server side.
- The private key is never returned by any HTTP endpoint.
- `.local/enablebanking/` and local `.env` files are ignored by Git.
- Logs are JSON and redact common secret fields, tokens, passwords, and private
  key material.
- The bridge is designed to run locally or on the same host as `actual-server`.
- Do not expose the bridge directly to the public internet without adding an
  authenticating reverse proxy.

## Configuration

Copy `packages/enablebanking-bridge/.env.example` to either:

- `.env` at the repository root, or
- `packages/enablebanking-bridge/.env`

Minimum production-like configuration:

```bash
ENABLE_BANKING_ENVIRONMENT=SANDBOX
ENABLE_BANKING_APP_ID=<app-id-from-enable-banking>
ENABLE_BANKING_REDIRECT_URL=http://localhost:3099/auth/callback
ENABLE_BANKING_CALLBACK_URL=http://localhost:3099/auth/callback
ENABLE_BANKING_DATA_DIR=.local/enablebanking

ACTUAL_SERVER_URL=http://localhost:5006
ACTUAL_PASSWORD=<actual-server-password>
ACTUAL_BUDGET_ID=<actual-sync-id>

BRIDGE_PORT=3099
BRIDGE_BASE_URL=http://localhost:3099
SCHEDULER_ENABLED=false
SCHEDULER_DEFAULT_CRON=0 */6 * * *
```

`ACTUAL_BUDGET_ID` is passed to `@actual-app/api.downloadBudget`, so it should
be the Actual sync ID for the budget on your Actual server. If your budget is
encrypted end-to-end, also set `ACTUAL_ENCRYPTION_PASSWORD`.

## Generate Key and Certificate

```bash
yarn enablebanking:bootstrap
```

This creates, only if missing:

- `.local/enablebanking/private.key`
- `.local/enablebanking/public.crt`

Existing keys and certificates are not overwritten.
The SQLite database at `.local/enablebanking/bridge.db` is initialized when the
bridge server or a sync command first starts.

Print the certificate to upload into Enable Banking:

```bash
yarn enablebanking:print-cert
```

After uploading/registering the certificate in Enable Banking, set
`ENABLE_BANKING_APP_ID`.

Check the setup:

```bash
yarn enablebanking:check
yarn enablebanking:test-auth
```

`test-auth` verifies that the bridge can sign a JWT and prints only a redacted
preview.

## Run the Bridge

```bash
yarn enablebanking:serve
```

The default base URL is `http://localhost:3099`.

Health and config endpoints:

```bash
curl http://localhost:3099/health
curl http://localhost:3099/config/check
```

All endpoints are also available under `/api/v1`, for example
`/api/v1/sync/status`.

## Start Bank Authorization

Start an Enable Banking authorization with the ASPSP name and country:

```bash
curl -X POST http://localhost:3099/auth/start \
  -H 'Content-Type: application/json' \
  -d '{
    "aspsp": { "name": "Nordea", "country": "FI" },
    "psuType": "personal",
    "language": "en"
  }'
```

Open the returned `url` in a browser. Enable Banking will redirect back to
`/auth/callback`. The bridge exchanges the callback code for a session, stores
the session, and discovers the accessible bank accounts.

List sessions and detected bank accounts:

```bash
curl http://localhost:3099/sessions
curl http://localhost:3099/accounts
```

## Map Bank Accounts to Actual

List Actual accounts:

```bash
curl http://localhost:3099/actual/accounts
```

Map a bank account to an existing Actual account:

```bash
curl -X POST http://localhost:3099/mappings \
  -H 'Content-Type: application/json' \
  -d '{
    "bankAccountId": "<enable-banking-account-id>",
    "actualAccountId": "<actual-account-id>"
  }'
```

Or create an Actual account and map it immediately:

```bash
curl -X POST http://localhost:3099/actual/accounts \
  -H 'Content-Type: application/json' \
  -d '{
    "bankAccountId": "<enable-banking-account-id>",
    "name": "Bank checking",
    "initialBalance": 0
  }'
```

## Manual Sync

Sync one mapped account:

```bash
yarn enablebanking:sync --account <enable-banking-account-id>
```

Or through HTTP:

```bash
curl -X POST http://localhost:3099/sync/account/<enable-banking-account-id>
```

Sync all mapped accounts:

```bash
yarn enablebanking:sync-all
curl -X POST http://localhost:3099/sync/all
```

Read recent sync status:

```bash
curl http://localhost:3099/sync/status
```

The bridge uses `@actual-app/api.importTransactions` with stable
`imported_id` values in the form `enablebanking:<bankAccountId>:<bankTxKey>`.
If Enable Banking does not provide a transaction identifier, the bridge creates
a deterministic SHA-256 hash from date, amount, payee, remittance, and bank
account ID. Re-running a sync should reconcile instead of duplicating.

## Scheduled Sync

Scheduled sync is disabled by default:

```bash
SCHEDULER_ENABLED=false
```

Enable it only after manual sync works:

```bash
SCHEDULER_ENABLED=true
SCHEDULER_DEFAULT_CRON=0 */6 * * *
```

The scheduler is intentionally conservative and serializes account syncs. Each
account also has a lock to avoid concurrent syncs for the same account.

## Troubleshooting

- `ENABLE_BANKING_APP_ID is required`: upload `public.crt` to Enable Banking
  and set the returned app ID.
- `Enable Banking request timed out`: check local network access and the API
  base URL.
- `Bank account ... is not mapped`: call `POST /mappings` or
  `POST /actual/accounts` before syncing.
- `ACTUAL_BUDGET_ID is required`: set the Actual sync ID for the budget.
- No transactions imported: inspect `GET /sync/status`; the provider may have
  returned no transactions for the default 90-day window.
