let memoryToken: string | null = null;
let tokenRefreshFn: (() => Promise<string | null>) | null = null;

export function setMemoryToken(token: string | null) {
  memoryToken = token;
}

export function getMemoryToken(): string | null {
  return memoryToken;
}

export function registerTokenRefresher(fn: (() => Promise<string | null>) | null) {
  tokenRefreshFn = fn;
}

export class ApiError extends Error {
  status: number;
  payload: any;
  constructor(message: string, status: number, payload?: any) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  let token = memoryToken;
  if (!token && tokenRefreshFn) {
    token = await tokenRefreshFn();
  }

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(path, { ...options, headers });

  if (res.status === 401 && tokenRefreshFn && (!token || !token.startsWith('cops.'))) {
    const fresh = await tokenRefreshFn();
    if (fresh) {
      headers.set('Authorization', `Bearer ${fresh}`);
      const retry = await fetch(path, { ...options, headers });
      if (!retry.ok) {
        const errBody = await retry.json().catch(() => ({}));
        throw new ApiError(errBody.error || `Request failed (${retry.status})`, retry.status, errBody);
      }
      return retry.json() as Promise<T>;
    }
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new ApiError(errBody.error || `Request failed (${res.status})`, res.status, errBody);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json() as Promise<T>;
  }
  return res.text() as unknown as T;
}

export async function apiDownloadCsv(path: string, filename: string) {
  const token = memoryToken || (tokenRefreshFn ? await tokenRefreshFn() : null);
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(path, { headers });
  if (!res.ok) {
    throw new Error('Failed to export file');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
