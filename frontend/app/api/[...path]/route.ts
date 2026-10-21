import type { NextRequest } from 'next/server';
import { resolveBackendUrl } from '@/lib/backendUrl';

/**
 * Same-origin proxy to the Express backend. Reading BACKEND_URL at request time
 * (rather than baking it into next.config rewrites at build time) lets one
 * Docker image run against any backend address.
 */
export const dynamic = 'force-dynamic';

const BACKEND_URL = resolveBackendUrl();
/** Generous by default: a sleeping free-tier backend can take ~a minute to wake. */
const TIMEOUT_MS = Number(process.env.BACKEND_TIMEOUT_MS) || 70_000;
const FORWARDED_HEADERS = ['authorization', 'content-type', 'accept'];

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = `${BACKEND_URL}/api/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const h of FORWARDED_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer(),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const resHeaders = new Headers();
    const ct = upstream.headers.get('content-type');
    if (ct) resHeaders.set('content-type', ct);
    const location = upstream.headers.get('location');
    if (location) resHeaders.set('location', location);
    return new Response(upstream.status === 204 ? null : upstream.body, { status: upstream.status, headers: resHeaders });
  } catch {
    return Response.json(
      { error: { code: 'BACKEND_UNAVAILABLE', message: 'The prospect service is unreachable. Is the backend running?' } },
      { status: 502 },
    );
  }
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
