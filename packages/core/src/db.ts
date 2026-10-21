import pg from 'pg';
import { required } from './config';
let pool: pg.Pool | undefined;
export function db() {
  if (!pool) pool = new pg.Pool({ connectionString: required('DATABASE_URL'), max: 8, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined });
  return pool;
}
export type BatchRecord = { id:string, filename:string, owner_type:'user'|'group', owner_id:string, mode:string, status:string, created_at:string };
export type AssetRecord = {id:string,batch_id:string,effect:string,kind:string,rel_path:string,storage_key:string,sha256:string,status:string,asset_id:string|null,operation_ref:string|null,error_text:string|null};
export async function getBatch(id:string) { const {rows}=await db().query<BatchRecord>('SELECT * FROM batches WHERE id=$1',[id]); return rows[0] ?? null; }
export async function getAssets(id:string) { const {rows}=await db().query<AssetRecord>('SELECT * FROM assets WHERE batch_id=$1 ORDER BY effect,kind,rel_path',[id]);return rows; }
