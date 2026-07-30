import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Award,
  BadgeIndianRupee,
  CalendarCheck,
  ChefHat,
  ClipboardList,
  Clock,
  Star,
  Timer,
  Utensils,
} from 'lucide-react';
import { Badge, ORDER_STATUS_TONE } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, Progress, Skeleton } from '@/components/ui/feedback';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { StarRating } from './CustomersPage';
import { dashboardService } from '@/services';
import { cn, formatCurrency, formatDate, formatDuration, formatRelativeTime, titleCase } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';

const ATTENDANCE_TONE: Record<string, string> = {
  present: 'text-success',
  late: 'text-warning',
  absent: 'text-danger',
  leave: 'text-info',
  half_day: 'text-accent',
};

/**
 * "My shift" — what a waiter, chef or cashier sees instead of the owner's
 * business dashboard. Their own output, pay and reviews, not the P&L.
 */
export default function MyDashboardPage() {
  const user = useAuthStore((state) => state.user);

  const me = useQuery({
    queryKey: ['dashboard', 'me'],
    queryFn: dashboardService.me,
    refetchInterval: 180_000,
  });

  if (me.isError) {
    return (
      <>
        <PageHeader title="My shift" />
        <ErrorState onRetry={() => void me.refetch()} />
      </>
    );
  }

  const data = me.data;
  const isKitchen = data?.focus === 'kitchen';
  const greeting = getGreeting();

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user?.name?.split(' ')[0] ?? 'there'}`}
        description={
          isKitchen
            ? "Your board, your timings, and what guests said about the food."
            : 'Your tables, your orders, and what guests said about the service.'
        }
        actions={
          <Button asChild>
            <Link to={isKitchen ? '/kitchen' : '/floor'}>
              {isKitchen ? <ChefHat /> : <Utensils />}
              {isKitchen ? 'Open kitchen' : 'Open floor'}
            </Link>
          </Button>
        }
      />

      {/* ── Today ────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          index={0}
          label={isKitchen ? 'Tickets today' : 'Orders today'}
          value={String(data?.today.orders ?? 0)}
          icon={ClipboardList}
          hint={`${data?.today.completed ?? 0} completed`}
          tone="brand"
          loading={me.isLoading}
        />
        <StatCard
          index={1}
          label="This week"
          value={String(data?.week.orders ?? 0)}
          icon={CalendarCheck}
          hint={`${data?.month.orders ?? 0} in the last 30 days`}
          tone="info"
          loading={me.isLoading}
        />
        <StatCard
          index={2}
          label={isKitchen ? 'Avg. cook time' : 'Avg. service time'}
          value={formatDuration(
            isKitchen ? (data?.month.averageCookMinutes ?? 0) : (data?.month.averageServiceMinutes ?? 0),
          )}
          icon={Timer}
          hint="Across the last 30 days"
          tone="accent"
          loading={me.isLoading}
        />
        <StatCard
          index={3}
          label="Guest rating"
          value={data?.rating.average !== null && data?.rating.average !== undefined ? `${data.rating.average}★` : '—'}
          icon={Star}
          hint={
            (data?.rating.reviewCount ?? 0) > 0
              ? `from ${data?.rating.reviewCount} reviews`
              : 'No reviews yet'
          }
          tone="success"
          loading={me.isLoading}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* ── Employment & attendance ────────────────────────────────── */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BadgeIndianRupee className="size-4 text-ink-muted" />
              Your employment
            </CardTitle>
          </CardHeader>
          <CardContent>
            {me.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : !data?.employment ? (
              <p className="py-6 text-center text-sm text-ink-subtle">
                No HR record is linked to your account yet. Ask a manager to add one.
              </p>
            ) : (
              <>
                <dl className="space-y-2.5 text-sm">
                  <Row label="Employee code" value={data.employment.employeeCode} mono />
                  <Row label="Position" value={data.employment.position} />
                  <Row label="Department" value={data.employment.department} />
                  <Row label="Joined" value={formatDate(data.employment.hiredAt)} />
                  <Row
                    label="Monthly salary"
                    value={formatCurrency(data.employment.monthlySalary)}
                    emphasis
                  />
                </dl>

                {data.attendance && (
                  <div className="mt-5 border-t border-line pt-4">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                        Attendance · 30 days
                      </span>
                      <span className="text-sm font-semibold tabular text-ink">
                        {data.attendance.rate}%
                      </span>
                    </div>
                    <Progress
                      value={data.attendance.rate}
                      className="mt-2"
                      tone={
                        data.attendance.rate >= 90
                          ? 'success'
                          : data.attendance.rate >= 75
                            ? 'warning'
                            : 'danger'
                      }
                    />
                    <p className="mt-2 text-xs text-ink-subtle">
                      {data.attendance.presentDays} of {data.attendance.totalDays} days ·{' '}
                      {data.attendance.hoursWorked}h worked
                    </p>
                  </div>
                )}

                {data.recentAttendance.length > 0 && (
                  <ul className="mt-4 space-y-1.5 border-t border-line pt-4">
                    {data.recentAttendance.slice(0, 5).map((entry) => (
                      <li key={entry.workDate} className="flex items-center justify-between text-xs">
                        <span className="text-ink-muted">{formatDate(entry.workDate)}</span>
                        <span className="flex items-center gap-2">
                          <span className={cn('font-medium', ATTENDANCE_TONE[entry.status])}>
                            {titleCase(entry.status)}
                          </span>
                          {entry.hoursWorked > 0 && (
                            <span className="tabular text-ink-subtle">{entry.hoursWorked}h</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Recent work ────────────────────────────────────────────── */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent {isKitchen ? 'tickets' : 'orders'}</CardTitle>
          </CardHeader>
          <CardContent>
            {me.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (data?.recentOrders.length ?? 0) === 0 ? (
              <EmptyState
                icon={<ClipboardList />}
                title={isKitchen ? 'No tickets yet' : 'No orders yet'}
                description="Your work shows up here as service runs."
              />
            ) : (
              <ul className="divide-y divide-line">
                {data?.recentOrders.map((order) => (
                  <li key={order.id}>
                    <Link
                      to={`/orders/${order.id}`}
                      className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-hover"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{order.orderNumber}</p>
                        <p className="text-[11px] text-ink-subtle">
                          {order.tableLabel ? `Table ${order.tableLabel}` : titleCase(order.type)} ·{' '}
                          {formatRelativeTime(order.placedAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <Badge tone={ORDER_STATUS_TONE[order.status]} size="sm">
                          {titleCase(order.status)}
                        </Badge>
                        <span className="w-20 text-right text-sm font-semibold tabular text-ink">
                          {formatCurrency(order.total)}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* ── My tables (floor only) ─────────────────────────────────── */}
        {!isKitchen && (
          <Card>
            <CardHeader>
              <CardTitle>My tables</CardTitle>
            </CardHeader>
            <CardContent>
              {(data?.myTables.length ?? 0) === 0 ? (
                <p className="py-6 text-center text-sm text-ink-subtle">
                  No tables assigned to you right now.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {data?.myTables.map((table) => (
                    <Link
                      key={table.id}
                      to="/floor"
                      className="rounded-xl border border-line p-3 transition-colors hover:bg-surface-hover"
                    >
                      <p className="text-sm font-semibold text-ink">{table.label}</p>
                      <p className="text-[11px] text-ink-subtle">
                        {table.section} · seats {table.capacity}
                      </p>
                      <Badge tone="info" size="sm" className="mt-1.5">
                        {titleCase(table.status)}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Top dishes ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>{isKitchen ? 'Most cooked' : 'Most sold'}</CardTitle>
            <p className="mt-0.5 text-sm text-ink-muted">Last 30 days</p>
          </CardHeader>
          <CardContent>
            {(data?.topDishes.length ?? 0) === 0 ? (
              <p className="py-6 text-center text-sm text-ink-subtle">Nothing yet.</p>
            ) : (
              <ol className="space-y-2.5">
                {data?.topDishes.map((dish, index) => (
                  <li key={dish.name} className="flex items-center gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-[11px] font-bold text-brand-soft-ink">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{dish.name}</span>
                    <span className="shrink-0 text-sm font-semibold tabular text-ink-muted">
                      {dish.quantity}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* ── Reviews ────────────────────────────────────────────────── */}
        <Card className={isKitchen ? 'lg:col-span-2' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="size-4 text-ink-muted" />
              What guests said
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.recentReviews.length ?? 0) === 0 ? (
              <p className="py-6 text-center text-sm text-ink-subtle">
                No written reviews on your orders yet.
              </p>
            ) : (
              <div className="space-y-3">
                {data?.recentReviews.map((review) => (
                  <div key={review.id} className="rounded-xl border border-line p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <StarRating rating={review.rating} />
                      <span className="flex items-center gap-1 text-[11px] text-ink-subtle">
                        <Clock className="size-3" />
                        {formatRelativeTime(review.createdAt)}
                      </span>
                    </div>
                    {review.comment && (
                      <p className="mt-2 text-sm text-ink-muted">“{review.comment}”</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  mono = false,
  emphasis = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd
        className={cn(
          'text-right font-medium text-ink',
          mono && 'font-mono text-xs',
          emphasis && 'text-base font-semibold tabular',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
