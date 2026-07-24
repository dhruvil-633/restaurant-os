import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Cake, Clock, Heart, Phone, Repeat, TrendingUp, Wallet } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, PageLoader } from '@/components/ui/feedback';
import { PageHeader } from '@/components/shared/PageHeader';
import { StarRating } from './CustomersPage';
import { QUERY_KEYS } from '@/constants/socketEvents';
import { formatCurrency, formatDate, formatRelativeTime, titleCase } from '@/lib/utils';
import { customerService } from '@/services';

const TIER_TONE = {
  new: 'neutral',
  returning: 'info',
  frequent: 'accent',
  regular: 'brand',
} as const;

export default function CustomerDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const memory = useQuery({
    queryKey: QUERY_KEYS.customerMemory(id),
    queryFn: () => customerService.memory(id),
    enabled: Boolean(id),
  });

  if (memory.isLoading) return <PageLoader label="Loading guest" />;
  if (memory.isError || !memory.data) {
    return (
      <>
        <PageHeader title="Guest" />
        <ErrorState title="Guest not found" onRetry={() => void memory.refetch()} />
      </>
    );
  }

  const { customer, ...profile } = memory.data;

  return (
    <>
      <PageHeader
        title={customer.name}
        description="Everything the floor should know before greeting them."
        actions={
          <Button variant="secondary" onClick={() => navigate(-1)}>
            <ArrowLeft />
            Back
          </Button>
        }
      />

      {/* ── Recognition banner ───────────────────────────────────── */}
      <Card className="mb-4 overflow-hidden">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <Avatar name={customer.name} size="xl" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-ink">{customer.name}</h2>
              <Badge tone={TIER_TONE[profile.tier]} dot>
                {titleCase(profile.tier)}
              </Badge>
              {profile.isReturning && (
                <Badge tone="success" size="sm">
                  <Repeat className="size-3" />
                  Returning guest
                </Badge>
              )}
              {profile.daysUntilBirthday !== null && profile.daysUntilBirthday <= 30 && (
                <Badge tone="accent" size="sm">
                  <Cake className="size-3" />
                  {profile.daysUntilBirthday === 0
                    ? 'Birthday today'
                    : `Birthday in ${profile.daysUntilBirthday}d`}
                </Badge>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
              <span className="flex items-center gap-1.5">
                <Phone className="size-3.5" />
                {customer.phone}
              </span>
              {customer.email && <span>{customer.email}</span>}
              {profile.daysSinceLastVisit !== null && (
                <span className="flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  Last visit {profile.daysSinceLastVisit === 0 ? 'today' : `${profile.daysSinceLastVisit}d ago`}
                </span>
              )}
            </div>

            {customer.notes && (
              <p className="mt-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning-soft-ink">
                {customer.notes}
              </p>
            )}
          </div>

          {profile.averageRating !== null && (
            <div className="shrink-0 text-center">
              <StarRating rating={Math.round(profile.averageRating)} large />
              <p className="mt-1 text-xs text-ink-muted">
                {profile.averageRating.toFixed(1)} average
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric icon={Repeat} label="Visits" value={String(customer.visitCount)} />
        <Metric icon={Wallet} label="Lifetime spend" value={formatCurrency(customer.totalSpent)} />
        <Metric icon={TrendingUp} label="Average bill" value={formatCurrency(customer.averageBill)} />
        <Metric icon={Heart} label="Loyalty points" value={String(customer.loyaltyPoints)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Favourites ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Usual order</CardTitle>
            <p className="mt-0.5 text-sm text-ink-muted">What they reach for most often</p>
          </CardHeader>
          <CardContent>
            {profile.favouriteDishes.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-subtle">No order history yet.</p>
            ) : (
              <ol className="space-y-2.5">
                {profile.favouriteDishes.map((dish, index) => (
                  <li key={`${dish.name}-${index}`} className="flex items-center gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-xs font-bold text-brand-soft-ink">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{dish.name}</p>
                      <p className="text-[11px] text-ink-subtle">
                        Ordered {dish.timesOrdered}×
                        {dish.lastOrderedAt && ` · last ${formatRelativeTime(dish.lastOrderedAt)}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-xs">
              <div>
                <p className="text-ink-subtle">Visits roughly every</p>
                <p className="mt-0.5 font-semibold text-ink">
                  {profile.visitPattern.averageDaysBetweenVisits > 0
                    ? `${profile.visitPattern.averageDaysBetweenVisits} days`
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-ink-subtle">Usually arrives around</p>
                <p className="mt-0.5 font-semibold text-ink">
                  {profile.visitPattern.favouriteHour > 0
                    ? `${profile.visitPattern.favouriteHour}:00`
                    : '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Recent orders ──────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Recent orders</CardTitle>
          </CardHeader>
          <CardContent>
            {profile.recentOrders.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-subtle">No orders yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {profile.recentOrders.map((order) => (
                  <li key={order.id}>
                    <Link
                      to={`/orders/${order.id}`}
                      className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-hover"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{order.orderNumber}</p>
                        <p className="text-[11px] text-ink-subtle">
                          {titleCase(order.type)} · {formatDate(order.placedAt)}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular text-ink">
                        {formatCurrency(order.total)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {profile.recentFeedback.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>What they said</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {profile.recentFeedback.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-line p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <StarRating rating={entry.rating} />
                  <span className="text-[11px] text-ink-subtle">
                    {formatRelativeTime(entry.createdAt)}
                  </span>
                </div>
                {entry.comment && (
                  <p className="mt-2 text-sm text-ink-muted">“{entry.comment}”</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Repeat;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-ink-subtle">
        <Icon className="size-3.5" />
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1.5 text-xl font-semibold tabular text-ink">{value}</p>
    </Card>
  );
}
