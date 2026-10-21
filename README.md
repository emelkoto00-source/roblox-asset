# EST Roblox Asset Cloud

**Private Railway + GitHub bulk image publishing dashboard** for the EST V4 Cinematic Particle Collection.

This is the **first deployable implementation**: Next.js dashboard, ZIP staging, personal/group routing, durable worker queue, Roblox Assets API adapter, operation polling, and Luau/JSON/CSV exports. Asset API request compatibility must be verified against Roblox's current official documentation before switching on live uploads. Roblox moderation is not bypassed.

![Model: a private creator upload dashboard](https://img.shields.io/badge/status-initial%20implementation-7c4dff)

## What is built

- Private admin authentication (scrypt, HMAC session, login throttling, strict-origin POSTs).
- Validates the **actual EST V4 manifest** (15 effect folders; 8 particle PNGs, 1 burst sheet, 1 ambient loop per folder).
- Mode `essential` **default: 150 files**; optional modes `frames`: 600; `all`: 630.
- Distinguishes personal owner and group owner; **fixed server-side numeric owner IDs**, no arbitrary client creator targeting.
- ZIP safety controls, PNG validation, checksums, S3-compatible storage, persistent PostgreSQL database.
- Explicit "scan & stage", an optional **one-asset test**, then "confirm & publish remaining".
- BullMQ Redis durable background publisher with creation-operation polling and conservative ambiguity handling.
- Download Luau, JSON, and CSV maps with image IDs, ordered by asset folder/name.
- Reports `created`, **not falsely** `moderation approved`.

## Repo layout

```text
apps/
  web/                  Next.js 15 responsive private dashboard and authenticated API routes
  worker/               BullMQ background asset uploads and operation polling
packages/
  core/src/scanner.ts    EST V4 ZIP scanner and 150 / 600 / 630 file selectors
  core/src/roblox.ts     Roblox Open Cloud API client / owner selection
  core/src/export.ts     Luau, JSON, CSV registry builders
  core/src/storage.ts    S3-compatible shared file storage
  core/src/db.ts         PostgreSQL access layer
  core/src/queue.ts      Durable Redis/BullMQ queue
scripts/
  schema.sql            Database tables
  init-db.ts            Apply safe schema creation
  make-password.mjs     Generate scrypt password hash and session secret
samples/
  EST_V4_ASSET_MANIFEST.json  Actual manifest from your particle pack

docs/
  RAILWAY_DEPLOYMENT.md  Full Railway and GitHub instructions
  ROBLOX_OPEN_CLOUD_SETUP.md  Secure personal/group Open Cloud checklist
```

## Quickstart

1. `npm install`
2. `npm run make:password`
3. Set up PostgreSQL, Redis, and S3 bucket (see `.env.example`).
4. Create `.env.local` for local web and process env for worker. **Never commit keys.**
5. `npm run db:init`
6. In separate terminals run `npm run dev` and `npm run start:worker`.
7. Open `http://localhost:3000` (set `APP_PUBLIC_ORIGIN=http://localhost:3000` locally), log in, and import your EST V4 ZIP.

**For Railway deployment** follow [docs/RAILWAY_DEPLOYMENT.md](docs/RAILWAY_DEPLOYMENT.md).

**Roblox connection setup** is in [docs/ROBLOX_OPEN_CLOUD_SETUP.md](docs/ROBLOX_OPEN_CLOUD_SETUP.md).

## Current limitations and next features

- Official Roblox Assets API request shape and permissions have **not been live-tested in this environment**. The adapter must be validated before production uploads.
- Per-file inclusion/exclusion, upload pause/resume, manual safe retry, moderation confirmation, asset thumbnails, are sensible future improvements.
- An ambiguous POST can leave a `needs_review` row, or a `submitting` row if a worker was abruptly terminated. Do not automatically retry these without checking Roblox first.
- Assets marked `created` are **not necessarily moderated or usable** in a particular experience.
- One-asset test is recommended before batch creation. For now, keep `ROBLOX_UPLOADS_ENABLED=false` until validation is complete.
- Website code does not include the original 630-PNG pack; upload the ZIP through the dashboard to stage images.

## Security

A backend-only Open Cloud API key is required. No Roblox password, session cookie, or moderation bypass is requested or supported. Keep the app private and avoid broad group permissions.
