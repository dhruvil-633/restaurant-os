import { useEffect, useMemo, useState } from 'react';
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
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ChefHat,
  Clock,
  Flame,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, Progress, Skeleton } from '@/components/ui/feedback';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/PageHeader';
import {
  AXIS_PROPS,
  CHART_COLORS,
  CHART_SERIES,
  ChartLegend,
  ChartTooltip,
  currencyTick,
  hourLabel,
} from '@/components/charts/chartTheme';
import { useHotkey } from '@/hooks';
import { cn, formatCurrency, formatDuration, formatTime, titleCase } from '@/lib/utils';
import { analyticsService } from '@/services';

const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '60', label: 'Last 60 days' },
  { value: '90', label: 'Last 90 days' },
];

function rangeParams(days: string): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - Number(days));
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function AnalyticsPage() {
  const [range, setRange] = useState('30');
  const params = useMemo(() => rangeParams(range), [range]);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="The numbers behind the service — where time, money and food are going."
        actions={
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <Tabs defaultValue="health">
        <TabsList>
          <TabsTrigger value="health">
            <Gauge />
            Health score
          </TabsTrigger>
          <TabsTrigger value="kitchen">
            <ChefHat />
            Kitchen heatmap
          </TabsTrigger>
          <TabsTrigger value="peak">
            <TrendingUp />
            Peak hours
          </TabsTrigger>
          <TabsTrigger value="waste">
            <Trash2 />
            Waste
          </TabsTrigger>
          <TabsTrigger value="replay">
            <Activity />
            Replay
          </TabsTrigger>
        </TabsList>

        <TabsContent value="health">
          <HealthScoreTab params={params} />
        </TabsContent>
        <TabsContent value="kitchen">
          <KitchenHeatmapTab params={params} />
        </TabsContent>
        <TabsContent value="peak">
          <PeakHoursTab params={params} />
        </TabsContent>
        <TabsContent value="waste">
          <WasteTab params={params} />
        </TabsContent>
        <TabsContent value="replay">
          <ReplayTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

/* ── 5 · Restaurant Health Score ─────────────────────────────────────────── */

function HealthScoreTab({ params }: { params: { from: string; to: string } }) {
  const health = useQuery({
    queryKey: ['analytics', 'health', params],
    queryFn: () => analyticsService.healthScore(params),
  });

  if (health.isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (!health.data) return <EmptyState title="No data for this period" />;

  const data = health.data;
  const gradeTone =
    data.score >= 80 ? 'success' : data.score >= 65 ? 'brand' : data.score >= 50 ? 'warning' : 'danger';

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col items-center p-6 text-center">
          {/* Radial gauge drawn with a rotated conic gradient. */}
          <div className="relative flex size-44 items-center justify-center">
            <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-sunken)" strokeWidth="12" />
              <motion.circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke={
                  gradeTone === 'success'
                    ? CHART_COLORS.brand
                    : gradeTone === 'warning'
                      ? CHART_COLORS.amber
                      : gradeTone === 'danger'
                        ? CHART_COLORS.rose
                        : CHART_COLORS.info
                }
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 52}
                initial={{ strokeDashoffset: 2 * Math.PI * 52 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 52 * (1 - data.score / 100) }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              />
            </svg>
            <div>
              <p className="text-5xl font-semibold tabular text-ink">{data.score}</p>
              <p className="text-xs text-ink-subtle">out of 100</p>
            </div>
          </div>

          <Badge tone={gradeTone} className="mt-4">
            Grade {data.grade} · {titleCase(data.status)}
          </Badge>

          {data.focusArea && (
            <div className="mt-5 w-full rounded-xl bg-surface-sunken p-3.5 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                Where to focus
              </p>
              <p className="mt-1 text-sm font-medium text-ink">{data.focusArea.label}</p>
              <p className="mt-0.5 text-xs text-ink-muted">{data.focusArea.detail}</p>
            </div>
          )}

          <dl className="mt-5 grid w-full grid-cols-2 gap-3 border-t border-line pt-4 text-left">
            <div>
              <dt className="text-[11px] text-ink-subtle">Revenue</dt>
              <dd className="text-sm font-semibold tabular text-ink">
                {formatCurrency(data.context.revenue, { compact: true })}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-ink-subtle">Completed orders</dt>
              <dd className="text-sm font-semibold tabular text-ink">
                {data.context.completedOrders}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-ink-subtle">Previous period</dt>
              <dd className="text-sm font-semibold tabular text-ink">
                {formatCurrency(data.context.previousRevenue, { compact: true })}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-ink-subtle">Cancellations</dt>
              <dd className="text-sm font-semibold tabular text-ink">
                {data.context.cancellationRate}%
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How the score breaks down</CardTitle>
          <p className="mt-0.5 text-sm text-ink-muted">
            Five weighted pillars, so one strong area cannot mask a weak one.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {data.pillars.map((pillar, index) => {
            const ratio = pillar.max > 0 ? (pillar.score / pillar.max) * 100 : 0;
            return (
              <motion.div
                key={pillar.key}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.06 }}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-ink">{pillar.label}</p>
                  <p className="shrink-0 text-sm tabular text-ink-muted">
                    <span className="font-semibold text-ink">{pillar.score}</span> / {pillar.max}
                  </p>
                </div>
                <Progress
                  value={ratio}
                  className="mt-2"
                  tone={ratio >= 75 ? 'success' : ratio >= 50 ? 'warning' : 'danger'}
                />
                <p className="mt-1.5 text-xs text-ink-subtle">{pillar.detail}</p>
              </motion.div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── 2 · Kitchen Heatmap ─────────────────────────────────────────────────── */

function KitchenHeatmapTab({ params }: { params: { from: string; to: string } }) {
  const heatmap = useQuery({
    queryKey: ['analytics', 'kitchen', params],
    queryFn: () => analyticsService.kitchenHeatmap(params),
  });

  if (heatmap.isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (!heatmap.data || heatmap.data.dishes.length === 0) {
    return (
      <EmptyState
        icon={<ChefHat />}
        title="Not enough timed tickets yet"
        description="The heatmap needs orders that recorded both a start and a ready time."
      />
    );
  }

  const data = heatmap.data;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SmallStat label="Average ticket" value={formatDuration(data.summary.averageMinutes)} />
        <SmallStat label="Slowest ticket" value={formatDuration(data.summary.slowestMinutes)} tone="text-danger" />
        <SmallStat label="Tickets measured" value={String(data.summary.ticketCount)} />
        <SmallStat
          label="Slowest hour"
          value={data.summary.slowestHour !== null ? `${hourLabel(data.summary.slowestHour)}` : '—'}
          tone="text-accent"
        />
      </div>

      {data.bottlenecks.length > 0 && (
        <Card className="border-danger/25 bg-danger-soft/25">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="size-4 text-danger" />
              Biggest bottlenecks
            </CardTitle>
            <p className="mt-0.5 text-sm text-ink-muted">
              Ranked by total minutes lost across the period, not just the worst single ticket.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.bottlenecks.map((dish) => (
              <div key={dish.name} className="rounded-xl border border-line bg-surface p-3.5">
                <p className="truncate text-sm font-medium text-ink">{dish.name}</p>
                <p className="mt-1 text-2xl font-semibold tabular text-danger">
                  +{formatDuration(dish.delayMinutes)}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-subtle">
                  per serving · {formatDuration(dish.cumulativeDelayMinutes)} lost over{' '}
                  {dish.timesCooked} orders
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Expected vs actual, by dish</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.dishes.slice(0, 12)} margin={{ top: 8, right: 8, left: -16, bottom: 60 }}>
                <XAxis
                  dataKey="name"
                  {...AXIS_PROPS}
                  angle={-40}
                  textAnchor="end"
                  height={80}
                  interval={0}
                  tickFormatter={(value: string) =>
                    value.length > 14 ? `${value.slice(0, 13)}…` : value
                  }
                />
                <YAxis {...AXIS_PROPS} unit="m" width={44} />
                <Tooltip cursor={{ fill: 'var(--surface-hover)' }} content={<ChartTooltip />} />
                <Bar dataKey="expectedMinutes" name="Expected" fill={CHART_COLORS.slate} radius={[4, 4, 0, 0]} />
                <Bar dataKey="actualMinutes" name="Actual" radius={[4, 4, 0, 0]}>
                  {data.dishes.slice(0, 12).map((dish) => (
                    <Cell
                      key={dish.name}
                      fill={
                        dish.heat === 'red'
                          ? CHART_COLORS.rose
                          : dish.heat === 'amber'
                            ? CHART_COLORS.amber
                            : CHART_COLORS.brand
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ChartLegend
            className="mt-3 justify-center"
            items={[
              { label: 'On time', color: CHART_COLORS.brand },
              { label: 'Slipping', color: CHART_COLORS.amber },
              { label: 'Overdue', color: CHART_COLORS.rose },
              { label: 'Expected', color: CHART_COLORS.slate },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pressure through the day</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {data.byHour.map((hour) => (
              <div
                key={hour.hour}
                className={cn(
                  'flex min-w-[4.5rem] flex-1 flex-col items-center rounded-lg border px-2 py-2.5',
                  hour.heat === 'red'
                    ? 'border-danger/40 bg-danger-soft'
                    : hour.heat === 'amber'
                      ? 'border-warning/40 bg-warning-soft'
                      : 'border-success/30 bg-success-soft',
                )}
                title={`${hour.ticketCount} tickets, ${hour.averageMinutes} min average`}
              >
                <span className="text-[10px] font-medium text-ink-muted">{hourLabel(hour.hour)}</span>
                <span className="mt-0.5 text-sm font-semibold tabular text-ink">
                  {hour.averageMinutes}m
                </span>
                <span className="text-[10px] text-ink-subtle">{hour.ticketCount} tix</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── 6 · Peak Hour Analytics ─────────────────────────────────────────────── */

function PeakHoursTab({ params }: { params: { from: string; to: string } }) {
  const peak = useQuery({
    queryKey: ['analytics', 'peak', params],
    queryFn: () => analyticsService.peakHours(params),
  });

  if (peak.isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (!peak.data || peak.data.grid.length === 0) {
    return <EmptyState icon={<TrendingUp />} title="No completed orders in this period" />;
  }

  const data = peak.data;
  const maxRevenue = Math.max(...data.grid.map((cell) => cell.revenue), 1);
  const hours = [...new Set(data.grid.map((cell) => cell.hour))].sort((a, b) => a - b);
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SmallStat
          label="Peak slot"
          value={
            data.insights.peakSlot
              ? `${data.insights.peakSlot.weekdayName.slice(0, 3)} ${hourLabel(data.insights.peakSlot.hour)}`
              : '—'
          }
          tone="text-brand"
        />
        <SmallStat
          label="Busiest hour"
          value={data.insights.peakHour !== null ? hourLabel(data.insights.peakHour) : '—'}
        />
        <SmallStat label="Busiest day" value={data.insights.busiestDay ?? '—'} tone="text-accent" />
        <SmallStat label="Quietest day" value={data.insights.quietestDay ?? '—'} tone="text-ink-muted" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue heatmap</CardTitle>
          <p className="mt-0.5 text-sm text-ink-muted">
            Darker cells earned more. Use it to decide when to add staff and when to close a section.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[42rem]">
              <div className="flex gap-1">
                <div className="w-10 shrink-0" />
                {hours.map((hour) => (
                  <div key={hour} className="flex-1 text-center text-[10px] font-medium text-ink-subtle">
                    {hourLabel(hour)}
                  </div>
                ))}
              </div>

              {WEEKDAYS.map((day, weekdayIndex) => (
                <div key={day} className="mt-1 flex gap-1">
                  <div className="flex w-10 shrink-0 items-center text-[11px] font-medium text-ink-muted">
                    {day}
                  </div>
                  {hours.map((hour) => {
                    const cell = data.grid.find(
                      (entry) => entry.weekday === weekdayIndex && entry.hour === hour,
                    );
                    const intensity = cell ? cell.revenue / maxRevenue : 0;

                    return (
                      <div
                        key={`${day}-${hour}`}
                        className="group relative h-9 flex-1 rounded transition-transform hover:scale-110 hover:z-10"
                        style={{
                          backgroundColor:
                            intensity > 0
                              ? `color-mix(in srgb, ${CHART_COLORS.brand} ${Math.round(intensity * 100)}%, var(--surface-sunken))`
                              : 'var(--surface-sunken)',
                        }}
                        title={
                          cell
                            ? `${day} ${hourLabel(hour)} · ${formatCurrency(cell.revenue)} · ${cell.orderCount} orders`
                            : `${day} ${hourLabel(hour)} · no orders`
                        }
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2 text-[11px] text-ink-subtle">
            <span>Quiet</span>
            <div className="h-2.5 w-28 rounded-full bg-gradient-to-r from-[var(--surface-sunken)] to-brand" />
            <span>Busy</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue by hour</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.byHour} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="hourFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.accent} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={CHART_COLORS.accent} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="hour" {...AXIS_PROPS} tickFormatter={hourLabel} />
                  <YAxis {...AXIS_PROPS} tickFormatter={currencyTick} width={56} />
                  <Tooltip
                    content={
                      <ChartTooltip
                        currencyKeys={['revenue', 'averageOrderValue']}
                        labelFormatter={(value) => hourLabel(Number(value))}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke={CHART_COLORS.accent}
                    strokeWidth={2}
                    fill="url(#hourFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue by day</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byWeekday} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <XAxis
                    dataKey="weekdayName"
                    {...AXIS_PROPS}
                    tickFormatter={(value: string) => value.slice(0, 3)}
                  />
                  <YAxis {...AXIS_PROPS} tickFormatter={currencyTick} width={56} />
                  <Tooltip
                    cursor={{ fill: 'var(--surface-hover)' }}
                    content={<ChartTooltip currencyKeys={['revenue']} />}
                  />
                  <Bar dataKey="revenue" name="Revenue" fill={CHART_COLORS.brand} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ── 4 · Waste Analytics ─────────────────────────────────────────────────── */

function WasteTab({ params }: { params: { from: string; to: string } }) {
  const waste = useQuery({
    queryKey: ['analytics', 'waste', params],
    queryFn: () => analyticsService.waste(params),
  });

  if (waste.isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (!waste.data || waste.data.summary.incidents === 0) {
    return (
      <EmptyState
        icon={<Trash2 />}
        title="No waste recorded"
        description="Log waste from the Inventory screen to build this picture."
      />
    );
  }

  const data = waste.data;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SmallStat label="Total written off" value={formatCurrency(data.summary.totalValue)} tone="text-danger" />
        <SmallStat label="Per day" value={formatCurrency(data.summary.averagePerDay)} />
        <SmallStat label="Share of revenue" value={`${data.summary.percentOfRevenue}%`} tone="text-accent" />
        <SmallStat
          label="If this continues"
          value={`${formatCurrency(data.summary.projectedMonthlyLoss)}/mo`}
          tone="text-danger"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Why food is being thrown away</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.byReason}
                    dataKey="value"
                    nameKey="reason"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {data.byReason.map((entry, index) => (
                      <Cell key={entry.reason} fill={CHART_SERIES[index % CHART_SERIES.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip currencyKeys={['value']} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-2">
              {data.byReason.map((reason, index) => (
                <div key={reason.reason} className="flex items-center gap-2.5 text-sm">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: CHART_SERIES[index % CHART_SERIES.length] }}
                  />
                  <span className="flex-1 text-ink-muted">{titleCase(reason.reason)}</span>
                  <span className="tabular text-ink-subtle">{reason.share}%</span>
                  <span className="w-20 text-right font-semibold tabular text-ink">
                    {formatCurrency(reason.value)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Worst offenders</CardTitle>
            <p className="mt-0.5 text-sm text-ink-muted">By money lost</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.byIngredient.slice(0, 8).map((ingredient) => {
              const share =
                data.summary.totalValue > 0
                  ? (ingredient.value / data.summary.totalValue) * 100
                  : 0;
              return (
                <div key={ingredient.ingredientId}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-sm font-medium text-ink">{ingredient.name}</p>
                    <p className="shrink-0 text-sm font-semibold tabular text-ink">
                      {formatCurrency(ingredient.value)}
                    </p>
                  </div>
                  <Progress value={share} className="mt-1.5" tone="danger" size="sm" />
                  <p className="mt-1 text-[11px] text-ink-subtle">
                    {ingredient.quantity} {ingredient.unit} across {ingredient.incidents} incidents
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Waste over time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.daily} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  {...AXIS_PROPS}
                  minTickGap={24}
                  tickFormatter={(value: string) =>
                    new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                  }
                />
                <YAxis {...AXIS_PROPS} tickFormatter={currencyTick} width={56} />
                <Tooltip
                  cursor={{ fill: 'var(--surface-hover)' }}
                  content={<ChartTooltip currencyKeys={['value']} />}
                />
                <Bar dataKey="value" name="Value lost" fill={CHART_COLORS.rose} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── 1 · Restaurant Replay ───────────────────────────────────────────────── */

function ReplayTab() {
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [speed, setSpeed] = useState(4);

  const replay = useQuery({
    queryKey: ['analytics', 'replay'],
    queryFn: () => analyticsService.replay({ limit: 400 }),
  });

  const events = replay.data?.events ?? [];

  useHotkey(' ', () => setPlaying((value) => !value));

  // Advances the scrubber while playing, stopping at the end of the stream.
  useEffect(() => {
    if (!playing) return undefined;

    const timer = window.setInterval(() => {
      setCursor((value) => {
        if (value >= events.length) {
          setPlaying(false);
          return events.length;
        }
        return value + 1;
      });
    }, 1000 / speed);

    return () => window.clearInterval(timer);
  }, [playing, speed, events.length]);

  if (replay.isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (events.length === 0) {
    return (
      <EmptyState
        icon={<Activity />}
        title="No events in the last 12 hours"
        description="Replay reconstructs service from the activity log as orders move through the floor."
      />
    );
  }

  const visible = events.slice(0, cursor || events.length).slice(-40).reverse();
  const progress = events.length > 0 ? ((cursor || events.length) / events.length) * 100 : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                onClick={() => {
                  if (cursor >= events.length) setCursor(0);
                  setPlaying((value) => !value);
                }}
                aria-label={playing ? 'Pause' : 'Play'}
              >
                {playing ? <Pause /> : <Play />}
              </Button>
              <Button
                variant="secondary"
                size="icon"
                onClick={() => {
                  setCursor(0);
                  setPlaying(false);
                }}
                aria-label="Restart"
              >
                <RotateCcw />
              </Button>
              <Select value={String(speed)} onValueChange={(value) => setSpeed(Number(value))}>
                <SelectTrigger size="sm" className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2×</SelectItem>
                  <SelectItem value="4">4×</SelectItem>
                  <SelectItem value="8">8×</SelectItem>
                  <SelectItem value="16">16×</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 flex-1">
              <input
                type="range"
                min={0}
                max={events.length}
                value={cursor || events.length}
                onChange={(event) => {
                  setCursor(Number(event.target.value));
                  setPlaying(false);
                }}
                className="w-full accent-[var(--brand)]"
                aria-label="Replay position"
              />
              <div className="mt-1 flex justify-between text-[11px] text-ink-subtle">
                <span>{formatTime(replay.data?.from)}</span>
                <span className="font-medium text-ink">
                  {cursor || events.length} of {events.length} events
                </span>
                <span>{formatTime(replay.data?.to)}</span>
              </div>
            </div>
          </div>

          <Progress value={progress} className="mt-3" />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
        <Card className="max-h-[32rem] overflow-y-auto">
          <CardHeader className="sticky top-0 z-10 bg-surface">
            <CardTitle>Event stream</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2.5">
              <AnimatePresence initial={false}>
                {visible.map((event) => (
                  <motion.li
                    key={event.id}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex gap-3 rounded-lg border border-line px-3 py-2.5"
                  >
                    <span
                      className="mt-1.5 size-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: event.action.includes('cancel')
                          ? CHART_COLORS.rose
                          : event.action.includes('settled')
                            ? CHART_COLORS.brand
                            : event.action.includes('ready')
                              ? CHART_COLORS.info
                              : CHART_COLORS.accent,
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-snug text-ink">{event.description}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-subtle">
                        <Clock className="size-3" />
                        {formatTime(event.occurredAt)}
                        <span>·</span>
                        {titleCase(event.entityType)}
                      </p>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Activity mix</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(replay.data?.byCategory ?? []).map((category, index) => (
              <div key={category.entityType}>
                <div className="flex justify-between text-sm">
                  <span className="text-ink-muted">{titleCase(category.entityType)}</span>
                  <span className="font-semibold tabular text-ink">{category.count}</span>
                </div>
                <Progress
                  value={
                    replay.data?.totalEvents
                      ? (category.count / replay.data.totalEvents) * 100
                      : 0
                  }
                  size="sm"
                  className="mt-1.5"
                  tone={index === 0 ? 'brand' : index === 1 ? 'accent' : 'info'}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SmallStat({
  label,
  value,
  tone = 'text-ink',
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className={cn('mt-1 text-xl font-semibold tabular', tone)}>{value}</p>
    </Card>
  );
}
