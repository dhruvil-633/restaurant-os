import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, Plus, SplitSquareHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency, formatNumber, formatTime, titleCase } from '@/lib/utils';
import { getErrorMessage } from '@/services/api';
import { commerceService } from '@/services';
import type { PaymentMethod } from '@/types';

const METHODS: PaymentMethod[] = ['cash', 'card', 'upi', 'wallet'];

export interface SplitBillPanelProps {
  orderId: string;
  /** Known guest, if any — rewards can only be spent against a profile. */
  customerId: string | null;
  /** Whether the bill is still open. A closed bill is read-only. */
  isOpen: boolean;
  /** Called once the balance reaches zero and the order closes itself. */
  onSettled: () => void;
}

/**
 * Takes a bill in several payments and spends loyalty points against it.
 *
 * A table of six paying separately was previously impossible — the bill took
 * one tender for the whole amount. The server finalises the order itself once
 * the payments cover the total, so this panel never closes it directly.
 */
export function SplitBillPanel({ orderId, customerId, isOpen, onSettled }: SplitBillPanelProps) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [payerLabel, setPayerLabel] = useState('');

  const bill = useQuery({
    queryKey: ['bill', orderId],
    queryFn: () => commerceService.payments(orderId),
  });

  const rewards = useQuery({
    queryKey: ['rewards', customerId],
    queryFn: () => commerceService.rewards(customerId ?? undefined),
    enabled: Boolean(customerId) && isOpen,
  });

  const refresh = (settled: boolean): void => {
    void queryClient.invalidateQueries({ queryKey: ['bill', orderId] });
    if (settled) onSettled();
  };

  const addPayment = useMutation({
    mutationFn: () =>
      commerceService.addPayment(orderId, {
        amount: Number(amount),
        method,
        payerLabel: payerLabel || undefined,
      }),
    onSuccess: (state) => {
      setAmount('');
      setPayerLabel('');
      toast.success(
        state.isSettled ? 'Bill settled' : `${formatCurrency(state.balance)} still to pay`,
      );
      refresh(state.isSettled);
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not take that payment')),
  });

  const voidPayment = useMutation({
    mutationFn: (paymentId: string) => commerceService.voidPayment(orderId, paymentId),
    onSuccess: () => {
      toast.success('Payment removed');
      refresh(false);
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not remove that payment')),
  });

  const redeem = useMutation({
    mutationFn: (rewardId: string) =>
      commerceService.redeem({
        rewardId,
        orderId,
        customerId: customerId ?? undefined,
      }),
    onSuccess: (result) => {
      toast.success(`${result.rewardName} applied`, {
        description: `${formatCurrency(result.discountApplied)} off · ${formatNumber(result.pointsSpent)} points spent`,
      });
      void queryClient.invalidateQueries({ queryKey: ['bill', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['rewards', customerId] });
      onSettled();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not apply that reward')),
  });

  const state = bill.data;
  if (!state) return null;

  const entered = Number(amount);
  // The server rejects an over-tender, so the button stays off rather than
  // letting the till take money the bill cannot absorb.
  const canTake = entered > 0 && entered <= state.balance + 0.009;

  const affordable = (rewards.data?.rewards ?? []).filter((reward) => reward.affordable === true);

  /** Splits the remaining balance into n equal shares, rounded to the paisa. */
  const shareOf = (ways: number): string => (state.balance / ways).toFixed(2);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SplitSquareHorizontal className="size-4 text-ink-muted" />
          Split the bill
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-sunken p-3 text-center">
          <div>
            <p className="text-[11px] text-ink-subtle">Total</p>
            <p className="text-sm font-semibold text-ink">{formatCurrency(state.total)}</p>
          </div>
          <div>
            <p className="text-[11px] text-ink-subtle">Paid</p>
            <p className="text-sm font-semibold text-success">{formatCurrency(state.paid)}</p>
          </div>
          <div>
            <p className="text-[11px] text-ink-subtle">Left</p>
            <p className="text-sm font-semibold text-ink">{formatCurrency(state.balance)}</p>
          </div>
        </div>

        {state.payments.length > 0 && (
          <ul className="space-y-1.5">
            {state.payments.map((payment) => (
              <li
                key={payment.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink">
                    {payment.payerLabel ?? titleCase(payment.method)}
                  </p>
                  <p className="text-[11px] text-ink-subtle">
                    {titleCase(payment.method)} · {formatTime(payment.createdAt)}
                    {payment.receivedBy ? ` · ${payment.receivedBy}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-semibold text-ink">
                    {formatCurrency(payment.amount)}
                  </span>
                  {isOpen && (
                    <button
                      type="button"
                      onClick={() => voidPayment.mutate(payment.id)}
                      className="rounded p-1 text-ink-subtle transition-colors hover:text-danger"
                      aria-label="Remove this payment"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {!isOpen || state.isSettled ? (
          <Badge tone="success" className="w-full justify-center">
            Bill settled in {state.payments.length} payment
            {state.payments.length === 1 ? '' : 's'}
          </Badge>
        ) : (
          <>
            <div className="flex gap-2">
              {[2, 3, 4].map((ways) => (
                <Button
                  key={ways}
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={() => setAmount(shareOf(ways))}
                >
                  Split {ways}
                </Button>
              ))}
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => setAmount(state.balance.toFixed(2))}
              >
                All
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount" required>
                <Input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder={state.balance.toFixed(2)}
                />
              </Field>
              <Field label="Method" required>
                <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHODS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {titleCase(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Who is paying" hint="Shows on the receipt">
              <Input
                value={payerLabel}
                onChange={(event) => setPayerLabel(event.target.value)}
                placeholder="Seat 3"
              />
            </Field>

            <Button
              className="w-full"
              disabled={!canTake}
              loading={addPayment.isPending}
              onClick={() => addPayment.mutate()}
            >
              <Plus />
              Take {entered > 0 ? formatCurrency(entered) : 'payment'}
            </Button>

            {customerId && affordable.length > 0 && (
              <div className="space-y-2 border-t border-line pt-4">
                <p className="flex items-center justify-between text-[13px] font-medium text-ink">
                  <span className="flex items-center gap-1.5">
                    <Gift className="size-3.5 text-ink-muted" />
                    Rewards
                  </span>
                  <span className="text-ink-muted">
                    {formatNumber(rewards.data?.customerPoints ?? 0)} pts
                  </span>
                </p>

                {affordable.map((reward) => (
                  <Button
                    key={reward.id}
                    variant="secondary"
                    size="sm"
                    className="w-full justify-between"
                    loading={redeem.isPending}
                    onClick={() => redeem.mutate(reward.id)}
                  >
                    <span className="truncate">{reward.name}</span>
                    <span className="text-ink-muted">{formatNumber(reward.pointsCost)} pts</span>
                  </Button>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
