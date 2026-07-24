import crypto from 'node:crypto';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError } from './apiError';
import type { UserRole } from '../types/roles';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  name: string;
}

export interface RefreshTokenPayload {
  sub: string;
  tokenId: string;
}

type ExpiresIn = SignOptions['expiresIn'];

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as ExpiresIn,
    issuer: 'restaurant-os',
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as ExpiresIn,
    issuer: 'restaurant-os',
  };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload & AccessTokenPayload;
    return { sub: decoded.sub, email: decoded.email, role: decoded.role, name: decoded.name };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new ApiError(401, 'Your session has expired. Please sign in again.', 'TOKEN_EXPIRED');
    }
    throw ApiError.unauthorized('Invalid authentication token');
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload & RefreshTokenPayload;
    return { sub: decoded.sub, tokenId: decoded.tokenId };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new ApiError(401, 'Your session has expired. Please sign in again.', 'TOKEN_EXPIRED');
    }
    throw ApiError.unauthorized('Invalid refresh token');
  }
}

/**
 * Refresh and reset tokens are stored hashed. SHA-256 (not bcrypt) is correct
 * here: the input is already 128+ bits of entropy, so there is nothing to brute
 * force, and lookups need to be a fast indexed equality match.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateSecureToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Converts `15m`, `7d`, `24h`, `30s` into milliseconds. */
export function durationToMs(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration.trim());
  if (!match) throw new Error(`Unsupported duration format: ${duration}`);
  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * (multipliers[unit] ?? 0);
}
