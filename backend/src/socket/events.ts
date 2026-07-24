/**
 * Socket event names. The frontend mirrors this list in
 * `frontend/src/constants/socketEvents.ts` — keep the two in step.
 */
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

export const SOCKET_ROOMS = {
  /** Everyone who is signed in. */
  ALL: 'room:all',
  /** Chefs and kitchen staff — the kitchen display. */
  KITCHEN: 'room:kitchen',
  /** Waiters, cashiers and managers — the floor. */
  FLOOR: 'room:floor',
  /** Owners and managers — financial and analytics streams. */
  MANAGEMENT: 'room:management',
  user: (userId: string): string => `room:user:${userId}`,
  role: (role: string): string => `room:role:${role}`,
} as const;
