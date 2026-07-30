import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, ChefHat, Clock, PackageCheck, Search, UtensilsCrossed } from 'lucide-react';
import { Badge, ORDER_STATUS_TONE } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { getErrorMessage } from '@/services/api';
import { publicService } from '@/services';
import { cn, formatCurrency, formatTime, titleCase } from '@/lib/utils';

const STAGES = [
  { label: 'Received', icon: Check },
  { label: 'Cooking', icon: ChefHat },
  { label: 'Ready', icon: PackageCheck },
  { label: 'Collected', icon: UtensilsCrossed },
];

export default function TrackOrderPage() {
  const [searchParams] = useSearchParams();
  const [orderNumber, setOrderNumber] = useState(searchParams.get('orderNumber') ?? '');
  const [phone, setPhone] = useState('');
  const [submitted, setSubmitted] = useState<{ orderNumber: string; phone: string } | null>(null);

  const tracked = useQuery({
    queryKey: ['public', 'track', submitted],
    queryFn: () => publicService.track(submitted!.orderNumber, submitted!.phone),
    enabled: Boolean(submitted),
    // A guest watching this screen wants it to move on its own.
    refetchInterval: 30_000,
    retry: 0,
  });

  const data = tracked.data;
  // "served" and "completed" both land on the final stage for a guest.
  const stage = data ? Math.min(Math.max(data.stageIndex, 0), 3) : 0;

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line glass">
        <div className="mx-auto flex h-16 max-w-2xl items-center gap-3 px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand shadow-sm">
              <UtensilsCrossed className="size-[18px] text-white" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-ink">Track order</span>
          </Link>
          <Button variant="ghost" size="sm" className="ml-auto" asChild>
            <Link to="/order">
              <ArrowLeft />
              Menu
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-8">
        <Card>
          <CardContent className="space-y-4 p-5">
            <Field label="Order number" required>
              <Input
                value={orderNumber}
                onChange={(event) => setOrderNumber(event.target.value.toUpperCase())}
                placeholder="ORD-20260728-0012"
                className="font-mono"
              />
            </Field>
            <Field label="Phone used on the order" required>
              <Input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+91 98765 43210"
                inputMode="tel"
              />
            </Field>
            <Button
              className="w-full"
              disabled={orderNumber.trim().length < 4 || phone.replace(/\D/g, '').length < 4}
              loading={tracked.isFetching && Boolean(submitted)}
              onClick={() => setSubmitted({ orderNumber: orderNumber.trim(), phone: phone.trim() })}
            >
              <Search />
              Find my order
            </Button>
          </CardContent>
        </Card>

        {tracked.isError && submitted && (
          <p className="mt-4 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-soft-ink">
            {getErrorMessage(tracked.error, 'We could not find that order.')} Check the number and
            that the phone matches the one used when ordering.
          </p>
        )}

        {data && (
          <Card className="mt-4">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-semibold text-ink">{data.orderNumber}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {data.customerName} · {titleCase(data.type)} · placed {formatTime(data.placedAt)}
                  </p>
                </div>
                <Badge tone={ORDER_STATUS_TONE[data.status]} dot>
                  {titleCase(data.status)}
                </Badge>
              </div>

              {data.status === 'cancelled' ? (
                <p className="mt-5 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-soft-ink">
                  This order was cancelled. Please contact the restaurant.
                </p>
              ) : (
                <ol className="mt-6 flex items-center">
                  {STAGES.map((entry, index) => {
                    const reached = index <= stage;
                    return (
                      <li key={entry.label} className="flex flex-1 items-center last:flex-none">
                        <div className="flex flex-col items-center gap-1.5">
                          <span
                            className={cn(
                              'flex size-9 items-center justify-center rounded-full transition-colors',
                              reached ? 'bg-brand text-white' : 'bg-surface-sunken text-ink-subtle',
                            )}
                          >
                            <entry.icon className="size-4" />
                          </span>
                          <span
                            className={cn(
                              'text-[11px] font-medium',
                              reached ? 'text-ink' : 'text-ink-subtle',
                            )}
                          >
                            {entry.label}
                          </span>
                        </div>
                        {index < STAGES.length - 1 && (
                          <span
                            className={cn(
                              'mx-1 mb-5 h-0.5 flex-1 rounded-full transition-colors',
                              index < stage ? 'bg-brand' : 'bg-line',
                            )}
                          />
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}

              <ul className="mt-6 space-y-1.5 border-t border-line pt-4 text-sm">
                {data.items.map((line, index) => (
                  <li key={index} className="flex justify-between text-ink-muted">
                    <span>
                      {line.quantity} × {line.name}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                <span className="flex items-center gap-1.5 text-xs text-ink-subtle">
                  <Clock className="size-3.5" />
                  {data.elapsedMinutes} min since ordering
                </span>
                <span className="text-base font-semibold tabular text-ink">
                  {formatCurrency(data.total)}
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
