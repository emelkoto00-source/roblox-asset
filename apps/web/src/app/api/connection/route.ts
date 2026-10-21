import { NextResponse } from 'next/server';
import { guard } from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const deny=await guard(request);if(deny)return deny;
 return NextResponse.json({
  personal:{ownerId:process.env.ALLOWED_ROBLOX_USER_ID||null},
  group:{ownerId:process.env.ALLOWED_ROBLOX_GROUP_ID||null},
  uploadsEnabled:process.env.ROBLOX_UPLOADS_ENABLED==='true',
  credentialLocation:'Worker-only Railway secrets; not accessible from web by design',
  note:'Owner IDs and feature flag do not validate Roblox API permissions or moderation status.'
 },{headers:{'Cache-Control':'private, no-store'}});
}
