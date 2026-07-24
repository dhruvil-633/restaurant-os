import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { db } from '../db';
import { passwordResetTokens, refreshTokens, users } from '../db/schema';
import { env } from '../config/env';
import { buildPasswordResetEmail } from '../emails/templates';
import { requireUser } from '../middlewares/auth';
import { recordActivity } from '../services/activityLog';
import {
  clearRefreshCookie,
  issueTokens,
  revokeAllUserTokens,
  revokeRefreshToken,
  toPublicUser,
} from '../services/authService';
import { sendMail } from '../services/mail';
import { ApiError } from '../utils/apiError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../utils/apiResponse';
import { generateSecureToken, hashToken, verifyRefreshToken } from '../utils/jwt';
import { hashPassword, verifyPassword } from '../utils/password';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '../validators/auth';

const RESET_TOKEN_TTL_MINUTES = 30;

/**
 * Bootstrap registration.
 *
 * Open sign-up would let anyone create an account in a restaurant's back
 * office, so this endpoint only works while the users table is empty — it
 * creates the first owner. Every later account is created by an owner or
 * manager through POST /api/users.
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const input = registerSchema.parse(req.body);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);

  if (count > 0) {
    throw ApiError.forbidden(
      'This workspace already has an owner. Ask an owner or manager to create your account.',
    );
  }

  const [created] = await db
    .insert(users)
    .values({
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: 'owner',
    })
    .returning();

  if (!created) throw ApiError.internal('Could not create the account');

  const tokens = await issueTokens(created, req, res);

  await recordActivity({
    userId: created.id,
    actorName: created.name,
    action: 'auth.register',
    entityType: 'user',
    entityId: created.id,
    description: `${created.name} created the workspace as owner`,
  });

  sendCreated(res, { user: toPublicUser(created), ...tokens }, 'Welcome to RestaurantOS');
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const input = loginSchema.parse(req.body);

  const [account] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

  // Same error and roughly the same work either way, so the response cannot be
  // used to discover which email addresses exist.
  if (!account) {
    await verifyPassword(input.password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidin');
    throw ApiError.unauthorized('That email or password is incorrect');
  }

  const passwordMatches = await verifyPassword(input.password, account.passwordHash);
  if (!passwordMatches) throw ApiError.unauthorized('That email or password is incorrect');

  if (!account.isActive) {
    throw ApiError.forbidden('This account has been deactivated. Contact your manager.');
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, account.id));

  const tokens = await issueTokens(account, req, res);

  await recordActivity({
    userId: account.id,
    actorName: account.name,
    action: 'auth.login',
    entityType: 'user',
    entityId: account.id,
    description: `${account.name} signed in`,
  });

  sendSuccess(res, { user: toPublicUser(account), ...tokens }, `Welcome back, ${account.name}`);
});

/** Rotates the refresh token: the presented one is revoked as a new pair is issued. */
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const presented =
    (typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined) ??
    (req.cookies?.refreshToken as string | undefined);

  if (!presented) throw ApiError.unauthorized('No refresh token was supplied');

  const payload = verifyRefreshToken(presented);

  const [stored] = await db
    .select()
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.tokenHash, hashToken(presented)),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!stored) {
    // The token verified but is not on file — it was already used or revoked.
    // Treat as replay and drop every session for that user.
    await revokeAllUserTokens(payload.sub);
    clearRefreshCookie(res);
    throw ApiError.unauthorized('Your session is no longer valid. Please sign in again.');
  }

  const [account] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
  if (!account) throw ApiError.unauthorized('This account no longer exists');
  if (!account.isActive) throw ApiError.forbidden('This account has been deactivated');

  await revokeRefreshToken(presented);
  const tokens = await issueTokens(account, req, res);

  sendSuccess(res, { user: toPublicUser(account), ...tokens }, 'Session refreshed');
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const presented =
    (typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined) ??
    (req.cookies?.refreshToken as string | undefined);

  if (presented) await revokeRefreshToken(presented);
  clearRefreshCookie(res);

  sendSuccess(res, null, 'Signed out');
});

export const logoutAll = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  await revokeAllUserTokens(user.id);
  clearRefreshCookie(res);
  sendSuccess(res, null, 'Signed out of every device');
});

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const [account] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!account) throw ApiError.notFound('Account');
  sendSuccess(res, toPublicUser(account), 'Profile loaded');
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = updateProfileSchema.parse(req.body);

  const [updated] = await db
    .update(users)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl || null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
    .returning();

  if (!updated) throw ApiError.notFound('Account');

  sendSuccess(res, toPublicUser(updated), 'Profile updated');
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = changePasswordSchema.parse(req.body);

  const [account] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!account) throw ApiError.notFound('Account');

  const matches = await verifyPassword(input.currentPassword, account.passwordHash);
  if (!matches) throw ApiError.badRequest('Your current password is incorrect');

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  // Force every other device to sign in again with the new password.
  await revokeAllUserTokens(user.id);
  clearRefreshCookie(res);

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: 'auth.password_changed',
    entityType: 'user',
    entityId: user.id,
    description: `${user.name} changed their password`,
  });

  sendSuccess(res, null, 'Password changed. Please sign in again.');
});

/** Always reports success so the endpoint cannot enumerate registered emails. */
export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const input = forgotPasswordSchema.parse(req.body);
  const genericMessage = 'If that email is registered, a reset link is on its way.';

  const [account] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

  if (!account || !account.isActive) {
    sendSuccess(res, null, genericMessage);
    return;
  }

  const rawToken = generateSecureToken(32);

  await db.insert(passwordResetTokens).values({
    userId: account.id,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000),
  });

  await sendMail(
    buildPasswordResetEmail({
      to: account.email,
      name: account.name,
      token: rawToken,
      expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
    }),
  );

  // Without SMTP configured the link is only in the server log, which would
  // make the flow untestable — surface it in development only.
  const data = env.hasSmtp || env.isProduction ? null : { resetToken: rawToken };

  sendSuccess(res, data, genericMessage);
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const input = resetPasswordSchema.parse(req.body);

  const [record] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashToken(input.token)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!record) {
    throw ApiError.badRequest('This reset link is invalid or has expired. Request a new one.');
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(input.password), updatedAt: new Date() })
    .where(eq(users.id, record.userId));

  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, record.id));

  await revokeAllUserTokens(record.userId);
  clearRefreshCookie(res);

  await recordActivity({
    userId: record.userId,
    action: 'auth.password_reset',
    entityType: 'user',
    entityId: record.userId,
    description: 'Password reset completed',
  });

  sendSuccess(res, null, 'Your password has been reset. You can sign in now.');
});
