import { relations } from 'drizzle-orm';
import { refreshTokens, users } from './auth';
import { menuCategories, menuItems } from './menu';
import { attendance, customers, employees, shifts } from './people';
import { feedback, orderItems, orders, reservations, restaurantTables } from './operations';
import {
  ingredients,
  inventoryTransactions,
  menuItemIngredients,
  purchaseItems,
  purchases,
  suppliers,
} from './inventory';
import { activityLogs, notifications } from './system';

export const usersRelations = relations(users, ({ many, one }) => ({
  refreshTokens: many(refreshTokens),
  notifications: many(notifications),
  activityLogs: many(activityLogs),
  employee: one(employees, { fields: [users.id], references: [employees.userId] }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));

export const menuCategoriesRelations = relations(menuCategories, ({ many }) => ({
  items: many(menuItems),
}));

export const menuItemsRelations = relations(menuItems, ({ one, many }) => ({
  category: one(menuCategories, {
    fields: [menuItems.categoryId],
    references: [menuCategories.id],
  }),
  orderItems: many(orderItems),
  recipe: many(menuItemIngredients),
}));

export const restaurantTablesRelations = relations(restaurantTables, ({ one, many }) => ({
  assignedWaiter: one(users, {
    fields: [restaurantTables.assignedWaiterId],
    references: [users.id],
  }),
  orders: many(orders),
  reservations: many(reservations),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  table: one(restaurantTables, { fields: [orders.tableId], references: [restaurantTables.id] }),
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  waiter: one(users, { fields: [orders.waiterId], references: [users.id] }),
  chef: one(users, { fields: [orders.chefId], references: [users.id] }),
  items: many(orderItems),
  feedback: many(feedback),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  menuItem: one(menuItems, { fields: [orderItems.menuItemId], references: [menuItems.id] }),
}));

export const reservationsRelations = relations(reservations, ({ one }) => ({
  table: one(restaurantTables, {
    fields: [reservations.tableId],
    references: [restaurantTables.id],
  }),
  customer: one(customers, { fields: [reservations.customerId], references: [customers.id] }),
  createdBy: one(users, { fields: [reservations.createdById], references: [users.id] }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  orders: many(orders),
  reservations: many(reservations),
  feedback: many(feedback),
}));

export const feedbackRelations = relations(feedback, ({ one }) => ({
  order: one(orders, { fields: [feedback.orderId], references: [orders.id] }),
  customer: one(customers, { fields: [feedback.customerId], references: [customers.id] }),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  user: one(users, { fields: [employees.userId], references: [users.id] }),
  attendance: many(attendance),
  shifts: many(shifts),
}));

export const attendanceRelations = relations(attendance, ({ one }) => ({
  employee: one(employees, { fields: [attendance.employeeId], references: [employees.id] }),
}));

export const shiftsRelations = relations(shifts, ({ one }) => ({
  employee: one(employees, { fields: [shifts.employeeId], references: [employees.id] }),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  ingredients: many(ingredients),
  purchases: many(purchases),
}));

export const ingredientsRelations = relations(ingredients, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [ingredients.supplierId], references: [suppliers.id] }),
  transactions: many(inventoryTransactions),
  usedIn: many(menuItemIngredients),
}));

export const menuItemIngredientsRelations = relations(menuItemIngredients, ({ one }) => ({
  menuItem: one(menuItems, {
    fields: [menuItemIngredients.menuItemId],
    references: [menuItems.id],
  }),
  ingredient: one(ingredients, {
    fields: [menuItemIngredients.ingredientId],
    references: [ingredients.id],
  }),
}));

export const inventoryTransactionsRelations = relations(inventoryTransactions, ({ one }) => ({
  ingredient: one(ingredients, {
    fields: [inventoryTransactions.ingredientId],
    references: [ingredients.id],
  }),
  order: one(orders, { fields: [inventoryTransactions.orderId], references: [orders.id] }),
  performedBy: one(users, {
    fields: [inventoryTransactions.performedById],
    references: [users.id],
  }),
}));

export const purchasesRelations = relations(purchases, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [purchases.supplierId], references: [suppliers.id] }),
  items: many(purchaseItems),
  createdBy: one(users, { fields: [purchases.createdById], references: [users.id] }),
}));

export const purchaseItemsRelations = relations(purchaseItems, ({ one }) => ({
  purchase: one(purchases, { fields: [purchaseItems.purchaseId], references: [purchases.id] }),
  ingredient: one(ingredients, {
    fields: [purchaseItems.ingredientId],
    references: [ingredients.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  user: one(users, { fields: [activityLogs.userId], references: [users.id] }),
}));
