import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Cake, Search, Star, UsersRound } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/PageHeader';
import { QUERY_KEYS } from '@/constants/socketEvents';
import { useDebouncedValue } from '@/hooks';
import { cn, formatCurrency, formatDate, formatRelativeTime } from '@/lib/utils';
import { customerService } from '@/services';

export default function CustomersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('lastVisitAt');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebouncedValue(search, 350);

  const customers = useQuery({
    queryKey: [...QUERY_KEYS.customers, { debouncedSearch, sortBy, page }],
    queryFn: () =>
      customerService.list({ page, limit: 20, search: debouncedSearch || undefined, sortBy }),
    placeholderData: keepPreviousData,
  });

  const birthdays = useQuery({
    queryKey: [...QUERY_KEYS.customers, 'birthdays'],
    queryFn: () => customerService.birthdays(30),
  });

  const feedback = useQuery({
    queryKey: [...QUERY_KEYS.customers, 'feedback'],
    queryFn: () => customerService.feedback({ limit: 20 }),
  });

  const rows = customers.data?.data ?? [];
  const meta = customers.data?.meta;

  return (
    <>
      <PageHeader
        title="Guests"
        description="Who comes back, what they order and when to make a fuss of them."
      />

      <Tabs defaultValue="directory">
        <TabsList>
          <TabsTrigger value="directory">Directory</TabsTrigger>
          <TabsTrigger value="birthdays">
            Birthdays
            {(birthdays.data?.length ?? 0) > 0 && (
              <Badge tone="accent" size="sm">
                {birthdays.data?.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
        </TabsList>

        {/* ── Directory ──────────────────────────────────────────── */}
        <TabsContent value="directory">
          <Card className="mb-4">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Name, phone or email…"
                leading={<Search />}
                className="sm:max-w-xs"
              />
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lastVisitAt">Most recent visit</SelectItem>
                  <SelectItem value="totalSpent">Highest spend</SelectItem>
                  <SelectItem value="visitCount">Most visits</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {customers.isError ? (
            <ErrorState onRetry={() => void customers.refetch()} />
          ) : (
            <Card>
              <CardContent className="p-0">
                {customers.isLoading ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 8 }).map((_, index) => (
                      <Skeleton key={index} className="h-14 w-full" />
                    ))}
                  </div>
                ) : rows.length === 0 ? (
                  <EmptyState
                    className="m-4 border-0"
                    icon={<UsersRound />}
                    title="No guests found"
                    description="Guest records are created automatically when a phone number is added to an order."
                  />
                ) : (
                  <TableWrapper>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Guest</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead className="text-right">Visits</TableHead>
                          <TableHead className="text-right">Total spent</TableHead>
                          <TableHead className="text-right">Average bill</TableHead>
                          <TableHead className="text-right">Points</TableHead>
                          <TableHead className="text-right">Last seen</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((customer) => (
                          <TableRow
                            key={customer.id}
                            interactive
                            onClick={() => navigate(`/customers/${customer.id}`)}
                          >
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                <Avatar name={customer.name} size="sm" />
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-ink">{customer.name}</p>
                                  {customer.email && (
                                    <p className="truncate text-[11px] text-ink-subtle">
                                      {customer.email}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-ink-muted">{customer.phone}</TableCell>
                            <TableCell className="text-right tabular">{customer.visitCount}</TableCell>
                            <TableCell className="text-right font-semibold tabular">
                              {formatCurrency(customer.totalSpent)}
                            </TableCell>
                            <TableCell className="text-right tabular text-ink-muted">
                              {formatCurrency(customer.averageBill)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge tone="brand" size="sm">
                                {customer.loyaltyPoints}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-sm text-ink-muted">
                              {customer.lastVisitAt ? formatRelativeTime(customer.lastVisitAt) : '—'}
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
                      Page {meta.page} of {meta.totalPages} · {meta.total} guests
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
        </TabsContent>

        {/* ── Birthdays ──────────────────────────────────────────── */}
        <TabsContent value="birthdays">
          {birthdays.isLoading ? (
            <Skeleton className="h-48 w-full rounded-2xl" />
          ) : (birthdays.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon={<Cake />}
              title="No birthdays in the next 30 days"
              description="Add birthdays to guest records to see them here."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(birthdays.data ?? []).map((customer) => (
                <Card
                  key={customer.id}
                  className="cursor-pointer p-4 transition-shadow hover:shadow-md"
                  onClick={() => navigate(`/customers/${customer.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                      <Cake className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{customer.name}</p>
                      <p className="text-xs text-ink-muted">{formatDate(customer.birthday)}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-ink-subtle">
                    {customer.visitCount} visits · {formatCurrency(customer.totalSpent)} lifetime
                  </p>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Feedback ───────────────────────────────────────────── */}
        <TabsContent value="feedback">
          {feedback.isLoading ? (
            <Skeleton className="h-48 w-full rounded-2xl" />
          ) : (feedback.data?.data.length ?? 0) === 0 ? (
            <EmptyState icon={<Star />} title="No reviews yet" />
          ) : (
            <div className="space-y-3">
              {(feedback.data?.data ?? []).map((entry) => (
                <Card key={entry.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{entry.customerName ?? 'Anonymous'}</p>
                        <p className="text-[11px] text-ink-subtle">
                          {entry.orderNumber ? `${entry.orderNumber} · ` : ''}
                          {formatRelativeTime(entry.createdAt)}
                        </p>
                      </div>
                      <StarRating rating={entry.rating} />
                    </div>
                    {entry.comment && (
                      <p className="mt-2.5 text-sm text-ink-muted">“{entry.comment}”</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-ink-subtle">
                      {entry.foodRating && <span>Food {entry.foodRating}/5</span>}
                      {entry.serviceRating && <span>Service {entry.serviceRating}/5</span>}
                      {entry.ambienceRating && <span>Ambience {entry.ambienceRating}/5</span>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

/** Tailwind extracts classes statically, so the size variants are literals. */
export function StarRating({ rating, large = false }: { rating: number; large?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={cn(
            large ? 'size-5' : 'size-4',
            index < rating ? 'fill-warning text-warning' : 'text-line-strong',
          )}
        />
      ))}
    </div>
  );
}
