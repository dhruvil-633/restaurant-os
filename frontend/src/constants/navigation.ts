import {
  BarChart3,
  Boxes,
  CalendarClock,
  ChefHat,
  ClipboardList,
  LayoutDashboard,
  Settings,
  Store,
  UsersRound,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '@/types';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Roles allowed to see this entry. */
  roles: UserRole[];
  /** Grouping heading in the sidebar. */
  section: 'Operations' | 'Management' | 'Insights';
}

const ALL_ROLES: UserRole[] = ['owner', 'manager', 'cashier', 'waiter', 'chef', 'kitchen_staff'];
const FLOOR: UserRole[] = ['owner', 'manager', 'cashier', 'waiter'];
const KITCHEN: UserRole[] = ['owner', 'manager', 'chef', 'kitchen_staff'];
const MANAGEMENT: UserRole[] = ['owner', 'manager'];

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, roles: ALL_ROLES, section: 'Operations' },
  { label: 'Floor', to: '/floor', icon: Store, roles: FLOOR, section: 'Operations' },
  { label: 'Orders', to: '/orders', icon: ClipboardList, roles: FLOOR, section: 'Operations' },
  { label: 'Kitchen', to: '/kitchen', icon: ChefHat, roles: KITCHEN, section: 'Operations' },
  {
    label: 'Reservations',
    to: '/reservations',
    icon: CalendarClock,
    roles: FLOOR,
    section: 'Operations',
  },

  { label: 'Menu', to: '/menu', icon: UtensilsCrossed, roles: ALL_ROLES, section: 'Management' },
  { label: 'Inventory', to: '/inventory', icon: Boxes, roles: ALL_ROLES, section: 'Management' },
  { label: 'Customers', to: '/customers', icon: UsersRound, roles: FLOOR, section: 'Management' },
  { label: 'Team', to: '/team', icon: Wallet, roles: MANAGEMENT, section: 'Management' },

  { label: 'Analytics', to: '/analytics', icon: BarChart3, roles: MANAGEMENT, section: 'Insights' },
  { label: 'Reports', to: '/reports', icon: ClipboardList, roles: MANAGEMENT, section: 'Insights' },
  { label: 'Settings', to: '/settings', icon: Settings, roles: ALL_ROLES, section: 'Insights' },
];

export const NAV_SECTIONS = ['Operations', 'Management', 'Insights'] as const;

export function navItemsForRole(role: UserRole | undefined): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

/** Where each role lands after signing in — their most useful screen. */
export const ROLE_HOME: Record<UserRole, string> = {
  owner: '/dashboard',
  manager: '/dashboard',
  cashier: '/dashboard',
  waiter: '/dashboard',
  chef: '/dashboard',
  kitchen_staff: '/dashboard',
};

/** Roles that see restaurant-wide figures rather than their own shift. */
export const MANAGEMENT_ROLES: UserRole[] = ['owner', 'manager'];

/** Owner-only capabilities — the manager runs operations, not the business. */
export function isOwner(role: UserRole | undefined): boolean {
  return role === 'owner';
}
