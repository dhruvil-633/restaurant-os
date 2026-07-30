import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ChefHat,
  ClipboardList,
  IndianRupee,
  Star,
  Timer,
  UsersRound,
  Utensils,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import {
  AXIS_PROPS,
  CHART_COLORS,
  CHART_SERIES,
  ChartLegend,
  ChartTooltip,
  currencyTick,
} from '@/components/charts/chartTheme';
import { QUERY_KEYS } from '@/constants/socketEvents';
import { formatCurrency, formatDuration, formatRelativeTime, titleCase } from '@/lib/utils';
import { dashboardService } from '@/services';
import { useAuthStore } from '@/store/authStore';

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const isManagement = user?.role === 'owner' || user?.role === 'manager';
  const [rangeDays, setRangeDays] = useState(14);

  const overview = useQuery({
    queryKey: QUERY_KEYS.dashboardOverview,
    queryFn: dashboardService.overview,
    refetchInterval: 180_000,
  });

  const revenue = useQuery({
    queryKey: QUERY_KEYS.revenueChart(rangeDays),
    queryFn: () => dashboardService.revenueChart(rangeDays),
  });

  const dishes = useQuery({
    queryKey: QUERY_KEYS.popularDishes(30),
    queryFn: () => dashboardService.popularDishes({ days: 30, limit: 7 }),
  });

  const orderMix = useQuery({
    queryKey: QUERY_KEYS.orderMix(30),
    queryFn: () => dashboardService.orderMix(30),
  });

  const activity = useQuery({
    queryKey: QUERY_KEYS.activity,
    queryFn: () => dashboardService.activity(12),
    refetchInterval: 180_000,
  });

  const stats = overview.data;
  const greeting = getGreeting();

  if (overview.isError) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorState
          description="Could not load today's figures. The API may still be waking up."
          onRetry={() => void overview.refetch()}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user?.name?.split(' ')[0] ?? 'there'}`}
        description="Here's how the restaurant is running today."
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link to="/floor">
                <Utensils />
                Floor
              </Link>
            </Button>
            <Button asChild>
              <Link to="/orders/new">
                <ClipboardList />
                New order
              </Link>
            </Button>
          </>
        }
      />

      {/* ── Headline figures ─────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          index={0}
          label="Today's revenue"
          value={formatCurrency(stats?.revenue.value ?? 0)}
          icon={IndianRupee}
          trend={stats?.revenue.trend}
          tone="brand"
          loading={overview.isLoading}
        />
        <StatCard
          index={1}
          label="Orders today"
          value={String(stats?.orders.value ?? 0)}
          icon={ClipboardList}
          trend={stats?.orders.trend}
          tone="info"
          loading={overview.isLoading}
        />
        <StatCard
          index={2}
          label="Guests served"
          value={String(stats?.orders.guests ?? 0)}
          icon={UsersRound}
          hint={`${stats?.customers.newToday ?? 0} new guests registered`}
          tone="accent"
          loading={overview.isLoading}
        />
        <StatCard
          index={3}
          label="Average order"
          value={formatCurrency(stats?.revenue.averageOrderValue ?? 0)}
          icon={Star}
          hint={
            stats?.satisfaction.reviewCount
              ? `${stats.satisfaction.averageRating}★ from ${stats.satisfaction.reviewCount} reviews`
              : 'No reviews in the last 30 days'
          }
          tone="success"
          loading={overview.isLoading}
        />
      </div>

      {/* ── Operational pulse ────────────────────────────────────────── */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          index={4}
          label="Tables occupied"
          value={`${stats?.tables.occupied ?? 0} / ${stats?.tables.total ?? 0}`}
          icon={Utensils}
          hint={`${stats?.tables.occupancyRate ?? 0}% occupancy`}
          tone="info"
          loading={overview.isLoading}
        />
        <StatCard
          index={5}
          label="Kitchen tickets"
          value={String(stats?.kitchen.activeTickets ?? 0)}
          icon={ChefHat}
          hint={
            stats?.kitchen.delayedTickets
              ? `${stats.kitchen.delayedTickets} running late`
              : 'All tickets on time'
          }
          tone={stats?.kitchen.delayedTickets ? 'danger' : 'success'}
          loading={overview.isLoading}
        />
        <StatCard
          index={6}
          label="Reservations today"
          value={String(stats?.reservations.today ?? 0)}
          icon={CalendarClock}
          hint={`${stats?.reservations.upcoming ?? 0} still to arrive`}
          tone="accent"
          loading={overview.isLoading}
        />
        <StatCard
          index={7}
          label="Inventory alerts"
          value={String((stats?.inventory.lowStock ?? 0) + (stats?.inventory.expiringSoon ?? 0))}
          icon={AlertTriangle}
          hint={`${stats?.inventory.lowStock ?? 0} low · ${stats?.inventory.expiringSoon ?? 0} expiring`}
          tone={
            (stats?.inventory.lowStock ?? 0) + (stats?.inventory.expiringSoon ?? 0) > 0
              ? 'warning'
              : 'success'
          }
          loading={overview.isLoading}
        />
      </div>

      {/* ── Revenue ──────────────────────────────────────────────────── */}
      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Revenue</CardTitle>
              <p className="mt-0.5 text-sm text-ink-muted">
                Completed orders over the last {rangeDays} days
              </p>
            </div>
            <Select value={String(rangeDays)} onValueChange={(value) => setRangeDays(Number(value))}>
              <SelectTrigger size="sm" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {revenue.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenue.data ?? []} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_COLORS.brand} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={CHART_COLORS.brand} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      {...AXIS_PROPS}
                      tickFormatter={(value: string) =>
                        new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                      }
                      minTickGap={24}
                    />
                    <YAxis {...AXIS_PROPS} tickFormatter={currencyTick} width={56} />
                    <Tooltip
                      content={
                        <ChartTooltip
                          currencyKeys={['revenue']}
                          labelFormatter={(value) =>
                            new Date(String(value)).toLocaleDateString('en-IN', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                            })
                          }
                        />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue"
                      stroke={CHART_COLORS.brand}
                      strokeWidth={2}
                      fill="url(#revenueFill)"
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Order mix ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Order mix</CardTitle>
            <p className="mt-0.5 text-sm text-ink-muted">Last 30 days</p>
          </CardHeader>
          <CardContent>
            {orderMix.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (orderMix.data?.length ?? 0) === 0 ? (
              <EmptyState title="No orders yet" description="Order types will appear here." />
            ) : (
              <>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={orderMix.data ?? []}
                        dataKey="orderCount"
                        nameKey="type"
                        innerRadius="58%"
                        outerRadius="86%"
                        paddingAngle={3}
                        strokeWidth={0}
                      >
                        {(orderMix.data ?? []).map((entry, index) => (
                          <Cell key={entry.type} fill={CHART_SERIES[index % CHART_SERIES.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip currencyKeys={['revenue']} />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ChartLegend
                  className="mt-4 justify-center"
                  items={(orderMix.data ?? []).map((entry, index) => ({
                    label: titleCase(entry.type),
                    color: CHART_SERIES[index % CHART_SERIES.length] as string,
                    value: entry.orderCount,
                  }))}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Dishes and activity ──────────────────────────────────────── */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Best sellers</CardTitle>
              <p className="mt-0.5 text-sm text-ink-muted">By quantity sold, last 30 days</p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/menu">
                Menu
                <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {dishes.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (dishes.data?.length ?? 0) === 0 ? (
              <EmptyState
                icon={<Utensils />}
                title="No sales yet"
                description="Once orders come through, your best sellers show up here."
              />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={dishes.data ?? []}
                    layout="vertical"
                    margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                  >
                    <XAxis type="number" {...AXIS_PROPS} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      {...AXIS_PROPS}
                      width={132}
                      tickFormatter={(value: string) =>
                        value.length > 18 ? `${value.slice(0, 17)}…` : value
                      }
                    />
                    <Tooltip
                      cursor={{ fill: 'var(--surface-hover)' }}
                      content={<ChartTooltip currencyKeys={['revenue']} />}
                    />
                    <Bar
                      dataKey="quantitySold"
                      name="Sold"
                      fill={CHART_COLORS.accent}
                      radius={[0, 6, 6, 0]}
                      maxBarSize={22}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle>Live activity</CardTitle>
            {isManagement && (
              <Button variant="ghost" size="sm" asChild>
                <Link to="/analytics">
                  Replay
                  <ArrowRight />
                </Link>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {activity.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="flex gap-3">
                    <Skeleton className="size-2 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-2.5 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (activity.data?.length ?? 0) === 0 ? (
              <EmptyState title="Nothing yet today" description="Activity appears here as service runs." />
            ) : (
              <ol className="relative space-y-4 before:absolute before:left-[3px] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-line">
                {(activity.data ?? []).map((entry) => (
                  <li key={entry.id} className="relative flex gap-3 pl-4">
                    <span
                      className="absolute left-0 top-1.5 size-[7px] rounded-full ring-2 ring-surface"
                      style={{ backgroundColor: activityColor(entry.action) }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-snug text-ink">{entry.description}</p>
                      <p className="mt-0.5 text-[11px] text-ink-subtle">
                        {formatRelativeTime(entry.occurredAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Kitchen pressure ─────────────────────────────────────────── */}
      {(stats?.kitchen.activeTickets ?? 0) > 0 && (
        <Card className="mt-4">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-xl bg-info-soft text-info">
                <Timer className="size-5" />
              </span>
              <div>
                <p className="font-semibold text-ink">
                  {stats?.kitchen.activeTickets} ticket
                  {stats?.kitchen.activeTickets === 1 ? '' : 's'} in the kitchen
                </p>
                <p className="text-sm text-ink-muted">
                  Average wait {formatDuration(stats?.kitchen.averageWaitMinutes ?? 0)}
                  {(stats?.kitchen.delayedTickets ?? 0) > 0 && (
                    <>
                      {' · '}
                      <span className="font-medium text-danger">
                        {stats?.kitchen.delayedTickets} over 25 minutes
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(stats?.kitchen.delayedTickets ?? 0) > 0 && (
                <Badge tone="danger" dot>
                  Attention needed
                </Badge>
              )}
              <Button variant="secondary" asChild>
                <Link to="/kitchen">
                  Open kitchen
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Colour-codes the timeline dot by what kind of event it was. */
function activityColor(action: string): string {
  if (action.includes('cancel')) return CHART_COLORS.rose;
  if (action.includes('settled') || action.includes('completed')) return CHART_COLORS.brand;
  if (action.includes('ready')) return CHART_COLORS.info;
  if (action.includes('created')) return CHART_COLORS.accent;
  return CHART_COLORS.slate;
}
