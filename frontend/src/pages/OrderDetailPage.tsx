import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Ban,
  Check,
  ChefHat,
  CircleCheck,
  Clock,
  CreditCard,
  Printer,
  Utensils,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge, ORDER_STATUS_TONE, PAYMENT_STATUS_TONE } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ErrorState, PageLoader } from '@/components/ui/feedback';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/shared/PageHeader';
import { QUERY_KEYS } from '@/constants/socketEvents';
import { cn, formatCurrency, formatDateTime, formatDuration, titleCase } from '@/lib/utils';
import { getErrorMessage } from '@/services/api';
import { orderService } from '@/services';
import { useAuthStore } from '@/store/authStore';
import type { PaymentMethod } from '@/types';

const TIMELINE = [
  { key: 'placedAt', label: 'Placed', icon: Clock },
  { key: 'cookingStartedAt', label: 'Cooking started', icon: ChefHat },
  { key: 'readyAt', label: 'Ready', icon: CircleCheck },
  { key: 'servedAt', label: 'Served', icon: Utensils },
  { key: 'completedAt', label: 'Completed', icon: Check },
] as const;

export default function OrderDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.user?.role);
  const canSettle = role === 'owner' || role === 'manager' || role === 'cashier';

  const [settleOpen, setSettleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cancelReason, setCancelReason] = useState('');
  const [discount, setDiscount] = useState<number | ''>('');

  const order = useQuery({
    queryKey: QUERY_KEYS.order(id),
    queryFn: () => orderService.get(id),
    enabled: Boolean(id),
    refetchInterval: 90_000,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.order(id) });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.orders });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tables });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.kitchenQueue });
  };

  const changeStatus = useMutation({
    mutationFn: ({ status, reason }: { status: string; reason?: string }) =>
      orderService.setStatus(id, status, reason),
    onSuccess: (updated) => {
      toast.success(`Order is now ${titleCase(updated.status)}`);
      setCancelOpen(false);
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not update the order')),
  });

  const settle = useMutation({
    mutationFn: () =>
      orderService.settle(id, paymentMethod, discount === '' ? undefined : Number(discount)),
    onSuccess: (updated) => {
      toast.success(`${updated.orderNumber} settled`, {
        description: `${formatCurrency(updated.total)} by ${titleCase(paymentMethod)}`,
      });
      setSettleOpen(false);
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not settle the order')),
  });

  if (order.isLoading) return <PageLoader label="Loading order" />;
  if (order.isError || !order.data) {
    return (
      <>
        <PageHeader title="Order" />
        <ErrorState
          title="Order not found"
          description="It may have been removed, or the link is out of date."
          onRetry={() => void order.refetch()}
        />
      </>
    );
  }

  const data = order.data;
  const isOpen = !['completed', 'cancelled'].includes(data.status);

  const nextStatus =
    data.status === 'pending'
      ? 'cooking'
      : data.status === 'cooking'
        ? 'ready'
        : data.status === 'ready'
          ? 'served'
          : data.status === 'served'
            ? 'completed'
            : null;

  return (
    <>
      <PageHeader
        title={data.orderNumber}
        description={`${titleCase(data.type)}${data.tableLabel ? ` · Table ${data.tableLabel}` : ''} · placed ${formatDateTime(data.placedAt)}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate(-1)}>
              <ArrowLeft />
              Back
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer />
              Print
            </Button>
            {isOpen && canSettle && data.paymentStatus !== 'paid' && (
              <Button onClick={() => setSettleOpen(true)}>
                <CreditCard />
                Settle bill
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-4">
          {/* ── Status ─────────────────────────────────────────────── */}
          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <Badge tone={ORDER_STATUS_TONE[data.status]} dot>
                {titleCase(data.status)}
              </Badge>
              <Badge tone={PAYMENT_STATUS_TONE[data.paymentStatus]}>
                {titleCase(data.paymentStatus)}
              </Badge>
              {data.priority !== 'normal' && (
                <Badge tone="accent">{titleCase(data.priority)} priority</Badge>
              )}
              <span className="text-sm text-ink-muted">
                {formatDuration(data.elapsedMinutes)} {isOpen ? 'open' : 'total'}
              </span>

              <div className="ml-auto flex gap-2">
                {nextStatus && (
                  <Button
                    size="sm"
                    loading={changeStatus.isPending}
                    onClick={() => changeStatus.mutate({ status: nextStatus })}
                  >
                    Mark {titleCase(nextStatus)}
                  </Button>
                )}
                {isOpen && (
                  <Button variant="secondary" size="sm" onClick={() => setCancelOpen(true)}>
                    <Ban />
                    Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Items ──────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-line">
                {data.items.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 py-3 first:pt-0">
                    <span className="mt-0.5 inline-flex min-w-[1.75rem] justify-center rounded-md bg-surface-sunken px-1.5 py-0.5 text-xs font-bold tabular text-ink">
                      {item.quantity}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'text-sm font-medium text-ink',
                          item.status === 'cancelled' && 'text-ink-subtle line-through',
                        )}
                      >
                        {item.name}
                      </p>
                      {item.notes && (
                        <p className="mt-0.5 text-xs italic text-accent">“{item.notes}”</p>
                      )}
                      <p className="mt-1 text-[11px] text-ink-subtle">
                        {formatCurrency(item.unitPrice)} each · {titleCase(item.status)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular text-ink">
                      {formatCurrency(item.lineTotal)}
                    </span>
                  </li>
                ))}
              </ul>

              <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
                <div className="flex justify-between text-ink-muted">
                  <dt>Subtotal</dt>
                  <dd className="tabular">{formatCurrency(data.subtotal)}</dd>
                </div>
                {data.discountAmount > 0 && (
                  <div className="flex justify-between text-ink-muted">
                    <dt>Discount</dt>
                    <dd className="tabular text-danger">−{formatCurrency(data.discountAmount)}</dd>
                  </div>
                )}
                <div className="flex justify-between text-ink-muted">
                  <dt>Tax</dt>
                  <dd className="tabular">{formatCurrency(data.taxAmount)}</dd>
                </div>
                <div className="flex justify-between border-t border-line pt-2 text-lg font-semibold text-ink">
                  <dt>Total</dt>
                  <dd className="tabular">{formatCurrency(data.total)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* ── Sidebar ──────────────────────────────────────────────── */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4 before:absolute before:left-[11px] before:top-3 before:h-[calc(100%-1.5rem)] before:w-px before:bg-line">
                {TIMELINE.map((step) => {
                  const value = data[step.key];
                  const done = Boolean(value);

                  return (
                    <li key={step.key} className="relative flex gap-3">
                      <span
                        className={cn(
                          'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full ring-4 ring-surface',
                          done ? 'bg-brand text-white' : 'bg-surface-sunken text-ink-subtle',
                        )}
                      >
                        <step.icon className="size-3" />
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <p
                          className={cn(
                            'text-[13px] font-medium',
                            done ? 'text-ink' : 'text-ink-subtle',
                          )}
                        >
                          {step.label}
                        </p>
                        <p className="text-[11px] text-ink-subtle">
                          {done ? formatDateTime(value) : 'Pending'}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>

              {data.cancelledAt && (
                <div className="mt-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5">
                  <p className="text-[13px] font-medium text-danger-soft-ink">Cancelled</p>
                  {data.cancelReason && (
                    <p className="mt-0.5 text-xs text-danger-soft-ink/80">{data.cancelReason}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <Detail label="Guest" value={data.customerName ?? 'Walk-in'} />
              {data.customerPhone && <Detail label="Phone" value={data.customerPhone} />}
              <Detail label="Guests" value={String(data.guestCount)} />
              <Detail label="Waiter" value={data.waiterName ?? '—'} />
              <Detail label="Chef" value={data.chefName ?? 'Unassigned'} />
              {data.paymentMethod && (
                <Detail label="Payment" value={titleCase(data.paymentMethod)} />
              )}
              {data.deliveryAddress && <Detail label="Address" value={data.deliveryAddress} />}
              {data.notes && <Detail label="Note" value={data.notes} />}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Settle ───────────────────────────────────────────────── */}
      <Dialog open={settleOpen} onOpenChange={setSettleOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Settle {data.orderNumber}</DialogTitle>
            <DialogDescription>
              This closes the bill, releases the table for cleaning and deducts ingredient stock.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <div className="rounded-xl bg-surface-sunken p-4 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                Amount due
              </p>
              <p className="mt-1 text-3xl font-semibold tabular text-ink">
                {formatCurrency(data.total)}
              </p>
            </div>

            <Field label="Payment method" required>
              <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="wallet">Wallet</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Adjust discount" hint="Leave blank to keep the current discount">
              <Input
                type="number"
                min={0}
                value={discount}
                onChange={(event) =>
                  setDiscount(event.target.value === '' ? '' : Number(event.target.value))
                }
                placeholder={String(data.discountAmount)}
              />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setSettleOpen(false)}>
              Cancel
            </Button>
            <Button loading={settle.isPending} onClick={() => settle.mutate()}>
              <CreditCard />
              Take payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cancel ───────────────────────────────────────────────── */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Cancel {data.orderNumber}?</DialogTitle>
            <DialogDescription>
              The kitchen will be told to stop, and the table is freed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <Field label="Reason" required>
              <Textarea
                rows={3}
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="Why is this order being cancelled?"
              />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              Keep order
            </Button>
            <Button
              variant="danger"
              disabled={cancelReason.trim().length === 0}
              loading={changeStatus.isPending}
              onClick={() => changeStatus.mutate({ status: 'cancelled', reason: cancelReason })}
            >
              Cancel order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-ink-muted">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}
