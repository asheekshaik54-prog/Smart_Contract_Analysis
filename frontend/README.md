# SkillNova Sentinel - frontend

React 19 + TypeScript (strict) + Vite + Tailwind 3 + React Router + TanStack Query + React Hook Form/Zod +
Three.js / React Three Fiber + Framer Motion + React Flow. Talks to the FastAPI backend in `../backend`.

## Run (Windows PowerShell)
1. Install **Node.js 22.12 or newer (the current LTS)** from https://nodejs.org (check: `node --version`). Close and reopen PowerShell.
2. Start the backend in one window (see ../SETUP.md): `uvicorn app.api.main:app --reload` (port 8000).
3. In a second window:
```powershell
cd frontend
npm install
npm run dev
```
4. Open http://localhost:5173. Requests to `/api/*` are proxied to http://127.0.0.1:8000 (override: `$env:VITE_DEV_API="http://host:port"`).

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | dev server with hot reload |
| `npm run build` | type-check + production build to `dist/` |
| `npm run preview` | serve `dist/` on :4173 (same proxy) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | 30 unit/component tests (vitest + Testing Library) |

Serving `dist/` from a different origin than the API: build with `VITE_API_BASE=https://api.example.com`, and set the
backend's `SENTINEL_CORS_ORIGINS` to your site's origin.

## Pages
`/` landing (3D hero, WebGL fallback) · `/scan` analyze · `/results/:id` workspace (overview, findings, 2D/3D graph,
instructions, coverage, symbolic, report) · `/compare` · `/history` · `/methodology` · `/settings`.

## Design rules enforced in code
- No fake data: history starts empty; the 3D hero is labelled decorative; graphs draw only engine-returned blocks/edges.
- No fabricated progress: the backend reports no stages, so the UI shows only "Analysis running".
- 3D is optional: lazy-loaded, disabled by Settings, by missing WebGL, by context loss, or on low-core devices; every 3D
  view has a 2D graph and a text alternative.
- Reduced motion (Settings or OS) disables CSS animation and freezes 3D movement.

## Not done / not verified
See ../README.md. Notably: not exercised in a real browser/GPU by the author, no automated accessibility audit, no
measured frame rates, no accounts/projects/notes/remediation tracking, history is browser-local only.
