import { pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', [
  'owner',
  'manager',
  'cashier',
  'waiter',
  'chef',
  'kitchen_staff',
]);

export const menuCategoryTypeEnum = pgEnum('menu_category_type', ['food', 'drinks', 'desserts']);

export const tableStatusEnum = pgEnum('table_status', [
  'available',
  'occupied',
  'reserved',
  'cleaning',
]);

export const tableShapeEnum = pgEnum('table_shape', ['square', 'round', 'rectangle']);

export const orderTypeEnum = pgEnum('order_type', ['dine_in', 'takeaway', 'delivery']);

export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'cooking',
  'ready',
  'served',
  'completed',
  'cancelled',
]);

export const orderItemStatusEnum = pgEnum('order_item_status', [
  'queued',
  'cooking',
  'ready',
  'served',
  'cancelled',
]);

export const orderPriorityEnum = pgEnum('order_priority', ['low', 'normal', 'high', 'urgent']);

export const paymentMethodEnum = pgEnum('payment_method', ['cash', 'card', 'upi', 'wallet']);

export const paymentStatusEnum = pgEnum('payment_status', ['unpaid', 'paid', 'refunded']);

export const reservationStatusEnum = pgEnum('reservation_status', [
  'pending',
  'confirmed',
  'seated',
  'completed',
  'cancelled',
  'no_show',
]);

export const inventoryUnitEnum = pgEnum('inventory_unit', [
  'kg',
  'g',
  'l',
  'ml',
  'piece',
  'packet',
  'bottle',
  'dozen',
]);

export const inventoryTransactionTypeEnum = pgEnum('inventory_transaction_type', [
  'purchase',
  'consumption',
  'waste',
  'adjustment',
]);

export const wasteReasonEnum = pgEnum('waste_reason', [
  'expired',
  'spoiled',
  'overcooked',
  'customer_return',
  'spillage',
  'preparation_error',
  'other',
]);

export const purchaseStatusEnum = pgEnum('purchase_status', [
  'draft',
  'ordered',
  'received',
  'cancelled',
]);

export const attendanceStatusEnum = pgEnum('attendance_status', [
  'present',
  'absent',
  'late',
  'half_day',
  'leave',
]);

export const notificationTypeEnum = pgEnum('notification_type', [
  'order_created',
  'order_ready',
  'order_completed',
  'order_cancelled',
  'reservation_created',
  'reservation_reminder',
  'inventory_low',
  'inventory_expiry',
  'feedback_received',
  'system',
]);
