import { create } from 'zustand';
import { api, getErrorMessage, tokenStore } from '@/services/api';
import type { ApiSuccess, AuthPayload, User, UserRole } from '@/types';

interface AuthState {
  user: User | null;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Restores a session on first load using the stored refresh token. */
  bootstrap: () => Promise<void>;
  setUser: (user: User) => void;
  hasRole: (...roles: UserRole[]) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: 'idle',
  error: null,

  async login(email, password) {
    set({ status: 'loading', error: null });
    try {
      const { data } = await api.post<ApiSuccess<AuthPayload>>('/auth/login', { email, password });
      tokenStore.setAccessToken(data.data.accessToken);
      tokenStore.setRefreshToken(data.data.refreshToken);
      set({ user: data.data.user, status: 'authenticated', error: null });
    } catch (error) {
      const message = getErrorMessage(error, 'Could not sign in');
      set({ status: 'unauthenticated', error: message });
      throw new Error(message);
    }
  },

  async register(name, email, password) {
    set({ status: 'loading', error: null });
    try {
      const { data } = await api.post<ApiSuccess<AuthPayload>>('/auth/register', {
        name,
        email,
        password,
      });
      tokenStore.setAccessToken(data.data.accessToken);
      tokenStore.setRefreshToken(data.data.refreshToken);
      set({ user: data.data.user, status: 'authenticated', error: null });
    } catch (error) {
      const message = getErrorMessage(error, 'Could not create the account');
      set({ status: 'unauthenticated', error: message });
      throw new Error(message);
    }
  },

  async logout() {
    try {
      await api.post('/auth/logout', { refreshToken: tokenStore.getRefreshToken() });
    } catch {
      // A failed round-trip must not trap the user in a signed-in shell.
    }
    tokenStore.clear();
    set({ user: null, status: 'unauthenticated', error: null });
  },

  async bootstrap() {
    const refreshToken = tokenStore.getRefreshToken();

    // No stored token still leaves the httpOnly cookie worth trying, but only
    // when one could plausibly exist — otherwise skip straight to the login screen.
    if (!refreshToken) {
      set({ status: 'unauthenticated' });
      return;
    }

    set({ status: 'loading' });

    try {
      const { data } = await api.post<ApiSuccess<AuthPayload>>('/auth/refresh', { refreshToken });
      tokenStore.setAccessToken(data.data.accessToken);
      tokenStore.setRefreshToken(data.data.refreshToken);
      set({ user: data.data.user, status: 'authenticated' });
    } catch {
      tokenStore.clear();
      set({ user: null, status: 'unauthenticated' });
    }
  },

  setUser(user) {
    set({ user });
  },

  hasRole(...roles) {
    const role = get().user?.role;
    return role !== undefined && roles.includes(role);
  },
}));

/** Convenience selectors — subscribing narrowly avoids needless re-renders. */
export const useUser = (): User | null => useAuthStore((state) => state.user);
export const useIsAuthenticated = (): boolean =>
  useAuthStore((state) => state.status === 'authenticated');
