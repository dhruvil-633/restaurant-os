import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, Plus, Ticket } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Field, Input, Textarea } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/shared/PageHeader';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/utils';
import { getErrorMessage } from '@/services/api';
import { commerceService } from '@/services';
import type { RewardType } from '@/types';

const TYPE_LABELS: Record<RewardType, string> = {
  discount_amount: 'Money off',
  discount_percent: 'Percent off',
  free_item: 'Free dish',
};

/** How the reward's value reads, which depends entirely on its type. */
function describeValue(type: RewardType, value: number): string {
  if (type === 'discount_percent') return `${value}% off`;
  if (type === 'free_item') return 'One free dish';
  return `${formatCurrency(value)} off`;
}

/**
 * Where the loyalty catalogue is designed.
 *
 * Redeeming happens on the order itself, since a reward only means anything
 * against a bill — this page is the owner deciding what points can buy.
 */
export default function RewardsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    pointsCost: '100',
    type: 'discount_amount' as RewardType,
    value: '100',
    maxDiscount: '',
  });

  const rewards = useQuery({
    queryKey: ['rewards'],
    queryFn: () => commerceService.rewards(),
  });

  const redemptions = useQuery({
    queryKey: ['rewards', 'redemptions'],
    queryFn: () => commerceService.redemptions(),
  });

  const createReward = useMutation({
    mutationFn: () =>
      commerceService.createReward({
        name: form.name,
        description: form.description || undefined,
        pointsCost: Number(form.pointsCost),
        type: form.type,
        value: Number(form.value),
        maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : undefined,
      }),
    onSuccess: () => {
      toast.success('Reward added');
      setDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['rewards'] });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not add that reward')),
  });

  const retireReward = useMutation({
    mutationFn: (id: string) => commerceService.retireReward(id),
    onSuccess: () => {
      toast.success('Reward retired');
      void queryClient.invalidateQueries({ queryKey: ['rewards'] });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not retire that reward')),
  });

  const openDialog = (): void => {
    setForm({
      name: '',
      description: '',
      pointsCost: '100',
      type: 'discount_amount',
      value: '100',
      maxDiscount: '',
    });
    setDialogOpen(true);
  };

  const valid = form.name.trim().length > 1 && Number(form.pointsCost) > 0 && Number(form.value) > 0;

  const list = rewards.data?.rewards ?? [];

  return (
    <>
      <PageHeader
        title="Loyalty rewards"
        description="What your regulars can spend their points on."
        actions={
          <Button onClick={openDialog}>
            <Plus />
            New reward
          </Button>
        }
      />

      {rewards.isError ? (
        <ErrorState onRetry={() => void rewards.refetch()} />
      ) : rewards.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Gift />}
          title="No rewards yet"
          description="Add one and your regulars will see it when they settle a bill."
          action={
            <Button onClick={openDialog}>
              <Plus />
              New reward
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((reward) => (
            <Card key={reward.id}>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="truncate">{reward.name}</CardTitle>
                  {reward.description && (
                    <p className="mt-1 text-xs text-ink-muted">{reward.description}</p>
                  )}
                </div>
                <Badge tone="brand" size="sm">
                  {formatNumber(reward.pointsCost)} pts
                </Badge>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge tone="outline" size="sm">
                    {TYPE_LABELS[reward.type]}
                  </Badge>
                  <span className="text-sm font-medium text-ink">
                    {describeValue(reward.type, reward.value)}
                  </span>
                </div>

                {reward.maxDiscount !== null && (
                  <p className="text-[11px] text-ink-subtle">
                    Capped at {formatCurrency(reward.maxDiscount)}
                  </p>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-danger"
                  loading={retireReward.isPending}
                  onClick={() => retireReward.mutate(reward.id)}
                >
                  Retire
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="size-4 text-ink-muted" />
            Recently redeemed
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(redemptions.data?.length ?? 0) === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-subtle">Nothing redeemed yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reward</TableHead>
                  <TableHead>Guest</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(redemptions.data ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-ink">{row.rewardName}</TableCell>
                    <TableCell>{row.customerName ?? '—'}</TableCell>
                    <TableCell>{row.orderNumber ?? '—'}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.pointsSpent)}</TableCell>
                    <TableCell className="text-right text-danger">
                      −{formatCurrency(row.discountApplied)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-ink-subtle">
                      {formatDateTime(row.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New reward</DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <Field label="Name" required>
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Free dessert"
              />
            </Field>

            <Field label="Description">
              <Textarea
                rows={2}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Points to spend" required>
                <Input
                  type="number"
                  min={1}
                  value={form.pointsCost}
                  onChange={(event) => setForm({ ...form, pointsCost: event.target.value })}
                />
              </Field>

              <Field label="Kind" required>
                <Select
                  value={form.type}
                  onValueChange={(value) => setForm({ ...form, type: value as RewardType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_LABELS) as RewardType[]).map((type) => (
                      <SelectItem key={type} value={type}>
                        {TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label={form.type === 'discount_percent' ? 'Percent' : 'Amount'}
                required
                hint={form.type === 'free_item' ? 'Value of the free dish' : undefined}
              >
                <Input
                  type="number"
                  min={1}
                  value={form.value}
                  onChange={(event) => setForm({ ...form, value: event.target.value })}
                />
              </Field>

              {form.type === 'discount_percent' && (
                <Field label="Cap" hint="Most it can take off">
                  <Input
                    type="number"
                    min={0}
                    value={form.maxDiscount}
                    onChange={(event) => setForm({ ...form, maxDiscount: event.target.value })}
                    placeholder="No cap"
                  />
                </Field>
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!valid}
              loading={createReward.isPending}
              onClick={() => createReward.mutate()}
            >
              Add reward
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
