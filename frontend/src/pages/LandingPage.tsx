import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Clock,
  LogIn,
  MapPin,
  Phone,
  ShoppingBag,
  Sparkles,
  Store,
  UtensilsCrossed,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { publicService } from '@/services';
import { formatCurrency, resolveImageUrl } from '@/lib/utils';

/**
 * The public front door. Guests go straight to ordering; staff take the
 * discreet sign-in link. Nothing here requires a token, so it renders even
 * while the API is still waking up.
 */
export default function LandingPage() {
  const menu = useQuery({
    queryKey: ['public', 'menu'],
    queryFn: publicService.menu,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const restaurant = menu.data?.restaurant;
  const featured =
    menu.data?.categories
      .flatMap((category) => category.items)
      .filter((item) => item.isFeatured)
      .slice(0, 3) ?? [];

  return (
    <div className="min-h-dvh bg-canvas">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-line glass">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-brand shadow-sm">
            <UtensilsCrossed className="size-[18px] text-white" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-ink">
            {restaurant?.name ?? 'RestaurantOS'}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">
                <LogIn />
                <span className="hidden sm:inline">Staff sign in</span>
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/order">Order now</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-texture opacity-[0.35] dark:opacity-[0.07]" />
        <div className="absolute -left-40 -top-40 size-[30rem] rounded-full bg-brand/12 blur-[120px]" />
        <div className="absolute -right-32 top-20 size-[26rem] rounded-full bg-accent/10 blur-[120px]" />

        <div className="relative mx-auto max-w-6xl px-5 py-20 text-center sm:py-28">
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-muted shadow-xs"
          >
            <Sparkles className="size-3.5 text-brand" />
            Freshly prepared, made to order
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-ink text-balance sm:text-6xl"
          >
            {restaurant?.name ?? 'Good food'},
            <br className="hidden sm:block" /> ordered in under a minute.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-ink-muted text-balance sm:text-base"
          >
            Browse the kitchen's live menu, build your order and send it straight to the pass.
            No app, no account, no waiting on hold.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18 }}
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Button size="lg" className="w-full sm:w-auto" asChild>
              <Link to="/order">
                <ShoppingBag />
                Start your order
                <ArrowRight />
              </Link>
            </Button>
            <Button variant="secondary" size="lg" className="w-full sm:w-auto" asChild>
              <Link to="/track">Track an order</Link>
            </Button>
          </motion.div>

          {restaurant && (restaurant.address || restaurant.phone) && (
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-ink-subtle">
              {restaurant.address && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3.5" />
                  {restaurant.address}
                </span>
              )}
              {restaurant.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3.5" />
                  {restaurant.phone}
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Featured dishes ──────────────────────────────────────────── */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 pb-20">
          <h2 className="mb-6 text-center text-xl font-semibold tracking-tight text-ink">
            Tonight's favourites
          </h2>
          <div className="grid gap-5 sm:grid-cols-3">
            {featured.map((item, index) => {
              const image = resolveImageUrl(item.imageUrl);
              return (
                <motion.article
                  key={item.id}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.08 }}
                  className="group overflow-hidden rounded-card border border-line bg-surface shadow-xs transition-shadow hover:shadow-md"
                >
                  <div className="h-40 overflow-hidden bg-surface-sunken">
                    {image ? (
                      <img
                        src={image}
                        alt={item.name}
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <UtensilsCrossed className="size-9 text-ink-subtle/30" />
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <h3 className="font-semibold text-ink">{item.name}</h3>
                    {item.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{item.description}</p>
                    )}
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-lg font-semibold tabular text-ink">
                        {formatCurrency(item.price)}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-ink-subtle">
                        <Clock className="size-3.5" />
                        {item.prepTimeMinutes} min
                      </span>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </section>
      )}

      {/* ── For restaurant owners ────────────────────────────────────── */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-3xl px-5 py-16 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-1 text-xs font-medium text-ink-muted">
            <Store className="size-3.5 text-brand" />
            Run a restaurant?
          </span>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-ink text-balance sm:text-3xl">
            Put your own restaurant on RestaurantOS
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-ink-muted text-balance">
            Floor plan, kitchen display, inventory that deducts itself, and the analytics
            that tell you where the evening actually went.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" variant="secondary" className="w-full sm:w-auto" asChild>
              <Link to="/register">
                <Store />
                Set up your restaurant
              </Link>
            </Button>
            <Button size="lg" variant="ghost" className="w-full sm:w-auto" asChild>
              <Link to="/login">
                <LogIn />
                I already have an account
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-xs text-ink-subtle sm:flex-row">
          <span>
            © {new Date().getFullYear()} {restaurant?.name ?? 'RestaurantOS'}
          </span>
          <Link to="/login" className="font-medium transition-colors hover:text-ink">
            Staff &amp; management sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
