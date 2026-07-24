import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  CheckCheck,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  User as UserIcon,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/switch';
import { QUERY_KEYS } from '@/constants/socketEvents';
import { useDebouncedValue, useHotkey, useOnClickOutside } from '@/hooks';
import { cn, formatCurrency, formatRelativeTime, titleCase } from '@/lib/utils';
import { notificationService, searchService } from '@/services';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';

export function Topbar({ socketConnected }: { socketConnected: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const setMobileNav = useUiStore((state) => state.setMobileNav);

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebouncedValue(query, 300);

  useOnClickOutside(searchRef, () => setSearchOpen(false));
  useHotkey('k', () => inputRef.current?.focus(), { meta: true });

  const { data: results, isFetching } = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => searchService.global(debouncedQuery),
    enabled: debouncedQuery.trim().length >= 2,
    staleTime: 15_000,
  });

  const { data: notifications } = useQuery({
    queryKey: QUERY_KEYS.notifications,
    queryFn: () => notificationService.list(20),
    refetchInterval: 90_000,
  });

  const markAllRead = useMutation({
    mutationFn: notificationService.markAllRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications }),
  });

  useEffect(() => {
    if (debouncedQuery.trim().length >= 2) setSearchOpen(true);
  }, [debouncedQuery]);

  const unreadCount = notifications?.unreadCount ?? 0;
  const hasResults =
    results &&
    (results.orders.length ||
      results.customers.length ||
      results.menuItems.length ||
      results.employees.length ||
      results.ingredients.length);

  const goTo = (path: string): void => {
    setSearchOpen(false);
    setQuery('');
    navigate(path);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line glass px-4 sm:px-6">
      <Button
        variant="ghost"
        size="icon-sm"
        className="lg:hidden"
        onClick={() => setMobileNav(true)}
        aria-label="Open navigation"
      >
        <Menu />
      </Button>

      {/* ── Global search ────────────────────────────────────────────── */}
      <div ref={searchRef} className="relative min-w-0 flex-1 max-w-md">
        <Input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => query.length >= 2 && setSearchOpen(true)}
          placeholder="Search orders, guests, dishes…"
          leading={<Search />}
          className="h-9 bg-surface-sunken border-transparent focus:bg-surface"
          aria-label="Global search"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium text-ink-subtle sm:block">
          ⌘K
        </kbd>

        <AnimatePresence>
          {searchOpen && debouncedQuery.trim().length >= 2 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.14 }}
              className="absolute left-0 right-0 top-11 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-surface p-2 shadow-lg"
            >
              {isFetching && !results ? (
                <p className="px-3 py-6 text-center text-sm text-ink-muted">Searching…</p>
              ) : !hasResults ? (
                <p className="px-3 py-6 text-center text-sm text-ink-muted">
                  Nothing matched “{debouncedQuery}”
                </p>
              ) : (
                <div className="space-y-3">
                  <SearchGroup label="Orders" show={results.orders.length > 0}>
                    {results.orders.map((order) => (
                      <SearchRow
                        key={order.id}
                        title={order.orderNumber}
                        meta={`${titleCase(order.status)} · ${formatCurrency(order.total)}`}
                        onClick={() => goTo(`/orders/${order.id}`)}
                      />
                    ))}
                  </SearchGroup>

                  <SearchGroup label="Guests" show={results.customers.length > 0}>
                    {results.customers.map((customer) => (
                      <SearchRow
                        key={customer.id}
                        title={customer.name}
                        meta={`${customer.phone} · ${customer.visitCount} visits`}
                        onClick={() => goTo(`/customers/${customer.id}`)}
                      />
                    ))}
                  </SearchGroup>

                  <SearchGroup label="Menu" show={results.menuItems.length > 0}>
                    {results.menuItems.map((item) => (
                      <SearchRow
                        key={item.id}
                        title={item.name}
                        meta={`${formatCurrency(item.price)}${item.isAvailable ? '' : ' · unavailable'}`}
                        onClick={() => goTo('/menu')}
                      />
                    ))}
                  </SearchGroup>

                  <SearchGroup label="Team" show={results.employees.length > 0}>
                    {results.employees.map((employee) => (
                      <SearchRow
                        key={employee.id}
                        title={employee.name}
                        meta={`${employee.position} · ${employee.employeeCode}`}
                        onClick={() => goTo('/team')}
                      />
                    ))}
                  </SearchGroup>

                  <SearchGroup label="Inventory" show={results.ingredients.length > 0}>
                    {results.ingredients.map((ingredient) => (
                      <SearchRow
                        key={ingredient.id}
                        title={ingredient.name}
                        meta={`${ingredient.currentStock} ${ingredient.unit} in stock`}
                        onClick={() => goTo('/inventory')}
                      />
                    ))}
                  </SearchGroup>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Tooltip label={socketConnected ? 'Live updates connected' : 'Reconnecting…'}>
          <span
            className={cn(
              'hidden size-8 items-center justify-center rounded-lg sm:flex',
              socketConnected ? 'text-success' : 'text-warning',
            )}
          >
            {socketConnected ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
          </span>
        </Tooltip>

        <Tooltip label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}>
          <Button variant="ghost" size="icon-sm" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
        </Tooltip>

        {/* ── Notifications ──────────────────────────────────────────── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="relative" aria-label="Notifications">
              <Bell />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white ring-2 ring-surface">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[21rem] p-0">
            <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
              <p className="text-sm font-semibold text-ink">Notifications</p>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAllRead.mutate()}
                  className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                >
                  <CheckCheck className="size-3.5" />
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto p-1.5">
              {(notifications?.notifications.length ?? 0) === 0 ? (
                <p className="px-3 py-10 text-center text-sm text-ink-muted">
                  You’re all caught up.
                </p>
              ) : (
                notifications?.notifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => notification.link && goTo(notification.link)}
                    className={cn(
                      'flex w-full gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-surface-hover',
                      !notification.isRead && 'bg-brand-soft/40',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-1.5 size-1.5 shrink-0 rounded-full',
                        notification.isRead ? 'bg-transparent' : 'bg-brand',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {notification.title}
                      </span>
                      <span className="mt-0.5 block line-clamp-2 text-xs text-ink-muted">
                        {notification.message}
                      </span>
                      <span className="mt-1 block text-[11px] text-ink-subtle">
                        {formatRelativeTime(notification.createdAt)}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* ── Account ────────────────────────────────────────────────── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ml-1 flex items-center gap-2 rounded-xl p-1 transition-colors hover:bg-surface-hover"
              aria-label="Account menu"
            >
              <Avatar name={user?.name ?? 'User'} src={user?.avatarUrl} size="sm" />
              <span className="hidden text-left lg:block">
                <span className="block max-w-[9rem] truncate text-[13px] font-medium leading-tight text-ink">
                  {user?.name}
                </span>
                <span className="block text-[11px] leading-tight text-ink-subtle">
                  {titleCase(user?.role ?? '')}
                </span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <span className="block truncate normal-case tracking-normal text-sm font-medium text-ink">
                {user?.name}
              </span>
              <span className="block truncate text-xs font-normal normal-case tracking-normal text-ink-subtle">
                {user?.email}
              </span>
            </DropdownMenuLabel>
            <div className="px-2.5 pb-2">
              <Badge tone="brand" size="sm">
                {titleCase(user?.role ?? '')}
              </Badge>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/profile">
                <UserIcon />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings">
                <Settings />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onSelect={() => {
                void logout().then(() => navigate('/login', { replace: true }));
              }}
            >
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function SearchGroup({
  label,
  show,
  children,
}: {
  label: string;
  show: boolean;
  children: React.ReactNode;
}) {
  if (!show) return null;
  return (
    <div>
      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SearchRow({
  title,
  meta,
  onClick,
}: {
  title: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-hover"
    >
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{title}</span>
      <span className="shrink-0 text-xs text-ink-subtle">{meta}</span>
    </button>
  );
}
