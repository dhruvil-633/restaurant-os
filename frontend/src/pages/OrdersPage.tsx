import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardList, Plus, Search } from 'lucide-react';
import { Badge, ORDER_STATUS_TONE, PAYMENT_STATUS_TONE } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
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
import { PageHeader } from '@/components/shared/PageHeader';
import { QUERY_KEYS } from '@/constants/socketEvents';
import { useDebouncedValue } from '@/hooks';
import { formatCurrency, formatDuration, formatRelativeTime, titleCase } from '@/lib/utils';
import { orderService } from '@/services';

const STATUSES = ['all', 'pending', 'cooking', 'ready', 'served', 'completed', 'cancelled'];
const TYPES = ['all', 'dine_in', 'takeaway', 'delivery'];

export default function OrdersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebouncedValue(search, 350);

  const orders = useQuery({
    queryKey: [...QUERY_KEYS.orders, { debouncedSearch, status, type, page }],
    queryFn: () =>
      orderService.list({
        page,
        limit: 20,
        search: debouncedSearch || undefined,
        status: status === 'all' ? undefined : status,
        type: type === 'all' ? undefined : type,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 150_000,
  });

  const rows = orders.data?.data ?? [];
  const meta = orders.data?.meta;

  /** Any filter change invalidates the current page number. */
  const withReset = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every ticket across dine-in, takeaway and delivery."
        actions={
          <Button asChild>
            <Link to="/orders/new">
              <Plus />
              New order
            </Link>
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
          <Input
            value={search}
            onChange={(event) => withReset(setSearch)(event.target.value)}
            placeholder="Order number, guest or table…"
            leading={<Search />}
            className="sm:max-w-xs"
          />
          <Select value={status} onValueChange={withReset(setStatus)}>
            <SelectTrigger className="sm:w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value === 'all' ? 'All statuses' : titleCase(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={withReset(setType)}>
            <SelectTrigger className="sm:w-40">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value === 'all' ? 'All types' : titleCase(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {orders.isError ? (
        <ErrorState onRetry={() => void orders.refetch()} />
      ) : (
        <Card>
          <CardContent className="p-0">
            {orders.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="h-14 w-full" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                className="m-4 border-0"
                icon={<ClipboardList />}
                title="No orders match these filters"
                description="Try clearing the search or choosing a different status."
              />
            ) : (
              <TableWrapper>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Table / Type</TableHead>
                      <TableHead>Guest</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Placed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((order) => (
                      <TableRow
                        key={order.id}
                        interactive
                        onClick={() => navigate(`/orders/${order.id}`)}
                      >
                        <TableCell>
                          <span className="font-medium text-ink">{order.orderNumber}</span>
                          {order.waiterName && (
                            <span className="mt-0.5 block text-[11px] text-ink-subtle">
                              {order.waiterName}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-ink">
                            {order.tableLabel ? `Table ${order.tableLabel}` : titleCase(order.type)}
                          </span>
                          {order.tableLabel && (
                            <span className="mt-0.5 block text-[11px] text-ink-subtle">
                              {titleCase(order.type)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-ink-muted">
                          {order.customerName ?? '—'}
                        </TableCell>
                        <TableCell className="text-sm tabular text-ink-muted">
                          {order.items.length}
                        </TableCell>
                        <TableCell>
                          <Badge tone={ORDER_STATUS_TONE[order.status]} size="sm" dot>
                            {titleCase(order.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge tone={PAYMENT_STATUS_TONE[order.paymentStatus]} size="sm">
                            {titleCase(order.paymentStatus)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular text-ink">
                          {formatCurrency(order.total)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm text-ink-muted">
                            {formatRelativeTime(order.placedAt)}
                          </span>
                          {order.status !== 'completed' && order.status !== 'cancelled' && (
                            <span className="mt-0.5 block text-[11px] text-ink-subtle">
                              {formatDuration(order.elapsedMinutes)} open
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrapper>
            )}

            {meta && meta.totalPages > 1 && (
              <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
                <p className="text-xs text-ink-muted">
                  Page {meta.page} of {meta.totalPages} · {meta.total} orders
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!meta.hasPreviousPage}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!meta.hasNextPage}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
