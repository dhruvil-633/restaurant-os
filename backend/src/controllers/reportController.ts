import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { db } from '../db';
import { customers, employees, ingredients, orderItems, orders, users } from '../db/schema';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { buildCsv, sendCsv, type CsvColumn } from '../utils/csv';
import { toNumber } from '../utils/serialize';

function parseRange(req: Request, defaultDays = 30): { from: Date; to: Date } {
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  const from = req.query.from ? new Date(String(req.query.from)) : new Date();
  if (!req.query.from) from.setDate(from.getDate() - defaultDays);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

const stamp = (): string => new Date().toISOString().slice(0, 10);

interface RevenueRow {
  date: string;
  orders: number;
  completed: number;
  cancelled: number;
  revenue: number;
  tax: number;
  discount: number;
  guests: number;
  averageOrderValue: number;
}

async function loadRevenueRows(from: Date, to: Date): Promise<RevenueRow[]> {
  const rows = await db
    .select({
      day: sql<string>`to_char(${orders.placedAt}, 'YYYY-MM-DD')`,
      orderCount: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${orders.status} = 'completed')::int`,
      cancelled: sql<number>`count(*) filter (where ${orders.status} = 'cancelled')::int`,
      revenue: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} = 'completed'), 0)::float`,
      tax: sql<number>`coalesce(sum(${orders.taxAmount}) filter (where ${orders.status} = 'completed'), 0)::float`,
      discount: sql<number>`coalesce(sum(${orders.discountAmount}) filter (where ${orders.status} = 'completed'), 0)::float`,
      guests: sql<number>`coalesce(sum(${orders.guestCount}), 0)::int`,
    })
    .from(orders)
    .where(and(gte(orders.placedAt, from), lte(orders.placedAt, to)))
    .groupBy(sql`to_char(${orders.placedAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${orders.placedAt}, 'YYYY-MM-DD')`);

  return rows.map((row) => ({
    date: row.day,
    orders: row.orderCount,
    completed: row.completed,
    cancelled: row.cancelled,
    revenue: Math.round(row.revenue * 100) / 100,
    tax: Math.round(row.tax * 100) / 100,
    discount: Math.round(row.discount * 100) / 100,
    guests: row.guests,
    averageOrderValue:
      row.completed > 0 ? Math.round((row.revenue / row.completed) * 100) / 100 : 0,
  }));
}

export const getRevenueReport = asyncHandler(async (req: Request, res: Response) => {
  const { from, to } = parseRange(req);
  const rows = await loadRevenueRows(from, to);

  const totals = rows.reduce(
    (accumulator, row) => ({
      orders: accumulator.orders + row.orders,
      completed: accumulator.completed + row.completed,
      cancelled: accumulator.cancelled + row.cancelled,
      revenue: accumulator.revenue + row.revenue,
      tax: accumulator.tax + row.tax,
      discount: accumulator.discount + row.discount,
      guests: accumulator.guests + row.guests,
    }),
    { orders: 0, completed: 0, cancelled: 0, revenue: 0, tax: 0, discount: 0, guests: 0 },
  );

  sendSuccess(
    res,
    {
      from: from.toISOString(),
      to: to.toISOString(),
      rows,
      totals: {
        ...totals,
        revenue: Math.round(totals.revenue * 100) / 100,
        tax: Math.round(totals.tax * 100) / 100,
        discount: Math.round(totals.discount * 100) / 100,
        averageOrderValue:
          totals.completed > 0 ? Math.round((totals.revenue / totals.completed) * 100) / 100 : 0,
        averagePerGuest:
          totals.guests > 0 ? Math.round((totals.revenue / totals.guests) * 100) / 100 : 0,
      },
    },
    'Revenue report ready',
  );
});

export const exportRevenueCsv = asyncHandler(async (req: Request, res: Response) => {
  const { from, to } = parseRange(req);
  const rows = await loadRevenueRows(from, to);

  const columns: CsvColumn<RevenueRow>[] = [
    { header: 'Date', value: (row) => row.date },
    { header: 'Orders', value: (row) => row.orders },
    { header: 'Completed', value: (row) => row.completed },
    { header: 'Cancelled', value: (row) => row.cancelled },
    { header: 'Guests', value: (row) => row.guests },
    { header: 'Revenue', value: (row) => row.revenue.toFixed(2) },
    { header: 'Tax', value: (row) => row.tax.toFixed(2) },
    { header: 'Discount', value: (row) => row.discount.toFixed(2) },
    { header: 'Average Order Value', value: (row) => row.averageOrderValue.toFixed(2) },
  ];

  sendCsv(res, `revenue-report-${stamp()}.csv`, buildCsv(rows, columns));
});

export const getOrdersReport = asyncHandler(async (req: Request, res: Response) => {
  const { from, to } = parseRange(req);

  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      type: orders.type,
      status: orders.status,
      total: orders.total,
      paymentMethod: orders.paymentMethod,
      guestCount: orders.guestCount,
      placedAt: orders.placedAt,
      completedAt: orders.completedAt,
      waiterName: users.name,
      customerName: customers.name,
    })
    .from(orders)
    .leftJoin(users, eq(orders.waiterId, users.id))
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(and(gte(orders.placedAt, from), lte(orders.placedAt, to)))
    .orderBy(desc(orders.placedAt))
    .limit(5000);

  sendSuccess(
    res,
    rows.map((row) => ({
      ...row,
      total: toNumber(row.total),
      placedAt: row.placedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      serviceMinutes: row.completedAt
        ? Math.round((row.completedAt.getTime() - row.placedAt.getTime()) / 60_000)
        : null,
    })),
    'Orders report ready',
  );
});

export const exportOrdersCsv = asyncHandler(async (req: Request, res: Response) => {
  const { from, to } = parseRange(req);

  const rows = await db
    .select({
      orderNumber: orders.orderNumber,
      type: orders.type,
      status: orders.status,
      total: orders.total,
      taxAmount: orders.taxAmount,
      discountAmount: orders.discountAmount,
      paymentMethod: orders.paymentMethod,
      guestCount: orders.guestCount,
      placedAt: orders.placedAt,
      completedAt: orders.completedAt,
      waiterName: users.name,
      customerName: customers.name,
    })
    .from(orders)
    .leftJoin(users, eq(orders.waiterId, users.id))
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(and(gte(orders.placedAt, from), lte(orders.placedAt, to)))
    .orderBy(desc(orders.placedAt))
    .limit(10_000);

  type Row = (typeof rows)[number];

  const columns: CsvColumn<Row>[] = [
    { header: 'Order Number', value: (row) => row.orderNumber },
    { header: 'Type', value: (row) => row.type },
    { header: 'Status', value: (row) => row.status },
    { header: 'Customer', value: (row) => row.customerName ?? '' },
    { header: 'Waiter', value: (row) => row.waiterName ?? '' },
    { header: 'Guests', value: (row) => row.guestCount },
    { header: 'Discount', value: (row) => toNumber(row.discountAmount).toFixed(2) },
    { header: 'Tax', value: (row) => toNumber(row.taxAmount).toFixed(2) },
    { header: 'Total', value: (row) => toNumber(row.total).toFixed(2) },
    { header: 'Payment Method', value: (row) => row.paymentMethod ?? '' },
    { header: 'Placed At', value: (row) => row.placedAt.toISOString() },
    { header: 'Completed At', value: (row) => row.completedAt?.toISOString() ?? '' },
  ];

  sendCsv(res, `orders-report-${stamp()}.csv`, buildCsv(rows, columns));
});

export const getCustomerReport = asyncHandler(async (req: Request, res: Response) => {
  const { from, to } = parseRange(req, 90);

  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      email: customers.email,
      visitCount: customers.visitCount,
      totalSpent: customers.totalSpent,
      loyaltyPoints: customers.loyaltyPoints,
      lastVisitAt: customers.lastVisitAt,
      periodOrders: sql<number>`count(${orders.id})::int`,
      periodSpend: sql<number>`coalesce(sum(${orders.total}), 0)::float`,
    })
    .from(customers)
    .leftJoin(
      orders,
      and(
        eq(orders.customerId, customers.id),
        gte(orders.placedAt, from),
        lte(orders.placedAt, to),
        eq(orders.status, 'completed'),
      ),
    )
    .groupBy(customers.id)
    .orderBy(desc(customers.totalSpent))
    .limit(2000);

  sendSuccess(
    res,
    rows.map((row) => ({
      ...row,
      totalSpent: toNumber(row.totalSpent),
      periodSpend: Math.round(row.periodSpend * 100) / 100,
      lastVisitAt: row.lastVisitAt?.toISOString() ?? null,
      averageBill:
        row.visitCount > 0 ? Math.round((toNumber(row.totalSpent) / row.visitCount) * 100) / 100 : 0,
    })),
    'Customer report ready',
  );
});

export const exportCustomersCsv = asyncHandler(async (req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(customers)
    .orderBy(desc(customers.totalSpent))
    .limit(10_000);

  type Row = (typeof rows)[number];

  const columns: CsvColumn<Row>[] = [
    { header: 'Name', value: (row) => row.name },
    { header: 'Phone', value: (row) => row.phone },
    { header: 'Email', value: (row) => row.email ?? '' },
    { header: 'Visits', value: (row) => row.visitCount },
    { header: 'Total Spent', value: (row) => toNumber(row.totalSpent).toFixed(2) },
    {
      header: 'Average Bill',
      value: (row) =>
        row.visitCount > 0 ? (toNumber(row.totalSpent) / row.visitCount).toFixed(2) : '0.00',
    },
    { header: 'Loyalty Points', value: (row) => row.loyaltyPoints },
    { header: 'Birthday', value: (row) => row.birthday ?? '' },
    { header: 'Last Visit', value: (row) => row.lastVisitAt?.toISOString() ?? '' },
  ];

  sendCsv(res, `customers-${stamp()}.csv`, buildCsv(rows, columns));
});

export const getInventoryReport = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await db.select().from(ingredients).orderBy(desc(ingredients.name));

  sendSuccess(
    res,
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      unit: row.unit,
      currentStock: toNumber(row.currentStock),
      minStock: toNumber(row.minStock),
      costPerUnit: toNumber(row.costPerUnit),
      stockValue: Math.round(toNumber(row.currentStock) * toNumber(row.costPerUnit) * 100) / 100,
      expiryDate: row.expiryDate,
      isLowStock: toNumber(row.currentStock) <= toNumber(row.minStock),
    })),
    'Inventory report ready',
  );
});

export const exportInventoryCsv = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await db.select().from(ingredients).orderBy(desc(ingredients.name));
  type Row = (typeof rows)[number];

  const columns: CsvColumn<Row>[] = [
    { header: 'Ingredient', value: (row) => row.name },
    { header: 'Category', value: (row) => row.category },
    { header: 'Unit', value: (row) => row.unit },
    { header: 'Current Stock', value: (row) => toNumber(row.currentStock) },
    { header: 'Minimum Stock', value: (row) => toNumber(row.minStock) },
    { header: 'Cost Per Unit', value: (row) => toNumber(row.costPerUnit).toFixed(2) },
    {
      header: 'Stock Value',
      value: (row) => (toNumber(row.currentStock) * toNumber(row.costPerUnit)).toFixed(2),
    },
    { header: 'Storage', value: (row) => row.storageLocation },
    { header: 'Expiry Date', value: (row) => row.expiryDate ?? '' },
  ];

  sendCsv(res, `inventory-${stamp()}.csv`, buildCsv(rows, columns));
});

export const exportEmployeesCsv = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await db.select().from(employees).orderBy(desc(employees.isActive));
  type Row = (typeof rows)[number];

  const columns: CsvColumn<Row>[] = [
    { header: 'Employee Code', value: (row) => row.employeeCode },
    { header: 'Name', value: (row) => row.name },
    { header: 'Position', value: (row) => row.position },
    { header: 'Department', value: (row) => row.department },
    { header: 'Phone', value: (row) => row.phone ?? '' },
    { header: 'Email', value: (row) => row.email ?? '' },
    { header: 'Monthly Salary', value: (row) => toNumber(row.monthlySalary).toFixed(2) },
    { header: 'Hired', value: (row) => row.hiredAt },
    { header: 'Active', value: (row) => (row.isActive ? 'Yes' : 'No') },
  ];

  sendCsv(res, `employees-${stamp()}.csv`, buildCsv(rows, columns));
});

/** Per-dish sales, used by the menu report screen and its CSV export. */
export const exportMenuSalesCsv = asyncHandler(async (req: Request, res: Response) => {
  const { from, to } = parseRange(req);

  const rows = await db
    .select({
      name: orderItems.nameSnapshot,
      quantitySold: sql<number>`sum(${orderItems.quantity})::int`,
      revenue: sql<number>`coalesce(sum(${orderItems.lineTotal}), 0)::float`,
      orderCount: sql<number>`count(distinct ${orderItems.orderId})::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(gte(orders.placedAt, from), lte(orders.placedAt, to), sql`${orders.status} <> 'cancelled'`),
    )
    .groupBy(orderItems.nameSnapshot)
    .orderBy(desc(sql`sum(${orderItems.quantity})`));

  type Row = (typeof rows)[number];

  const columns: CsvColumn<Row>[] = [
    { header: 'Dish', value: (row) => row.name },
    { header: 'Quantity Sold', value: (row) => row.quantitySold },
    { header: 'Appeared On Orders', value: (row) => row.orderCount },
    { header: 'Revenue', value: (row) => row.revenue.toFixed(2) },
  ];

  sendCsv(res, `menu-sales-${stamp()}.csv`, buildCsv(rows, columns));
});
