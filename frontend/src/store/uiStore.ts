import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark';

interface UiState {
  theme: Theme;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  commandOpen: boolean;

  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setMobileNav: (open: boolean) => void;
  setCommandOpen: (open: boolean) => void;
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem('restaurantos-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: initialTheme(),
      sidebarCollapsed: false,
      mobileNavOpen: false,
      commandOpen: false,

      toggleTheme() {
        const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        set({ theme: next });
      },

      setTheme(theme) {
        applyTheme(theme);
        set({ theme });
      },

      toggleSidebar() {
        set({ sidebarCollapsed: !get().sidebarCollapsed });
      },

      setMobileNav(open) {
        set({ mobileNavOpen: open });
      },

      setCommandOpen(open) {
        set({ commandOpen: open });
      },
    }),
    {
      name: 'restaurantos-ui',
      // The inline script in index.html reads this key directly to set the
      // theme before first paint, so it must stay a bare "light" / "dark".
      partialize: (state) => ({ theme: state.theme, sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
);

/** Mirrors the theme into the standalone key the pre-paint script reads. */
useUiStore.subscribe((state) => {
  try {
    window.localStorage.setItem('restaurantos-theme', state.theme);
  } catch {
    /* Storage unavailable — the in-session theme still applies. */
  }
});
