import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Moon, Save, Store, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/feedback';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/shared/PageHeader';
import { QUERY_KEYS } from '@/constants/socketEvents';
import { configureCurrency } from '@/lib/utils';
import { getErrorMessage } from '@/services/api';
import { settingsService } from '@/services';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';

const schema = z.object({
  restaurantName: z.string().trim().min(2, 'Enter the restaurant name').max(140),
  currency: z.string().trim().length(3, 'Use a 3-letter code, e.g. INR'),
  currencySymbol: z.string().trim().min(1).max(4),
  taxRatePercent: z.coerce.number().min(0).max(50),
  serviceChargePercent: z.coerce.number().min(0).max(50),
  loyaltyPointsPerCurrencyUnit: z.coerce.number().min(0).max(10),
  averageTableTurnoverMinutes: z.coerce.number().int().min(15).max(300),
  address: z.string().max(500).optional(),
  phone: z.string().max(32).optional(),
  lowStockNotifications: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.user?.role);
  const canEdit = role === 'owner' || role === 'manager';
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);

  const settings = useQuery({ queryKey: QUERY_KEYS.settings, queryFn: settingsService.get });

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  // Populate the form once the server values arrive.
  useEffect(() => {
    if (settings.data) form.reset(settings.data);
  }, [settings.data, form]);

  const save = useMutation({
    mutationFn: (values: FormValues) => settingsService.update(values),
    onSuccess: (updated) => {
      configureCurrency(updated.currencySymbol, updated.currency);
      toast.success('Settings saved');
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not save the settings')),
  });

  return (
    <>
      <PageHeader
        title="Settings"
        description="Restaurant details, tax and how the app looks."
        actions={
          canEdit && (
            <Button
              loading={save.isPending}
              onClick={form.handleSubmit((values) => save.mutate(values))}
            >
              <Save />
              Save changes
            </Button>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="size-4 text-ink-muted" />
              Restaurant
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {settings.isLoading ? (
              <>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </>
            ) : (
              <>
                <Field label="Name" required error={form.formState.errors.restaurantName?.message}>
                  <Input disabled={!canEdit} {...form.register('restaurantName')} />
                </Field>
                <Field label="Address" error={form.formState.errors.address?.message}>
                  <Textarea rows={2} disabled={!canEdit} {...form.register('address')} />
                </Field>
                <Field label="Phone" error={form.formState.errors.phone?.message}>
                  <Input disabled={!canEdit} {...form.register('phone')} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Currency code" error={form.formState.errors.currency?.message}>
                    <Input disabled={!canEdit} maxLength={3} {...form.register('currency')} />
                  </Field>
                  <Field label="Symbol" error={form.formState.errors.currencySymbol?.message}>
                    <Input disabled={!canEdit} maxLength={4} {...form.register('currencySymbol')} />
                  </Field>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Service &amp; billing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {settings.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Tax rate (%)"
                    error={form.formState.errors.taxRatePercent?.message}
                    hint="Applied to every new order"
                  >
                    <Input
                      type="number"
                      step="0.5"
                      disabled={!canEdit}
                      {...form.register('taxRatePercent')}
                    />
                  </Field>
                  <Field
                    label="Service charge (%)"
                    error={form.formState.errors.serviceChargePercent?.message}
                  >
                    <Input
                      type="number"
                      step="0.5"
                      disabled={!canEdit}
                      {...form.register('serviceChargePercent')}
                    />
                  </Field>
                </div>

                <Field
                  label="Loyalty points per unit spent"
                  error={form.formState.errors.loyaltyPointsPerCurrencyUnit?.message}
                  hint="0.1 means 10 points for every 100 spent"
                >
                  <Input
                    type="number"
                    step="0.01"
                    disabled={!canEdit}
                    {...form.register('loyaltyPointsPerCurrencyUnit')}
                  />
                </Field>

                <Field
                  label="Average table turnover (minutes)"
                  error={form.formState.errors.averageTableTurnoverMinutes?.message}
                  hint="Feeds the Smart Wait Time estimate on the floor"
                >
                  <Input
                    type="number"
                    disabled={!canEdit}
                    {...form.register('averageTableTurnoverMinutes')}
                  />
                </Field>

                <label className="flex items-center justify-between gap-3 rounded-xl border border-line p-3.5">
                  <span>
                    <span className="block text-sm font-medium text-ink">Low stock alerts</span>
                    <span className="mt-0.5 block text-xs text-ink-muted">
                      Notify managers when an ingredient drops below its minimum.
                    </span>
                  </span>
                  <Switch
                    disabled={!canEdit}
                    checked={form.watch('lowStockNotifications') ?? true}
                    onCheckedChange={(value) => form.setValue('lowStockNotifications', value)}
                  />
                </label>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <p className="mt-0.5 text-sm text-ink-muted">
              Stored on this device — each person on the team can choose their own.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {(['light', 'dark'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTheme(option)}
                className={`flex flex-1 min-w-[12rem] items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
                  theme === option
                    ? 'border-brand bg-brand-soft'
                    : 'border-line hover:bg-surface-hover'
                }`}
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-surface shadow-xs">
                  {option === 'light' ? (
                    <Sun className="size-4 text-warning" />
                  ) : (
                    <Moon className="size-4 text-info" />
                  )}
                </span>
                <span>
                  <span className="block text-sm font-medium text-ink">
                    {option === 'light' ? 'Light' : 'Dark'}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    {option === 'light' ? 'Bright, for daytime service' : 'Easier on the eyes at night'}
                  </span>
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      {!canEdit && (
        <p className="mt-4 text-center text-sm text-ink-subtle">
          Only owners and managers can change restaurant settings.
        </p>
      )}
    </>
  );
}
