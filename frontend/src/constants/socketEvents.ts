/** Mirrors `backend/src/socket/events.ts` — keep the two in step. */
export const SOCKET_EVENTS = {
  ORDER_CREATED: 'order:created',
  ORDER_UPDATED: 'order:updated',
  ORDER_READY: 'order:ready',
  ORDER_COMPLETED: 'order:completed',
  ORDER_CANCELLED: 'order:cancelled',
  ORDER_ITEM_UPDATED: 'order-item:updated',

  TABLE_UPDATED: 'table:updated',

  RESERVATION_CREATED: 'reservation:created',
  RESERVATION_UPDATED: 'reservation:updated',

  INVENTORY_ALERT: 'inventory:alert',
  INVENTORY_UPDATED: 'inventory:updated',

  NOTIFICATION_NEW: 'notification:new',
  ACTIVITY_LOGGED: 'activity:logged',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

/** React Query keys, centralised so socket handlers can invalidate precisely. */
export const QUERY_KEYS = {
  dashboard: ['dashboard'] as const,
  dashboardOverview: ['dashboard', 'overview'] as const,
  revenueChart: (days: number) => ['dashboard', 'revenue-chart', days] as const,
  popularDishes: (days: number) => ['dashboard', 'popular-dishes', days] as const,
  orderMix: (days: number) => ['dashboard', 'order-mix', days] as const,
  activity: ['dashboard', 'activity'] as const,

  tables: ['tables'] as const,
  waitTime: ['tables', 'wait-time'] as const,

  orders: ['orders'] as const,
  order: (id: string) => ['orders', id] as const,
  kitchenQueue: ['kitchen', 'queue'] as const,

  menu: ['menu'] as const,
  menuCategories: ['menu', 'categories'] as const,
  menuItems: ['menu', 'items'] as const,
  menuForOrdering: ['menu', 'for-ordering'] as const,

  reservations: ['reservations'] as const,
  reservationsToday: ['reservations', 'today'] as const,

  customers: ['customers'] as const,
  customer: (id: string) => ['customers', id] as const,
  customerMemory: (id: string) => ['customers', id, 'memory'] as const,

  employees: ['employees'] as const,
  performance: ['employees', 'performance'] as const,

  inventory: ['inventory'] as const,
  inventorySummary: ['inventory', 'summary'] as const,
  suppliers: ['inventory', 'suppliers'] as const,

  notifications: ['notifications'] as const,
  settings: ['settings'] as const,
  users: ['users'] as const,
  analytics: ['analytics'] as const,
} as const;
