CREATE TABLE IF NOT EXISTS batches (
  id UUID PRIMARY KEY,
  filename TEXT NOT NULL,
  owner_type TEXT NOT NULL CHECK(owner_type IN ('user','group')),
  owner_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('essential','frames','all')),
  status TEXT NOT NULL DEFAULT 'staged',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  effect TEXT NOT NULL,
  kind TEXT NOT NULL,
  rel_path TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  status TEXT NOT NULL DEFAULT 'staged',
  asset_id TEXT,
  operation_ref TEXT,
  error_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(batch_id,rel_path)
);
CREATE INDEX IF NOT EXISTS assets_batch_status_idx ON assets(batch_id,status);
CREATE INDEX IF NOT EXISTS assets_operation_idx ON assets(operation_ref);
