import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthLayout } from '@/layouts/AuthLayout';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { PageLoader } from '@/components/ui/feedback';
import { useAuthStore } from '@/store/authStore';
import { MANAGEMENT_ROLES, ROLE_HOME } from '@/constants/navigation';
import type { UserRole } from '@/types';

/* Public, no token required. */
const LandingPage = lazy(() => import('@/pages/LandingPage'));
const CustomerOrderPage = lazy(() => import('@/pages/CustomerOrderPage'));
const TrackOrderPage = lazy(() => import('@/pages/TrackOrderPage'));

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'));

/* Two different dashboards — only the one for your role is downloaded. */
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const MyDashboardPage = lazy(() => import('@/pages/MyDashboardPage'));

const FloorPage = lazy(() => import('@/pages/FloorPage'));
const OrdersPage = lazy(() => import('@/pages/OrdersPage'));
const NewOrderPage = lazy(() => import('@/pages/NewOrderPage'));
const OrderDetailPage = lazy(() => import('@/pages/OrderDetailPage'));
const KitchenPage = lazy(() => import('@/pages/KitchenPage'));
const MenuPage = lazy(() => import('@/pages/MenuPage'));
const ReservationsPage = lazy(() => import('@/pages/ReservationsPage'));
const CustomersPage = lazy(() => import('@/pages/CustomersPage'));
const CustomerDetailPage = lazy(() => import('@/pages/CustomerDetailPage'));
const InventoryPage = lazy(() => import('@/pages/InventoryPage'));
const TeamPage = lazy(() => import('@/pages/TeamPage'));
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'));
const ReportsPage = lazy(() => import('@/pages/ReportsPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const location = useLocation();

  if (status !== 'authenticated') {
    // Remember where they were headed so login can return them there.
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}

function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const role = useAuthStore((state) => state.user?.role);

  if (!role) return <Navigate to="/login" replace />;
  if (!roles.includes(role)) return <Navigate to={ROLE_HOME[role]} replace />;
  return <>{children}</>;
}

function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const role = useAuthStore((state) => state.user?.role);

  if (status === 'authenticated' && role) return <Navigate to={ROLE_HOME[role]} replace />;
  return <>{children}</>;
}

/**
 * Owners and managers get the business dashboard; everyone else gets their own
 * shift. Splitting here rather than inside one page means a chef never
 * downloads the charting bundle.
 */
function RoleDashboard() {
  const role = useAuthStore((state) => state.user?.role);
  const isManagement = role !== undefined && MANAGEMENT_ROLES.includes(role);
  return isManagement ? <DashboardPage /> : <MyDashboardPage />;
}

const FLOOR: UserRole[] = ['owner', 'manager', 'cashier', 'waiter'];
const KITCHEN: UserRole[] = ['owner', 'manager', 'chef', 'kitchen_staff'];
const MANAGEMENT: UserRole[] = ['owner', 'manager'];

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* ── Public ─────────────────────────────────────────────── */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/order" element={<CustomerOrderPage />} />
        <Route path="/track" element={<TrackOrderPage />} />

        <Route
          element={
            <RedirectIfAuthenticated>
              <AuthLayout />
            </RedirectIfAuthenticated>
          }
        >
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>

        {/* ── Authenticated app ──────────────────────────────────── */}
        <Route
          element={
            <RequireAuth>
              <DashboardLayout />
            </RequireAuth>
          }
        >
          <Route path="/dashboard" element={<RoleDashboard />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/menu" element={<MenuPage />} />
          <Route path="/inventory" element={<InventoryPage />} />

          <Route
            path="/floor"
            element={
              <RequireRole roles={FLOOR}>
                <FloorPage />
              </RequireRole>
            }
          />
          <Route
            path="/orders"
            element={
              <RequireRole roles={FLOOR}>
                <OrdersPage />
              </RequireRole>
            }
          />
          <Route
            path="/orders/new"
            element={
              <RequireRole roles={FLOOR}>
                <NewOrderPage />
              </RequireRole>
            }
          />
          <Route
            path="/orders/:id"
            element={
              <RequireRole roles={[...FLOOR, 'chef', 'kitchen_staff']}>
                <OrderDetailPage />
              </RequireRole>
            }
          />
          <Route
            path="/reservations"
            element={
              <RequireRole roles={FLOOR}>
                <ReservationsPage />
              </RequireRole>
            }
          />
          <Route
            path="/customers"
            element={
              <RequireRole roles={FLOOR}>
                <CustomersPage />
              </RequireRole>
            }
          />
          <Route
            path="/customers/:id"
            element={
              <RequireRole roles={FLOOR}>
                <CustomerDetailPage />
              </RequireRole>
            }
          />
          <Route
            path="/kitchen"
            element={
              <RequireRole roles={KITCHEN}>
                <KitchenPage />
              </RequireRole>
            }
          />
          <Route
            path="/team"
            element={
              <RequireRole roles={MANAGEMENT}>
                <TeamPage />
              </RequireRole>
            }
          />
          <Route
            path="/analytics"
            element={
              <RequireRole roles={MANAGEMENT}>
                <AnalyticsPage />
              </RequireRole>
            }
          />
          <Route
            path="/reports"
            element={
              <RequireRole roles={MANAGEMENT}>
                <ReportsPage />
              </RequireRole>
            }
          />

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
