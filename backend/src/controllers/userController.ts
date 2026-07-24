import { and, asc, desc, eq, ilike, inArray, ne, or, sql, type SQL } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { db } from '../db';
import { orders, users } from '../db/schema';
import { buildWelcomeEmail } from '../emails/templates';
import { requireUser } from '../middlewares/auth';
import { recordActivity } from '../services/activityLog';
import { revokeAllUserTokens, toPublicUser } from '../services/authService';
import { sendMail } from '../services/mail';
import { ApiError } from '../utils/apiError';
import { asyncHandler } from '../utils/asyncHandler';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse';
import { hashPassword } from '../utils/password';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, USER_ROLES, type UserRole } from '../types/roles';
import { createUserSchema, updateUserSchema } from '../validators/auth';
import { listQuerySchema } from '../validators/common';

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const query = listQuerySchema.parse(req.query);
  const roleFilter = typeof req.query.role === 'string' ? (req.query.role as UserRole) : undefined;

  const filters: SQL[] = [];
  if (roleFilter && USER_ROLES.includes(roleFilter)) filters.push(eq(users.role, roleFilter));
  if (query.search) {
    const term = `%${query.search}%`;
    const condition = or(ilike(users.name, term), ilike(users.email, term));
    if (condition) filters.push(condition);
  }

  const where = filters.length ? and(...filters) : undefined;
  const direction = query.sortOrder === 'asc' ? asc : desc;
  const offset = (query.page - 1) * query.limit;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(users)
      .where(where)
      .orderBy(direction(users.createdAt))
      .limit(query.limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(users).where(where),
  ]);

  sendSuccess(
    res,
    rows.map(toPublicUser),
    'Team loaded',
    200,
    buildPaginationMeta(query.page, query.limit, total),
  );
});

export const getRoles = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(
    res,
    USER_ROLES.map((role) => ({
      value: role,
      label: ROLE_LABELS[role],
      description: ROLE_DESCRIPTIONS[role],
    })),
    'Roles loaded',
  );
});

/** Compact list used to populate waiter/chef pickers. */
export const listAssignableStaff = asyncHandler(async (req: Request, res: Response) => {
  const group = typeof req.query.group === 'string' ? req.query.group : 'all';

  const roleGroups: Record<string, UserRole[]> = {
    kitchen: ['chef', 'kitchen_staff'],
    floor: ['waiter', 'cashier', 'manager'],
    all: [...USER_ROLES],
  };

  const roles = roleGroups[group] ?? roleGroups.all;

  const rows = await db
    .select({ id: users.id, name: users.name, role: users.role, avatarUrl: users.avatarUrl })
    .from(users)
    .where(and(eq(users.isActive, true), inArray(users.role, roles)))
    .orderBy(asc(users.name));

  sendSuccess(res, rows, 'Staff loaded');
});

export const getUser = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const [account] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!account) throw ApiError.notFound('Staff member');

  const [stats] = await db
    .select({
      ordersServed: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${orders.total}), 0)::float`,
    })
    .from(orders)
    .where(and(eq(orders.waiterId, id), eq(orders.status, 'completed')));

  sendSuccess(res, { ...toPublicUser(account), stats }, 'Staff member loaded');
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireUser(req);
  const input = createUserSchema.parse(req.body);

  // Only an owner may mint another owner.
  if (input.role === 'owner' && actor.role !== 'owner') {
    throw ApiError.forbidden('Only an owner can create another owner account');
  }

  const [created] = await db
    .insert(users)
    .values({
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      phone: input.phone || null,
    })
    .returning();

  if (!created) throw ApiError.internal('Could not create the account');

  await sendMail(
    buildWelcomeEmail({
      to: created.email,
      name: created.name,
      role: ROLE_LABELS[created.role],
      temporaryPassword: input.password,
    }),
  );

  await recordActivity({
    userId: actor.id,
    actorName: actor.name,
    action: 'user.created',
    entityType: 'user',
    entityId: created.id,
    description: `${actor.name} created a ${ROLE_LABELS[created.role]} account for ${created.name}`,
  });

  sendCreated(res, toPublicUser(created), `${created.name} can now sign in`);
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireUser(req);
  const input = updateUserSchema.parse(req.body);
  const id = req.params.id as string;

  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) throw ApiError.notFound('Staff member');

  if (input.role && input.role !== existing.role) {
    if (actor.role !== 'owner') {
      throw ApiError.forbidden('Only an owner can change a role');
    }
    // Removing the last owner would lock everyone out of the workspace.
    if (existing.role === 'owner') {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(and(eq(users.role, 'owner'), eq(users.isActive, true), ne(users.id, id)));
      if (count === 0) {
        throw ApiError.badRequest('This is the only owner. Promote someone else first.');
      }
    }
  }

  if (input.isActive === false && id === actor.id) {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }

  const [updated] = await db
    .update(users)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning();

  if (!updated) throw ApiError.notFound('Staff member');

  // A deactivated or demoted account should lose its sessions right away.
  if (input.isActive === false || (input.role && input.role !== existing.role)) {
    await revokeAllUserTokens(id);
  }

  await recordActivity({
    userId: actor.id,
    actorName: actor.name,
    action: 'user.updated',
    entityType: 'user',
    entityId: id,
    description: `${actor.name} updated ${updated.name}'s account`,
  });

  sendSuccess(res, toPublicUser(updated), 'Account updated');
});

export const resetUserPassword = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireUser(req);
  const id = req.params.id as string;
  const newPassword = typeof req.body?.password === 'string' ? req.body.password : '';

  if (newPassword.length < 8) {
    throw ApiError.badRequest('The new password must be at least 8 characters');
  }

  const [updated] = await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();

  if (!updated) throw ApiError.notFound('Staff member');

  await revokeAllUserTokens(id);

  await recordActivity({
    userId: actor.id,
    actorName: actor.name,
    action: 'user.password_reset',
    entityType: 'user',
    entityId: id,
    description: `${actor.name} reset the password for ${updated.name}`,
  });

  sendSuccess(res, null, `${updated.name}'s password was reset`);
});

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireUser(req);
  const id = req.params.id as string;

  if (id === actor.id) throw ApiError.badRequest('You cannot delete your own account');

  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) throw ApiError.notFound('Staff member');

  if (existing.role === 'owner') {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.role, 'owner'), ne(users.id, id)));
    if (count === 0) throw ApiError.badRequest('The last owner account cannot be deleted');
  }

  const [{ count: orderCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(eq(orders.waiterId, id));

  // Their name appears on historical orders, so deactivate instead of deleting.
  if (orderCount > 0) {
    await db
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(users.id, id));
    await revokeAllUserTokens(id);
    sendSuccess(
      res,
      null,
      `${existing.name} served ${orderCount} order${orderCount === 1 ? '' : 's'}, so the account was deactivated rather than deleted.`,
    );
    return;
  }

  await db.delete(users).where(eq(users.id, id));

  await recordActivity({
    userId: actor.id,
    actorName: actor.name,
    action: 'user.deleted',
    entityType: 'user',
    entityId: id,
    description: `${actor.name} deleted the account for ${existing.name}`,
  });

  sendSuccess(res, null, 'Account deleted');
});
