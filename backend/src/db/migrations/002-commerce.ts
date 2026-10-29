import { sql } from 'drizzle-orm';
import { closeDatabaseConnection, db, verifyDatabaseConnection } from '../index';
import { logger } from '../../config/logger';

/**
 * Adds split payments and loyalty rewards. Additive and idempotent, same
 * contract as 001: nothing existing is dropped, renamed or rewritten, so the
 * running deployment is unaffected until the new endpoints are called.
 */
async function migrate(): Promise<void> {
  await verifyDatabaseConnection();
  logger.info('Migration 002 — split payments + loyalty rewards');

  const [restaurant] = await db.execute<{ id: string; name: string }>(
    sql`select id, name from restaurants order by created_at limit 1`,
  );
  if (!restaurant) throw new Error('No restaurant found — run 001 first');

  await db.execute(sql`
    create table if not exists payments (
      id uuid primary key default gen_random_uuid(),
      restaurant_id uuid references restaurants (id) on delete cascade,
      order_id uuid not null references orders (id) on delete cascade,
      amount numeric(12,2) not null,
      method payment_method not null,
      payer_label varchar(60),
      reference varchar(80),
      received_by_id uuid references users (id) on delete set null,
      created_at timestamptz not null default now()
    )
  `);
  await db.execute(sql`create index if not exists payments_order_idx on payments (order_id)`);
  await db.execute(sql`create index if not exists payments_created_at_idx on payments (created_at)`);

  await db.execute(sql`
    do $$ begin
      if not exists (select 1 from pg_type where typname = 'reward_type') then
        create type reward_type as enum ('discount_amount','discount_percent','free_item');
      end if;
    end $$
  `);

  await db.execute(sql`
    create table if not exists loyalty_rewards (
      id uuid primary key default gen_random_uuid(),
      restaurant_id uuid references restaurants (id) on delete cascade,
      name varchar(120) not null,
      description text,
      points_cost integer not null,
      type reward_type not null default 'discount_amount',
      value numeric(12,2) not null default 0,
      menu_item_id uuid references menu_items (id) on delete set null,
      max_discount numeric(12,2),
      is_active boolean not null default true,
      created_at timestamptz not null default now()
    )
  `);
  await db.execute(
    sql`create index if not exists loyalty_rewards_active_idx on loyalty_rewards (is_active)`,
  );

  await db.execute(sql`
    create table if not exists reward_redemptions (
      id uuid primary key default gen_random_uuid(),
      restaurant_id uuid references restaurants (id) on delete cascade,
      customer_id uuid not null references customers (id) on delete cascade,
      reward_id uuid references loyalty_rewards (id) on delete set null,
      order_id uuid references orders (id) on delete set null,
      reward_name varchar(120) not null,
      points_spent integer not null,
      discount_applied numeric(12,2) not null default 0,
      redeemed_by_id uuid references users (id) on delete set null,
      created_at timestamptz not null default now()
    )
  `);
  await db.execute(
    sql`create index if not exists reward_redemptions_customer_idx on reward_redemptions (customer_id)`,
  );
  await db.execute(
    sql`create index if not exists reward_redemptions_order_idx on reward_redemptions (order_id)`,
  );

  // Backfill the ledger from bills already settled, so split-payment reporting
  // and the day's takings are not blind to everything paid before today.
  const backfilled = await db.execute(sql`
    insert into payments (restaurant_id, order_id, amount, method, payer_label, created_at)
    select o.restaurant_id, o.id, o.total, o.payment_method, 'Full bill',
           coalesce(o.completed_at, o.placed_at)
    from orders o
    where o.payment_status = 'paid'
      and o.payment_method is not null
      and not exists (select 1 from payments p where p.order_id = o.id)
  `);
  logger.info(`  backfilled ${(backfilled as unknown as { count?: number }).count ?? 0} historical payments`);

  // A few starter rewards so the screen is not empty on first open.
  const [{ n }] = await db.execute<{ n: number }>(sql`select count(*)::int n from loyalty_rewards`);
  if (n === 0) {
    await db.execute(sql`
      insert into loyalty_rewards (restaurant_id, name, description, points_cost, type, value, max_discount)
      values
        (${restaurant.id}, 'Rs 50 off', 'Take 50 off the bill', 500, 'discount_amount', 50, 50),
        (${restaurant.id}, '10% off the bill', 'Ten percent off, capped at 300', 1200, 'discount_percent', 10, 300),
        (${restaurant.id}, 'Free dessert', 'One dessert on the house', 800, 'discount_amount', 160, 200)
    `);
    logger.info('  seeded 3 starter rewards');
  }

  logger.info('Migration 002 complete — existing behaviour unchanged');
}

migrate()
  .then(async () => {
    await closeDatabaseConnection();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    logger.error('Migration 002 failed', error);
    await closeDatabaseConnection().catch(() => undefined);
    process.exit(1);
  });
