import { sql } from 'drizzle-orm';
import { closeDatabaseConnection, db, verifyDatabaseConnection } from '../index';
import { logger } from '../../config/logger';

/**
 * Phase 1 of the multi-tenant migration — additive only.
 *
 * This runs against a live database, so every statement is idempotent and
 * nothing is dropped, renamed or rewritten:
 *
 *   1. create the `restaurants` table
 *   2. adopt the existing data as one default restaurant
 *   3. add a NULLABLE `restaurant_id` to each root table
 *   4. backfill every existing row to that restaurant
 *
 * The column stays nullable on purpose. Until every query is tenant-scoped,
 * an unscoped query still returns exactly what it returns today, so the
 * running deployment is unaffected. Tightening to NOT NULL is phase 3, once
 * nothing can write a null.
 */

/** Root tables that own their rows. Children inherit tenancy via their parent. */
const TENANT_TABLES = [
  'users',
  'menu_categories',
  'menu_items',
  'restaurant_tables',
  'orders',
  'reservations',
  'feedback',
  'customers',
  'employees',
  'suppliers',
  'ingredients',
  'purchases',
  'notifications',
  'activity_logs',
  'settings',
] as const;

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 150) || 'restaurant'
  );
}

async function migrate(): Promise<void> {
  await verifyDatabaseConnection();
  logger.info('Phase 1 — additive multi-tenant migration');

  // ── 1. Tenant table ──────────────────────────────────────────────────
  await db.execute(sql`
    create table if not exists restaurants (
      id uuid primary key default gen_random_uuid(),
      name varchar(140) not null,
      slug varchar(160) not null unique,
      address text,
      phone varchar(32),
      email varchar(160),
      logo_url text,
      currency varchar(3) not null default 'INR',
      currency_symbol varchar(4) not null default '₹',
      timezone varchar(64) not null default 'Asia/Kolkata',
      online_ordering_enabled boolean not null default true,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await db.execute(sql`create index if not exists restaurants_slug_idx on restaurants (slug)`);
  await db.execute(sql`create index if not exists restaurants_active_idx on restaurants (is_active)`);
  logger.info('  restaurants table ready');

  // ── 2. Adopt the existing data under one restaurant ──────────────────
  const [existing] = await db.execute<{ id: string; name: string }>(
    sql`select id, name from restaurants order by created_at limit 1`,
  );

  let restaurantId: string;
  let restaurantName: string;

  if (existing) {
    restaurantId = existing.id;
    restaurantName = existing.name;
    logger.info(`  default restaurant already present: ${restaurantName}`);
  } else {
    // Reuse the name already configured in settings so nothing visibly changes.
    const [settingsRow] = await db.execute<{ value: Record<string, unknown> }>(
      sql`select value from settings where key = 'restaurant' limit 1`,
    );
    const name =
      (settingsRow?.value as { restaurantName?: string } | undefined)?.restaurantName ??
      'My Restaurant';
    const configured = settingsRow?.value as
      | { address?: string; phone?: string; currency?: string; currencySymbol?: string }
      | undefined;

    const [created] = await db.execute<{ id: string; name: string }>(sql`
      insert into restaurants (name, slug, address, phone, currency, currency_symbol)
      values (
        ${name},
        ${slugify(name)},
        ${configured?.address ?? null},
        ${configured?.phone ?? null},
        ${configured?.currency ?? 'INR'},
        ${configured?.currencySymbol ?? '₹'}
      )
      returning id, name
    `);

    if (!created) throw new Error('Could not create the default restaurant');
    restaurantId = created.id;
    restaurantName = created.name;
    logger.info(`  adopted existing data as "${restaurantName}"`);
  }

  // ── 3 & 4. Add the nullable column, then backfill ────────────────────
  for (const table of TENANT_TABLES) {
    await db.execute(
      sql.raw(`alter table ${table} add column if not exists restaurant_id uuid`),
    );

    // Attach the FK separately so a re-run does not error on an existing one.
    await db.execute(
      sql.raw(`
        do $$
        begin
          if not exists (
            select 1 from pg_constraint where conname = '${table}_restaurant_id_fkey'
          ) then
            alter table ${table}
              add constraint ${table}_restaurant_id_fkey
              foreign key (restaurant_id) references restaurants (id) on delete cascade;
          end if;
        end $$;
      `),
    );

    await db.execute(
      sql.raw(`create index if not exists ${table}_restaurant_idx on ${table} (restaurant_id)`),
    );

    const result = await db.execute(
      sql.raw(
        `update ${table} set restaurant_id = '${restaurantId}' where restaurant_id is null`,
      ),
    );

    logger.info(`  ${table.padEnd(18)} backfilled (${(result as unknown as { count?: number }).count ?? 0} rows)`);
  }

  // ── Verify nothing was left behind ───────────────────────────────────
  logger.info('');
  logger.info('Verification:');
  let orphans = 0;
  for (const table of TENANT_TABLES) {
    const [row] = await db.execute<{ n: number }>(
      sql.raw(`select count(*)::int as n from ${table} where restaurant_id is null`),
    );
    const n = row?.n ?? 0;
    orphans += n;
    if (n > 0) logger.warn(`  ${table}: ${n} rows still unassigned`);
  }

  if (orphans === 0) {
    logger.info('  every row is assigned to a restaurant');
  } else {
    throw new Error(`${orphans} rows were left without a restaurant — investigate before phase 2`);
  }

  logger.info('');
  logger.info(`Phase 1 complete. Default restaurant: ${restaurantName} (${restaurantId})`);
  logger.info('Existing queries are unchanged — the column is additive and nullable.');
}

migrate()
  .then(async () => {
    await closeDatabaseConnection();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    logger.error('Migration failed — no partial state should remain', error);
    await closeDatabaseConnection().catch(() => undefined);
    process.exit(1);
  });
