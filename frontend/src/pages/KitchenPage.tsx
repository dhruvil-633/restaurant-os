import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlarmClock,
  Check,
  ChefHat,
  CircleDot,
  Flame,
  PartyPopper,
  Play,
  Utensils,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { PageHeader } from '@/components/shared/PageHeader';
import { QUERY_KEYS } from '@/constants/socketEvents';
import { useNow } from '@/hooks';
import { cn, formatDuration, titleCase } from '@/lib/utils';
import { getErrorMessage } from '@/services/api';
import { kitchenService, orderService } from '@/services';
import type { KitchenTicket } from '@/types';

const HEAT_STYLES = {
  green: {
    card: 'border-success/30 bg-success-soft/30',
    bar: 'bg-success',
    text: 'text-success-soft-ink',
    label: 'On time',
  },
  amber: {
    card: 'border-warning/40 bg-warning-soft/40',
    bar: 'bg-warning',
    text: 'text-warning-soft-ink',
    label: 'Closing in',
  },
  red: {
    card: 'border-danger/50 bg-danger-soft/40',
    bar: 'bg-danger',
    text: 'text-danger-soft-ink',
    label: 'Overdue',
  },
} as const;

type Lane = 'pending' | 'cooking' | 'ready';

const LANES: { key: Lane; title: string; icon: typeof Flame; hint: string }[] = [
  { key: 'pending', title: 'Queued', icon: CircleDot, hint: 'Waiting to start' },
  { key: 'cooking', title: 'Cooking', icon: Flame, hint: 'On the pass' },
  { key: 'ready', title: 'Ready', icon: PartyPopper, hint: 'Waiting for service' },
];

export default function KitchenPage() {
  const queryClient = useQueryClient();
  const now = useNow(15_000);
  const [busyId, setBusyId] = useState<string | null>(null);

  const queue = useQuery({
    queryKey: QUERY_KEYS.kitchenQueue,
    queryFn: kitchenService.queue,
    // Sockets push most changes, but a slow poll catches anything missed
    // while a tab was backgrounded.
    refetchInterval: 30_000,
  });

  const advance = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      orderService.setStatus(id, status),
    onMutate: ({ id }) => setBusyId(id),
    onSettled: () => setBusyId(null),
    onSuccess: (order) => {
      toast.success(`${order.orderNumber} → ${titleCase(order.status)}`);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.kitchenQueue });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.orders });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not update the ticket')),
  });

  const lanes = useMemo(() => {
    const tickets = queue.data?.tickets ?? [];
    return {
      pending: tickets.filter((ticket) => ticket.status === 'pending'),
      cooking: tickets.filter((ticket) => ticket.status === 'cooking'),
      ready: tickets.filter((ticket) => ticket.status === 'ready'),
    };
  }, [queue.data]);

  const summary = queue.data?.summary;

  if (queue.isError) {
    return (
      <>
        <PageHeader title="Kitchen" />
        <ErrorState onRetry={() => void queue.refetch()} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Kitchen display"
        description="Tickets are ordered oldest first and turn red once they pass their prep time."
        actions={
          summary && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{summary.total} active</Badge>
              {summary.overdue > 0 && (
                <Badge tone="danger" dot>
                  {summary.overdue} overdue
                </Badge>
              )}
            </div>
          )
        }
      />

      {queue.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {LANES.map((lane) => (
            <div key={lane.key} className="space-y-3">
              <Skeleton className="h-10 w-full rounded-xl" />
              {Array.from({ length: 2 }).map((_, index) => (
                <Skeleton key={index} className="h-44 w-full rounded-2xl" />
              ))}
            </div>
          ))}
        </div>
      ) : (queue.data?.tickets.length ?? 0) === 0 ? (
        <EmptyState
          icon={<ChefHat />}
          title="The pass is clear"
          description="Every ticket has been served. New orders appear here the moment they're placed."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {LANES.map((lane) => {
            const tickets = lanes[lane.key];

            return (
              <section key={lane.key} className="flex min-w-0 flex-col">
                <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5">
                  <lane.icon
                    className={cn(
                      'size-4',
                      lane.key === 'pending' && 'text-ink-subtle',
                      lane.key === 'cooking' && 'text-info',
                      lane.key === 'ready' && 'text-brand',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{lane.title}</p>
                    <p className="text-[11px] text-ink-subtle">{lane.hint}</p>
                  </div>
                  <span className="rounded-lg bg-surface-sunken px-2 py-0.5 text-xs font-semibold tabular text-ink-muted">
                    {tickets.length}
                  </span>
                </div>

                <div className="space-y-3">
                  <AnimatePresence mode="popLayout">
                    {tickets.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-line py-8 text-center text-xs text-ink-subtle">
                        Nothing here
                      </p>
                    ) : (
                      tickets.map((ticket) => (
                        <TicketCard
                          key={ticket.id}
                          ticket={ticket}
                          now={now}
                          busy={busyId === ticket.id}
                          onAdvance={(status) => advance.mutate({ id: ticket.id, status })}
                        />
                      ))
                    )}
                  </AnimatePresence>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

interface TicketCardProps {
  ticket: KitchenTicket;
  now: Date;
  busy: boolean;
  onAdvance: (status: string) => void;
}

function TicketCard({ ticket, now, busy, onAdvance }: TicketCardProps) {
  // Recomputed from the ticking clock so the timer moves without a refetch.
  const elapsedMinutes = Math.max(
    0,
    Math.round((now.getTime() - new Date(ticket.placedAt).getTime()) / 60_000),
  );
  const overdueMinutes = Math.max(0, elapsedMinutes - ticket.expectedMinutes);
  const heat: keyof typeof HEAT_STYLES =
    overdueMinutes > 0 ? 'red' : elapsedMinutes >= ticket.expectedMinutes * 0.7 ? 'amber' : 'green';
  const styles = HEAT_STYLES[heat];

  const progress =
    ticket.expectedMinutes > 0
      ? Math.min(100, (elapsedMinutes / ticket.expectedMinutes) * 100)
      : 0;

  const next = ticket.status === 'pending' ? 'cooking' : ticket.status === 'cooking' ? 'ready' : 'served';
  const nextLabel =
    ticket.status === 'pending'
      ? 'Start cooking'
      : ticket.status === 'cooking'
        ? 'Mark ready'
        : 'Mark served';
  const NextIcon = ticket.status === 'pending' ? Play : ticket.status === 'cooking' ? Check : Utensils;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
    >
      <Card className={cn('overflow-hidden border-2', styles.card)}>
        {/* Elapsed-time bar doubles as the urgency signal. */}
        <div className="h-1 w-full bg-surface-sunken">
          <div
            className={cn('h-full transition-[width] duration-1000 ease-linear', styles.bar)}
            style={{ width: `${progress}%` }}
          />
        </div>

        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{ticket.orderNumber}</p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {ticket.tableLabel ? `Table ${ticket.tableLabel}` : titleCase(ticket.type)}
                {ticket.guestCount > 1 && ` · ${ticket.guestCount} guests`}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className={cn('text-lg font-semibold leading-none tabular', styles.text)}>
                {formatDuration(elapsedMinutes)}
              </p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
                of {formatDuration(ticket.expectedMinutes)}
              </p>
            </div>
          </div>

          {(ticket.priority === 'urgent' || ticket.priority === 'high' || overdueMinutes > 0) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {overdueMinutes > 0 && (
                <Badge tone="danger" size="sm" dot>
                  <AlarmClock className="size-3" />
                  {formatDuration(overdueMinutes)} over
                </Badge>
              )}
              {(ticket.priority === 'urgent' || ticket.priority === 'high') && (
                <Badge tone="accent" size="sm">
                  {titleCase(ticket.priority)} priority
                </Badge>
              )}
            </div>
          )}

          <ul className="mt-3 space-y-1.5 border-t border-line/70 pt-3">
            {ticket.items
              .filter((item) => item.status !== 'cancelled')
              .map((item) => (
                <li key={item.id} className="flex items-start gap-2 text-sm">
                  <span className="mt-px inline-flex min-w-[1.5rem] justify-center rounded-md bg-surface px-1 py-0.5 text-xs font-bold tabular text-ink shadow-xs">
                    {item.quantity}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block leading-snug text-ink">{item.name}</span>
                    {item.notes && (
                      <span className="mt-0.5 block text-[11px] italic leading-snug text-accent">
                        “{item.notes}”
                      </span>
                    )}
                  </span>
                </li>
              ))}
          </ul>

          {ticket.notes && (
            <p className="mt-3 rounded-lg bg-surface px-2.5 py-2 text-[11px] italic text-ink-muted">
              {ticket.notes}
            </p>
          )}

          <div className="mt-3.5 flex items-center gap-2">
            <Button
              size="sm"
              className="flex-1"
              loading={busy}
              onClick={() => onAdvance(next)}
              variant={ticket.status === 'ready' ? 'secondary' : 'primary'}
            >
              {!busy && <NextIcon />}
              {nextLabel}
            </Button>
            {ticket.chefName && (
              <span className="shrink-0 truncate text-[11px] text-ink-subtle" title={ticket.chefName}>
                {ticket.chefName.split(' ')[0]}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
