import { del, downloadFile, get, getPaged, patch, post } from './api';
import type {
  ActivityEntry,
  AppNotification,
  AttendanceRecord,
  Bill,
  Customer,
  CustomerMemory,
  DashboardOverview,
  Employee,
  EmployeeDetail,
  FeedbackEntry,
  GlobalSearchResults,
  HealthScore,
  Ingredient,
  InventorySummary,
  KitchenHeatmap,
  KitchenQueue,
  MenuCategory,
  MenuCategoryWithItems,
  MenuItem,
  MenuPerformance,
  MyPerformance,
  PublicMenu,
  PublicOrderReceipt,
  PublicOrderStatus,
  Order,
  PeakHours,
  PerformanceEntry,
  PopularDish,
  Purchase,
  ReplayData,
  Reservation,
  RestaurantSettings,
  RestaurantTable,
  RevenuePoint,
  RevenueReport,
  Shift,
  StaffOption,
  StockMovement,
  Supplier,
  TodayReservations,
  UploadedFile,
  User,
  WaitTimeEstimate,
} from '@/types';

/* ── Menu ───────────────────────────────────────────────────────────────── */

export const menuService = {
  listCategories: () => get<MenuCategory[]>('/menu/categories'),
  createCategory: (body: unknown) => post<MenuCategory>('/menu/categories', body),
  updateCategory: (id: string, body: unknown) => patch<MenuCategory>(`/menu/categories/${id}`, body),
  deleteCategory: (id: string) => del<null>(`/menu/categories/${id}`),

  listItems: (params?: Record<string, unknown>) => getPaged<MenuItem[]>('/menu/items', params),
  getItem: (id: string) => get<MenuItem & { recipe: { ingredientId: string; quantity: number }[] }>(`/menu/items/${id}`),
  createItem: (body: unknown) => post<MenuItem>('/menu/items', body),
  updateItem: (id: string, body: unknown) => patch<MenuItem>(`/menu/items/${id}`, body),
  deleteItem: (id: string) => del<MenuItem | null>(`/menu/items/${id}`),
  toggleAvailability: (id: string) => patch<MenuItem>(`/menu/items/${id}/availability`),
  setRecipe: (id: string, ingredients: { ingredientId: string; quantity: number }[]) =>
    post<unknown>(`/menu/items/${id}/recipe`, { ingredients }),

  forOrdering: () => get<MenuCategoryWithItems[]>('/menu/for-ordering'),
};

/* ── Floor ──────────────────────────────────────────────────────────────── */

export const tableService = {
  list: (params?: Record<string, unknown>) => get<RestaurantTable[]>('/tables', params),
  sections: () => get<string[]>('/tables/sections'),
  waitTime: () => get<WaitTimeEstimate>('/tables/wait-time'),
  create: (body: unknown) => post<RestaurantTable>('/tables', body),
  update: (id: string, body: unknown) => patch<RestaurantTable>(`/tables/${id}`, body),
  setStatus: (id: string, status: string) => patch<RestaurantTable>(`/tables/${id}/status`, { status }),
  assignWaiter: (id: string, waiterId: string | null) =>
    patch<RestaurantTable>(`/tables/${id}/waiter`, { waiterId }),
  saveLayout: (tables: { id: string; positionX: number; positionY: number }[]) =>
    post<{ updated: number }>('/tables/layout', { tables }),
  remove: (id: string) => del<null>(`/tables/${id}`),
};

/* ── Orders & kitchen ───────────────────────────────────────────────────── */

export const orderService = {
  list: (params?: Record<string, unknown>) => getPaged<Order[]>('/orders', params),
  get: (id: string) => get<Order>(`/orders/${id}`),
  create: (body: unknown) => post<Order>('/orders', body),
  setStatus: (id: string, status: string, cancelReason?: string) =>
    patch<Order>(`/orders/${id}/status`, { status, cancelReason }),
  setItemStatus: (itemId: string, status: string) =>
    patch<Order>(`/orders/items/${itemId}/status`, { status }),
  addItems: (id: string, items: { menuItemId: string; quantity: number; notes?: string }[]) =>
    post<Order>(`/orders/${id}/items`, { items }),
  removeItem: (orderId: string, itemId: string) => del<Order>(`/orders/${orderId}/items/${itemId}`),
  assignChef: (id: string, chefId: string | null) => patch<Order>(`/orders/${id}/chef`, { chefId }),
  settle: (id: string, paymentMethod: string, discountAmount?: number) =>
    post<Order>(`/orders/${id}/settle`, { paymentMethod, discountAmount }),
  bill: (id: string) => get<Bill>(`/orders/${id}/bill`),
};

export const kitchenService = {
  queue: () => get<KitchenQueue>('/kitchen/queue'),
};

/* ── Guests ─────────────────────────────────────────────────────────────── */

export const customerService = {
  list: (params?: Record<string, unknown>) => getPaged<Customer[]>('/customers', params),
  get: (id: string) => get<Customer>(`/customers/${id}`),
  memory: (id: string) => get<CustomerMemory>(`/customers/${id}/memory`),
  lookup: (phone: string) => get<Customer | null>('/customers/lookup', { phone }),
  birthdays: (days = 30) => get<Customer[]>('/customers/birthdays', { days }),
  feedback: (params?: Record<string, unknown>) => getPaged<FeedbackEntry[]>('/customers/feedback', params),
  create: (body: unknown) => post<Customer>('/customers', body),
  update: (id: string, body: unknown) => patch<Customer>(`/customers/${id}`, body),
  adjustLoyalty: (id: string, points: number, reason?: string) =>
    post<Customer>(`/customers/${id}/loyalty`, { points, reason }),
  remove: (id: string) => del<null>(`/customers/${id}`),
};

export const reservationService = {
  list: (params?: Record<string, unknown>) => getPaged<Reservation[]>('/reservations', params),
  today: () => get<TodayReservations>('/reservations/today'),
  get: (id: string) => get<Reservation>(`/reservations/${id}`),
  create: (body: unknown) => post<Reservation>('/reservations', body),
  update: (id: string, body: unknown) => patch<Reservation>(`/reservations/${id}`, body),
  remove: (id: string) => del<null>(`/reservations/${id}`),
};

export const feedbackService = {
  create: (body: unknown) => post<unknown>('/feedback', body),
};

/* ── Staff ──────────────────────────────────────────────────────────────── */

export const employeeService = {
  list: (params?: Record<string, unknown>) => getPaged<Employee[]>('/employees', params),
  get: (id: string) => get<EmployeeDetail>(`/employees/${id}`),
  create: (body: unknown) => post<Employee>('/employees', body),
  update: (id: string, body: unknown) => patch<Employee>(`/employees/${id}`, body),
  remove: (id: string) => del<null>(`/employees/${id}`),

  attendance: (params?: Record<string, unknown>) => get<AttendanceRecord[]>('/employees/attendance', params),
  markAttendance: (body: unknown) => post<AttendanceRecord>('/employees/attendance', body),

  shifts: (params?: Record<string, unknown>) => get<Shift[]>('/employees/shifts', params),
  createShift: (body: unknown) => post<Shift>('/employees/shifts', body),
  removeShift: (id: string) => del<null>(`/employees/shifts/${id}`),

  performance: (params?: Record<string, unknown>) =>
    get<{ from: string; to: string; staff: PerformanceEntry[]; topPerformer: PerformanceEntry | null }>(
      '/employees/performance',
      params,
    ),
};

export const userService = {
  list: (params?: Record<string, unknown>) => getPaged<User[]>('/users', params),
  get: (id: string) => get<User & { stats: { ordersServed: number; revenue: number } }>(`/users/${id}`),
  assignable: (group?: 'kitchen' | 'floor' | 'all') => get<StaffOption[]>('/users/assignable', { group }),
  roles: () => get<{ value: string; label: string; description: string }[]>('/users/roles'),
  create: (body: unknown) => post<User>('/users', body),
  update: (id: string, body: unknown) => patch<User>(`/users/${id}`, body),
  resetPassword: (id: string, password: string) => post<null>(`/users/${id}/reset-password`, { password }),
  remove: (id: string) => del<null>(`/users/${id}`),
};

/* ── Inventory ──────────────────────────────────────────────────────────── */

export const inventoryService = {
  list: (params?: Record<string, unknown>) => getPaged<Ingredient[]>('/inventory', params),
  summary: () => get<InventorySummary>('/inventory/summary'),
  transactions: (params?: Record<string, unknown>) => getPaged<StockMovement[]>('/inventory/transactions', params),
  create: (body: unknown) => post<Ingredient>('/inventory', body),
  update: (id: string, body: unknown) => patch<Ingredient>(`/inventory/${id}`, body),
  adjust: (id: string, quantity: number, note?: string) =>
    post<Ingredient>(`/inventory/${id}/adjust`, { quantity, note }),
  recordWaste: (body: unknown) => post<{ lostValue: number }>('/inventory/waste', body),
  remove: (id: string) => del<null>(`/inventory/${id}`),

  suppliers: (params?: Record<string, unknown>) => get<Supplier[]>('/inventory/suppliers', params),
  createSupplier: (body: unknown) => post<Supplier>('/inventory/suppliers', body),
  updateSupplier: (id: string, body: unknown) => patch<Supplier>(`/inventory/suppliers/${id}`, body),
  removeSupplier: (id: string) => del<null>(`/inventory/suppliers/${id}`),

  purchases: (params?: Record<string, unknown>) => getPaged<Purchase[]>('/inventory/purchases', params),
  createPurchase: (body: unknown) => post<Purchase>('/inventory/purchases', body),
  receivePurchase: (id: string) => post<unknown>(`/inventory/purchases/${id}/receive`),
};

/* ── Dashboard & analytics ──────────────────────────────────────────────── */

export const dashboardService = {
  /** Personal shift stats — available to every signed-in role. */
  me: () => get<MyPerformance>('/dashboard/me'),
  overview: () => get<DashboardOverview>('/dashboard/overview'),
  revenueChart: (days = 14) => get<RevenuePoint[]>('/dashboard/revenue-chart', { days }),
  popularDishes: (params?: Record<string, unknown>) => get<PopularDish[]>('/dashboard/popular-dishes', params),
  orderMix: (days = 30) =>
    get<{ type: string; orderCount: number; revenue: number }[]>('/dashboard/order-mix', { days }),
  activity: (limit = 20) => get<ActivityEntry[]>('/dashboard/activity', { limit }),
};

export const analyticsService = {
  replay: (params?: Record<string, unknown>) => get<ReplayData>('/analytics/replay', params),
  kitchenHeatmap: (params?: Record<string, unknown>) => get<KitchenHeatmap>('/analytics/kitchen-heatmap', params),
  waste: (params?: Record<string, unknown>) => get<import('@/types').WasteAnalytics>('/analytics/waste', params),
  healthScore: (params?: Record<string, unknown>) => get<HealthScore>('/analytics/health-score', params),
  peakHours: (params?: Record<string, unknown>) => get<PeakHours>('/analytics/peak-hours', params),
  menuPerformance: (params?: Record<string, unknown>) =>
    get<MenuPerformance>('/analytics/menu-performance', params),
};

export const reportService = {
  revenue: (params?: Record<string, unknown>) => get<RevenueReport>('/reports/revenue', params),
  orders: (params?: Record<string, unknown>) => get<unknown[]>('/reports/orders', params),
  customers: (params?: Record<string, unknown>) => get<unknown[]>('/reports/customers', params),
  inventory: () => get<unknown[]>('/reports/inventory'),

  exportCsv: (kind: string, params?: Record<string, unknown>) =>
    downloadFile(`/reports/${kind}/export`, params),
};

/* ── Platform ───────────────────────────────────────────────────────────── */

export const notificationService = {
  list: (limit = 30) =>
    get<{ notifications: AppNotification[]; unreadCount: number }>('/notifications', { limit }),
  markRead: (id: string) => post<unknown>(`/notifications/${id}/read`),
  markAllRead: () => post<null>('/notifications/read-all'),
};

export const searchService = {
  global: (q: string) => get<GlobalSearchResults>('/search', { q }),
};

export const settingsService = {
  get: () => get<RestaurantSettings>('/settings'),
  update: (body: Partial<RestaurantSettings>) => patch<RestaurantSettings>('/settings', body),
  workspaceStatus: () =>
    get<{ users: number; menuItems: number; orders: number; customers: number; ingredients: number }>(
      '/settings/workspace-status',
    ),
};

export const uploadService = {
  async upload(file: File, folder: string): Promise<UploadedFile> {
    const form = new FormData();
    form.append('file', file);
    form.append('folder', folder);

    const { api } = await import('./api');
    const { data } = await api.post<{ data: UploadedFile }>('/uploads', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.data;
  },
  remove: (storageKey: string) => del<null>('/uploads', { storageKey }),
};

export const profileService = {
  me: () => get<User>('/auth/me'),
  update: (body: { name?: string; phone?: string; avatarUrl?: string }) => patch<User>('/auth/me', body),
  changePassword: (currentPassword: string, newPassword: string) =>
    post<null>('/auth/change-password', { currentPassword, newPassword }),
  forgotPassword: (email: string) => post<{ resetToken?: string } | null>('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) => post<null>('/auth/reset-password', { token, password }),
};

/* ── Guest-facing (no authentication) ───────────────────────────────────── */

export const publicService = {
  menu: () => get<PublicMenu>('/public/menu'),
  createOrder: (body: unknown) => post<PublicOrderReceipt>('/public/orders', body),
  track: (orderNumber: string, phone: string) =>
    get<PublicOrderStatus>('/public/orders/track', { orderNumber, phone }),
};
