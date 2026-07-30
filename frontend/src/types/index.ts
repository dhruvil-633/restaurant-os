/* ────────────────────────────────────────────────────────────────────────
   API contract types.

   These mirror the DTOs the Express controllers serialise. Keeping them in
   one file makes a backend field change a single-place edit on the client.
   ──────────────────────────────────────────────────────────────────────── */

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiError {
  success: false;
  message: string;
  code: string;
  issues?: { field: string; message: string }[];
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export type UserRole = 'owner' | 'manager' | 'cashier' | 'waiter' | 'chef' | 'kitchen_staff';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuthPayload {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/* ── Menu ───────────────────────────────────────────────────────────────── */

export type MenuCategoryType = 'food' | 'drinks' | 'desserts';

export interface MenuCategory {
  id: string;
  name: string;
  slug: string;
  type: MenuCategoryType;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  itemCount: number;
  createdAt: string;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  categoryName: string | null;
  name: string;
  description: string | null;
  price: number;
  cost: number;
  margin: number;
  imageUrl: string | null;
  prepTimeMinutes: number;
  calories: number | null;
  spiceLevel: number;
  isVegetarian: boolean;
  isAvailable: boolean;
  isFeatured: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface MenuCategoryWithItems extends MenuCategory {
  items: MenuItem[];
}

/* ── Floor ──────────────────────────────────────────────────────────────── */

export type TableStatus = 'available' | 'occupied' | 'reserved' | 'cleaning';

export interface RestaurantTable {
  id: string;
  label: string;
  capacity: number;
  section: string;
  status: TableStatus;
  shape: 'square' | 'round' | 'rectangle';
  positionX: number;
  positionY: number;
  assignedWaiterId: string | null;
  assignedWaiterName: string | null;
  isActive: boolean;
  activeOrder: {
    id: string;
    orderNumber: string;
    status: string;
    total: number;
    guestCount: number;
    placedAt: string;
    minutesSeated: number;
  } | null;
}

export interface WaitTimeEstimate {
  estimatedMinutes: number;
  confidence: 'low' | 'medium' | 'high';
  occupancyRate: number;
  breakdown: {
    totalTables: number;
    available: number;
    occupied: number;
    reserved: number;
    cleaning: number;
    pendingOrders: number;
    averageSeatedMinutes: number;
  };
}

/* ── Orders ─────────────────────────────────────────────────────────────── */

export type OrderType = 'dine_in' | 'takeaway' | 'delivery';
export type OrderStatus = 'pending' | 'cooking' | 'ready' | 'served' | 'completed' | 'cancelled';
export type OrderItemStatus = 'queued' | 'cooking' | 'ready' | 'served' | 'cancelled';
export type PaymentMethod = 'cash' | 'card' | 'upi' | 'wallet';
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

export interface OrderItem {
  id: string;
  menuItemId: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  status: OrderItemStatus;
  notes: string | null;
  prepTimeMinutes: number;
  startedAt: string | null;
  readyAt: string | null;
}

export interface Order {
  id: string;
  orderNumber: string;
  type: OrderType;
  status: OrderStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  tableId: string | null;
  tableLabel: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  waiterId: string | null;
  waiterName: string | null;
  chefId: string | null;
  chefName: string | null;
  guestCount: number;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  deliveryAddress: string | null;
  notes: string | null;
  cancelReason: string | null;
  placedAt: string;
  cookingStartedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  elapsedMinutes: number;
  items: OrderItem[];
}

export interface KitchenTicket extends Order {
  expectedMinutes: number;
  overdueMinutes: number;
  heat: 'green' | 'amber' | 'red';
}

export interface KitchenQueue {
  tickets: KitchenTicket[];
  summary: {
    total: number;
    pending: number;
    cooking: number;
    ready: number;
    overdue: number;
  };
}

export interface Bill {
  order: Order;
  restaurant: {
    name: string;
    address: string;
    phone: string;
    currency: string;
    currencySymbol: string;
  };
  taxRatePercent: number;
  generatedAt: string;
}

/* ── Guests ─────────────────────────────────────────────────────────────── */

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  birthday: string | null;
  notes: string | null;
  loyaltyPoints: number;
  visitCount: number;
  totalSpent: number;
  averageBill: number;
  firstVisitAt: string | null;
  lastVisitAt: string | null;
  createdAt: string;
}

export interface CustomerMemory {
  customer: Customer;
  isReturning: boolean;
  tier: 'new' | 'returning' | 'frequent' | 'regular';
  daysSinceLastVisit: number | null;
  daysUntilBirthday: number | null;
  averageRating: number | null;
  favouriteDishes: {
    menuItemId: string | null;
    name: string;
    timesOrdered: number;
    lastOrderedAt: string | null;
  }[];
  recentOrders: {
    id: string;
    orderNumber: string;
    total: number;
    status: string;
    type: string;
    placedAt: string;
  }[];
  recentFeedback: { id: string; rating: number; comment: string | null; createdAt: string }[];
  visitPattern: { averageDaysBetweenVisits: number; favouriteHour: number };
}

export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'seated'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export interface Reservation {
  id: string;
  reservationCode: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  tableId: string | null;
  tableLabel: string | null;
  partySize: number;
  reservedFor: string;
  durationMinutes: number;
  status: ReservationStatus;
  specialRequest: string | null;
  seatedAt: string | null;
  minutesUntilArrival: number;
  createdAt: string;
}

export interface TodayReservations {
  reservations: Reservation[];
  summary: {
    total: number;
    upcoming: number;
    seated: number;
    completed: number;
    noShow: number;
    expectedGuests: number;
  };
}

export interface FeedbackEntry {
  id: string;
  rating: number;
  foodRating: number | null;
  serviceRating: number | null;
  ambienceRating: number | null;
  comment: string | null;
  createdAt: string;
  customerName: string | null;
  orderNumber: string | null;
}

/* ── Staff ──────────────────────────────────────────────────────────────── */

export interface Employee {
  id: string;
  userId: string | null;
  linkedRole: UserRole | null;
  employeeCode: string;
  name: string;
  position: string;
  department: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  emergencyContact: string | null;
  avatarUrl: string | null;
  /** Null unless the viewer is an owner — pay is not a manager's to see. */
  monthlySalary: number | null;
  hiredAt: string;
  isActive: boolean;
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName?: string;
  employeeCode?: string;
  workDate: string;
  status: 'present' | 'absent' | 'late' | 'half_day' | 'leave';
  checkInAt: string | null;
  checkOutAt: string | null;
  hoursWorked: number;
  notes: string | null;
}

export interface Shift {
  id: string;
  employeeId: string;
  employeeName?: string;
  position?: string;
  startsAt: string;
  endsAt: string;
  label: string;
  notes: string | null;
}

export interface EmployeeDetail extends Employee {
  attendance: AttendanceRecord[];
  shifts: Shift[];
  attendanceRate: number;
  totalHoursLast30Days: number;
}

export interface PerformanceEntry {
  userId: string | null;
  name: string;
  role: UserRole;
  avatarUrl: string | null;
  ordersServed: number;
  revenue: number;
  averageServiceMinutes: number;
  averageGuests: number;
  averageRating: number | null;
  reviewCount: number;
  attendanceRate: number | null;
  hoursWorked: number;
  performanceScore: number;
}

/* ── Inventory ──────────────────────────────────────────────────────────── */

export type InventoryUnit = 'kg' | 'g' | 'l' | 'ml' | 'piece' | 'packet' | 'bottle' | 'dozen';

export interface Ingredient {
  id: string;
  name: string;
  category: string;
  unit: InventoryUnit;
  currentStock: number;
  minStock: number;
  maxStock: number;
  costPerUnit: number;
  stockValue: number;
  supplierId: string | null;
  supplierName: string | null;
  storageLocation: string;
  expiryDate: string | null;
  daysUntilExpiry: number | null;
  isLowStock: boolean;
  isOutOfStock: boolean;
  isExpiringSoon: boolean;
  stockPercentage: number;
  isActive: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface InventorySummary {
  totals: {
    totalItems: number;
    stockValue: number;
    lowStockCount: number;
    outOfStockCount: number;
    expiringCount: number;
  };
  lowStock: Ingredient[];
  expiringSoon: Ingredient[];
  byCategory: { category: string; itemCount: number; value: number }[];
}

export interface StockMovement {
  id: string;
  type: 'purchase' | 'consumption' | 'waste' | 'adjustment';
  quantity: number;
  unitCost: number;
  totalCost: number;
  wasteReason: string | null;
  note: string | null;
  occurredAt: string;
  ingredientName: string;
  unit: InventoryUnit;
}

export interface Purchase {
  id: string;
  purchaseNumber: string;
  supplierId: string;
  supplierName: string;
  status: 'draft' | 'ordered' | 'received' | 'cancelled';
  invoiceNumber: string | null;
  invoiceUrl: string | null;
  totalAmount: number;
  orderedAt: string;
  receivedAt: string | null;
}

/* ── Dashboard & analytics ──────────────────────────────────────────────── */

export interface DashboardOverview {
  revenue: { value: number; trend: number; averageOrderValue: number };
  orders: { value: number; trend: number; completed: number; cancelled: number; guests: number };
  customers: { total: number; newToday: number; returning: number };
  reservations: { today: number; upcoming: number; seated: number };
  inventory: { lowStock: number; outOfStock: number; expiringSoon: number };
  kitchen: { activeTickets: number; delayedTickets: number; averageWaitMinutes: number };
  tables: { total: number; occupied: number; available: number; occupancyRate: number };
  satisfaction: { averageRating: number; reviewCount: number };
}

export interface RevenuePoint {
  date: string;
  revenue: number;
  orders: number;
  guests: number;
}

export interface PopularDish {
  menuItemId: string | null;
  name: string;
  quantitySold: number;
  revenue: number;
  orderCount: number;
}

export interface ActivityEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
}

export interface ReplayData {
  from: string;
  to: string;
  totalEvents: number;
  events: (ActivityEntry & { offsetSeconds: number })[];
  density: { timestamp: string; eventCount: number }[];
  byCategory: { entityType: string; count: number }[];
  durationSeconds: number;
}

export interface KitchenHeatmap {
  from: string;
  to: string;
  dishes: {
    menuItemId: string | null;
    name: string;
    timesCooked: number;
    expectedMinutes: number;
    actualMinutes: number;
    delayMinutes: number;
    cumulativeDelayMinutes: number;
    heat: 'green' | 'amber' | 'red';
  }[];
  byHour: { hour: number; ticketCount: number; averageMinutes: number; heat: string }[];
  bottlenecks: {
    name: string;
    delayMinutes: number;
    cumulativeDelayMinutes: number;
    timesCooked: number;
  }[];
  summary: {
    averageMinutes: number;
    slowestMinutes: number;
    ticketCount: number;
    slowestHour: number | null;
  };
}

export interface WasteAnalytics {
  from: string;
  to: string;
  summary: {
    totalValue: number;
    totalQuantity: number;
    incidents: number;
    averagePerDay: number;
    percentOfRevenue: number;
    projectedMonthlyLoss: number;
  };
  byReason: { reason: string; value: number; quantity: number; incidents: number; share: number }[];
  byIngredient: {
    ingredientId: string;
    name: string;
    unit: string;
    quantity: number;
    value: number;
    incidents: number;
  }[];
  daily: { date: string; value: number; quantity: number }[];
}

export interface HealthScore {
  from: string;
  to: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  status: string;
  pillars: { key: string; label: string; score: number; max: number; detail: string }[];
  focusArea: { key: string; label: string; detail: string } | null;
  context: {
    revenue: number;
    previousRevenue: number;
    completedOrders: number;
    cancellationRate: number;
  };
}

export interface PeakHours {
  from: string;
  to: string;
  grid: {
    weekday: number;
    weekdayName: string;
    hour: number;
    orderCount: number;
    revenue: number;
    guests: number;
  }[];
  byHour: { hour: number; orderCount: number; revenue: number; averageOrderValue: number }[];
  byWeekday: {
    weekday: number;
    weekdayName: string;
    orderCount: number;
    revenue: number;
    guests: number;
  }[];
  insights: {
    peakSlot: { weekday: number; weekdayName: string; hour: number; revenue: number } | null;
    peakHour: number | null;
    busiestDay: string | null;
    quietestDay: string | null;
  };
}

export interface MenuPerformance {
  from: string;
  to: string;
  items: {
    menuItemId: string | null;
    name: string;
    quantitySold: number;
    revenue: number;
    cost: number;
    profit: number;
    marginPercent: number;
    quadrant: 'star' | 'plowhorse' | 'puzzle' | 'dog';
  }[];
  quadrants: { stars: number; plowhorses: number; puzzles: number; dogs: number };
}

/* ── Platform ───────────────────────────────────────────────────────────── */

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  payload: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}

export interface RestaurantSettings {
  restaurantName: string;
  currency: string;
  currencySymbol: string;
  taxRatePercent: number;
  serviceChargePercent: number;
  loyaltyPointsPerCurrencyUnit: number;
  lowStockNotifications: boolean;
  averageTableTurnoverMinutes: number;
  address: string;
  phone: string;
  timezone: string;
}

export interface GlobalSearchResults {
  orders: { id: string; orderNumber: string; status: string; total: number; placedAt: string }[];
  customers: { id: string; name: string; phone: string; visitCount: number }[];
  menuItems: { id: string; name: string; price: number; isAvailable: boolean }[];
  employees: { id: string; name: string; position: string; employeeCode: string }[];
  ingredients: { id: string; name: string; currentStock: number; unit: string }[];
}

export interface RevenueReport {
  from: string;
  to: string;
  rows: {
    date: string;
    orders: number;
    completed: number;
    cancelled: number;
    revenue: number;
    tax: number;
    discount: number;
    guests: number;
    averageOrderValue: number;
  }[];
  totals: {
    orders: number;
    completed: number;
    cancelled: number;
    revenue: number;
    tax: number;
    discount: number;
    guests: number;
    averageOrderValue: number;
    averagePerGuest: number;
  };
}

export interface StaffOption {
  id: string;
  name: string;
  role: UserRole;
  avatarUrl: string | null;
}

export interface UploadedFile {
  url: string;
  storageKey: string;
  provider: string;
}

/* ── Guest-facing (public, no auth) ─────────────────────────────────────── */

export interface PublicMenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  prepTimeMinutes: number;
  isVegetarian: boolean;
  spiceLevel: number;
  calories: number | null;
  isFeatured: boolean;
}

export interface PublicMenu {
  restaurant: {
    name: string;
    address: string;
    phone: string;
    currencySymbol: string;
    taxRatePercent: number;
  };
  categories: {
    id: string;
    name: string;
    type: string;
    description: string | null;
    items: PublicMenuItem[];
  }[];
}

export interface PublicOrderReceipt {
  orderNumber: string;
  status: string;
  type: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  estimatedMinutes: number;
  placedAt: string;
  items: { name: string; quantity: number; lineTotal: number }[];
}

export interface PublicOrderStatus {
  orderNumber: string;
  status: OrderStatus;
  type: string;
  total: number;
  customerName: string;
  placedAt: string;
  readyAt: string | null;
  completedAt: string | null;
  stageIndex: number;
  elapsedMinutes: number;
  items: { name: string; quantity: number }[];
}

/* ── Personal performance (waiter / chef / cashier) ─────────────────────── */

export interface MyPerformance {
  role: UserRole;
  focus: 'kitchen' | 'floor';
  today: { orders: number; completed: number; revenue: number; guests: number };
  week: { orders: number; revenue: number };
  month: {
    orders: number;
    revenue: number;
    averageServiceMinutes: number;
    averageCookMinutes: number;
  };
  rating: { average: number | null; reviewCount: number };
  employment: {
    employeeCode: string;
    position: string;
    department: string;
    monthlySalary: number;
    hiredAt: string;
  } | null;
  attendance: {
    presentDays: number;
    totalDays: number;
    rate: number;
    hoursWorked: number;
  } | null;
  recentAttendance: { workDate: string; status: string; hoursWorked: number }[];
  myTables: { id: string; label: string; status: string; section: string; capacity: number }[];
  topDishes: { name: string; quantity: number }[];
  recentOrders: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    type: string;
    total: number;
    placedAt: string;
    tableLabel: string | null;
  }[];
  recentReviews: {
    id: string;
    rating: number;
    comment: string | null;
    createdAt: string;
    orderNumber: string;
  }[];
}
