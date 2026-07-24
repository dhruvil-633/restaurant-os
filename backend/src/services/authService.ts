import { and, eq, isNull, lt, or } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { db } from '../db';
import { refreshTokens, users, type UserRow } from '../db/schema';
import { env } from '../config/env';
import {
  durationToMs,
  generateSecureToken,
  hashToken,
  signAccessToken,
  signRefreshToken,
} from '../utils/jwt';
import type { AuthenticatedUser } from '../types/auth';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRow['role'];
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** Strips the password hash — the only safe shape to send to a client. */
export function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Issues an access/refresh pair and persists the refresh token as a hash.
 *
 * The refresh token is returned in the body *and* set as an httpOnly cookie.
 * The cookie is the safer channel, but browsers that block third-party cookies
 * would silently break a Vercel→Render deployment, so the body acts as the
 * reliable fallback the client can replay explicitly.
 */
export async function issueTokens(
  user: UserRow,
  req: Request,
  res: Response,
): Promise<IssuedTokens> {
  const tokenId = generateSecureToken(16);
  const refreshToken = signRefreshToken({ sub: user.id, tokenId });
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  });

  const refreshLifetimeMs = durationToMs(env.JWT_REFRESH_EXPIRES_IN);

  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    userAgent: req.headers['user-agent']?.slice(0, 255) ?? null,
    ipAddress: req.ip?.slice(0, 64) ?? null,
    expiresAt: new Date(Date.now() + refreshLifetimeMs),
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    // Cross-site cookies require SameSite=None, which browsers only honour
    // over HTTPS. Locally both ends are http://localhost, so Lax is correct.
    sameSite: env.isProduction ? 'none' : 'lax',
    secure: env.isProduction,
    maxAge: refreshLifetimeMs,
    path: '/api/auth',
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: Math.floor(durationToMs(env.JWT_ACCESS_EXPIRES_IN) / 1000),
  };
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    sameSite: env.isProduction ? 'none' : 'lax',
    secure: env.isProduction,
    path: '/api/auth',
  });
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.tokenHash, hashToken(token)));
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

/** Removes rows that are expired or long revoked, keeping the table small. */
export async function pruneExpiredTokens(): Promise<void> {
  const cutoff = new Date();
  await db
    .delete(refreshTokens)
    .where(or(lt(refreshTokens.expiresAt, cutoff), lt(refreshTokens.revokedAt, cutoff)));
}

export async function findActiveUserById(userId: string): Promise<UserRow | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user;
}

export function toAuthenticatedUser(user: UserRow): AuthenticatedUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
