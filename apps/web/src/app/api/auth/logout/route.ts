import { NextResponse } from 'next/server';
import { hasValidOrigin } from '@/lib/auth';
import { required } from '@est/core';

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) {
    return new Response('Origin rejected', { status: 403 });
  }

  // Redirect to the public Railway domain, not an internal localhost URL.
  const response = NextResponse.redirect(
    new URL('/login', required('APP_PUBLIC_ORIGIN')),
    { status: 303 },
  );
  response.cookies.set({ name: 'est_cloud_session', value: '', path: '/', maxAge: 0 });
  return response;
}
