# GymBuddy

**A personal strength-training log for the gym floor: an installable PWA served by a single Cloudflare Worker, signed in with the passkey that already lives on your phone.**

No accounts, no passwords, no e-mail. You open it, you log a set, the rest timer starts. If there is no coverage in the basement where the squat racks are, it keeps working and syncs when you walk back up.

Deployed at [`gymbuddy.juanmmm21.workers.dev`](https://gymbuddy.juanmmm21.workers.dev) — sign-up is invite-only by design.

---

## What it is

Most training apps want a subscription, a social feed, or an account tied to an e-mail address. GymBuddy wants none of them: one Worker, one SQLite database at the edge, one person's training history, and a phone that already knows who you are.

It does the things you actually do between sets:

- **Log a set** in two taps — the weight comes pre-filled with your last one on that exercise, and the rest timer counts down to `0:00` on its own.
- **Follow a routine** and bend it when the machine is taken: swap the exercise or the number of sets *for today only*, without editing the routine itself.
- **Browse a catalogue of 1,323 exercises** with animated demonstrations, search it in plain language ("face pull", "press banca"), and filter by equipment or body part.
- **Track progression**: working weight, estimated 1RM, volume, personal records, and a plateau warning when an exercise has stopped moving.
- **Record cardio** with duration and distance, including a treadmill finisher that keeps the session open while it runs.
- **Attach your own photo or video** of the technique to an exercise you created, re-encoded on the phone before it ever leaves it.
- **Get a rest notification** on the lock screen when the app is closed, over Web Push from the Worker.
- **Work offline.** Sets logged without coverage queue up in IndexedDB and drain, in order, when the network returns.

The whole thing runs inside Cloudflare's free plan and is expected to stay there.

---

## What makes this repository interesting

The constraints are the design. Four of them shaped almost every decision in the codebase:

**10 ms of CPU per invocation.** That is plenty for CRUD and forbids anything that touches the whole catalogue at once. The catalogue sync therefore walks **one muscle group per invocation** — nineteen in total — chained by a Cron Trigger every five minutes, which maps naturally onto the upstream API because it is already split by muscle. Anything that grows with history (export, import) is paged or batched under the same ceiling.

**Weights are integers of grams, never floating point.** Gym plates go up in 1.25 kg steps, and an `82.5` that renders as `82.49999` is a visible bug. Storage is grams, arithmetic is integer, and the API exposes kilograms as a fixed two-decimal string (`"82.50"`). Where a formula produces a fraction — Epley's `w × (1 + reps/30)` for the estimated 1RM — the numerator is kept integer and divided exactly once, rounding half up explicitly.

**One contract, two runtimes.** Every request and response shape is a Zod schema in `packages/shared`. The Worker validates input with it; the PWA infers its types from the same schema with `z.infer`. There is no hand-written API type in `apps/web`, and no generation step to forget to run. This is the entire reason the project is TypeScript on both sides.

**Domain logic is pure and shared.** Working weight, estimated 1RM, personal-record detection, plateau detection, plate loading, the weekly body map, and the mascot's state machine are pure functions in `packages/shared/src/domain/`, with no dependency on Workers or React, and they run on both sides. The mascot in particular is a tested state machine, not an `if` inside a component.

A few other decisions worth a look, each written up as an ADR in [`docs/decisions/`](docs/decisions):

- The exercise catalogue is **consumed from a CDN and never vendored** — the upstream repository has no licence, so only JSON metadata is cached in D1, never the GIFs ([ADR 0001](docs/decisions/0001-catalogo-remoto-por-cdn.md)).
- Identity is **passkeys plus a single-use invitation code**, with only the digest of a code ever stored ([ADR 0005](docs/decisions/0005-identidad-propia-con-passkeys.md)).
- Restoring a backup rewrites every id as a **UUID derived from the destination account** (SHA-256 → UUID v8), so a restore into a second account neither collides with the first nor duplicates on a retry ([ADR 0006](docs/decisions/0006-importar-copias-con-ids-derivados.md)).
- Offline writes go through a **queue in IndexedDB**, drained strictly in order, with rejections surfaced rather than swallowed ([ADR 0007](docs/decisions/0007-cola-offline-de-escrituras.md)).
- The end-of-rest notification is scheduled by a **Durable Object alarm** that sends a payload-less Web Push signed with VAPID, using WebCrypto rather than a push library ([ADR 0009](docs/decisions/0009-aviso-de-descanso-por-push.md)).

> The ADRs and the runbooks in [`docs/operations/`](docs/operations) are written in Spanish; the code, the commit history and this README are in English.

---

## How it works

```
                  Cron Trigger (*/5)
                          │  one muscle group per tick
                          ▼
  jsDelivr ──► Worker (Hono) ──► D1  (metadata only, never the GIFs)
  @v1.1.0          │  fetch + scheduled
                   │
  ┌────────────────┴───────────────────────────┐
  │                                            │
  ▼                                            ▼
 /api/v1/*  ── JSON, validated with Zod      static assets: the built PWA
  ▲                                            │
  │                                            ▼
  └──────── PWA (React + TanStack Query) ◄──── same origin, no CORS
                   │
                   ├─ IndexedDB: write queue, device snapshot, media cache
                   └─ Service worker: app shell + GIFs already seen
```

The Worker is the whole backend. It exports `fetch` (the API under `/api/v1`) and `scheduled` (catalogue sync plus a sweep of expired passkey challenges and device codes), it serves the built PWA as static assets from the same origin, and it holds one R2 bucket for technique photos and videos and one Durable Object class for rest alarms.

Serving the app and the API from a single Worker is deliberate: one origin means no CORS, no exposed-header configuration for the self-renewing session token, and — most importantly — **one domain**, which is what passkeys are bound to. The GIFs themselves are never proxied: the browser fetches them straight from jsDelivr and the service worker keeps the ones already seen.

### The exercise catalogue

Exercise metadata and animations come from [`JahelCuadrado/ExerciseGymGifsDB`](https://github.com/JahelCuadrado/ExerciseGymGifsDB), served over [jsDelivr](https://www.jsdelivr.com/) and pinned to an immutable tag:

```
https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@v1.1.0
```

Two things about that contract are easy to get wrong and are worth stating plainly:

- **`muscle` is not `bodyPart`.** There are nineteen muscles and seven body parts, and they do not line up: the bench press is `muscle: "pectorals"` with `bodyPart: "chest"`. Navigation ("legs, chest, back…") uses `bodyPart`; the exercise page, the GIF folder and the stable `catalogId` (`"{muscle}/{slug}"`) use `muscle`.
- **The tag is pinned, never `@main`.** Upstream regenerates `api/` wholesale, so `@main` would let a change there break a deployed app. Bumping the catalogue is editing `CATALOG_VERSION` in `packages/shared/src/schemas/catalog.ts`, which both sides read.

### Identity

There are no passwords and no e-mail addresses in the database. Registration takes a **single-use invitation code** (twelve symbols, seven days) and creates a passkey; from then on, signing in is a discoverable-credential WebAuthn ceremony with nothing typed at all. A second phone joins the same account through a **ten-minute device code** issued from a phone that is already signed in. Of every code, only a SHA-256 digest is stored; the challenge row is deleted in the same statement that reads it, so a signed response cannot be replayed.

The session is a JWT that **renews itself while the app is used**: once a token is more than half spent, `requireUser` attaches a fresh one to the response headers. There are no eternal tokens and no refresh endpoint to call.

### Offline

The PWA assumes there is no coverage. The five writes a session needs — start, log set, edit set, remove set, end — go through a queue in IndexedDB: straight to the network when it is up and the queue is empty, otherwise appended and drained in order, with anything the Worker rejects surfaced to the user and dropped. A device snapshot (open session, exercises, routines, signals, the week) is restored before the first paint, so the app opens and shows real data in airplane mode. Exercise GIFs already seen live in the service-worker cache; photos and videos already watched live in IndexedDB under a 200 MB byte budget that evicts the least-watched first.

---

## Architecture

```text
GymBuddy/
├── apps/
│   ├── api/                          # the Cloudflare Worker: API, cron, static assets
│   │   ├── wrangler.toml             # bindings: D1, R2, Durable Object, cron, [env.production]
│   │   ├── drizzle/                  # generated migrations, applied with wrangler
│   │   ├── scripts/                  # D1 backup and restore (checked SQL dumps)
│   │   ├── src/
│   │   │   ├── index.ts              # fetch + scheduled, the single entry point
│   │   │   ├── routes/v1/            # health, catalog, auth, exercises, sessions, history,
│   │   │   │                         # routines, stats, export, import, push, admin
│   │   │   ├── auth/                 # passkeys, invitations, device links, challenges, JWT
│   │   │   ├── catalog/              # jsDelivr client, one-muscle-per-tick sync, fuzzy search
│   │   │   ├── db/                   # Drizzle schema, queries, parameter-aware batching
│   │   │   ├── training/             # exercises, sessions, stats, records, export, import, media
│   │   │   ├── push/                 # VAPID Web Push and the rest-alarm Durable Object
│   │   │   └── http/                 # env/secrets, current user, error handler, idle close
│   │   └── test/                     # Vitest against a real D1 via @cloudflare/vitest-pool-workers
│   └── web/                          # the PWA, built to dist/ and served by the Worker
│       ├── src/
│       │   ├── design/               # colour, spacing, type and motion tokens — the only source of style
│       │   ├── components/           # buttons, sheets, fields, skeletons… nothing domain-specific
│       │   ├── features/             # home, session, catalog, exercises, history, routines,
│       │   │                         # mascot, backup, settings, devices, install, tutorial
│       │   ├── offline/              # write queue, device snapshot, media cache, push service worker
│       │   ├── api/                  # typed client and TanStack Query hooks
│       │   └── app/                  # router, tab shell, screen transitions
│       └── test/
├── packages/
│   └── shared/
│       └── src/
│           ├── schemas/              # Zod: the whole API contract, plus the backup file format
│           └── domain/               # pure logic: progression, records, plates, mascot, week, units
└── docs/
    ├── decisions/                    # ADRs (Spanish)
    └── operations/                   # deployment and D1 backup runbooks (Spanish)
```

### Data model, briefly

`user` owns everything. A `tracked_exercise` is an exercise this person actually trains — either a reference to a `catalog_exercise` by its stable `catalogId`, or one they created themselves — and it carries the per-exercise flags that change the maths, such as `unilateral` for one-arm work (where volume counts both sides and records are kept per arm).

A `workout_session` holds `set_entry` rows, which are a discriminated union: a strength set has weight and reps, a cardio set has duration and an optional distance. Sets are inserts with their own id and timestamp, which is what makes the offline queue safe: they never conflict, they only arrive late. `personal_record` rows are derived from sets and are rewritten inside the same batch whenever a set — or a whole session — is deleted, so the records always match the history that is actually there.

---

## Requirements

- **Node 26** (see `.node-version`) and **pnpm 12** (`packageManager` in `package.json`)
- A Cloudflare account for deployment; local development needs no account at all — `wrangler` runs a real D1 on disk

```bash
pnpm install
```

`esbuild` and `workerd` download binaries in their install scripts and are allow-listed in `pnpm-workspace.yaml`; without them neither `wrangler dev` nor the Worker test pool will start.

---

## Local development

```bash
# Worker + a local D1 on disk (http://localhost:8787)
pnpm --filter @gymbuddy/api dev

# PWA with hot reload (http://localhost:5173)
pnpm --filter @gymbuddy/web dev
```

Secrets go in `apps/api/.dev.vars` (git-ignored; see `.dev.vars.example`): `JWT_SECRET` and `ADMIN_TOKEN` are required, and the `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` pair only enables the rest notification — without it the rest of the app works unchanged. `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN` are public and live in `[vars]` of `wrangler.toml`; they must match wherever the PWA is served from.

Migrations:

```bash
pnpm --filter @gymbuddy/api db:generate        # drizzle-kit, from src/db/schema.ts
pnpm --filter @gymbuddy/api db:migrate:local
```

A fresh local database needs a catalogue and a way in. Both go through the admin routes, behind `x-gymbuddy-admin-token`:

```bash
# One muscle group per call; nineteen calls fill the catalogue (?force=true restarts the cycle)
curl -X POST http://localhost:8787/api/v1/admin/catalog/sync \
  -H "x-gymbuddy-admin-token: $ADMIN_TOKEN"

# An invitation code, which is how the first account is created
curl -X POST http://localhost:8787/api/v1/admin/invitations \
  -H "x-gymbuddy-admin-token: $ADMIN_TOKEN"
```

Passkeys need a secure context. `localhost` counts, so a desktop browser is enough; testing on a real phone needs HTTPS, for example through a `cloudflared` tunnel, with `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN` set to the tunnel's host.

---

## The API

Routes are versioned under `/api/v1`. Everything except `/health`, the auth ceremonies and the admin routes requires a session.

| Area | Endpoints |
|---|---|
| Health | `GET /health` |
| Catalogue | `GET /catalog/bodyparts`, `/catalog/bodyparts/{bodyPart}`, `/catalog/search`, `/catalog/exercises/{muscle}/{slug}` |
| Auth | `POST /auth/registration/options` · `/verify`, `/auth/login/options` · `/verify`, `/auth/devices/link` · `/options` · `/verify`, `GET`/`PATCH /auth/me`, `GET`/`POST /auth/invitations` |
| Exercises | `GET`/`POST /exercises`, `GET`/`PATCH /exercises/{id}`, `PUT`/`DELETE /exercises/{id}/media`, `GET /exercises/{id}/media/{mediaId}` |
| Sessions | `POST /sessions`, `GET /sessions/active`, `GET`/`DELETE /sessions/{id}`, `POST /sessions/{id}/sets`, `PATCH`/`DELETE /sessions/{id}/sets/{setId}`, `PUT`/`DELETE /sessions/{id}/cardio`, `POST /sessions/{id}/end` |
| History & stats | `GET /history/sessions`, `/history/exercises/{id}`, `/stats/week`, `/stats/signals`, `/stats/exercise/{id}` |
| Routines | `GET`/`POST /routines`, `GET`/`PATCH`/`DELETE /routines/{id}` |
| Backup | `GET /export/snapshot`, `GET /export/sessions`, `POST /import/exercises` · `/routines` · `/sessions` |
| Push | `GET /push/config`, `PUT`/`DELETE /push/subscription`, `PUT`/`DELETE /push/rest-notice` |

Errors are uniform and never silent:

```json
{ "error": { "code": "exercise_not_found", "message": "…", "detail": {} } }
```

A strength set as it travels over the wire — note the weight as a fixed two-decimal string and the explicit UTC timestamp:

```json
{
  "id": "0f7c…",
  "kind": "strength",
  "trackedExerciseId": "2b19…",
  "orderIndex": 3,
  "weight": "82.50",
  "reps": 5,
  "rpe": 8.5,
  "isWarmup": false,
  "completedAt": "2026-09-20T18:42:11.000Z"
}
```

### Using the contract

`@gymbuddy/shared` is a workspace package with no build step: it exports its TypeScript sources, and both apps import from it directly.

```ts
import { logSetRequestSchema, estimateOneRepMaxGrams, barbellLoad } from '@gymbuddy/shared';

// The Worker validates with the same schema the PWA infers its types from
const body = logSetRequestSchema.parse(await c.req.json());

// Pure domain maths, integer grams in and out
estimateOneRepMaxGrams(82_500, 5); // 96_250  → 96.25 kg
barbellLoad(82_500); // { perSide: [25_000, 5_000, 1_250], remainderGrams: 0 }
```

---

## Development

```bash
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
```

That is exactly what `.github/workflows/ci.yml` runs on every push to `main`. The order matters: the Worker's lint needs the binding types that `wrangler types` generates during `typecheck`, and `pnpm format` is Prettier in `--check` mode.

The test suite is split the way the code is: pure domain and contract tests in `packages/shared`, Worker tests running against a **real D1** through `@cloudflare/vitest-pool-workers`, and hook and screen tests for the PWA under jsdom. WebAuthn is covered by a virtual authenticator built in `apps/api/test/`, which signs with real WebCrypto keys and assembles the CBOR by hand. **No test touches the network**: the CDN, the push service and the browser APIs are all faked.

Deploying, the production secrets, the D1 backup script and the rehearsed restore procedure are documented in [`docs/operations/`](docs/operations).

---

## Troubleshooting

**`wrangler dev` fails, or the Worker tests will not start.** The `compatibility_date` in `wrangler.toml` cannot be ahead of the `workerd` build that ships with the test pool. If you bump it, bump `wrangler` too.

**`c.env.JWT_SECRET` is typed as `string` locally and disappears in CI.** `wrangler types` generates a different `Env` depending on whether `.dev.vars` exists. Secrets are therefore read through `readSecret` in `apps/api/src/http/env.ts`, never off `c.env` directly.

**A query fails with a parameter limit.** D1 allows **100 bound parameters per statement**. Multi-row inserts are chunked by `rowsPerInsert(table)` in `apps/api/src/db/batching.ts`, which derives the row count from the table's column count — a hard-coded row count silently overflows the day a column is added.

**A migration that recreates a table wipes related rows.** D1 enforces foreign keys at all times and ignores `PRAGMA foreign_keys=OFF`, so the `DROP TABLE` in a drizzle-kit table rebuild fires every `ON DELETE CASCADE`. Columns are dropped with `ALTER TABLE … DROP COLUMN`; a genuine rebuild moves child tables aside first (see migration `0008`).

**A `wrangler d1 export` dump cannot be re-imported as it is.** It declares tables in SQLite's order rather than by dependency, and its `PRAGMA defer_foreign_keys=TRUE` does not survive the import being split into several transactions. `apps/api/scripts/restore-d1.sh` reorders the `INSERT`s by dependency; the whole procedure is written up in [`docs/operations/copia-de-seguridad-de-la-d1.md`](docs/operations/copia-de-seguridad-de-la-d1.md).

---

## Credits

The exercise catalogue — metadata and animated demonstrations for 1,323 exercises — comes from **[`JahelCuadrado/ExerciseGymGifsDB`](https://github.com/JahelCuadrado/ExerciseGymGifsDB)**, served through [jsDelivr](https://www.jsdelivr.com/). None of it is redistributed here: GymBuddy links to the CDN and caches only JSON metadata, and the app credits the source on screen as well.

Built with [Hono](https://hono.dev/), [Drizzle ORM](https://orm.drizzle.team/), [Zod](https://zod.dev/), [SimpleWebAuthn](https://simplewebauthn.dev/), [React](https://react.dev/), [TanStack Query](https://tanstack.com/query), [Vite](https://vite.dev/) and [Mediabunny](https://mediabunny.dev/), on [Cloudflare Workers](https://workers.cloudflare.com/), D1, R2 and Durable Objects.

## License

MIT — see [`LICENSE`](LICENSE).
