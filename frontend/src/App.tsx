import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AppRoutes } from '@/routes';
import { setSessionExpiredHandler } from '@/services/api';
import { settingsService } from '@/services';
import { useAuthStore } from '@/store/authStore';
import { QUERY_KEYS } from '@/constants/socketEvents';
import { configureCurrency } from '@/lib/utils';
import { PageLoader } from '@/components/ui/feedback';

export function App() {
  const navigate = useNavigate();
  const status = useAuthStore((state) => state.status);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const isAuthenticated = status === 'authenticated';

  // Restore the session before deciding which routes to render.
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // A refresh failure anywhere in the app lands the user back on login.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      useAuthStore.setState({ user: null, status: 'unauthenticated' });
      toast.error('Your session expired', { description: 'Please sign in again.' });
      navigate('/login', { replace: true });
    });
  }, [navigate]);

  // Currency formatting is restaurant-wide, so it is configured once here
  // rather than threaded through every component that renders money.
  const { data: settings } = useQuery({
    queryKey: QUERY_KEYS.settings,
    queryFn: settingsService.get,
    enabled: isAuthenticated,
    staleTime: 10 * 60_000,
  });

  useEffect(() => {
    if (settings) configureCurrency(settings.currencySymbol, settings.currency);
  }, [settings]);

  if (status === 'idle' || status === 'loading') {
    return <PageLoader label="Starting RestaurantOS" />;
  }

  return <AppRoutes />;
}
