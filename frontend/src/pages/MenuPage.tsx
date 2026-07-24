import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Leaf, Pencil, Plus, Search, Trash2, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/shared/PageHeader';
import { QUERY_KEYS } from '@/constants/socketEvents';
import { useDebouncedValue } from '@/hooks';
import { cn, formatCurrency, resolveImageUrl } from '@/lib/utils';
import { getErrorMessage } from '@/services/api';
import { menuService } from '@/services';
import { useAuthStore } from '@/store/authStore';
import type { MenuItem } from '@/types';

const itemSchema = z.object({
  name: z.string().trim().min(2, 'Enter a dish name'),
  categoryId: z.string().uuid('Choose a category'),
  description: z.string().max(1000).optional(),
  price: z.coerce.number().min(0, 'Cannot be negative'),
  cost: z.coerce.number().min(0, 'Cannot be negative'),
  prepTimeMinutes: z.coerce.number().int().min(1, 'At least 1 minute').max(240),
  imageUrl: z.string().url('Enter a valid URL').or(z.literal('')).optional(),
  isVegetarian: z.boolean(),
  isAvailable: z.boolean(),
});

type ItemForm = z.infer<typeof itemSchema>;

export default function MenuPage() {
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.user?.role);
  const canEdit = role === 'owner' || role === 'manager';
  const canToggle = canEdit || role === 'chef' || role === 'kitchen_staff';

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<MenuItem | null>(null);

  const debouncedSearch = useDebouncedValue(search, 350);

  const categories = useQuery({
    queryKey: QUERY_KEYS.menuCategories,
    queryFn: menuService.listCategories,
  });

  const items = useQuery({
    queryKey: [...QUERY_KEYS.menuItems, { debouncedSearch, categoryId }],
    queryFn: () =>
      menuService.listItems({
        limit: 100,
        search: debouncedSearch || undefined,
        categoryId: categoryId === 'all' ? undefined : categoryId,
      }),
    placeholderData: keepPreviousData,
  });

  const form = useForm<ItemForm>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: '',
      categoryId: '',
      description: '',
      price: 0,
      cost: 0,
      prepTimeMinutes: 15,
      imageUrl: '',
      isVegetarian: false,
      isAvailable: true,
    },
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.menu });
  };

  const saveItem = useMutation({
    mutationFn: (values: ItemForm) =>
      editing ? menuService.updateItem(editing.id, values) : menuService.createItem(values),
    onSuccess: () => {
      toast.success(editing ? 'Dish updated' : 'Dish added to the menu');
      setDialogOpen(false);
      setEditing(null);
      form.reset();
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not save the dish')),
  });

  const toggleAvailability = useMutation({
    mutationFn: (id: string) => menuService.toggleAvailability(id),
    onSuccess: (updated) => {
      toast.success(`${updated.name} is ${updated.isAvailable ? 'available' : 'unavailable'}`);
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not update availability')),
  });

  const removeItem = useMutation({
    mutationFn: (id: string) => menuService.deleteItem(id),
    onSuccess: () => {
      // The API archives instead of deleting when a dish has order history.
      toast.success('Dish removed from the menu');
      setDeleting(null);
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not remove the dish')),
  });

  const openCreate = (): void => {
    setEditing(null);
    form.reset({
      name: '',
      categoryId: categories.data?.[0]?.id ?? '',
      description: '',
      price: 0,
      cost: 0,
      prepTimeMinutes: 15,
      imageUrl: '',
      isVegetarian: false,
      isAvailable: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (item: MenuItem): void => {
    setEditing(item);
    form.reset({
      name: item.name,
      categoryId: item.categoryId,
      description: item.description ?? '',
      price: item.price,
      cost: item.cost,
      prepTimeMinutes: item.prepTimeMinutes,
      imageUrl: item.imageUrl ?? '',
      isVegetarian: item.isVegetarian,
      isAvailable: item.isAvailable,
    });
    setDialogOpen(true);
  };

  const rows = items.data?.data ?? [];

  const stats = useMemo(() => {
    const all = rows;
    return {
      total: all.length,
      available: all.filter((item) => item.isAvailable).length,
      vegetarian: all.filter((item) => item.isVegetarian).length,
      averageMargin:
        all.length > 0
          ? Math.round(all.reduce((sum, item) => sum + item.margin, 0) / all.length)
          : 0,
    };
  }, [rows]);

  return (
    <>
      <PageHeader
        title="Menu"
        description="Dishes, pricing and what the kitchen can currently make."
        actions={
          canEdit && (
            <Button onClick={openCreate}>
              <Plus />
              Add dish
            </Button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Dishes" value={String(stats.total)} />
        <MiniStat label="Available" value={String(stats.available)} tone="success" />
        <MiniStat label="Vegetarian" value={String(stats.vegetarian)} tone="brand" />
        <MiniStat label="Avg. margin" value={`${stats.averageMargin}%`} tone="accent" />
      </div>

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search dishes…"
            leading={<Search />}
            className="sm:max-w-xs"
          />
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {(categories.data ?? []).map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name} ({category.itemCount})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {items.isError ? (
        <ErrorState onRetry={() => void items.refetch()} />
      ) : items.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<UtensilsCrossed />}
          title="No dishes here yet"
          description={canEdit ? 'Add your first dish to start taking orders.' : 'Nothing matches these filters.'}
          action={canEdit && <Button onClick={openCreate}>Add dish</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((item, index) => {
            const image = resolveImageUrl(item.imageUrl);

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, delay: Math.min(index * 0.02, 0.25) }}
              >
                <Card
                  className={cn(
                    'group flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md',
                    !item.isAvailable && 'opacity-70',
                  )}
                >
                  <div className="relative h-32 overflow-hidden bg-surface-sunken">
                    {image ? (
                      <img
                        src={image}
                        alt={item.name}
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <UtensilsCrossed className="size-8 text-ink-subtle/40" />
                      </div>
                    )}
                    <div className="absolute left-2 top-2 flex gap-1.5">
                      {item.isVegetarian && (
                        <Badge tone="success" size="sm">
                          <Leaf className="size-3" />
                        </Badge>
                      )}
                      {item.isFeatured && (
                        <Badge tone="accent" size="sm">
                          Featured
                        </Badge>
                      )}
                    </div>
                    {!item.isAvailable && (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-950/55">
                        <Badge tone="danger">Unavailable</Badge>
                      </div>
                    )}
                  </div>

                  <CardContent className="flex flex-1 flex-col p-4">
                    <p className="line-clamp-1 font-medium text-ink">{item.name}</p>
                    <p className="mt-0.5 text-[11px] text-ink-subtle">
                      {item.categoryName} · {item.prepTimeMinutes} min
                    </p>

                    <div className="mt-auto flex items-end justify-between gap-2 pt-3">
                      <div>
                        <p className="text-lg font-semibold tabular text-ink">
                          {formatCurrency(item.price)}
                        </p>
                        <p className="text-[11px] text-ink-subtle">{item.margin}% margin</p>
                      </div>

                      <div className="flex items-center gap-1">
                        {canToggle && (
                          <Switch
                            checked={item.isAvailable}
                            onCheckedChange={() => toggleAvailability.mutate(item.id)}
                            aria-label={`Toggle availability for ${item.name}`}
                          />
                        )}
                      </div>
                    </div>

                    {canEdit && (
                      <div className="mt-3 flex gap-1.5 border-t border-line pt-3">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1"
                          onClick={() => openEdit(item)}
                        >
                          <Pencil />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDeleting(item)}
                          aria-label={`Delete ${item.name}`}
                        >
                          <Trash2 className="text-danger" />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── Create / edit ────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add a dish'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={form.handleSubmit((values) => saveItem.mutate(values))}>
            <DialogBody className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Name"
                required
                error={form.formState.errors.name?.message}
                className="sm:col-span-2"
              >
                <Input {...form.register('name')} placeholder="Butter Chicken" />
              </Field>

              <Field label="Category" required error={form.formState.errors.categoryId?.message}>
                <Select
                  value={form.watch('categoryId')}
                  onValueChange={(value) => form.setValue('categoryId', value, { shouldValidate: true })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose one" />
                  </SelectTrigger>
                  <SelectContent>
                    {(categories.data ?? []).map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field
                label="Prep time (minutes)"
                required
                error={form.formState.errors.prepTimeMinutes?.message}
              >
                <Input type="number" min={1} {...form.register('prepTimeMinutes')} />
              </Field>

              <Field label="Price" required error={form.formState.errors.price?.message}>
                <Input type="number" min={0} step="0.01" {...form.register('price')} />
              </Field>

              <Field
                label="Ingredient cost"
                error={form.formState.errors.cost?.message}
                hint="Used for margin and waste valuation"
              >
                <Input type="number" min={0} step="0.01" {...form.register('cost')} />
              </Field>

              <Field
                label="Description"
                className="sm:col-span-2"
                error={form.formState.errors.description?.message}
              >
                <Textarea rows={2} {...form.register('description')} />
              </Field>

              <Field
                label="Image URL"
                className="sm:col-span-2"
                error={form.formState.errors.imageUrl?.message}
                hint="Paste any public image link"
              >
                <Input {...form.register('imageUrl')} placeholder="https://…" />
              </Field>

              <label className="flex items-center gap-3 rounded-xl border border-line p-3">
                <Switch
                  checked={form.watch('isVegetarian')}
                  onCheckedChange={(value) => form.setValue('isVegetarian', value)}
                />
                <span className="text-sm font-medium text-ink">Vegetarian</span>
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-line p-3">
                <Switch
                  checked={form.watch('isAvailable')}
                  onCheckedChange={(value) => form.setValue('isAvailable', value)}
                />
                <span className="text-sm font-medium text-ink">Available now</span>
              </label>
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={saveItem.isPending}>
                {editing ? 'Save changes' : 'Add dish'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete ───────────────────────────────────────────────── */}
      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Remove {deleting?.name}?</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-ink-muted">
              If this dish appears on past orders it will be retired from the menu rather than
              deleted, so historical bills stay accurate.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={removeItem.isPending}
              onClick={() => deleting && removeItem.mutate(deleting.id)}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MiniStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'success' | 'brand' | 'accent';
}) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tabular',
          tone === 'success' && 'text-success',
          tone === 'brand' && 'text-brand',
          tone === 'accent' && 'text-accent',
          tone === 'neutral' && 'text-ink',
        )}
      >
        {value}
      </p>
    </Card>
  );
}
