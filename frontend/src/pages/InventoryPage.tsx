import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Boxes, CalendarX, Plus, Search, Trash2, TrendingDown } from 'lucide-react';
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
import { EmptyState, ErrorState, Progress, Skeleton } from '@/components/ui/feedback';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { QUERY_KEYS } from '@/constants/socketEvents';
import { useDebouncedValue } from '@/hooks';
import { cn, formatCurrency, formatDate, formatRelativeTime, titleCase } from '@/lib/utils';
import { getErrorMessage } from '@/services/api';
import { inventoryService } from '@/services';
import { useAuthStore } from '@/store/authStore';
import type { Ingredient } from '@/types';

const WASTE_REASONS = [
  'expired',
  'spoiled',
  'overcooked',
  'customer_return',
  'spillage',
  'preparation_error',
  'other',
] as const;

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.user?.role);
  const canManage = role === 'owner' || role === 'manager';
  const canLogWaste = canManage || role === 'chef' || role === 'kitchen_staff';

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [wasteFor, setWasteFor] = useState<Ingredient | null>(null);
  const [wasteQuantity, setWasteQuantity] = useState('');
  const [wasteReason, setWasteReason] = useState<(typeof WASTE_REASONS)[number]>('spoiled');
  const [wasteNote, setWasteNote] = useState('');
  const [adjustFor, setAdjustFor] = useState<Ingredient | null>(null);
  const [adjustQuantity, setAdjustQuantity] = useState('');

  const debouncedSearch = useDebouncedValue(search, 350);

  const summary = useQuery({
    queryKey: QUERY_KEYS.inventorySummary,
    queryFn: inventoryService.summary,
  });

  const ingredients = useQuery({
    queryKey: [...QUERY_KEYS.inventory, { debouncedSearch, filter }],
    queryFn: () =>
      inventoryService.list({
        limit: 100,
        search: debouncedSearch || undefined,
        lowStock: filter === 'low' ? 'true' : undefined,
        expiringSoon: filter === 'expiring' ? 'true' : undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const movements = useQuery({
    queryKey: [...QUERY_KEYS.inventory, 'transactions'],
    queryFn: () => inventoryService.transactions({ limit: 30 }),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.inventory });
  };

  const recordWaste = useMutation({
    mutationFn: () =>
      inventoryService.recordWaste({
        ingredientId: wasteFor?.id,
        quantity: Number(wasteQuantity),
        reason: wasteReason,
        note: wasteNote || undefined,
      }),
    onSuccess: (result) => {
      toast.success('Waste recorded', {
        description: `${formatCurrency(result.lostValue)} written off`,
      });
      setWasteFor(null);
      setWasteQuantity('');
      setWasteNote('');
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not record the waste')),
  });

  const adjustStock = useMutation({
    mutationFn: () => inventoryService.adjust(adjustFor?.id ?? '', Number(adjustQuantity)),
    onSuccess: () => {
      toast.success('Stock adjusted');
      setAdjustFor(null);
      setAdjustQuantity('');
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not adjust the stock')),
  });

  const rows = ingredients.data?.data ?? [];
  const totals = summary.data?.totals;

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock levels, expiry dates and where the money is going."
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          index={0}
          label="Stock value"
          value={formatCurrency(totals?.stockValue ?? 0)}
          icon={Boxes}
          hint={`${totals?.totalItems ?? 0} ingredients tracked`}
          loading={summary.isLoading}
        />
        <StatCard
          index={1}
          label="Low stock"
          value={String(totals?.lowStockCount ?? 0)}
          icon={TrendingDown}
          tone={totals?.lowStockCount ? 'warning' : 'success'}
          hint="At or below the reorder point"
          loading={summary.isLoading}
        />
        <StatCard
          index={2}
          label="Out of stock"
          value={String(totals?.outOfStockCount ?? 0)}
          icon={AlertTriangle}
          tone={totals?.outOfStockCount ? 'danger' : 'success'}
          hint="Nothing left in the store"
          loading={summary.isLoading}
        />
        <StatCard
          index={3}
          label="Expiring soon"
          value={String(totals?.expiringCount ?? 0)}
          icon={CalendarX}
          tone={totals?.expiringCount ? 'accent' : 'success'}
          hint="Within the next 7 days"
          loading={summary.isLoading}
        />
      </div>

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
        </TabsList>

        <TabsContent value="stock">
          <Card className="mb-4">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search ingredients…"
                leading={<Search />}
                className="sm:max-w-xs"
              />
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everything</SelectItem>
                  <SelectItem value="low">Low stock only</SelectItem>
                  <SelectItem value="expiring">Expiring soon</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {ingredients.isError ? (
            <ErrorState onRetry={() => void ingredients.refetch()} />
          ) : (
            <Card>
              <CardContent className="p-0">
                {ingredients.isLoading ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 8 }).map((_, index) => (
                      <Skeleton key={index} className="h-14 w-full" />
                    ))}
                  </div>
                ) : rows.length === 0 ? (
                  <EmptyState className="m-4 border-0" icon={<Boxes />} title="No ingredients found" />
                ) : (
                  <TableWrapper>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ingredient</TableHead>
                          <TableHead>Stock level</TableHead>
                          <TableHead className="text-right">On hand</TableHead>
                          <TableHead className="text-right">Value</TableHead>
                          <TableHead>Expiry</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((ingredient) => (
                          <TableRow key={ingredient.id}>
                            <TableCell>
                              <p className="font-medium text-ink">{ingredient.name}</p>
                              <p className="text-[11px] text-ink-subtle">
                                {ingredient.category}
                                {ingredient.supplierName && ` · ${ingredient.supplierName}`}
                              </p>
                            </TableCell>
                            <TableCell className="w-40">
                              <Progress
                                value={ingredient.stockPercentage}
                                tone={
                                  ingredient.isOutOfStock
                                    ? 'danger'
                                    : ingredient.isLowStock
                                      ? 'warning'
                                      : 'success'
                                }
                                size="sm"
                              />
                              <p className="mt-1 text-[11px] text-ink-subtle">
                                min {ingredient.minStock} {ingredient.unit}
                              </p>
                            </TableCell>
                            <TableCell className="text-right">
                              <span
                                className={cn(
                                  'font-semibold tabular',
                                  ingredient.isOutOfStock
                                    ? 'text-danger'
                                    : ingredient.isLowStock
                                      ? 'text-warning'
                                      : 'text-ink',
                                )}
                              >
                                {ingredient.currentStock} {ingredient.unit}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular text-ink-muted">
                              {formatCurrency(ingredient.stockValue)}
                            </TableCell>
                            <TableCell>
                              {ingredient.expiryDate ? (
                                <Badge
                                  tone={
                                    (ingredient.daysUntilExpiry ?? 99) <= 3
                                      ? 'danger'
                                      : ingredient.isExpiringSoon
                                        ? 'warning'
                                        : 'neutral'
                                  }
                                  size="sm"
                                >
                                  {formatDate(ingredient.expiryDate)}
                                </Badge>
                              ) : (
                                <span className="text-xs text-ink-subtle">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1.5">
                                {canManage && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setAdjustFor(ingredient);
                                      setAdjustQuantity('');
                                    }}
                                  >
                                    <Plus />
                                    Adjust
                                  </Button>
                                )}
                                {canLogWaste && (
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => setWasteFor(ingredient)}
                                    aria-label={`Record waste for ${ingredient.name}`}
                                  >
                                    <Trash2 className="text-danger" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableWrapper>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="movements">
          <Card>
            <CardHeader>
              <CardTitle>Recent stock movements</CardTitle>
              <p className="mt-0.5 text-sm text-ink-muted">
                Purchases, automatic consumption from completed orders, waste and manual corrections.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {movements.isLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-12 w-full" />
                  ))}
                </div>
              ) : (movements.data?.data.length ?? 0) === 0 ? (
                <EmptyState className="m-4 border-0" title="No movements recorded yet" />
              ) : (
                <TableWrapper>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ingredient</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead className="text-right">When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(movements.data?.data ?? []).map((movement) => (
                        <TableRow key={movement.id}>
                          <TableCell className="font-medium text-ink">
                            {movement.ingredientName}
                          </TableCell>
                          <TableCell>
                            <Badge
                              size="sm"
                              tone={
                                movement.type === 'purchase'
                                  ? 'success'
                                  : movement.type === 'waste'
                                    ? 'danger'
                                    : movement.type === 'consumption'
                                      ? 'info'
                                      : 'neutral'
                              }
                            >
                              {titleCase(movement.type)}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className={cn(
                              'text-right font-semibold tabular',
                              movement.quantity < 0 ? 'text-danger' : 'text-success',
                            )}
                          >
                            {movement.quantity > 0 ? '+' : ''}
                            {movement.quantity} {movement.unit}
                          </TableCell>
                          <TableCell className="text-right tabular text-ink-muted">
                            {formatCurrency(movement.totalCost)}
                          </TableCell>
                          <TableCell className="max-w-[16rem] truncate text-sm text-ink-muted">
                            {movement.wasteReason
                              ? titleCase(movement.wasteReason)
                              : (movement.note ?? '—')}
                          </TableCell>
                          <TableCell className="text-right text-sm text-ink-muted">
                            {formatRelativeTime(movement.occurredAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableWrapper>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Record waste ─────────────────────────────────────────── */}
      <Dialog open={Boolean(wasteFor)} onOpenChange={(open) => !open && setWasteFor(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Record waste — {wasteFor?.name}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field label={`Quantity wasted (${wasteFor?.unit})`} required>
              <Input
                type="number"
                min={0}
                step="0.001"
                value={wasteQuantity}
                onChange={(event) => setWasteQuantity(event.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Reason" required>
              <Select
                value={wasteReason}
                onValueChange={(value) => setWasteReason(value as (typeof WASTE_REASONS)[number])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WASTE_REASONS.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {titleCase(reason)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Note">
              <Textarea
                rows={2}
                value={wasteNote}
                onChange={(event) => setWasteNote(event.target.value)}
                placeholder="What happened?"
              />
            </Field>
            {wasteFor && Number(wasteQuantity) > 0 && (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-soft-ink">
                Writes off{' '}
                <strong>{formatCurrency(Number(wasteQuantity) * wasteFor.costPerUnit)}</strong>
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setWasteFor(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!wasteQuantity || Number(wasteQuantity) <= 0}
              loading={recordWaste.isPending}
              onClick={() => recordWaste.mutate()}
            >
              Record waste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Adjust stock ─────────────────────────────────────────── */}
      <Dialog open={Boolean(adjustFor)} onOpenChange={(open) => !open && setAdjustFor(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Adjust stock — {adjustFor?.name}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <p className="text-sm text-ink-muted">
              Currently {adjustFor?.currentStock} {adjustFor?.unit}. Enter a positive number to add
              stock, or a negative one to remove it.
            </p>
            <Field label="Change" required>
              <Input
                type="number"
                step="0.001"
                value={adjustQuantity}
                onChange={(event) => setAdjustQuantity(event.target.value)}
                placeholder="e.g. 12 or -3"
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAdjustFor(null)}>
              Cancel
            </Button>
            <Button
              disabled={!adjustQuantity || Number(adjustQuantity) === 0}
              loading={adjustStock.isPending}
              onClick={() => adjustStock.mutate()}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
