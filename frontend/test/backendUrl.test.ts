import { describe, expect, it } from 'vitest';
import { resolveBackendUrl } from '@/lib/backendUrl';

describe('resolveBackendUrl', () => {
  it('prefers an explicit BACKEND_URL and strips a trailing slash', () => {
    expect(resolveBackendUrl({ BACKEND_URL: 'http://backend:4000/', BACKEND_HOST: 'x.onrender.com' })).toBe('http://backend:4000');
  });

  it('builds an https URL from a bare BACKEND_HOST (Render Blueprint)', () => {
    expect(resolveBackendUrl({ BACKEND_HOST: 'prospect-map-api.onrender.com' })).toBe('https://prospect-map-api.onrender.com');
  });

  it('falls back to localhost for local development', () => {
    expect(resolveBackendUrl({})).toBe('http://localhost:4000');
    expect(resolveBackendUrl({ BACKEND_URL: '  ' })).toBe('http://localhost:4000');
  });
});
