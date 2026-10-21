import { NextResponse } from 'next/server';
import { isAdmin,hasValidOrigin } from './auth';
export async function guard(request:Request,mutate=false){
  if(!await isAdmin())return NextResponse.json({error:'Unauthorized'},{status:401});
  if(mutate&&!hasValidOrigin(request))return NextResponse.json({error:'Origin check failed'},{status:403});
  return null;
}
export function failure(e:unknown){
  console.error('API error:',e instanceof Error?e.message:'unknown');
  return NextResponse.json({error:e instanceof Error?e.message:'Unexpected server error'},{status:400});
}
