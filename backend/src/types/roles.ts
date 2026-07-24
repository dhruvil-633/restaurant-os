export const USER_ROLES = [
  'owner',
  'manager',
  'cashier',
  'waiter',
  'chef',
  'kitchen_staff',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  cashier: 'Cashier',
  waiter: 'Waiter',
  chef: 'Chef',
  kitchen_staff: 'Kitchen Staff',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  owner: 'Unrestricted access, including staff accounts, financials and settings.',
  manager: 'Runs daily operations: menu, inventory, staff, reservations and reports.',
  cashier: 'Takes payments, closes bills and manages orders at the counter.',
  waiter: 'Manages the floor, takes orders and serves tables.',
  chef: 'Runs the kitchen display, assigns dishes and marks them ready.',
  kitchen_staff: 'Prepares dishes and updates their status on the kitchen display.',
};

/** Roles that may read financial figures and full analytics. */
export const MANAGEMENT_ROLES: readonly UserRole[] = ['owner', 'manager'];

/** Roles that work the kitchen display. */
export const KITCHEN_ROLES: readonly UserRole[] = ['owner', 'manager', 'chef', 'kitchen_staff'];

/** Roles that may create and modify orders. */
export const ORDER_ROLES: readonly UserRole[] = ['owner', 'manager', 'cashier', 'waiter'];
