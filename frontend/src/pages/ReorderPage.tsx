import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Coins, PackageCheck, PackageX, ShoppingCart, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
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
import { StatCard } from '@/components/shared/StatCard';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { commerceService } from '@/services';
import type { ReorderUrgency } from '@/types';

const URGENCY: Record<ReorderUrgency, { label: string; tone: 'danger' | 'warning' | 'info' }> = {
  out: { label: 'Out', tone: 'danger' },
  critical: { label: 'Critical', tone: 'danger' },
  urgent: { label: 'Urgent', tone: 'warning' },
  soon: { label: 'Soon', tone: 'info' },
};

const COVER_OPTIONS = [3, 7, 14, 30];

/**
 * Smart reorder.
 *
 * The inventory page says what is low right now; this says what will run out,
 * by projecting the last few weeks of real consumption and waste forward.
 */
export default function ReorderPage() {
  const [coverDays, setCoverDays] = useState(7);

  const report = useQuery({
    queryKey: ['reorder', coverDays],
    queryFn: () => commerceService.reorder({ coverDays }),
  });

  const data = report.data;

  return (
    <>
      <PageHeader
        title="Reorder"
        description="What to buy before it runs out, worked out from what you actually get through."
        actions={
          <Select value={String(coverDays)} onValueChange={(value) => setCoverDays(Number(value))}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COVER_OPTIONS.map((days) => (
                <SelectItem key={days} value={String(days)}>
                  Cover {days} days
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {report.isError ? (
        <ErrorState onRetry={() => void report.refetch()} />
      ) : report.isLoading || !data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Out of stock"
              value={formatNumber(data.counts.out)}
              icon={PackageX}
              tone="danger"
              index={0}
            />
            <StatCard
              label="Critical"
              value={formatNumber(data.counts.critical)}
              icon={AlertTriangle}
              tone="warning"
              index={1}
            />
            <StatCard
              label="To reorder"
              value={formatNumber(data.counts.total)}
              icon={ShoppingCart}
              index={2}
            />
            <StatCard
              label="Estimated spend"
              value={formatCurrency(data.totalEstimatedCost)}
              icon={Coins}
              hint={`Covers ${data.coverDays} days`}
              index={3}
            />
          </div>

          {data.suggestions.length === 0 ? (
            <EmptyState
              icon={<PackageCheck />}
              title="Nothing to order"
              description={`Every ingredient has more than ${data.coverDays} days of cover at your current burn rate.`}
            />
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Running out first</CardTitle>
                  <p className="text-xs text-ink-muted">
                    Burn rate measured over the last {data.lookbackDays} days of consumption and
                    waste.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ingredient</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead className="text-right">In stock</TableHead>
                        <TableHead className="text-right">Per day</TableHead>
                        <TableHead className="text-right">Days left</TableHead>
                        <TableHead className="text-right">Order</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead>Why</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.suggestions.map((item) => (
                        <TableRow key={item.ingredientId}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge tone={URGENCY[item.urgency].tone} size="sm">
                                {URGENCY[item.urgency].label}
                              </Badge>
                              <div className="min-w-0">
                                <p className="truncate font-medium text-ink">{item.name}</p>
                                <p className="text-[11px] text-ink-subtle">{item.category}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{item.supplierName ?? '—'}</TableCell>
                          <TableCell className="text-right">
                            {formatNumber(item.currentStock, 2)} {item.unit}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(item.dailyBurn, 2)}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.daysRemaining === null
                              ? '—'
                              : formatNumber(item.daysRemaining, 1)}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-ink">
                            {formatNumber(item.suggestedQuantity, 2)} {item.unit}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(item.estimatedCost)}
                          </TableCell>
                          <TableCell className="max-w-56 text-xs text-ink-muted">
                            {item.reason}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <div>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                  <Truck className="size-4 text-ink-muted" />
                  Grouped by supplier
                </h2>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {data.bySupplier.map((group) => (
                    <Card key={group.supplierId ?? 'unassigned'}>
                      <CardHeader className="flex-row items-start justify-between gap-3">
                        <CardTitle className="truncate">{group.supplierName}</CardTitle>
                        <span className="text-sm font-semibold text-ink">
                          {formatCurrency(group.total)}
                        </span>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {group.items.map((item) => (
                          <div
                            key={item.ingredientId}
                            className="flex items-baseline justify-between gap-2 text-sm"
                          >
                            <span className="truncate text-ink-muted">{item.name}</span>
                            <span className="whitespace-nowrap font-medium text-ink">
                              {formatNumber(item.suggestedQuantity, 2)} {item.unit}
                            </span>
                          </div>
                        ))}

                        {/* Sending the order is the supplier's own channel — copying the
                            list is what a manager actually does today. */}
                        <Button
                          variant="secondary"
                          size="sm"
                          className="mt-2 w-full"
                          onClick={() => {
                            const lines = group.items
                              .map(
                                (item) =>
                                  `${item.name}: ${formatNumber(item.suggestedQuantity, 2)} ${item.unit}`,
                              )
                              .join('\n');
                            void navigator.clipboard.writeText(
                              `Purchase order — ${group.supplierName}\n\n${lines}`,
                            );
                          }}
                        >
                          Copy order list
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
