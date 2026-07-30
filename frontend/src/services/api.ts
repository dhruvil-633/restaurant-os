import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { ApiError, ApiSuccess, AuthPayload, PaginationMeta } from '@/types';

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5000';

export const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');

/* ── Token storage ───────────────────────────────────────────────────────
   The access token is short-lived and kept in memory where an XSS payload
   cannot read it from storage. The refresh token is persisted because the
   session must survive a page reload, and is also mirrored into an httpOnly
   cookie by the API for browsers that accept it.
   ──────────────────────────────────────────────────────────────────────── */

const REFRESH_KEY = 'restaurantos-refresh';

let accessToken: string | null = null;

export const tokenStore = {
  getAccessToken: (): string | null => accessToken,
  setAccessToken: (token: string | null): void => {
    accessToken = token;
  },
  getRefreshToken: (): string | null => {
    try {
      return localStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  },
  setRefreshToken: (token: string | null): void => {
    try {
      if (token) localStorage.setItem(REFRESH_KEY, token);
      else localStorage.removeItem(REFRESH_KEY);
    } catch {
      /* Private browsing can block storage — the in-memory token still works. */
    }
  },
  clear: (): void => {
    accessToken = null;
    tokenStore.setRefreshToken(null);
  },
};

/* ── Client ──────────────────────────────────────────────────────────────── */

export const api: AxiosInstance = axios.create({
  baseURL: `${API_ORIGIN}/api`,
  withCredentials: true,
  // Render's free tier sleeps after 15 minutes idle and takes ~50s to wake.
  // A 30s timeout guarantees the first request of a session fails even though
  // the server is coming up fine, so the ceiling sits above the cold start.
  timeout: 70_000,
  headers: { 'Content-Type': 'application/json' },
});

/** True while the very first request of a session is still in flight. */
let coldStartPending = true;
type ColdStartListener = (waking: boolean) => void;
const coldStartListeners = new Set<ColdStartListener>();

export function onColdStartChange(listener: ColdStartListener): () => void {
  coldStartListeners.add(listener);
  return () => coldStartListeners.delete(listener);
}

function settleColdStart(): void {
  if (!coldStartPending) return;
  coldStartPending = false;
  coldStartListeners.forEach((listener) => listener(false));
}

/** Announces a slow first request so the UI can explain the wait. */
export function markWakingIfSlow(): void {
  if (!coldStartPending) return;
  coldStartListeners.forEach((listener) => listener(true));
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Called when refresh fails, so the app can drop to the login screen. */
type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler = () => undefined;

export function setSessionExpiredHandler(handler: SessionExpiredHandler): void {
  onSessionExpired = handler;
}

/* A single refresh is shared by every request that 401s while it is in
   flight, so a burst of parallel calls cannot trigger a refresh storm. */
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = tokenStore.getRefreshToken();

  const { data } = await axios.post<ApiSuccess<AuthPayload>>(
    `${API_ORIGIN}/api/auth/refresh`,
    // Sent in the body as well as the cookie: browsers that block third-party
    // cookies would otherwise silently fail on a Vercel → Render deployment.
    refreshToken ? { refreshToken } : {},
    { withCredentials: true, timeout: 20_000 },
  );

  tokenStore.setAccessToken(data.data.accessToken);
  tokenStore.setRefreshToken(data.data.refreshToken);
  return data.data.accessToken;
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

api.interceptors.response.use(
  (response) => {
    settleColdStart();
    return response;
  },
  async (error: AxiosError<ApiError>) => {
    // A response of any kind means the server is awake.
    if (error.response) settleColdStart();
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    const isAuthRoute = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/refresh');

    if (status === 401 && original && !original._retried && !isAuthRoute) {
      original._retried = true;

      try {
        refreshPromise = refreshPromise ?? refreshAccessToken();
        const token = await refreshPromise;
        refreshPromise = null;

        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch (refreshError) {
        refreshPromise = null;
        tokenStore.clear();
        onSessionExpired();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/** Extracts a human-readable message from any thrown value. */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError<ApiError>(error)) {
    if (error.code === 'ECONNABORTED') return 'The request timed out. Please try again.';
    if (!error.response) {
      return 'Cannot reach the server. Check your connection and that the API is running.';
    }
    return error.response.data?.message ?? fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

/** Field-level validation errors, keyed by field name, for form binding. */
export function getFieldErrors(error: unknown): Record<string, string> {
  if (!axios.isAxiosError<ApiError>(error)) return {};
  const issues = error.response?.data?.issues ?? [];
  return Object.fromEntries(issues.map((issue) => [issue.field, issue.message]));
}

/** Unwraps `{ success, data }` so callers work with the payload directly. */
export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const { data } = await api.request<ApiSuccess<T>>(config);
  return data.data;
}

/** Same as `request`, but keeps the pagination envelope. */
export async function requestPaged<T>(
  config: AxiosRequestConfig,
): Promise<{ data: T; meta: PaginationMeta | undefined }> {
  const { data } = await api.request<ApiSuccess<T>>(config);
  return { data: data.data, meta: data.meta };
}

export const get = <T>(url: string, params?: unknown): Promise<T> =>
  request<T>({ method: 'GET', url, params });

export const getPaged = <T>(url: string, params?: unknown) =>
  requestPaged<T>({ method: 'GET', url, params });

export const post = <T>(url: string, body?: unknown): Promise<T> =>
  request<T>({ method: 'POST', url, data: body });

export const patch = <T>(url: string, body?: unknown): Promise<T> =>
  request<T>({ method: 'PATCH', url, data: body });

export const del = <T>(url: string, body?: unknown): Promise<T> =>
  request<T>({ method: 'DELETE', url, data: body });

/** Downloads a CSV/PDF endpoint as a Blob, preserving auth headers. */
export async function downloadFile(url: string, params?: unknown): Promise<Blob> {
  const response = await api.request<Blob>({
    method: 'GET',
    url,
    params,
    responseType: 'blob',
  });
  return response.data;
}
