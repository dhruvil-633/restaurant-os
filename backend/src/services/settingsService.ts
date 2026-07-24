import { eq } from 'drizzle-orm';
import { db } from '../db';
import { settings } from '../db/schema';
import { logger } from '../config/logger';

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

export const DEFAULT_SETTINGS: RestaurantSettings = {
  restaurantName: 'RestaurantOS',
  currency: 'INR',
  currencySymbol: '₹',
  taxRatePercent: 5,
  serviceChargePercent: 0,
  loyaltyPointsPerCurrencyUnit: 0.1,
  lowStockNotifications: true,
  averageTableTurnoverMinutes: 55,
  address: '',
  phone: '',
  timezone: 'Asia/Kolkata',
};

const SETTINGS_KEY = 'restaurant';
const CACHE_TTL_MS = 60_000;

let cache: { value: RestaurantSettings; expiresAt: number } | null = null;

/**
 * Settings are read on nearly every order write, so they are cached briefly.
 * `saveSettings` invalidates the cache immediately, keeping edits instant.
 */
export async function getSettings(): Promise<RestaurantSettings> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, SETTINGS_KEY)).limit(1);
    const stored = (row?.value ?? {}) as Partial<RestaurantSettings>;
    const merged: RestaurantSettings = { ...DEFAULT_SETTINGS, ...stored };
    cache = { value: merged, expiresAt: Date.now() + CACHE_TTL_MS };
    return merged;
  } catch (error) {
    logger.warn('Could not read settings — falling back to defaults', error);
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(
  patch: Partial<RestaurantSettings>,
  updatedById?: string,
): Promise<RestaurantSettings> {
  const current = await getSettings();
  const next: RestaurantSettings = { ...current, ...patch };

  await db
    .insert(settings)
    .values({
      key: SETTINGS_KEY,
      value: next,
      description: 'Restaurant-wide configuration',
      updatedById: updatedById ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: next, updatedById: updatedById ?? null, updatedAt: new Date() },
    });

  cache = { value: next, expiresAt: Date.now() + CACHE_TTL_MS };
  return next;
}

export function invalidateSettingsCache(): void {
  cache = null;
}
