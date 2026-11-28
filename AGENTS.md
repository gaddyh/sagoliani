# AGENTS.md

## Preferences

- Always use the dev server at `http://127.0.0.1:5173` for previews and Playwright checks. If it is not running, start it with `npm run dev` (Vite binds to 127.0.0.1:5173). Do not use another port.
- Run commands and verification steps are documented in `README.md` (`npm run build`, `npm run test:visual`, `npm run test:studio`, `npm run test:admin`).

## Studio admin development environment

The admin (`/admin`) and the storefront order capture run against a local Supabase stack:

1. `supabase start` (Docker; CLI installed via `brew install supabase/tap/supabase`) — API at `http://127.0.0.1:54321`.
2. `npm run reset:dev` — recreates the local database (migrations) and seeds the catalog + the two dev artist accounts from `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`; never commit this file or any service key).
3. Dev accounts: `irit@sagoliani.art` / `efrat@sagoliani.art`, password `studio-dev-2026` (local only). Public signups are disabled.

Test commands: `npm run test:integration` (RPC-level, 44 checks — requires the local stack), `npm run test:studio-admin` (full storefront-capture → admin e2e — requires the stack **and** the dev server), `npm run test:visual` (storefront regression; also performs real captures against the local stack and purges its test orders first). `supabase/config.jsonc` changes (e.g. auth flags) require `supabase stop && supabase start`, not just `db reset`.

Key invariants to preserve when editing `supabase/migrations/`: anon may execute only `submit_order_request`; artists write stateful tables only through the RPCs (no direct table grants); mapping-version lookups must null-check `v_mapping.id` (Postgres composite `IS NULL` is true when any field is null); PostgREST bulk upserts need uniform object keys; PostgREST DELETE requires a WHERE clause.
