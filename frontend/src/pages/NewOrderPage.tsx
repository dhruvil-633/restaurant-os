import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Minus, Plus, Search, ShoppingCart, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/PageHeader';
import { QUERY_KEYS } from '@/constants/socketEvents';
import { useDebouncedValue } from '@/hooks';
import { cn, formatCurrency } from '@/lib/utils';
import { getErrorMessage } from '@/services/api';
import { customerService, menuService, orderService, settingsService, tableService } from '@/services';
import type { MenuItem, OrderType } from '@/types';

interface CartLine {
  item: MenuItem;
  quantity: number;
  notes: string;
}

export default function NewOrderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [tableId, setTableId] = useState(searchParams.get('tableId') ?? '');
  const [guestCount, setGuestCount] = useState(2);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState(0);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [cart, setCart] = useState<CartLine[]>([]);

  const debouncedPhone = useDebouncedValue(customerPhone, 500);

  const menu = useQuery({
    queryKey: QUERY_KEYS.menuForOrdering,
    queryFn: menuService.forOrdering,
    staleTime: 2 * 60_000,
  });

  const tables = useQuery({
    queryKey: QUERY_KEYS.tables,
    queryFn: () => tableService.list(),
  });

  const settings = useQuery({ queryKey: QUERY_KEYS.settings, queryFn: settingsService.get });

  // Recognises a returning guest as soon as enough digits are typed.
  const knownCustomer = useQuery({
    queryKey: ['customer-lookup', debouncedPhone],
    queryFn: () => customerService.lookup(debouncedPhone),
    enabled: debouncedPhone.replace(/\D/g, '').length >= 6,
  });

  const createOrder = useMutation({
    mutationFn: orderService.create,
    onSuccess: (order) => {
      toast.success(`Order ${order.orderNumber} placed`, {
        description: 'The kitchen has been notified.',
      });
      navigate(`/orders/${order.id}`, { replace: true });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not place the order')),
  });

  const categories = menu.data ?? [];

  const visibleItems = useMemo(() => {
    const all = categories.flatMap((category) => category.items);
    const byCategory =
      activeCategory === 'all'
        ? all
        : all.filter((item) => item.categoryId === activeCategory);

    if (!search.trim()) return byCategory;
    const term = search.toLowerCase();
    return byCategory.filter((item) => item.name.toLowerCase().includes(term));
  }, [categories, activeCategory, search]);

  const subtotal = cart.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
  const taxRate = settings.data?.taxRatePercent ?? 5;
  const cappedDiscount = Math.min(discount, subtotal);
  const taxAmount = ((subtotal - cappedDiscount) * taxRate) / 100;
  const total = subtotal - cappedDiscount + taxAmount;

  const addToCart = (item: MenuItem): void => {
    setCart((current) => {
      const existing = current.find((line) => line.item.id === item.id);
      if (existing) {
        return current.map((line) =>
          line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...current, { item, quantity: 1, notes: '' }];
    });
  };

  const changeQuantity = (itemId: string, delta: number): void => {
    setCart((current) =>
      current
        .map((line) =>
          line.item.id === itemId ? { ...line, quantity: line.quantity + delta } : line,
        )
        .filter((line) => line.quantity > 0),
    );
  };

  const setLineNotes = (itemId: string, value: string): void => {
    setCart((current) =>
      current.map((line) => (line.item.id === itemId ? { ...line, notes: value } : line)),
    );
  };

  const canSubmit =
    cart.length > 0 &&
    (orderType !== 'dine_in' || Boolean(tableId)) &&
    (orderType !== 'delivery' || deliveryAddress.trim().length > 0);

  const submit = (): void => {
    createOrder.mutate({
      type: orderType,
      tableId: orderType === 'dine_in' ? tableId : null,
      guestCount: orderType === 'dine_in' ? guestCount : 1,
      customerPhone: customerPhone.trim() || undefined,
      customerName: customerName.trim() || knownCustomer.data?.name || undefined,
      deliveryAddress: orderType === 'delivery' ? deliveryAddress : undefined,
      notes: notes.trim() || undefined,
      discountAmount: cappedDiscount,
      items: cart.map((line) => ({
        menuItemId: line.item.id,
        quantity: line.quantity,
        notes: line.notes || undefined,
      })),
    });
  };

  const freeTables = (tables.data ?? []).filter(
    (table) => table.status === 'available' || table.id === tableId,
  );

  return (
    <>
      <PageHeader
        title="New order"
        description="Build the ticket, then send it straight to the kitchen."
        actions={
          <Button variant="secondary" onClick={() => navigate(-1)}>
            <ArrowLeft />
            Back
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_23rem]">
        {/* ── Menu picker ────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Tabs
                  value={orderType}
                  onValueChange={(value) => setOrderType(value as OrderType)}
                  className="w-full sm:w-auto"
                >
                  <TabsList>
                    <TabsTrigger value="dine_in">Dine in</TabsTrigger>
                    <TabsTrigger value="takeaway">Takeaway</TabsTrigger>
                    <TabsTrigger value="delivery">Delivery</TabsTrigger>
                  </TabsList>
                </Tabs>

                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search the menu…"
                  leading={<Search />}
                  className="sm:ml-auto sm:max-w-xs"
                />
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                <button
                  type="button"
                  onClick={() => setActiveCategory('all')}
                  className={cn(
                    'shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
                    activeCategory === 'all'
                      ? 'bg-brand text-white'
                      : 'bg-surface-sunken text-ink-muted hover:text-ink',
                  )}
                >
                  All
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setActiveCategory(category.id)}
                    className={cn(
                      'shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
                      activeCategory === category.id
                        ? 'bg-brand text-white'
                        : 'bg-surface-sunken text-ink-muted hover:text-ink',
                    )}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {menu.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 9 }).map((_, index) => (
                <Skeleton key={index} className="h-24 rounded-2xl" />
              ))}
            </div>
          ) : visibleItems.length === 0 ? (
            <EmptyState
              title="No dishes here"
              description="Try another category, or clear the search."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleItems.map((item) => {
                const inCart = cart.find((line) => line.item.id === item.id);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addToCart(item)}
                    className={cn(
                      'group relative flex flex-col rounded-2xl border bg-surface p-3.5 text-left shadow-xs',
                      'transition-all hover:-translate-y-0.5 hover:shadow-md',
                      inCart ? 'border-brand ring-2 ring-brand/25' : 'border-line',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-sm font-medium leading-snug text-ink">
                        {item.name}
                      </span>
                      {item.isVegetarian && (
                        <span
                          className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-sm border-2 border-success"
                          title="Vegetarian"
                        >
                          <span className="size-1.5 rounded-full bg-success" />
                        </span>
                      )}
                    </div>

                    <div className="mt-auto flex items-end justify-between gap-2 pt-3">
                      <span className="text-sm font-semibold tabular text-ink">
                        {formatCurrency(item.price)}
                      </span>
                      <span className="text-[11px] text-ink-subtle">{item.prepTimeMinutes}m</span>
                    </div>

                    {inCart && (
                      <span className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white shadow-sm">
                        {inCart.quantity}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Cart ───────────────────────────────────────────────────── */}
        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card className="flex max-h-[calc(100dvh-7rem)] flex-col">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <ShoppingCart className="size-4 text-ink-muted" />
              <p className="text-sm font-semibold text-ink">Current order</p>
              {cart.length > 0 && (
                <Badge tone="brand" size="sm" className="ml-auto">
                  {cart.reduce((sum, line) => sum + line.quantity, 0)} items
                </Badge>
              )}
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {/* Order context */}
              <div className="space-y-3">
                {orderType === 'dine_in' && (
                  <>
                    <Field label="Table" required>
                      <Select value={tableId} onValueChange={setTableId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a free table" />
                        </SelectTrigger>
                        <SelectContent>
                          {freeTables.length === 0 ? (
                            <SelectItem value="none" disabled>
                              No free tables
                            </SelectItem>
                          ) : (
                            freeTables.map((table) => (
                              <SelectItem key={table.id} value={table.id}>
                                {table.label} · {table.section} · seats {table.capacity}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field label="Guests">
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        value={guestCount}
                        onChange={(event) => setGuestCount(Number(event.target.value) || 1)}
                      />
                    </Field>
                  </>
                )}

                {orderType === 'delivery' && (
                  <Field label="Delivery address" required>
                    <Textarea
                      rows={2}
                      value={deliveryAddress}
                      onChange={(event) => setDeliveryAddress(event.target.value)}
                      placeholder="Flat, building, street, landmark"
                    />
                  </Field>
                )}

                <Field label="Guest phone" hint="Links the order to their history">
                  <Input
                    value={customerPhone}
                    onChange={(event) => setCustomerPhone(event.target.value)}
                    placeholder="+91 98765 43210"
                    leading={<UserRound />}
                  />
                </Field>

                {knownCustomer.data ? (
                  <div className="rounded-xl border border-brand/30 bg-brand-soft px-3 py-2.5">
                    <p className="text-[13px] font-medium text-brand-soft-ink">
                      {knownCustomer.data.name} is back
                    </p>
                    <p className="mt-0.5 text-[11px] text-brand-soft-ink/80">
                      {knownCustomer.data.visitCount} visits · average bill{' '}
                      {formatCurrency(knownCustomer.data.averageBill)}
                    </p>
                  </div>
                ) : (
                  debouncedPhone.replace(/\D/g, '').length >= 6 && (
                    <Field label="Guest name" hint="A new guest record will be created">
                      <Input
                        value={customerName}
                        onChange={(event) => setCustomerName(event.target.value)}
                        placeholder="Their name"
                      />
                    </Field>
                  )
                )}
              </div>

              {/* Lines */}
              <div className="space-y-2 border-t border-line pt-4">
                <AnimatePresence initial={false}>
                  {cart.length === 0 ? (
                    <p className="py-6 text-center text-sm text-ink-subtle">
                      Tap a dish to add it here.
                    </p>
                  ) : (
                    cart.map((line) => (
                      <motion.div
                        key={line.item.id}
                        layout
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="rounded-xl border border-line bg-surface-sunken p-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-ink">
                            {line.item.name}
                          </span>
                          <span className="shrink-0 text-[13px] font-semibold tabular text-ink">
                            {formatCurrency(line.item.price * line.quantity)}
                          </span>
                        </div>

                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex items-center rounded-lg border border-line bg-surface">
                            <button
                              type="button"
                              onClick={() => changeQuantity(line.item.id, -1)}
                              className="p-1.5 text-ink-muted transition-colors hover:text-ink"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="size-3.5" />
                            </button>
                            <span className="min-w-[1.75rem] text-center text-[13px] font-semibold tabular text-ink">
                              {line.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => changeQuantity(line.item.id, 1)}
                              className="p-1.5 text-ink-muted transition-colors hover:text-ink"
                              aria-label="Increase quantity"
                            >
                              <Plus className="size-3.5" />
                            </button>
                          </div>

                          <Input
                            value={line.notes}
                            onChange={(event) => setLineNotes(line.item.id, event.target.value)}
                            placeholder="Note for the kitchen"
                            className="h-8 flex-1 text-xs"
                          />

                          <button
                            type="button"
                            onClick={() => changeQuantity(line.item.id, -line.quantity)}
                            className="p-1.5 text-ink-subtle transition-colors hover:text-danger"
                            aria-label="Remove"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>

              {cart.length > 0 && (
                <div className="space-y-3 border-t border-line pt-4">
                  <Field label="Order note">
                    <Textarea
                      rows={2}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Allergies, timing, anything the kitchen should know"
                    />
                  </Field>
                  <Field label="Discount">
                    <Input
                      type="number"
                      min={0}
                      value={discount || ''}
                      onChange={(event) => setDiscount(Number(event.target.value) || 0)}
                      placeholder="0"
                    />
                  </Field>
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="space-y-3 border-t border-line p-4">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between text-ink-muted">
                  <dt>Subtotal</dt>
                  <dd className="tabular">{formatCurrency(subtotal)}</dd>
                </div>
                {cappedDiscount > 0 && (
                  <div className="flex justify-between text-ink-muted">
                    <dt>Discount</dt>
                    <dd className="tabular text-danger">−{formatCurrency(cappedDiscount)}</dd>
                  </div>
                )}
                <div className="flex justify-between text-ink-muted">
                  <dt>Tax ({taxRate}%)</dt>
                  <dd className="tabular">{formatCurrency(taxAmount)}</dd>
                </div>
                <div className="flex justify-between border-t border-line pt-2 text-base font-semibold text-ink">
                  <dt>Total</dt>
                  <dd className="tabular">{formatCurrency(total)}</dd>
                </div>
              </dl>

              <Button
                className="w-full"
                size="lg"
                disabled={!canSubmit}
                loading={createOrder.isPending}
                onClick={submit}
              >
                {!createOrder.isPending && <ShoppingCart />}
                Send to kitchen
              </Button>

              {!canSubmit && cart.length > 0 && (
                <p className="text-center text-[11px] text-ink-subtle">
                  {orderType === 'dine_in' && !tableId
                    ? 'Choose a table to continue'
                    : orderType === 'delivery' && !deliveryAddress.trim()
                      ? 'Add a delivery address to continue'
                      : ''}
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
