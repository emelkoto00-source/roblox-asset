import { cookies } from 'next/headers';
import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import { required } from '@est/core';
const COOKIE='est_cloud_session';
function sig(content:string){return createHmac('sha256',required('SESSION_SECRET')).update(content).digest('hex')}
export function passwordMatches(password:string){
  try {
    const [salt,hex]=required('APP_PASSWORD_HASH').split(':');
    if(!salt||!hex||password.length>512)return false;
    const actual=scryptSync(password,Buffer.from(salt,'hex'),64);
    const expected=Buffer.from(hex,'hex');
    return actual.length===expected.length && timingSafeEqual(actual,expected);
  } catch {return false}
}
export function createSession(){
  const expires=Date.now()+12*3600_000;
  const nonce=crypto.randomUUID();
  const payload=`${expires}.${nonce}`;
  return `${payload}.${sig(payload)}`;
}
function validSession(token:string|undefined){
  if(!token)return false;
  const [exp,nonce,mac]=token.split('.');
  if(!exp||!nonce||!mac||!/^\d+$/.test(exp)||Number(exp)<Date.now())return false;
  const expected=Buffer.from(sig(`${exp}.${nonce}`),'hex');
  const actual=Buffer.from(mac,'hex');
  return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
export async function isAdmin(){const jar=await cookies();return validSession(jar.get(COOKIE)?.value)}
export function sessionCookie(value:string){return {name:COOKIE,value,httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict' as const,path:'/',maxAge:43200}}
export function hasValidOrigin(request:Request){
  const origin=request.headers.get('origin');
  const expected=process.env.APP_PUBLIC_ORIGIN;
  // Require explicit matching origin on every state-changing operation.
  if(!origin||!expected)return false;
  try {return new URL(origin).origin===new URL(expected).origin;}catch{return false}
}
