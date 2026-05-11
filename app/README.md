# Lasca App

This directory holds the actual Next.js application. For the project-level
overview, license, and contribution guide, see the [repo root README](../README.md).

## Quick start (from this directory)

```bash
npm install
cp .env.example .env.local   # then fill in OPENAI_API_KEY or ANTHROPIC_API_KEY
npm run dev                  # or `../dev.sh` from the repo root
```

Open [http://localhost:3000](http://localhost:3000). `AuthGuard` is bypassed
in `NODE_ENV=development`, so you can hop straight into `/create` or
`/editor` without invite codes.

## Commands

- `npm run dev` — local dev server (forced to webpack — see root `dev.sh`)
- `npm run build` — production build
- `npm run verify` — alias for `build`, used by CI
- `npm run lint` — ESLint

## Where things live

- `src/app/` — App-Router routes and API handlers
- `src/components/editor/` — editor shell and Canvas interactions
- `src/components/create/` — multi-step generation flow
- `src/components/chat/` — AI chat panel and intent dispatch
- `src/lib/renderSlide.ts` — slide JSON → HTML
- `src/lib/store.ts` — Zustand store + IndexedDB persistence
- `src/lib/ai/` — model abstraction, prompts, harness orchestration
- `src/lib/import/` — PPTX/PDF import paths
- `src/lib/db/` — beta auth/admin data layer

## Optional integrations

These environment variables in `.env.example` enable production-only flows.
None are required for local UI work:

- `POSTGRES_URL`, `JWT_SECRET`, `ADMIN_SECRET`, `ADMIN_EMAILS` — invite
  registration, admin dashboard, event logging
- `RESEND_API_KEY` — feedback / admin email
- `LEMON_SQUEEZY_*` — payment webhook path
- `REPORT_PDF_SERVICE_URL`, `REPORT_PDF_SERVICE_TOKEN` — print-quality
  report PDFs via the
  [`lasca-report-pdf-service`](https://github.com/lasca-ai/lasca-report-pdf-service)
  sidecar
- `NEXT_PUBLIC_ENABLE_DEV_PAGES=1` — exposes `/harness-test`,
  `/test-laser`, and `/test-paged` in production builds

## More context

The repo-root [`AGENTS.md`](../AGENTS.md) is the agent-oriented map of the
codebase; [`CONTRIBUTING.md`](../CONTRIBUTING.md) has recipes for adding
layouts, charts, presets, providers, and covers.
