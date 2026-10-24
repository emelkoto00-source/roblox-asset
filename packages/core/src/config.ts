export function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}
export const checkedMaxZipBytes = () => Math.min(110_000_000, Math.max(1_000_000, Number(process.env.MAX_ZIP_BYTES || 110_000_000)));
export type Ownership = 'user'|'group';
export type Selection = 'essential'|'all'|'frames';
export const VALID_MODES: Selection[] = ['essential','all','frames'];
export function creatorSettings(type: Ownership) {
  if (type === 'user') return { ownerId: required('ALLOWED_ROBLOX_USER_ID'), apiKey: required('ROBLOX_OPEN_CLOUD_API_KEY_USER') };
  if (type === 'group') return { ownerId: required('ALLOWED_ROBLOX_GROUP_ID'), apiKey: required('ROBLOX_OPEN_CLOUD_API_KEY_GROUP') };
  throw new Error('Unsupported creator type');
}
