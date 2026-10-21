/**
 * Backend base URL, in order of precedence:
 * 1. BACKEND_URL: explicit (local dev, docker-compose, or a manual override).
 * 2. BACKEND_HOST: a bare hostname, e.g. injected by the Render Blueprint from the API
 *    service's RENDER_EXTERNAL_HOSTNAME (free instances can't use the private network).
 * 3. http://localhost:4000
 */
export function resolveBackendUrl(env: Record<string, string | undefined> = process.env): string {
  const url = env.BACKEND_URL?.trim() || (env.BACKEND_HOST?.trim() ? `https://${env.BACKEND_HOST.trim()}` : 'http://localhost:4000');
  return url.replace(/\/$/, '');
}
