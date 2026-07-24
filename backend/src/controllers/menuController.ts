import { and, asc, desc, eq, gte, ilike, inArray, lte, sql, type SQL } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { db } from '../db';
import {
  menuCategories,
  menuItemIngredients,
  menuItems,
  orderItems,
  type MenuCategoryRow,
  type MenuItemRow,
} from '../db/schema';
import { requireUser } from '../middlewares/auth';
import { recordActivity } from '../services/activityLog';
import { storage } from '../services/storage';
import { ApiError } from '../utils/apiError';
import { asyncHandler } from '../utils/asyncHandler';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse';
import { toNumber } from '../utils/serialize';
import {
  createCategorySchema,
  createMenuItemSchema,
  menuItemQuerySchema,
  recipeSchema,
  updateCategorySchema,
  updateMenuItemSchema,
} from '../validators/menu';

interface MenuItemDto {
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

function toCategoryDto(row: MenuCategoryRow, itemCount = 0) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type,
    description: row.description,
    imageUrl: row.imageUrl,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    itemCount,
    createdAt: row.createdAt.toISOString(),
  };
}

function toMenuItemDto(row: MenuItemRow, categoryName: string | null = null): MenuItemDto {
  const price = toNumber(row.price);
  const cost = toNumber(row.cost);
  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryName,
    name: row.name,
    description: row.description,
    price,
    cost,
    // Percentage of the sale price kept after ingredient cost.
    margin: price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : 0,
    imageUrl: row.imageUrl,
    prepTimeMinutes: row.prepTimeMinutes,
    calories: row.calories,
    spiceLevel: row.spiceLevel,
    isVegetarian: row.isVegetarian,
    isAvailable: row.isAvailable,
    isFeatured: row.isFeatured,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 110);
}

/* ── Categories ─────────────────────────────────────────────────────────── */

export const listCategories = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await db
    .select({
      category: menuCategories,
      itemCount: sql<number>`count(${menuItems.id})::int`,
    })
    .from(menuCategories)
    .leftJoin(menuItems, eq(menuItems.categoryId, menuCategories.id))
    .groupBy(menuCategories.id)
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name));

  sendSuccess(
    res,
    rows.map((row) => toCategoryDto(row.category, row.itemCount)),
    'Categories loaded',
  );
});

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = createCategorySchema.parse(req.body);

  const [created] = await db
    .insert(menuCategories)
    .values({
      name: input.name,
      slug: slugify(input.name),
      type: input.type,
      description: input.description || null,
      imageUrl: input.imageUrl || null,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    })
    .returning();

  if (!created) throw ApiError.internal('Could not create the category');

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: 'menu.category_created',
    entityType: 'menu_category',
    entityId: created.id,
    description: `${user.name} added the category "${created.name}"`,
  });

  sendCreated(res, toCategoryDto(created), 'Category created');
});

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = updateCategorySchema.parse(req.body);
  const id = req.params.id as string;

  const [updated] = await db
    .update(menuCategories)
    .set({
      ...(input.name !== undefined ? { name: input.name, slug: slugify(input.name) } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl || null } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedAt: new Date(),
    })
    .where(eq(menuCategories.id, id))
    .returning();

  if (!updated) throw ApiError.notFound('Category');

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: 'menu.category_updated',
    entityType: 'menu_category',
    entityId: updated.id,
    description: `${user.name} updated the category "${updated.name}"`,
  });

  sendSuccess(res, toCategoryDto(updated), 'Category updated');
});

export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = req.params.id as string;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(menuItems)
    .where(eq(menuItems.categoryId, id));

  if (count > 0) {
    throw ApiError.conflict(
      `This category still holds ${count} dish${count === 1 ? '' : 'es'}. Move or delete them first.`,
    );
  }

  const [deleted] = await db.delete(menuCategories).where(eq(menuCategories.id, id)).returning();
  if (!deleted) throw ApiError.notFound('Category');

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: 'menu.category_deleted',
    entityType: 'menu_category',
    entityId: id,
    description: `${user.name} deleted the category "${deleted.name}"`,
  });

  sendSuccess(res, null, 'Category deleted');
});

/* ── Menu items ─────────────────────────────────────────────────────────── */

export const listMenuItems = asyncHandler(async (req: Request, res: Response) => {
  const query = menuItemQuerySchema.parse(req.query);

  const filters: SQL[] = [];
  if (query.categoryId) filters.push(eq(menuItems.categoryId, query.categoryId));
  if (query.type) filters.push(eq(menuCategories.type, query.type));
  if (query.isAvailable !== undefined) filters.push(eq(menuItems.isAvailable, query.isAvailable));
  if (query.isVegetarian !== undefined) filters.push(eq(menuItems.isVegetarian, query.isVegetarian));
  if (query.minPrice !== undefined) filters.push(gte(menuItems.price, String(query.minPrice)));
  if (query.maxPrice !== undefined) filters.push(lte(menuItems.price, String(query.maxPrice)));
  if (query.search) filters.push(ilike(menuItems.name, `%${query.search}%`));

  const where = filters.length ? and(...filters) : undefined;

  const sortColumn =
    query.sortBy === 'price'
      ? menuItems.price
      : query.sortBy === 'name'
        ? menuItems.name
        : query.sortBy === 'prepTime'
          ? menuItems.prepTimeMinutes
          : menuItems.sortOrder;

  const direction = query.sortOrder === 'asc' ? asc : desc;
  const offset = (query.page - 1) * query.limit;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ item: menuItems, categoryName: menuCategories.name })
      .from(menuItems)
      .innerJoin(menuCategories, eq(menuItems.categoryId, menuCategories.id))
      .where(where)
      .orderBy(direction(sortColumn), asc(menuItems.name))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(menuItems)
      .innerJoin(menuCategories, eq(menuItems.categoryId, menuCategories.id))
      .where(where),
  ]);

  sendSuccess(
    res,
    rows.map((row) => toMenuItemDto(row.item, row.categoryName)),
    'Menu loaded',
    200,
    buildPaginationMeta(query.page, query.limit, total),
  );
});

export const getMenuItem = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const [row] = await db
    .select({ item: menuItems, categoryName: menuCategories.name })
    .from(menuItems)
    .innerJoin(menuCategories, eq(menuItems.categoryId, menuCategories.id))
    .where(eq(menuItems.id, id))
    .limit(1);

  if (!row) throw ApiError.notFound('Dish');

  const recipe = await db
    .select()
    .from(menuItemIngredients)
    .where(eq(menuItemIngredients.menuItemId, id));

  sendSuccess(
    res,
    {
      ...toMenuItemDto(row.item, row.categoryName),
      recipe: recipe.map((entry) => ({
        ingredientId: entry.ingredientId,
        quantity: toNumber(entry.quantity),
      })),
    },
    'Dish loaded',
  );
});

export const createMenuItem = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = createMenuItemSchema.parse(req.body);

  const [category] = await db
    .select()
    .from(menuCategories)
    .where(eq(menuCategories.id, input.categoryId))
    .limit(1);
  if (!category) throw ApiError.badRequest('That category does not exist');

  const [created] = await db
    .insert(menuItems)
    .values({
      categoryId: input.categoryId,
      name: input.name,
      description: input.description || null,
      price: String(input.price),
      cost: String(input.cost),
      imageUrl: input.imageUrl || null,
      prepTimeMinutes: input.prepTimeMinutes,
      calories: input.calories ?? null,
      spiceLevel: input.spiceLevel,
      isVegetarian: input.isVegetarian,
      isAvailable: input.isAvailable,
      isFeatured: input.isFeatured,
      sortOrder: input.sortOrder,
    })
    .returning();

  if (!created) throw ApiError.internal('Could not create the dish');

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: 'menu.item_created',
    entityType: 'menu_item',
    entityId: created.id,
    description: `${user.name} added "${created.name}" to the menu`,
    metadata: { price: toNumber(created.price) },
  });

  sendCreated(res, toMenuItemDto(created, category.name), 'Dish added to the menu');
});

export const updateMenuItem = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = updateMenuItemSchema.parse(req.body);
  const id = req.params.id as string;

  const [updated] = await db
    .update(menuItems)
    .set({
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.price !== undefined ? { price: String(input.price) } : {}),
      ...(input.cost !== undefined ? { cost: String(input.cost) } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl || null } : {}),
      ...(input.prepTimeMinutes !== undefined ? { prepTimeMinutes: input.prepTimeMinutes } : {}),
      ...(input.calories !== undefined ? { calories: input.calories ?? null } : {}),
      ...(input.spiceLevel !== undefined ? { spiceLevel: input.spiceLevel } : {}),
      ...(input.isVegetarian !== undefined ? { isVegetarian: input.isVegetarian } : {}),
      ...(input.isAvailable !== undefined ? { isAvailable: input.isAvailable } : {}),
      ...(input.isFeatured !== undefined ? { isFeatured: input.isFeatured } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      updatedAt: new Date(),
    })
    .where(eq(menuItems.id, id))
    .returning();

  if (!updated) throw ApiError.notFound('Dish');

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: 'menu.item_updated',
    entityType: 'menu_item',
    entityId: updated.id,
    description: `${user.name} updated "${updated.name}"`,
  });

  sendSuccess(res, toMenuItemDto(updated), 'Dish updated');
});

/** Quick toggle used by the availability switch on the menu grid. */
export const toggleAvailability = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = req.params.id as string;

  const [updated] = await db
    .update(menuItems)
    .set({ isAvailable: sql`not ${menuItems.isAvailable}`, updatedAt: new Date() })
    .where(eq(menuItems.id, id))
    .returning();

  if (!updated) throw ApiError.notFound('Dish');

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: 'menu.availability_toggled',
    entityType: 'menu_item',
    entityId: updated.id,
    description: `${user.name} marked "${updated.name}" as ${
      updated.isAvailable ? 'available' : 'unavailable'
    }`,
  });

  sendSuccess(res, toMenuItemDto(updated), updated.isAvailable ? 'Now available' : 'Marked unavailable');
});

export const deleteMenuItem = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = req.params.id as string;

  const [existing] = await db.select().from(menuItems).where(eq(menuItems.id, id)).limit(1);
  if (!existing) throw ApiError.notFound('Dish');

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orderItems)
    .where(eq(orderItems.menuItemId, id));

  // Historical bills reference this dish, so removing it would rewrite the past.
  if (count > 0) {
    const [archived] = await db
      .update(menuItems)
      .set({ isAvailable: false, isFeatured: false, updatedAt: new Date() })
      .where(eq(menuItems.id, id))
      .returning();

    sendSuccess(
      res,
      archived ? toMenuItemDto(archived) : null,
      `"${existing.name}" appears on ${count} past order${count === 1 ? '' : 's'}, so it was ` +
        'retired from the menu instead of deleted.',
    );
    return;
  }

  await storage.remove(existing.imageUrl?.startsWith('/uploads') ? existing.imageUrl : null);
  await db.delete(menuItems).where(eq(menuItems.id, id));

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: 'menu.item_deleted',
    entityType: 'menu_item',
    entityId: id,
    description: `${user.name} removed "${existing.name}" from the menu`,
  });

  sendSuccess(res, null, 'Dish deleted');
});

/** Replaces a dish's recipe wholesale — simpler and safer than diffing rows. */
export const setRecipe = asyncHandler(async (req: Request, res: Response) => {
  const input = recipeSchema.parse(req.body);
  const id = req.params.id as string;

  const [item] = await db.select().from(menuItems).where(eq(menuItems.id, id)).limit(1);
  if (!item) throw ApiError.notFound('Dish');

  await db.transaction(async (tx) => {
    await tx.delete(menuItemIngredients).where(eq(menuItemIngredients.menuItemId, id));
    if (input.ingredients.length > 0) {
      await tx.insert(menuItemIngredients).values(
        input.ingredients.map((entry) => ({
          menuItemId: id,
          ingredientId: entry.ingredientId,
          quantity: String(entry.quantity),
        })),
      );
    }
  });

  sendSuccess(res, { menuItemId: id, ingredients: input.ingredients }, 'Recipe saved');
});

/** Grouped payload the POS order screen renders in one request. */
export const getMenuForOrdering = asyncHandler(async (_req: Request, res: Response) => {
  const categories = await db
    .select()
    .from(menuCategories)
    .where(eq(menuCategories.isActive, true))
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name));

  if (categories.length === 0) {
    sendSuccess(res, [], 'Menu loaded');
    return;
  }

  const items = await db
    .select()
    .from(menuItems)
    .where(
      and(
        eq(menuItems.isAvailable, true),
        inArray(
          menuItems.categoryId,
          categories.map((category) => category.id),
        ),
      ),
    )
    .orderBy(asc(menuItems.sortOrder), asc(menuItems.name));

  sendSuccess(
    res,
    categories.map((category) => ({
      ...toCategoryDto(category),
      items: items
        .filter((item) => item.categoryId === category.id)
        .map((item) => toMenuItemDto(item, category.name)),
    })),
    'Menu loaded',
  );
});
