# Dashboard — Jan Lipczyński

## Links
- **Production:** https://jan-dashboard.vercel.app
- **Weekly Planner:** https://jan-dashboard.vercel.app/weekly
- **Zdrowie:** https://jan-dashboard.vercel.app/zdrowie

## Stack
- Next.js (App Router), Vercel, Supabase
- Garmin Connect integration (fitness data)
- MyFitnessPal CSV import (nutrition data)

## Migrations
- SQL migrations live in `supabase/migrations/` (numbered: 001_, 002_, etc.)
- Auto-run on `npm run build` via `scripts/migrate.mjs`
- Requires `DATABASE_URL` env var (Supabase Postgres connection string)
- Also available via API: `GET /api/migrate`
- Tracking table: `_migrations` records which files have been applied

## Framework
- 4DX (WIG-i, lead/lag measures)
- Eat That Frog (ABCDE priorities, A-1 = żaba)
- Scoring: A=4, B=3, C=2, D/E=0, WIG bonus +2

## Pillars (filary życia)
- Praca: Ovoc Malinovi, Plantacja, Inne
- Życie: Zdrowie, Rozwój, Relacje, Duchowość
