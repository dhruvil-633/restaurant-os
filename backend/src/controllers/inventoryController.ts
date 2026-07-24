import { and, asc, desc, eq, gte, ilike, lte, sql, type SQL } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { db } from '../db';
import {
  ingredients,
  inventoryTransactions,
  purchaseItems,
  purchases,
  suppliers,
  type IngredientRow,
  type SupplierRow,
} from '../db/schema';
import { requireUser } from '../middlewares/auth';
import { recordActivity } from '../services/activityLog';
import { notifyRoles } from '../services/notification';
import { realtime } from '../socket';
import { SOCKET_EVENTS } from '../socket/events';
import { ApiError } from '../utils/apiError';
import { asyncHandler } from '../utils/asyncHandler';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse';
import { money, toNumber } from '../utils/serialize';
import { listQuerySchema } from '../validators/common';
import {
  createIngredientSchema,
  createPurchaseSchema,
  createSupplierSchema,
  ingredientQuerySchema,
  receivePurchaseSchema,
  recordWasteSchema,
  stockAdjustmentSchema,
  updateIngredientSchema,
  updateSupplierSchema,
} from '../validators/inventory';

function toIngredientDto(row: IngredientRow, supplierName: string | null = null) {
  const currentStock = toNumber(row.currentStock);
  const minStock = toNumber(row.minStock);
  const maxStock = toNumber(row.maxStock);
  const costPerUnit = toNumber(row.costPerUnit);

  const daysUntilExpiry = row.expiryDate
    ? Math.ceil((new Date(row.expiryDate).getTime() - Date.now()) / 86_400_000)
    : null;

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    currentStock,
    minStock,
    maxStock,
    costPerUnit,
    stockValue: money(currentStock * costPerUnit),
    supplierId: row.supplierId,
    supplierName,
    storageLocation: row.storageLocation,
    expiryDate: row.expiryDate,
    daysUntilExpiry,
    isLowStock: minStock > 0 && currentStock <= minStock,
    isOutOfStock: currentStock <= 0,
    isExpiringSoon: daysUntilExpiry !== null && daysUntilExpiry <= 7,
    stockPercentage: maxStock > 0 ? Math.min(100, Math.round((currentStock / maxStock) * 100)) : 0,
    isActive: row.isActive,
  };
}

function toSupplierDto(row: SupplierRow) {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contactName,
    phone: row.phone,
    email: row.email,
    address: row.address,
    notes: row.notes,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Raises a low-stock alert once a write pushes an ingredient below its floor. */
async function alertIfLowStock(ingredient: IngredientRow): Promise<void> {
  const currentStock = toNumber(ingredient.currentStock);
  const minStock = toNumber(ingredient.minStock);
  if (minStock <= 0 || currentStock > minStock) return;

  const payload = {
    ingredientId: ingredient.id,
    name: ingredient.name,
    currentStock,
    minStock,
    unit: ingredient.unit,
  };

  realtime.toManagement(SOCKET_EVENTS.INVENTORY_ALERT, payload);

  await notifyRoles(['owner', 'manager', 'chef'], {
    type: currentStock <= 0 ? 'inventory_low' : 'inventory_low',
    title: currentStock <= 0 ? `${ingredient.name} is out of stock` : `${ingredient.name} is running low`,
    message: `${currentStock} ${ingredient.unit} left (minimum ${minStock} ${ingredient.unit})`,
    link: '/inventory',
    payload,
  });
}

/* ── Ingredients ────────────────────────────────────────────────────────── */

export const listIngredients = asyncHandler(async (req: Request, res: Response) => {
  const query = ingredientQuerySchema.parse(req.query);

  const filters: SQL[] = [];
  if (query.category) filters.push(eq(ingredients.category, query.category));
  if (query.supplierId) filters.push(eq(ingredients.supplierId, query.supplierId));
  if (query.search) filters.push(ilike(ingredients.name, `%${query.search}%`));
  if (query.lowStock) {
    filters.push(sql`${ingredients.currentStock} <= ${ingredients.minStock}`);
  }
  if (query.expiringSoon) {
    filters.push(sql`${ingredients.expiryDate} is not null and ${ingredients.expiryDate} <= current_date + interval '7 days'`);
  }

  const where = filters.length ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.limit;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ ingredient: ingredients, supplierName: suppliers.name })
      .from(ingredients)
      .leftJoin(suppliers, eq(ingredients.supplierId, suppliers.id))
      .where(where)
      .orderBy(asc(ingredients.name))
      .limit(query.limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(ingredients).where(where),
  ]);

  sendSuccess(
    res,
    rows.map((row) => toIngredientDto(row.ingredient, row.supplierName)),
    'Inventory loaded',
    200,
    buildPaginationMeta(query.page, query.limit, total),
  );
});

/** Headline numbers plus the two alert lists the dashboard surfaces. */
export const getInventorySummary = asyncHandler(async (_req: Request, res: Response) => {
  const [[totals], lowStockRows, expiringRows, categoryRows] = await Promise.all([
    db
      .select({
        totalItems: sql<number>`count(*)::int`,
        stockValue: sql<number>`coalesce(sum(${ingredients.currentStock} * ${ingredients.costPerUnit}), 0)::float`,
        lowStockCount: sql<number>`count(*) filter (where ${ingredients.minStock} > 0 and ${ingredients.currentStock} <= ${ingredients.minStock})::int`,
        outOfStockCount: sql<number>`count(*) filter (where ${ingredients.currentStock} <= 0)::int`,
        expiringCount: sql<number>`count(*) filter (where ${ingredients.expiryDate} is not null and ${ingredients.expiryDate} <= current_date + interval '7 days')::int`,
      })
      .from(ingredients)
      .where(eq(ingredients.isActive, true)),

    db
      .select({ ingredient: ingredients, supplierName: suppliers.name })
      .from(ingredients)
      .leftJoin(suppliers, eq(ingredients.supplierId, suppliers.id))
      .where(
        and(
          eq(ingredients.isActive, true),
          sql`${ingredients.minStock} > 0 and ${ingredients.currentStock} <= ${ingredients.minStock}`,
        ),
      )
      .orderBy(asc(sql`${ingredients.currentStock} / nullif(${ingredients.minStock}, 0)`))
      .limit(15),

    db
      .select({ ingredient: ingredients, supplierName: suppliers.name })
      .from(ingredients)
      .leftJoin(suppliers, eq(ingredients.supplierId, suppliers.id))
      .where(
        and(
          eq(ingredients.isActive, true),
          sql`${ingredients.expiryDate} is not null and ${ingredients.expiryDate} <= current_date + interval '14 days'`,
        ),
      )
      .orderBy(asc(ingredients.expiryDate))
      .limit(15),

    db
      .select({
        category: ingredients.category,
        itemCount: sql<number>`count(*)::int`,
        value: sql<number>`coalesce(sum(${ingredients.currentStock} * ${ingredients.costPerUnit}), 0)::float`,
      })
      .from(ingredients)
      .where(eq(ingredients.isActive, true))
      .groupBy(ingredients.category)
      .orderBy(desc(sql`sum(${ingredients.currentStock} * ${ingredients.costPerUnit})`)),
  ]);

  sendSuccess(
    res,
    {
      totals: {
        totalItems: totals?.totalItems ?? 0,
        stockValue: Math.round((totals?.stockValue ?? 0) * 100) / 100,
        lowStockCount: totals?.lowStockCount ?? 0,
        outOfStockCount: totals?.outOfStockCount ?? 0,
        expiringCount: totals?.expiringCount ?? 0,
      },
      lowStock: lowStockRows.map((row) => toIngredientDto(row.ingredient, row.supplierName)),
      expiringSoon: expiringRows.map((row) => toIngredientDto(row.ingredient, row.supplierName)),
      byCategory: categoryRows.map((row) => ({
        category: row.category,
        itemCount: row.itemCount,
        value: Math.round(row.value * 100) / 100,
      })),
    },
    'Inventory summary loaded',
  );
});

export const createIngredient = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = createIngredientSchema.parse(req.body);

  const [created] = await db
    .insert(ingredients)
    .values({
      name: input.name,
      category: input.category,
      unit: input.unit,
      currentStock: String(input.currentStock),
      minStock: String(input.minStock),
      maxStock: String(input.maxStock),
      costPerUnit: String(input.costPerUnit),
      supplierId: input.supplierId ?? null,
      storageLocation: input.storageLocation,
      expiryDate: input.expiryDate ? input.expiryDate.toISOString().slice(0, 10) : null,
      isActive: input.isActive,
    })
    .returning();

  if (!created) throw ApiError.internal('Could not create the ingredient');

  // Opening stock is a ledger entry too, so the history starts from a real row.
  if (input.currentStock > 0) {
    await db.insert(inventoryTransactions).values({
      ingredientId: created.id,
      type: 'adjustment',
      quantity: String(input.currentStock),
      unitCost: String(input.costPerUnit),
      totalCost: String(money(input.currentStock * input.costPerUnit)),
      note: 'Opening stock',
      performedById: user.id,
    });
  }

  sendCreated(res, toIngredientDto(created), 'Ingredient added');
});

export const updateIngredient = asyncHandler(async (req: Request, res: Response) => {
  const input = updateIngredientSchema.parse(req.body);
  const id = req.params.id as string;

  const [updated] = await db
    .update(ingredients)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.minStock !== undefined ? { minStock: String(input.minStock) } : {}),
      ...(input.maxStock !== undefined ? { maxStock: String(input.maxStock) } : {}),
      ...(input.costPerUnit !== undefined ? { costPerUnit: String(input.costPerUnit) } : {}),
      ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
      ...(input.storageLocation !== undefined ? { storageLocation: input.storageLocation } : {}),
      ...(input.expiryDate !== undefined
        ? { expiryDate: input.expiryDate ? input.expiryDate.toISOString().slice(0, 10) : null }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedAt: new Date(),
    })
    .where(eq(ingredients.id, id))
    .returning();

  if (!updated) throw ApiError.notFound('Ingredient');

  await alertIfLowStock(updated);
  sendSuccess(res, toIngredientDto(updated), 'Ingredient updated');
});

/** Manual correction after a physical stock count. */
export const adjustStock = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = stockAdjustmentSchema.parse(req.body);
  const id = req.params.id as string;

  const [ingredient] = await db.select().from(ingredients).where(eq(ingredients.id, id)).limit(1);
  if (!ingredient) throw ApiError.notFound('Ingredient');

  const [updated] = await db
    .update(ingredients)
    .set({
      currentStock: sql`greatest(0, ${ingredients.currentStock} + ${String(input.quantity)})`,
      updatedAt: new Date(),
    })
    .where(eq(ingredients.id, id))
    .returning();

  if (!updated) throw ApiError.notFound('Ingredient');

  const unitCost = toNumber(ingredient.costPerUnit);

  await db.insert(inventoryTransactions).values({
    ingredientId: id,
    type: 'adjustment',
    quantity: String(input.quantity),
    unitCost: String(unitCost),
    totalCost: String(money(Math.abs(input.quantity) * unitCost)),
    note: input.note || 'Manual stock adjustment',
    performedById: user.id,
  });

  realtime.toManagement(SOCKET_EVENTS.INVENTORY_UPDATED, toIngredientDto(updated));
  await alertIfLowStock(updated);

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: 'inventory.adjusted',
    entityType: 'ingredient',
    entityId: id,
    description: `${user.name} adjusted ${updated.name} by ${input.quantity} ${updated.unit}`,
  });

  sendSuccess(res, toIngredientDto(updated), 'Stock adjusted');
});

export const recordWaste = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = recordWasteSchema.parse(req.body);

  const [ingredient] = await db
    .select()
    .from(ingredients)
    .where(eq(ingredients.id, input.ingredientId))
    .limit(1);
  if (!ingredient) throw ApiError.notFound('Ingredient');

  const unitCost = toNumber(ingredient.costPerUnit);
  const lostValue = money(input.quantity * unitCost);

  const [updated] = await db
    .update(ingredients)
    .set({
      currentStock: sql`greatest(0, ${ingredients.currentStock} - ${String(input.quantity)})`,
      updatedAt: new Date(),
    })
    .where(eq(ingredients.id, input.ingredientId))
    .returning();

  await db.insert(inventoryTransactions).values({
    ingredientId: input.ingredientId,
    type: 'waste',
    quantity: String(-input.quantity),
    unitCost: String(unitCost),
    totalCost: String(lostValue),
    wasteReason: input.reason,
    note: input.note || null,
    performedById: user.id,
  });

  if (updated) await alertIfLowStock(updated);

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: 'inventory.waste',
    entityType: 'ingredient',
    entityId: input.ingredientId,
    description: `${user.name} recorded ${input.quantity} ${ingredient.unit} of ${ingredient.name} wasted (${input.reason})`,
    metadata: { lostValue, reason: input.reason },
  });

  sendCreated(
    res,
    { ingredient: updated ? toIngredientDto(updated) : null, lostValue },
    `Waste recorded — ${lostValue} lost`,
  );
});

export const deleteIngredient = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryTransactions)
    .where(eq(inventoryTransactions.ingredientId, id));

  // Ledger history must stay intact, so retire rather than delete.
  if (count > 0) {
    const [archived] = await db
      .update(ingredients)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(ingredients.id, id))
      .returning();
    if (!archived) throw ApiError.notFound('Ingredient');
    sendSuccess(res, null, `${archived.name} was archived because it has stock history.`);
    return;
  }

  const [deleted] = await db.delete(ingredients).where(eq(ingredients.id, id)).returning();
  if (!deleted) throw ApiError.notFound('Ingredient');
  sendSuccess(res, null, 'Ingredient deleted');
});

export const listTransactions = asyncHandler(async (req: Request, res: Response) => {
  const query = listQuerySchema.parse(req.query);
  const type = typeof req.query.type === 'string' ? req.query.type : undefined;

  const filters: SQL[] = [];
  if (type && ['purchase', 'consumption', 'waste', 'adjustment'].includes(type)) {
    filters.push(
      eq(inventoryTransactions.type, type as 'purchase' | 'consumption' | 'waste' | 'adjustment'),
    );
  }
  if (query.from) filters.push(gte(inventoryTransactions.occurredAt, query.from));
  if (query.to) filters.push(lte(inventoryTransactions.occurredAt, query.to));

  const where = filters.length ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.limit;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: inventoryTransactions.id,
        type: inventoryTransactions.type,
        quantity: inventoryTransactions.quantity,
        unitCost: inventoryTransactions.unitCost,
        totalCost: inventoryTransactions.totalCost,
        wasteReason: inventoryTransactions.wasteReason,
        note: inventoryTransactions.note,
        occurredAt: inventoryTransactions.occurredAt,
        ingredientName: ingredients.name,
        unit: ingredients.unit,
      })
      .from(inventoryTransactions)
      .innerJoin(ingredients, eq(inventoryTransactions.ingredientId, ingredients.id))
      .where(where)
      .orderBy(desc(inventoryTransactions.occurredAt))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(inventoryTransactions)
      .where(where),
  ]);

  sendSuccess(
    res,
    rows.map((row) => ({
      ...row,
      quantity: toNumber(row.quantity),
      unitCost: toNumber(row.unitCost),
      totalCost: toNumber(row.totalCost),
      occurredAt: row.occurredAt.toISOString(),
    })),
    'Stock movements loaded',
    200,
    buildPaginationMeta(query.page, query.limit, total),
  );
});

/* ── Suppliers ──────────────────────────────────────────────────────────── */

export const listSuppliers = asyncHandler(async (req: Request, res: Response) => {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;

  const rows = await db
    .select()
    .from(suppliers)
    .where(search ? ilike(suppliers.name, `%${search}%`) : undefined)
    .orderBy(desc(suppliers.isActive), asc(suppliers.name));

  sendSuccess(res, rows.map(toSupplierDto), 'Suppliers loaded');
});

export const createSupplier = asyncHandler(async (req: Request, res: Response) => {
  const input = createSupplierSchema.parse(req.body);

  const [created] = await db
    .insert(suppliers)
    .values({
      name: input.name,
      contactName: input.contactName || null,
      phone: input.phone || null,
      email: input.email || null,
      address: input.address || null,
      notes: input.notes || null,
      isActive: input.isActive,
    })
    .returning();

  if (!created) throw ApiError.internal('Could not create the supplier');
  sendCreated(res, toSupplierDto(created), 'Supplier added');
});

export const updateSupplier = asyncHandler(async (req: Request, res: Response) => {
  const input = updateSupplierSchema.parse(req.body);
  const id = req.params.id as string;

  const [updated] = await db
    .update(suppliers)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.contactName !== undefined ? { contactName: input.contactName || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
      ...(input.email !== undefined ? { email: input.email || null } : {}),
      ...(input.address !== undefined ? { address: input.address || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedAt: new Date(),
    })
    .where(eq(suppliers.id, id))
    .returning();

  if (!updated) throw ApiError.notFound('Supplier');
  sendSuccess(res, toSupplierDto(updated), 'Supplier updated');
});

export const deleteSupplier = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const [updated] = await db
    .update(suppliers)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(suppliers.id, id))
    .returning();
  if (!updated) throw ApiError.notFound('Supplier');
  sendSuccess(res, null, 'Supplier deactivated');
});

/* ── Purchases ──────────────────────────────────────────────────────────── */

export const listPurchases = asyncHandler(async (req: Request, res: Response) => {
  const query = listQuerySchema.parse(req.query);
  const offset = (query.page - 1) * query.limit;

  const filters: SQL[] = [];
  if (query.from) filters.push(gte(purchases.orderedAt, query.from));
  if (query.to) filters.push(lte(purchases.orderedAt, query.to));
  const where = filters.length ? and(...filters) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ purchase: purchases, supplierName: suppliers.name })
      .from(purchases)
      .innerJoin(suppliers, eq(purchases.supplierId, suppliers.id))
      .where(where)
      .orderBy(desc(purchases.orderedAt))
      .limit(query.limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(purchases).where(where),
  ]);

  sendSuccess(
    res,
    rows.map((row) => ({
      id: row.purchase.id,
      purchaseNumber: row.purchase.purchaseNumber,
      supplierId: row.purchase.supplierId,
      supplierName: row.supplierName,
      status: row.purchase.status,
      invoiceNumber: row.purchase.invoiceNumber,
      invoiceUrl: row.purchase.invoiceUrl,
      totalAmount: toNumber(row.purchase.totalAmount),
      orderedAt: row.purchase.orderedAt.toISOString(),
      receivedAt: row.purchase.receivedAt?.toISOString() ?? null,
    })),
    'Purchases loaded',
    200,
    buildPaginationMeta(query.page, query.limit, total),
  );
});

export const createPurchase = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = createPurchaseSchema.parse(req.body);

  const lines = input.items.map((item) => ({
    ...item,
    lineTotal: money(item.quantity * item.unitCost),
  }));
  const totalAmount = money(lines.reduce((sum, line) => sum + line.lineTotal, 0));

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(purchases);

  const created = await db.transaction(async (tx) => {
    const [purchase] = await tx
      .insert(purchases)
      .values({
        purchaseNumber: `PO-${stamp}-${String(count + 1).padStart(4, '0')}`,
        supplierId: input.supplierId,
        status: input.status,
        invoiceNumber: input.invoiceNumber || null,
        invoiceUrl: input.invoiceUrl || null,
        totalAmount: String(totalAmount),
        notes: input.notes || null,
        createdById: user.id,
      })
      .returning();

    if (!purchase) throw ApiError.internal('Could not create the purchase order');

    await tx.insert(purchaseItems).values(
      lines.map((line) => ({
        purchaseId: purchase.id,
        ingredientId: line.ingredientId,
        quantity: String(line.quantity),
        unitCost: String(line.unitCost),
        lineTotal: String(line.lineTotal),
      })),
    );

    return purchase;
  });

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: 'purchase.created',
    entityType: 'purchase',
    entityId: created.id,
    description: `${user.name} raised purchase order ${created.purchaseNumber}`,
    metadata: { totalAmount },
  });

  sendCreated(
    res,
    { id: created.id, purchaseNumber: created.purchaseNumber, totalAmount },
    `Purchase order ${created.purchaseNumber} created`,
  );
});

/** Receiving a purchase is what actually moves stock into the store. */
export const receivePurchase = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = receivePurchaseSchema.parse(req.body);
  const id = req.params.id as string;

  const [purchase] = await db.select().from(purchases).where(eq(purchases.id, id)).limit(1);
  if (!purchase) throw ApiError.notFound('Purchase order');
  if (purchase.status === 'received') throw ApiError.conflict('This order was already received');
  if (purchase.status === 'cancelled') throw ApiError.badRequest('This order was cancelled');

  const lines = await db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, id));
  const receivedAt = input.receivedAt ?? new Date();

  await db.transaction(async (tx) => {
    for (const line of lines) {
      const quantity = toNumber(line.quantity);
      const unitCost = toNumber(line.unitCost);

      await tx
        .update(ingredients)
        .set({
          currentStock: sql`${ingredients.currentStock} + ${String(quantity)}`,
          // The latest purchase price becomes the running valuation cost.
          costPerUnit: String(unitCost),
          updatedAt: receivedAt,
        })
        .where(eq(ingredients.id, line.ingredientId));

      await tx.insert(inventoryTransactions).values({
        ingredientId: line.ingredientId,
        type: 'purchase',
        quantity: String(quantity),
        unitCost: String(unitCost),
        totalCost: String(toNumber(line.lineTotal)),
        note: `Received on ${purchase.purchaseNumber}`,
        performedById: user.id,
        occurredAt: receivedAt,
      });
    }

    await tx
      .update(purchases)
      .set({ status: 'received', receivedAt, updatedAt: receivedAt })
      .where(eq(purchases.id, id));
  });

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: 'purchase.received',
    entityType: 'purchase',
    entityId: id,
    description: `${user.name} received ${purchase.purchaseNumber} (${lines.length} lines)`,
  });

  realtime.toManagement(SOCKET_EVENTS.INVENTORY_UPDATED, { purchaseId: id });

  sendSuccess(res, { id, status: 'received' }, `${purchase.purchaseNumber} received into stock`);
});
