import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Armchair,
  ArrowRight,
  ChefHat,
  Clock,
  IndianRupee,
  Receipt,
  Timer,
  UserRound,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge, TABLE_STATUS_TONE } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/shared/PageHeader';
import { QUERY_KEYS } from '@/constants/socketEvents';
import { getErrorMessage } from '@/services/api';
import { tableService, userService } from '@/services';
import { cn, formatCurrency, formatDuration, titleCase } from '@/lib/utils';
import type { RestaurantTable, TableStatus } from '@/types';

const STATUS_STYLES: Record<TableStatus, { chip: string; ring: string; label: string }> = {
  available: {
    chip: 'bg-success-soft text-success-soft-ink border-success/30',
    ring: 'ring-success/40 hover:ring-success',
    label: 'Available',
  },
  occupied: {
    chip: 'bg-info-soft text-info-soft-ink border-info/30',
    ring: 'ring-info/40 hover:ring-info',
    label: 'Occupied',
  },
  reserved: {
    chip: 'bg-accent-soft text-accent-soft-ink border-accent/30',
    ring: 'ring-accent/40 hover:ring-accent',
    label: 'Reserved',
  },
  cleaning: {
    chip: 'bg-warning-soft text-warning-soft-ink border-warning/30',
    ring: 'ring-warning/40 hover:ring-warning',
    label: 'Cleaning',
  },
};

const STATUS_ORDER: TableStatus[] = ['available', 'occupied', 'reserved', 'cleaning'];

export default function FloorPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [section, setSection] = useState('all');
  const [selected, setSelected] = useState<RestaurantTable | null>(null);

  const tables = useQuery({
    queryKey: QUERY_KEYS.tables,
    queryFn: () => tableService.list(),
    refetchInterval: 45_000,
  });

  const waitTime = useQuery({
    queryKey: QUERY_KEYS.waitTime,
    queryFn: tableService.waitTime,
    refetchInterval: 60_000,
  });

  const waiters = useQuery({
    queryKey: [...QUERY_KEYS.users, 'floor'],
    queryFn: () => userService.assignable('floor'),
    staleTime: 5 * 60_000,
  });

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tables });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.waitTime });
  };

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TableStatus }) =>
      tableService.setStatus(id, status),
    onSuccess: (updated) => {
      toast.success(`Table ${updated.label} is now ${updated.status}`);
      setSelected(null);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not change the table status')),
  });

  const assignWaiter = useMutation({
    mutationFn: ({ id, waiterId }: { id: string; waiterId: string | null }) =>
      tableService.assignWaiter(id, waiterId),
    onSuccess: () => {
      toast.success('Waiter updated');
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not assign the waiter')),
  });

  const sections = useMemo(() => {
    const unique = new Set((tables.data ?? []).map((table) => table.section));
    return ['all', ...[...unique].sort()];
  }, [tables.data]);

  const visible = useMemo(
    () =>
      (tables.data ?? []).filter((table) => section === 'all' || table.section === section),
    [tables.data, section],
  );

  const counts = useMemo(() => {
    const base: Record<TableStatus, number> = {
      available: 0,
      occupied: 0,
      reserved: 0,
      cleaning: 0,
    };
    for (const table of tables.data ?? []) base[table.status] += 1;
    return base;
  }, [tables.data]);

  if (tables.isError) {
    return (
      <>
        <PageHeader title="Floor" />
        <ErrorState onRetry={() => void tables.refetch()} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Floor"
        description="Tap a table to open its order, change status or reassign a waiter."
        actions={
          <>
            <Select value={section} onValueChange={setSection}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sections.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name === 'all' ? 'All sections' : name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button asChild>
              <Link to="/orders/new">New order</Link>
            </Button>
          </>
        }
      />

      {/* ── Status summary + smart wait time ─────────────────────────── */}
      <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STATUS_ORDER.map((status) => (
            <Card key={status} className="p-4">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'size-2.5 rounded-full',
                    status === 'available' && 'bg-success',
                    status === 'occupied' && 'bg-info',
                    status === 'reserved' && 'bg-accent',
                    status === 'cleaning' && 'bg-warning',
                  )}
                />
                <span className="text-xs font-medium text-ink-muted">
                  {STATUS_STYLES[status].label}
                </span>
              </div>
              <p className="mt-1.5 text-2xl font-semibold tabular text-ink">{counts[status]}</p>
            </Card>
          ))}
        </div>

        <Card className="min-w-[15rem] bg-gradient-to-br from-brand-soft to-transparent p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-ink-muted">
            <Timer className="size-3.5" />
            Smart wait time
          </div>
          {waitTime.isLoading ? (
            <Skeleton className="mt-2 h-8 w-24" />
          ) : (
            <>
              <p className="mt-1 text-3xl font-semibold tabular text-ink">
                {waitTime.data?.estimatedMinutes ?? 0}
                <span className="ml-1 text-base font-medium text-ink-muted">min</span>
              </p>
              <p className="mt-1 text-[11px] text-ink-subtle">
                {waitTime.data?.confidence} confidence · {waitTime.data?.occupancyRate ?? 0}% full
                {(waitTime.data?.breakdown.pendingOrders ?? 0) > 0 &&
                  ` · ${waitTime.data?.breakdown.pendingOrders} in kitchen`}
              </p>
            </>
          )}
        </Card>
      </div>

      {/* ── Floor plan ───────────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {tables.isLoading ? (
            <div className="grid gap-4 p-6 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 10 }).map((_, index) => (
                <Skeleton key={index} className="h-28 rounded-2xl" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              className="m-6 border-0"
              icon={<Armchair />}
              title="No tables in this section"
              description="Add tables from Settings to build your floor plan."
            />
          ) : (
            <div className="grid-texture relative min-h-[26rem] p-5">
              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {visible.map((table, index) => {
                  const styles = STATUS_STYLES[table.status];

                  return (
                    <motion.button
                      key={table.id}
                      type="button"
                      onClick={() => setSelected(table)}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.24, delay: Math.min(index * 0.02, 0.3) }}
                      whileHover={{ y: -3 }}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        'group relative flex flex-col rounded-2xl border bg-surface p-4 text-left',
                        'shadow-xs ring-2 transition-all hover:shadow-md',
                        styles.chip,
                        styles.ring,
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-lg font-semibold tracking-tight text-ink">
                          {table.label}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] font-medium text-ink-muted">
                          <Users className="size-3" />
                          {table.capacity}
                        </span>
                      </div>

                      <span className="mt-0.5 text-[11px] text-ink-subtle">{table.section}</span>

                      <div className="mt-auto pt-3">
                        {table.activeOrder ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-[11px] font-medium text-ink-muted">
                                {table.activeOrder.orderNumber}
                              </span>
                              <span className="shrink-0 text-xs font-semibold tabular text-ink">
                                {formatCurrency(table.activeOrder.total)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-ink-subtle">
                              <Clock className="size-3" />
                              {formatDuration(table.activeOrder.minutesSeated)} seated
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] font-medium capitalize text-ink-muted">
                            {styles.label}
                          </span>
                        )}

                        {table.assignedWaiterName && (
                          <div className="mt-1.5 flex items-center gap-1 text-[11px] text-ink-subtle">
                            <UserRound className="size-3" />
                            <span className="truncate">{table.assignedWaiterName}</span>
                          </div>
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Table detail ─────────────────────────────────────────────── */}
      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <DialogTitle>Table {selected.label}</DialogTitle>
                  <Badge tone={TABLE_STATUS_TONE[selected.status]} dot>
                    {titleCase(selected.status)}
                  </Badge>
                </div>
                <DialogDescription>
                  {selected.section} · seats {selected.capacity}
                </DialogDescription>
              </DialogHeader>

              <DialogBody className="space-y-5">
                {selected.activeOrder ? (
                  <div className="rounded-xl border border-line bg-surface-sunken p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          {selected.activeOrder.orderNumber}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {titleCase(selected.activeOrder.status)} ·{' '}
                          {selected.activeOrder.guestCount} guest
                          {selected.activeOrder.guestCount === 1 ? '' : 's'} ·{' '}
                          {formatDuration(selected.activeOrder.minutesSeated)}
                        </p>
                      </div>
                      <p className="text-lg font-semibold tabular text-ink">
                        {formatCurrency(selected.activeOrder.total)}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => navigate(`/orders/${selected.activeOrder?.id}`)}
                      >
                        <Receipt />
                        Open order
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-line bg-surface-sunken/60 p-5 text-center">
                    <ChefHat className="mx-auto size-5 text-ink-subtle" />
                    <p className="mt-2 text-sm font-medium text-ink">No open order</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      Start a new one to seat this table.
                    </p>
                    <Button
                      size="sm"
                      className="mt-3"
                      onClick={() => navigate(`/orders/new?tableId=${selected.id}`)}
                    >
                      <IndianRupee />
                      Start order
                      <ArrowRight />
                    </Button>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                    Assigned waiter
                  </p>
                  <Select
                    value={selected.assignedWaiterId ?? 'none'}
                    onValueChange={(value) =>
                      assignWaiter.mutate({
                        id: selected.id,
                        waiterId: value === 'none' ? null : value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nobody assigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nobody assigned</SelectItem>
                      {(waiters.data ?? []).map((waiter) => (
                        <SelectItem key={waiter.id} value={waiter.id}>
                          {waiter.name} · {titleCase(waiter.role)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                    Change status
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {STATUS_ORDER.map((status) => (
                      <Button
                        key={status}
                        variant={selected.status === status ? 'primary' : 'secondary'}
                        size="sm"
                        disabled={selected.status === status || setStatus.isPending}
                        onClick={() => setStatus.mutate({ id: selected.id, status })}
                      >
                        {STATUS_STYLES[status].label}
                      </Button>
                    ))}
                  </div>
                  {selected.status === 'occupied' && selected.activeOrder && (
                    <p className="text-[11px] text-ink-subtle">
                      The open order must be settled or cancelled before this table can be freed.
                    </p>
                  )}
                </div>
              </DialogBody>

              <DialogFooter>
                <Button variant="secondary" onClick={() => setSelected(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
