import { eq } from 'drizzle-orm';
import type { RequestHandler } from 'express';
import { db } from '../db';
import { users } from '../db/schema';
import { ApiError } from '../utils/apiError';
import { asyncHandler } from '../utils/asyncHandler';
import { verifyAccessToken } from '../utils/jwt';
import type { UserRole } from '../types/roles';

/**
 * Verifies the bearer token and re-reads the account.
 *
 * The extra lookup is deliberate: it means deactivating a user takes effect on
 * their very next request instead of whenever their access token happens to
 * expire. It is a single indexed primary-key read.
 */
export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Sign in to continue');
  }

  const payload = verifyAccessToken(header.slice(7).trim());

  const [account] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);

  if (!account) throw ApiError.unauthorized('This account no longer exists');
  if (!account.isActive) throw ApiError.forbidden('This account has been deactivated');

  req.user = {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
  };

  next();
});

/** Restricts a route to the listed roles. Mount after `authenticate`. */
export function authorize(...allowedRoles: readonly UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(ApiError.unauthorized('Sign in to continue'));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(
        ApiError.forbidden(
          `This action is restricted to ${allowedRoles.join(', ')}. Your role is ${req.user.role}.`,
        ),
      );
      return;
    }

    next();
  };
}

/** Reads the caller off a request that has already passed `authenticate`. */
export function requireUser(req: { user?: { id: string; name: string; email: string; role: UserRole } }) {
  if (!req.user) throw ApiError.unauthorized('Sign in to continue');
  return req.user;
}
