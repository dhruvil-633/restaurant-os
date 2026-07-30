import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Bike,
  CheckCircle2,
  ChevronRight,
  Clock,
  Leaf,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Field, Input, Textarea } from '@/components/ui/input';
import { getErrorMessage } from '@/services/api';
import { publicService } from '@/services';
import { cn, formatCurrency, resolveImageUrl } from '@/lib/utils';
import type { PublicMenuItem, PublicOrderReceipt } from '@/types';

interface CartLine {
  item: PublicMenuItem;
  quantity: number;
}

type Step = 'menu' | 'details' | 'done';

export default function CustomerOrderPage() {
  const [step, setStep] = useState<Step>('menu');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [receipt, setReceipt] = useState<PublicOrderReceipt | null>(null);

  const [orderType, setOrderType] = useState<'takeaway' | 'delivery'>('takeaway');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const menu = useQuery({
    queryKey: ['public', 'menu'],
    queryFn: publicService.menu,
    staleTime: 5 * 60_000,
  });

  const placeOrder = useMutation({
    mutationFn: () =>
      publicService.createOrder({
        type: orderType,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        customerEmail: email.trim() || undefined,
        deliveryAddress: orderType === 'delivery' ? address.trim() : undefined,
        notes: notes.trim() || undefined,
        items: cart.map((line) => ({ menuItemId: line.item.id, quantity: line.quantity })),
      }),
    onSuccess: (result) => {
      setReceipt(result);
      setStep('done');
      setCart([]);
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not place your order')),
  });

  const categories = menu.data?.categories ?? [];
  const taxRate = menu.data?.restaurant.taxRatePercent ?? 5;

  const visibleItems = useMemo(() => {
    const all = categories.flatMap((category) => category.items);
    const scoped =
      activeCategory === 'all' ? all : all.filter((item) => item.categoryId === activeCategory);
    if (!search.trim()) return scoped;
    const term = search.toLowerCase();
    return scoped.filter(
      (item) =>
        item.name.toLowerCase().includes(term) ||
        (item.description ?? '').toLowerCase().includes(term),
    );
  }, [categories, activeCategory, search]);

  const subtotal = cart.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
  const taxAmount = (subtotal * taxRate) / 100;
  const total = subtotal + taxAmount;
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  const changeQuantity = (item: PublicMenuItem, delta: number): void => {
    setCart((current) => {
      const existing = current.find((line) => line.item.id === item.id);
      if (!existing) return delta > 0 ? [...current, { item, quantity: 1 }] : current;
      return current
        .map((line) =>
          line.item.id === item.id ? { ...line, quantity: line.quantity + delta } : line,
        )
        .filter((line) => line.quantity > 0);
    });
  };

  const detailsValid =
    name.trim().length >= 2 &&
    phone.replace(/\D/g, '').length >= 7 &&
    (orderType !== 'delivery' || address.trim().length >= 10);

  /* ── Confirmation ───────────────────────────────────────────────── */
  if (step === 'done' && receipt) {
    return (
      <Shell title={menu.data?.restaurant.name}>
        <div className="mx-auto max-w-lg py-10 text-center">
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-success-soft"
          >
            <CheckCircle2 className="size-8 text-success" />
          </motion.span>

          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink">
            Order sent to the kitchen
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Keep this number safe — you'll need it with your phone to track the order.
          </p>

          <div className="mt-6 rounded-card border border-line bg-surface p-5 text-left shadow-xs">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                Order number
              </span>
              <span className="font-mono text-sm font-semibold text-ink">
                {receipt.orderNumber}
              </span>
            </div>

            <ul className="space-y-2 py-3">
              {receipt.items.map((line, index) => (
                <li key={index} className="flex justify-between text-sm">
                  <span className="text-ink-muted">
                    {line.quantity} × {line.name}
                  </span>
                  <span className="tabular text-ink">{formatCurrency(line.lineTotal)}</span>
                </li>
              ))}
            </ul>

            <dl className="space-y-1.5 border-t border-line pt-3 text-sm">
              <div className="flex justify-between text-ink-muted">
                <dt>Subtotal</dt>
                <dd className="tabular">{formatCurrency(receipt.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-ink-muted">
                <dt>Tax</dt>
                <dd className="tabular">{formatCurrency(receipt.taxAmount)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold text-ink">
                <dt>Total</dt>
                <dd className="tabular">{formatCurrency(receipt.total)}</dd>
              </div>
            </dl>

            <p className="mt-4 flex items-center justify-center gap-1.5 rounded-lg bg-brand-soft py-2.5 text-sm font-medium text-brand-soft-ink">
              <Clock className="size-4" />
              Ready in roughly {receipt.estimatedMinutes} minutes
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild>
              <Link to={`/track?orderNumber=${receipt.orderNumber}`}>Track this order</Link>
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setReceipt(null);
                setStep('menu');
              }}
            >
              Order something else
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  /* ── Checkout details ───────────────────────────────────────────── */
  if (step === 'details') {
    return (
      <Shell title={menu.data?.restaurant.name}>
        <div className="mx-auto max-w-lg py-8">
          <Button variant="ghost" size="sm" onClick={() => setStep('menu')} className="mb-4">
            <ArrowLeft />
            Back to menu
          </Button>

          <h1 className="text-2xl font-semibold tracking-tight text-ink">Almost there</h1>
          <p className="mt-1 text-sm text-ink-muted">
            We only need enough to find you when the food is ready.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-2">
            {(['takeaway', 'delivery'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setOrderType(option)}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl border p-3.5 text-left transition-colors',
                  orderType === option
                    ? 'border-brand bg-brand-soft'
                    : 'border-line hover:bg-surface-hover',
                )}
              >
                {option === 'takeaway' ? (
                  <ShoppingBag className="size-4 text-ink-muted" />
                ) : (
                  <Bike className="size-4 text-ink-muted" />
                )}
                <span className="text-sm font-medium capitalize text-ink">{option}</span>
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-4">
            <Field label="Your name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ananya Sharma" />
            </Field>
            <Field label="Phone" required hint="Used to identify your order when you collect it">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                inputMode="tel"
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            {orderType === 'delivery' && (
              <Field label="Delivery address" required>
                <Textarea
                  rows={3}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Flat, building, street, landmark"
                />
              </Field>
            )}
            <Field label="Anything the kitchen should know?">
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Allergies, spice level, collection time…"
              />
            </Field>
          </div>

          <div className="mt-6 rounded-card border border-line bg-surface-sunken p-4">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between text-ink-muted">
                <dt>
                  Subtotal · {itemCount} item{itemCount === 1 ? '' : 's'}
                </dt>
                <dd className="tabular">{formatCurrency(subtotal)}</dd>
              </div>
              <div className="flex justify-between text-ink-muted">
                <dt>Tax ({taxRate}%)</dt>
                <dd className="tabular">{formatCurrency(taxAmount)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold text-ink">
                <dt>Total</dt>
                <dd className="tabular">{formatCurrency(total)}</dd>
              </div>
            </dl>
          </div>

          <Button
            size="lg"
            className="mt-5 w-full"
            disabled={!detailsValid}
            loading={placeOrder.isPending}
            onClick={() => placeOrder.mutate()}
          >
            Place order · {formatCurrency(total)}
          </Button>

          {!detailsValid && (
            <p className="mt-2 text-center text-xs text-ink-subtle">
              {name.trim().length < 2
                ? 'Enter your name to continue'
                : phone.replace(/\D/g, '').length < 7
                  ? 'Enter a valid phone number'
                  : 'Add a delivery address to continue'}
            </p>
          )}
          <p className="mt-3 text-center text-xs text-ink-subtle">
            You pay at the counter or on delivery — no card details needed.
          </p>
        </div>
      </Shell>
    );
  }

  /* ── Menu ───────────────────────────────────────────────────────── */
  return (
    <Shell title={menu.data?.restaurant.name}>
      <div className="py-6 pb-32">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Menu</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Everything here is available right now — the kitchen updates it live.
        </p>

        <div className="sticky top-16 z-20 -mx-5 mt-5 bg-canvas/95 px-5 py-3 backdrop-blur">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dishes…"
            leading={<Search />}
          />
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            <CategoryChip
              label="All"
              active={activeCategory === 'all'}
              onClick={() => setActiveCategory('all')}
            />
            {categories.map((category) => (
              <CategoryChip
                key={category.id}
                label={category.name}
                active={activeCategory === category.id}
                onClick={() => setActiveCategory(category.id)}
              />
            ))}
          </div>
        </div>

        {menu.isError ? (
          <ErrorState
            className="mt-6"
            title="Menu unavailable"
            description="We couldn't reach the kitchen. Please try again in a moment."
            onRetry={() => void menu.refetch()}
          />
        ) : menu.isLoading ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-32 rounded-2xl" />
            ))}
          </div>
        ) : visibleItems.length === 0 ? (
          <EmptyState className="mt-6" title="Nothing matches" description="Try another search." />
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleItems.map((item) => {
              const line = cart.find((entry) => entry.item.id === item.id);
              const image = resolveImageUrl(item.imageUrl);

              return (
                <Card
                  key={item.id}
                  className={cn(
                    'flex overflow-hidden transition-shadow hover:shadow-md',
                    line && 'border-brand ring-2 ring-brand/20',
                  )}
                >
                  {image && (
                    <img
                      src={image}
                      alt={item.name}
                      loading="lazy"
                      className="size-28 shrink-0 object-cover"
                    />
                  )}
                  <CardContent className="flex min-w-0 flex-1 flex-col p-4">
                    <div className="flex items-start gap-2">
                      <h3 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-ink">
                        {item.name}
                      </h3>
                      {item.isVegetarian && (
                        <Leaf className="mt-0.5 size-3.5 shrink-0 text-success" aria-label="Vegetarian" />
                      )}
                    </div>

                    {item.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{item.description}</p>
                    )}

                    <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                      <span className="text-sm font-semibold tabular text-ink">
                        {formatCurrency(item.price)}
                      </span>

                      {line ? (
                        <div className="flex items-center rounded-lg border border-line bg-surface">
                          <button
                            type="button"
                            onClick={() => changeQuantity(item, -1)}
                            className="p-1.5 text-ink-muted hover:text-ink"
                            aria-label={`Remove one ${item.name}`}
                          >
                            <Minus className="size-3.5" />
                          </button>
                          <span className="min-w-[1.5rem] text-center text-sm font-semibold tabular text-ink">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => changeQuantity(item, 1)}
                            className="p-1.5 text-ink-muted hover:text-ink"
                            aria-label={`Add one ${item.name}`}
                          >
                            <Plus className="size-3.5" />
                          </button>
                        </div>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => changeQuantity(item, 1)}>
                          <Plus />
                          Add
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Sticky cart bar ──────────────────────────────────────────── */}
      <AnimatePresence>
        {cart.length > 0 && (
          <motion.div
            initial={{ y: 90 }}
            animate={{ y: 0 }}
            exit={{ y: 90 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="fixed inset-x-0 bottom-0 z-30 border-t border-line glass"
          >
            <div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  {itemCount} item{itemCount === 1 ? '' : 's'} · {formatCurrency(total)}
                </p>
                <p className="truncate text-[11px] text-ink-subtle">
                  {cart.map((line) => `${line.quantity}× ${line.item.name}`).join(', ')}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setCart([])}
                aria-label="Clear cart"
              >
                <Trash2 />
              </Button>
              <Button onClick={() => setStep('details')}>
                Checkout
                <ChevronRight />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  );
}

function Shell({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line glass">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand shadow-sm">
              <UtensilsCrossed className="size-[18px] text-white" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-ink">
              {title ?? 'RestaurantOS'}
            </span>
          </Link>
          <Badge tone="brand" size="sm" className="ml-auto">
            Online ordering
          </Badge>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5">{children}</main>
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors',
        active ? 'bg-brand text-white' : 'bg-surface-sunken text-ink-muted hover:text-ink',
      )}
    >
      {label}
    </button>
  );
}
