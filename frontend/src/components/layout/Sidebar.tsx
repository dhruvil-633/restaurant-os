import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, UtensilsCrossed, X } from 'lucide-react';
import { NAV_SECTIONS, navItemsForRole } from '@/constants/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { Tooltip } from '@/components/ui/switch';

interface SidebarProps {
  /** Renders the mobile drawer variant instead of the fixed rail. */
  mobile?: boolean;
}

export function Sidebar({ mobile = false }: SidebarProps) {
  const role = useAuthStore((state) => state.user?.role);
  const collapsed = useUiStore((state) => state.sidebarCollapsed) && !mobile;
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const setMobileNav = useUiStore((state) => state.setMobileNav);

  const items = navItemsForRole(role);

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-line bg-surface transition-[width] duration-200',
        collapsed ? 'w-[4.5rem]' : 'w-64',
        mobile && 'w-72',
      )}
    >
      <div className={cn('flex h-16 items-center gap-2.5 px-4', collapsed && 'justify-center px-0')}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand shadow-sm">
          <UtensilsCrossed className="size-[18px] text-white" />
        </span>
        {!collapsed && (
          <span className="truncate text-[15px] font-semibold tracking-tight text-ink">
            RestaurantOS
          </span>
        )}
        {mobile && (
          <button
            type="button"
            onClick={() => setMobileNav(false)}
            className="ml-auto rounded-lg p-2 text-ink-subtle hover:bg-surface-hover hover:text-ink"
            aria-label="Close navigation"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4 pt-2">
        {NAV_SECTIONS.map((section) => {
          const sectionItems = items.filter((item) => item.section === section);
          if (sectionItems.length === 0) return null;

          return (
            <div key={section}>
              {!collapsed && (
                <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                  {section}
                </p>
              )}
              <ul className="space-y-0.5">
                {sectionItems.map((item) => {
                  const link = (
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      onClick={() => mobile && setMobileNav(false)}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                          collapsed && 'justify-center px-0',
                          isActive
                            ? 'bg-brand-soft text-brand-soft-ink'
                            : 'text-ink-muted hover:bg-surface-hover hover:text-ink',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {/* Active rail marker, animated between items. */}
                          {isActive && !collapsed && (
                            <motion.span
                              layoutId="nav-active"
                              className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand"
                              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                            />
                          )}
                          <item.icon className="size-[18px] shrink-0" />
                          {!collapsed && <span className="truncate">{item.label}</span>}
                        </>
                      )}
                    </NavLink>
                  );

                  return (
                    <li key={item.to}>
                      {collapsed ? (
                        <Tooltip label={item.label} side="right">
                          <div>{link}</div>
                        </Tooltip>
                      ) : (
                        link
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {!mobile && (
        <div className="border-t border-line p-3">
          <button
            type="button"
            onClick={toggleSidebar}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
              'text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink',
              collapsed && 'justify-center px-0',
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronLeft
              className={cn('size-[18px] shrink-0 transition-transform', collapsed && 'rotate-180')}
            />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      )}
    </aside>
  );
}
