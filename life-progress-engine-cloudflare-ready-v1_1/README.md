# Life Progress Engine — Cloudflare-ready v1.4

Private single-user Life Progress Engine using Cloudflare Pages Functions + D1 and optional Groq structured interpretation.

## v1.4 changes

- Trajectory graph now uses persisted **intraday trajectory points**, so multiple entries on the same day can produce visible movement.
- Daily `trajectory_history` remains the canonical long-term series; `trajectory_points` preserves within-day chart resolution.
- Chart timeframe selector supports `1H`, `1D`, `1W`, `1M`, `1Y`, `ALL` with adaptive aggregation for longer spans.
- Threshold is plotted from the actual persisted threshold value rather than inferred/faked UI data.
- Hover/focus points show timestamp, trajectory, threshold relationship, and the event-derived note when available.
- Existing v1.2 daily history is automatically backfilled into chart points once on first state load after migration.
- Export/import includes trajectory points and remains backward-compatible with backups that do not contain them.
- LLM model remains environment-driven through `GROQ_MODEL`; there is no hard-coded llama fallback.

## Local setup

1. Copy your existing `.dev.vars` into the project root. Do **not** commit it.
2. Install dependencies:

```bash
npm install
```

3. Create/update the local D1 schema:

```bash
npm run db:migrate:local
```

4. Start the local Pages runtime:

```bash
npm run dev
```

5. Open the printed localhost URL and log in.

If you already have valuable local test data in another project folder, export it there first and import the backup after starting this version. Do not copy `.dev.vars` into backups.

## Production

The Cloudflare Pages project can be deployed with:

```bash
npm run deploy
```

For production, keep these secrets in Cloudflare Pages:

- `AUTH_PASSWORD_HASH`
- `SESSION_SECRET`
- `GROQ_API_KEY`
- `GROQ_MODEL` (optional if using the default `openai/gpt-oss-120b`)

Apply the schema to the remote D1 database before relying on production data:

```bash
npm run db:migrate:remote
```

Do not use `--remote` against the wrong database. Confirm the database ID in `wrangler.toml` first.

## Self-test

```bash
npm run self-test
```

The self-test covers authentication, deterministic scoring, and threshold adaptation. It does not make a live Groq request.
