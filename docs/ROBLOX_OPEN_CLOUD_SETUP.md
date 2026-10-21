# Secure Roblox Open Cloud connection — personal + group

Roblox creator services can evolve; this document describes the intended asset workflow, not a live verification of October 2026 API details.

## Step 1 — Set the ownership IDs

From Roblox Creator Dashboard, identify:

- The **numeric User ID** for your personal creator.
- The **numeric Group ID** for your group/community.

Set `ALLOWED_ROBLOX_USER_ID` and `ALLOWED_ROBLOX_GROUP_ID` in the **web** and **worker** services. They are server-controlled allowlists, not submitted as arbitrary IDs from the browser.

## Step 2 — Create limited Open Cloud API keys

In Roblox Creator Dashboard's Open Cloud credentials settings, create a key with the smallest asset creation/read-operation permissions appropriate to the creator. Repeat for group ownership if needed. Your group account or role must have permission to create assets for the group.

Place keys into Railway **worker-only** secrets:

```text
ROBLOX_OPEN_CLOUD_API_KEY_USER=<secret>
ROBLOX_OPEN_CLOUD_API_KEY_GROUP=<secret>
```

You may use separate keys for safer isolation. If Roblox permits one key to cover both scopes, you can use the same value in both environment variables, but do not assume personal keys automatically authorize group creations.

Do NOT paste these keys into chat, GitHub, the web app, a frontend `NEXT_PUBLIC_*` variable, or the ZIP manifest.

## Step 3 — Confirm current API semantics

The adapter in `packages/core/src/roblox.ts` has configurable API paths. It presently constructs:

```text
POST https://apis.roblox.com/assets/v1/assets
multipart/form-data:
  request = JSON({assetType: "Decal", displayName, description, creationContext:{creator:{userId | groupId}}})
  fileContent = PNG bytes
x-api-key = secret from Railway worker
```

The worker then polls the operation endpoint, if the API returns an operation reference. The **exact path, accepted asset type, request format, and operation fields must be checked against the live Roblox documentation** before enabling publishing. ImageLabel may require a usable image texture asset ID rather than a decal container ID; test and, if required, adapt the created asset ID mapping.

There is no `.ROBLOSECURITY` cookie flow. Do not add one.

## Step 4 — Run with uploads disabled first

1. Keep `ROBLOX_UPLOADS_ENABLED=false` in both services.
2. Confirm `/api/connection` returns the intended owner IDs and whether credentials are configured.
3. Stage and inspect the EST V4 ZIP. It should have 150 essential assets, 15 folders, eight particles and two sheets per folder.
4. Validate the adapter against Roblox's official docs and test creator permissions on a single approved image.
5. Turn on `ROBLOX_UPLOADS_ENABLED=true` only when you are ready to publish.

## Step 5 — Moderation expectations

- A successful create operation returns a Roblox asset ID; it does **not** itself prove moderation approval.
- Some assets may be moderated or may not be accessible to the target experience.
- Track creation operation status, verify texture usability in Studio, and never claim moderation is bypassed.
- If POST times out after Roblox may have received it, the worker marks it `needs_review` rather than duplicating it blindly.
