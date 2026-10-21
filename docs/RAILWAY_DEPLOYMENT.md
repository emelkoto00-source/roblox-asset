# Railway deployment guide (GitHub-connected)

**Milestone:** EST Asset Cloud v0.1, personal **and** group ownership, 150 essential assets by default.

## 1. Create GitHub repository

From the extracted project root:

```bash
npm install
npm run make:password
# save the printed hashes/secrets into Railway variables (never GitHub)
git init
git add .
git commit -m "Initial EST Roblox Asset Cloud"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/est-roblox-asset-cloud.git
git push -u origin main
```

The repository **does not contain** API keys, owner credentials, or your 630-PNG asset ZIP.

## 2. Create one Railway project with five resources

1. **PostgreSQL** database.
2. **Redis** database.
3. **S3-compatible bucket** (Railway Bucket if available, otherwise Cloudflare R2 or another S3-compatible provider).
4. **Web service**, from your GitHub repository, root directory `/`.
5. **Worker service**, from the **same repository**, root directory `/`.

Do not try to mount one Railway volume to both web and worker. A shared bucket is the cross-service handoff.

## 3. Configure service build and start commands

Both web and worker:

- Runtime: Node.js 22 or newer.
- Install/build: `npm ci` **if package-lock.json exists**, otherwise `npm install`.
- For web, build: `npm run build`, start: `npm run start:web`.
- For worker, build: not needed, start: `npm run start:worker` (tsx executes the TypeScript service).

Point Railway's domain at the **web service only**. Never publicly expose the worker, Postgres, Redis, or bucket admin credentials.

## 4. Environment variables

Share these with WEB and WORKER:

```text
DATABASE_URL=<Railway Postgres connection variable>
REDIS_URL=<Railway Redis connection variable>
S3_ENDPOINT=<S3 endpoint>
S3_BUCKET=<bucket name>
S3_REGION=<provider region or auto>
S3_ACCESS_KEY_ID=<storage key>
S3_SECRET_ACCESS_KEY=<storage secret>
S3_FORCE_PATH_STYLE=true
```

WEB service only:

```text
APP_PUBLIC_ORIGIN=https://your-real-web-domain.up.railway.app
APP_PASSWORD_HASH=<scrypt salt:hash from npm run make:password>
SESSION_SECRET=<generated random 64-char hex>
ALLOWED_ROBLOX_USER_ID=<numeric user id>
ALLOWED_ROBLOX_GROUP_ID=<numeric group id>
ROBLOX_UPLOADS_ENABLED=false
MAX_ZIP_BYTES=35000000
```

WORKER service only:

```text
ROBLOX_OPEN_CLOUD_API_KEY_USER=<personal asset creation key>
ROBLOX_OPEN_CLOUD_API_KEY_GROUP=<group asset creation key>
ALLOWED_ROBLOX_USER_ID=<numeric user id>
ALLOWED_ROBLOX_GROUP_ID=<numeric group id>
ROBLOX_UPLOADS_ENABLED=false
ROBLOX_ASSET_TYPE=Decal
ROBLOX_CREATE_ASSET_URL=https://apis.roblox.com/assets/v1/assets
ROBLOX_OPERATION_URL_PREFIX=https://apis.roblox.com/assets/v1/operations/
ROBLOX_UPLOADS_PER_SECOND=2
```

**Before live publishing:** confirm current Roblox Open Cloud Assets API path, asset type (`Decal` vs `Image`), request JSON, Creator fields, required key permissions, group ownership behavior, and operation polling endpoint against [Roblox Creator Hub's Open Cloud Assets documentation](https://create.roblox.com/docs/cloud). They are configurable because the website could not verify the live docs during authoring.

Once verified, set `ROBLOX_UPLOADS_ENABLED=true` on BOTH services. Never prefix secrets with `NEXT_PUBLIC_`.

## 5. Database migration

Once from your local shell (with Railway DATABASE_URL exported):

```bash
npm run db:init
```

For automated deployment, run this once as a Railway pre-deploy command using the same code base (e.g. `npm run db:init`). Subsequent executions are safe (`CREATE TABLE IF NOT EXISTS`).

## 6. Check before enabling upload

- Login using the password you generated; test the wrong-password rate limit.
- Visit `/api/connection` **while logged in**; it shows owner IDs and the uploads-enabled flag (credentials intentionally live only in the worker).
- Import your exact EST V4 asset ZIP with `essential` selected.
- Check the staged count is **150** and folders are correct.
- Verify no POST requests to Roblox occurred while `ROBLOX_UPLOADS_ENABLED=false`.
- Validate API scope and owner IDs through official docs and a **single deliberate test asset** before trying 150.
- Enable uploads and start a small test batch. Use the **First: create one test asset** button on the staged batch. Wait for its result and verify its usability before publishing the remaining 149.

**Important:** the current dashboard has a conservative `needs_review` state. It does not automatically retry ambiguous create requests. A reviewer should inspect uncertain operations or Creator Dashboard entries before deciding to resubmit.

## 7. Exports

The authenticated dashboard exports:

- `.luau` reference tables for essential assets;
- `.json` registry for Astra;
- `.csv` with every file, status, and its Roblox ID when returned.

An asset marked **created** has a Roblox asset ID returned by the API; it is not a moderation approval. Confirm each image is usable under the target game creator account/group in Roblox Studio.

## 8. Practical security controls

- Strong secret password (scrypt hash), time-limited HMAC session cookie, same-site strict, secure in production, and POST origin validation.
- Redis limits failed logins, max five attempts per IP per 15 minutes (basic throttling, not enterprise WAF protection).
- The API key is referenced only by the server-side worker, selected by the admin's preapproved owner type.
- ZIP scanner has entry, decompressed-size, path, file-format, schema, and count validation.
- File content and S3 keys never leave the authenticated admin APIs.
- No Roblox .ROBLOSECURITY cookies or website credentials required.
- Use least-privilege Roblox keys; rotate them if leaked. Consider static egress if the API key requires explicit IP restrictions.
- Keep Railway and GitHub admin access restricted; use HTTPS on the Railway domain.
