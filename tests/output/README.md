# E2E test output

Full lifecycle integration tests (`tests/integration/full-lifecycle-e2e.test.ts`) write a manifest here after each run:

- `e2e-manifest-{runId}.json` — one file per run (faker seed, credentials, entity IDs, endpoint hit log)
- `latest-e2e-manifest.json` — pointer to the most recent run

**Database rows are intentionally not deleted** so you can inspect companies, orders, catalog, and audit data in Postgres / Prisma Studio.

Use the manifest `credentials` block to log in as the generated company user, or use the super admin from `tests/helpers/auth.ts`.
