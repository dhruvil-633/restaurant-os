import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import {
  customers,
  employees,
  ingredients,
  menuItems,
  notifications,
  orders,
  users,
} from '../db/schema';
import { requireUser } from '../middlewares/auth';
import { storage } from '../services/storage';
import { getSettings, saveSettings } from '../services/settingsService';
import { ApiError } from '../utils/apiError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../utils/apiResponse';
import { toNumber } from '../utils/serialize';

/* ── Notifications ──────────────────────────────────────────────────────── */

export const listNotifications = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);

  // A user sees notifications addressed to them, to their role, or to everyone.
  const audience = or(
    eq(notifications.userId, user.id),
    eq(notifications.targetRole, user.role),
    and(isNull(notifications.userId), isNull(notifications.targetRole)),
  );

  const [rows, [{ unread }]] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(audience)
      .orderBy(desc(notifications.createdAt))
      .limit(limit),
    db
      .select({ unread: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(audience, eq(notifications.isRead, false))),
  ]);

  sendSuccess(
    res,
    {
      notifications: rows.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        message: row.message,
        link: row.link,
        payload: row.payload,
        isRead: row.isRead,
        createdAt: row.createdAt.toISOString(),
      })),
      unreadCount: unread,
    },
    'Notifications loaded',
  );
});

export const markNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const [updated] = await db
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.id, id))
    .returning();

  if (!updated) throw ApiError.notFound('Notification');
  sendSuccess(res, { id: updated.id, isRead: true }, 'Marked as read');
});

export const markAllNotificationsRead = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);

  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.isRead, false),
        or(
          eq(notifications.userId, user.id),
          eq(notifications.targetRole, user.role),
          and(isNull(notifications.userId), isNull(notifications.targetRole)),
        ),
      ),
    );

  sendSuccess(res, null, 'All notifications marked as read');
});

/* ── File upload ────────────────────────────────────────────────────────── */

const uploadFolderSchema = z.enum(['menu-items', 'employees', 'invoices', 'avatars', 'categories']);

export const uploadFile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('No file was attached to the request');

  const folderInput = typeof req.body?.folder === 'string' ? req.body.folder : 'menu-items';
  const parsed = uploadFolderSchema.safeParse(folderInput);
  if (!parsed.success) {
    throw ApiError.badRequest(
      `Unknown upload folder. Use one of: ${uploadFolderSchema.options.join(', ')}.`,
    );
  }

  const stored = await storage.upload({
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    folder: parsed.data,
  });

  sendCreated(res, stored, 'File uploaded');
});

export const deleteUpload = asyncHandler(async (req: Request, res: Response) => {
  const storageKey = typeof req.body?.storageKey === 'string' ? req.body.storageKey : '';
  if (!storageKey) throw ApiError.badRequest('Supply the storageKey of the file to remove');

  await storage.remove(storageKey);
  sendSuccess(res, null, 'File removed');
});

/* ── Global search ──────────────────────────────────────────────────────── */

/** One query across every entity the top-bar search box can jump to. */
export const globalSearch = asyncHandler(async (req: Request, res: Response) => {
  const term = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (term.length < 2) {
    sendSuccess(res, { orders: [], customers: [], menuItems: [], employees: [], ingredients: [] }, 'Enter at least two characters');
    return;
  }

  const pattern = `%${term}%`;
  const perGroup = 5;

  const [orderRows, customerRows, menuRows, employeeRows, ingredientRows] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        total: orders.total,
        placedAt: orders.placedAt,
      })
      .from(orders)
      .where(ilike(orders.orderNumber, pattern))
      .orderBy(desc(orders.placedAt))
      .limit(perGroup),

    db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        visitCount: customers.visitCount,
      })
      .from(customers)
      .where(or(ilike(customers.name, pattern), ilike(customers.phone, pattern)))
      .limit(perGroup),

    db
      .select({
        id: menuItems.id,
        name: menuItems.name,
        price: menuItems.price,
        isAvailable: menuItems.isAvailable,
      })
      .from(menuItems)
      .where(ilike(menuItems.name, pattern))
      .limit(perGroup),

    db
      .select({
        id: employees.id,
        name: employees.name,
        position: employees.position,
        employeeCode: employees.employeeCode,
      })
      .from(employees)
      .where(or(ilike(employees.name, pattern), ilike(employees.employeeCode, pattern)))
      .limit(perGroup),

    db
      .select({
        id: ingredients.id,
        name: ingredients.name,
        currentStock: ingredients.currentStock,
        unit: ingredients.unit,
      })
      .from(ingredients)
      .where(ilike(ingredients.name, pattern))
      .limit(perGroup),
  ]);

  sendSuccess(
    res,
    {
      orders: orderRows.map((row) => ({
        ...row,
        total: toNumber(row.total),
        placedAt: row.placedAt.toISOString(),
      })),
      customers: customerRows,
      menuItems: menuRows.map((row) => ({ ...row, price: toNumber(row.price) })),
      employees: employeeRows,
      ingredients: ingredientRows.map((row) => ({
        ...row,
        currentStock: toNumber(row.currentStock),
      })),
    },
    'Search complete',
  );
});

/* ── Settings ───────────────────────────────────────────────────────────── */

const settingsSchema = z.object({
  restaurantName: z.string().trim().min(2).max(140).optional(),
  currency: z.string().trim().length(3).optional(),
  currencySymbol: z.string().trim().min(1).max(4).optional(),
  taxRatePercent: z.coerce.number().min(0).max(50).optional(),
  serviceChargePercent: z.coerce.number().min(0).max(50).optional(),
  loyaltyPointsPerCurrencyUnit: z.coerce.number().min(0).max(10).optional(),
  lowStockNotifications: z.boolean().optional(),
  averageTableTurnoverMinutes: z.coerce.number().int().min(15).max(300).optional(),
  address: z.string().trim().max(500).optional(),
  phone: z.string().trim().max(32).optional(),
  timezone: z.string().trim().max(64).optional(),
});

export const getRestaurantSettings = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, await getSettings(), 'Settings loaded');
});

export const updateRestaurantSettings = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = settingsSchema.parse(req.body);
  const updated = await saveSettings(input, user.id);
  sendSuccess(res, updated, 'Settings saved');
});

/** Lightweight counts used to decide whether to show empty-state screens. */
export const getWorkspaceStatus = asyncHandler(async (_req: Request, res: Response) => {
  const [[counts]] = await Promise.all([
    db
      .select({
        users: sql<number>`(select count(*) from ${users})::int`,
        menuItems: sql<number>`(select count(*) from ${menuItems})::int`,
        orders: sql<number>`(select count(*) from ${orders})::int`,
        customers: sql<number>`(select count(*) from ${customers})::int`,
        ingredients: sql<number>`(select count(*) from ${ingredients})::int`,
      })
      .from(sql`(select 1) as probe`),
  ]);

  sendSuccess(res, counts, 'Workspace status loaded');
});
