import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { passwordMatches, createSession, sessionCookie, hasValidOrigin } from '@/lib/auth';
import { redisConnection, required } from '@est/core';

export const runtime = 'nodejs';

// Railway terminates HTTPS at its proxy. request.url can have an internal
// localhost host here, so redirects must use the configured public origin.
function publicUrl(path: string): URL {
  return new URL(path, required('APP_PUBLIC_ORIGIN'));
}

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) {
    return new Response('Origin rejected', { status: 403 });
  }

  const form = await request.formData();
  const password = String(form.get('password') || '');
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const hash = createHash('sha256').update(ip).digest('hex').slice(0, 32);
  const key = `est:loginfail:${hash}`;
  const redis = redisConnection();

  if (Number((await redis.get(key)) || 0) >= 5) {
    return NextResponse.redirect(publicUrl('/login?error=rate'), { status: 303 });
  }

  if (!passwordMatches(password)) {
    await redis.multi().incr(key).expire(key, 900).exec();
    return NextResponse.redirect(publicUrl('/login?error=incorrect'), { status: 303 });
  }

  await redis.del(key);
  const response = NextResponse.redirect(publicUrl('/'), { status: 303 });
  response.cookies.set(sessionCookie(createSession()));
  return response;
}
