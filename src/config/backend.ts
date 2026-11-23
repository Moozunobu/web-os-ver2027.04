export const DEFAULT_CF_WORKER_URL = 'https://wetalks-backend.mozunbu0123.workers.dev';

function sanitizeBaseUrl(raw: string | undefined | null): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return '';
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate) && !/^wss?:\/\//i.test(candidate)) {
    candidate = 'https://' + candidate.replace(/^\/+/, '');
  }
  candidate = candidate.replace(/\/api\/wetalks.*$/i, '').replace(/\/+$/, '');
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'ws:' && u.protocol !== 'wss:') {
      return '';
    }
    const cleanPath = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/+$/, '') : '';
    return u.origin + cleanPath;
  } catch {
    return '';
  }
}

const metaEnv = (typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: Record<string, string | undefined> }).env : undefined) || {};

export const ENV_API_BASE_URL = sanitizeBaseUrl(metaEnv.VITE_API_BASE_URL);

export const ENV_WS_BASE_URL = (() => {
  const raw = metaEnv.VITE_WS_BASE_URL || '';
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const normalized = sanitizeBaseUrl(trimmed);
  if (!normalized) return '';
  return normalized.replace(/^http/i, 'ws');
})();

export function isGitHubPagesHost(): boolean {
  try {
    return Boolean(typeof window !== 'undefined' && window.location?.hostname?.endsWith('github.io'));
  } catch {
    return false;
  }
}

export function getSavedWorkerUrl(): string {
  try {
    const saved = localStorage.getItem('wetalks_cloudflare_url');
    const clean = sanitizeBaseUrl(saved);
    return clean || ENV_API_BASE_URL || DEFAULT_CF_WORKER_URL;
  } catch {
    return ENV_API_BASE_URL || DEFAULT_CF_WORKER_URL;
  }
}

export function resolveApiBaseUrl(): string {
  if (typeof window === 'undefined') return ENV_API_BASE_URL || '';
  if (isGitHubPagesHost()) {
    return ENV_API_BASE_URL || getSavedWorkerUrl();
  }
  try {
    const backend =
      localStorage.getItem('wetalks_backend_type_v2') ||
      localStorage.getItem('wetalks_backend_type') ||
      '';
    if (backend === 'cloudflare') {
      return getSavedWorkerUrl();
    }
  } catch {}
  if (ENV_API_BASE_URL) return ENV_API_BASE_URL;
  return window.location?.origin && window.location.origin !== 'null' ? window.location.origin : '';
}

export function resolveWeTalksApiBaseUrl(): string {
  if (typeof window === 'undefined') return ENV_API_BASE_URL || DEFAULT_CF_WORKER_URL;
  let backend = '';
  try {
    backend =
      localStorage.getItem('wetalks_backend_type_v2') ||
      localStorage.getItem('wetalks_backend_type') ||
      'cloudflare';
  } catch {
    backend = 'cloudflare';
  }
  if (backend === 'supabase') return '';
  if (isGitHubPagesHost()) {
    return ENV_API_BASE_URL || getSavedWorkerUrl();
  }
  if (backend === 'cloudflare') {
    return getSavedWorkerUrl();
  }
  if (ENV_API_BASE_URL) return ENV_API_BASE_URL;
  return window.location?.origin && window.location.origin !== 'null' ? window.location.origin : '';
}

export function resolveWsBaseUrl(): string {
  if (ENV_WS_BASE_URL) return ENV_WS_BASE_URL;
  try {
    const custom = sanitizeBaseUrl(localStorage.getItem('webos_ws_origin'));
    if (custom) return custom.replace(/^http/i, 'ws');
  } catch {}
  if (isGitHubPagesHost()) {
    if (ENV_API_BASE_URL && !ENV_API_BASE_URL.includes('.workers.dev')) {
      return ENV_API_BASE_URL.replace(/^http/i, 'ws');
    }
    return '';
  }
  try {
    if (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null') {
      return window.location.origin.replace(/^http/i, 'ws');
    }
  } catch {}
  return '';
}

export function buildApiUrl(endpoint: string): string {
  if (!endpoint.startsWith('/')) return endpoint;
  const base = resolveApiBaseUrl();
  return base ? `${base}${endpoint}` : endpoint;
}
