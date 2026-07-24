import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarClock, CalendarPlus, Clock, Phone, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, RESERVATION_STATUS_TONE } from '@/components/ui/badge';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/PageHeader';
import { QUERY_KEYS } from '@/constants/socketEvents';
import { formatDate, formatTime, titleCase, toDateTimeInputValue } from '@/lib/utils';
import { getErrorMessage } from '@/services/api';
import { reservationService, tableService } from '@/services';
import type { Reservation, ReservationStatus } from '@/types';

const schema = z.object({
  customerName: z.string().trim().min(2, 'Enter the guest name'),
  customerPhone: z.string().trim().min(7, 'Enter a phone number'),
  customerEmail: z.string().email('Enter a valid email').or(z.literal('')).optional(),
  partySize: z.coerce.number().int().min(1).max(50),
  reservedFor: z.string().min(1, 'Choose a date and time'),
  durationMinutes: z.coerce.number().int().min(15).max(480),
  tableId: z.string().optional(),
  specialRequest: z.string().max(500).optional(),
});

type FormValues = z.infer<typeof schema>;

const NEXT_STATUS: Partial<Record<ReservationStatus, { label: string; value: ReservationStatus }>> = {
  pending: { label: 'Confirm', value: 'confirmed' },
  confirmed: { label: 'Seat guests', value: 'seated' },
  seated: { label: 'Complete', value: 'completed' },
};

export default function ReservationsPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'today' | 'upcoming'>('today');
  const [dialogOpen, setDialogOpen] = useState(false);

  const today = useQuery({
    queryKey: QUERY_KEYS.reservationsToday,
    queryFn: reservationService.today,
    refetchInterval: 60_000,
  });

  const upcoming = useQuery({
    queryKey: [...QUERY_KEYS.reservations, 'upcoming'],
    queryFn: () =>
      reservationService.list({ limit: 50, from: new Date().toISOString(), sortOrder: 'asc' }),
    enabled: view === 'upcoming',
  });

  const tables = useQuery({ queryKey: QUERY_KEYS.tables, queryFn: () => tableService.list() });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      partySize: 2,
      reservedFor: toDateTimeInputValue(new Date(Date.now() + 2 * 3_600_000)),
      durationMinutes: 90,
      tableId: '',
      specialRequest: '',
    },
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.reservations });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tables });
  };

  const createReservation = useMutation({
    mutationFn: (values: FormValues) =>
      reservationService.create({
        ...values,
        tableId: values.tableId || null,
        reservedFor: new Date(values.reservedFor).toISOString(),
      }),
    onSuccess: (reservation) => {
      toast.success('Reservation confirmed', {
        description: `${reservation.customerName} · ${formatDate(reservation.reservedFor)} at ${formatTime(reservation.reservedFor)}`,
      });
      setDialogOpen(false);
      form.reset();
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not create the reservation')),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReservationStatus }) =>
      reservationService.update(id, { status }),
    onSuccess: (reservation) => {
      toast.success(`Marked as ${titleCase(reservation.status)}`);
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not update the reservation')),
  });

  const summary = today.data?.summary;
  const list = view === 'today' ? (today.data?.reservations ?? []) : (upcoming.data?.data ?? []);
  const isLoading = view === 'today' ? today.isLoading : upcoming.isLoading;

  return (
    <>
      <PageHeader
        title="Reservations"
        description="Bookings, arrivals and who is still expected tonight."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <CalendarPlus />
            New booking
          </Button>
        }
      />

      {summary && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Today" value={summary.total} />
          <Stat label="To arrive" value={summary.upcoming} tone="text-info" />
          <Stat label="Seated" value={summary.seated} tone="text-brand" />
          <Stat label="No-shows" value={summary.noShow} tone="text-danger" />
          <Stat label="Guests expected" value={summary.expectedGuests} tone="text-accent" />
        </div>
      )}

      <Tabs value={view} onValueChange={(value) => setView(value as 'today' | 'upcoming')} className="mb-4">
        <TabsList>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
        </TabsList>
      </Tabs>

      {today.isError ? (
        <ErrorState onRetry={() => void today.refetch()} />
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<CalendarClock />}
          title={view === 'today' ? 'Nothing booked today' : 'No upcoming bookings'}
          description="New reservations appear here as soon as they're taken."
          action={<Button onClick={() => setDialogOpen(true)}>Take a booking</Button>}
        />
      ) : (
        <div className="space-y-3">
          {list.map((reservation) => (
            <ReservationRow
              key={reservation.id}
              reservation={reservation}
              onStatusChange={(status) => updateStatus.mutate({ id: reservation.id, status })}
              busy={updateStatus.isPending}
            />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>New reservation</DialogTitle>
          </DialogHeader>

          <form onSubmit={form.handleSubmit((values) => createReservation.mutate(values))}>
            <DialogBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Guest name" required error={form.formState.errors.customerName?.message}>
                <Input {...form.register('customerName')} placeholder="Ananya Sharma" />
              </Field>
              <Field label="Phone" required error={form.formState.errors.customerPhone?.message}>
                <Input {...form.register('customerPhone')} placeholder="+91 98765 43210" />
              </Field>
              <Field label="Email" error={form.formState.errors.customerEmail?.message}>
                <Input type="email" {...form.register('customerEmail')} />
              </Field>
              <Field label="Party size" required error={form.formState.errors.partySize?.message}>
                <Input type="number" min={1} max={50} {...form.register('partySize')} />
              </Field>
              <Field label="Date & time" required error={form.formState.errors.reservedFor?.message}>
                <Input type="datetime-local" {...form.register('reservedFor')} />
              </Field>
              <Field label="Duration (minutes)" error={form.formState.errors.durationMinutes?.message}>
                <Input type="number" min={15} step={15} {...form.register('durationMinutes')} />
              </Field>
              <Field label="Table" className="sm:col-span-2" hint="Leave empty to assign on arrival">
                <Select
                  value={form.watch('tableId') || 'none'}
                  onValueChange={(value) => form.setValue('tableId', value === 'none' ? '' : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Assign later" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Assign later</SelectItem>
                    {(tables.data ?? []).map((table) => (
                      <SelectItem key={table.id} value={table.id}>
                        {table.label} · {table.section} · seats {table.capacity}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Special request" className="sm:col-span-2">
                <Textarea rows={2} {...form.register('specialRequest')} placeholder="Birthday, window seat, allergies…" />
              </Field>
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={createReservation.isPending}>
                Confirm booking
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReservationRow({
  reservation,
  onStatusChange,
  busy,
}: {
  reservation: Reservation;
  onStatusChange: (status: ReservationStatus) => void;
  busy: boolean;
}) {
  const next = NEXT_STATUS[reservation.status];
  const isSoon = reservation.minutesUntilArrival > 0 && reservation.minutesUntilArrival <= 30;

  return (
    <Card className={isSoon ? 'border-accent/40 bg-accent-soft/25' : undefined}>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="shrink-0 rounded-xl bg-surface-sunken px-3 py-2 text-center">
            <p className="text-sm font-semibold tabular text-ink">
              {formatTime(reservation.reservedFor)}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-ink-subtle">
              {formatDate(reservation.reservedFor).split(',')[0]}
            </p>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-ink">{reservation.customerName}</p>
              <Badge tone={RESERVATION_STATUS_TONE[reservation.status]} size="sm" dot>
                {titleCase(reservation.status)}
              </Badge>
              {isSoon && (
                <Badge tone="accent" size="sm">
                  Arriving in {reservation.minutesUntilArrival}m
                </Badge>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
              <span className="flex items-center gap-1">
                <Users className="size-3" />
                {reservation.partySize} guests
              </span>
              <span className="flex items-center gap-1">
                <Phone className="size-3" />
                {reservation.customerPhone}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {reservation.durationMinutes}m
              </span>
              {reservation.tableLabel && <span>Table {reservation.tableLabel}</span>}
            </div>

            {reservation.specialRequest && (
              <p className="mt-1.5 text-xs italic text-accent">“{reservation.specialRequest}”</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          {next && (
            <Button size="sm" disabled={busy} onClick={() => onStatusChange(next.value)}>
              {next.label}
            </Button>
          )}
          {['pending', 'confirmed'].includes(reservation.status) && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => onStatusChange('no_show')}
            >
              No-show
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone = 'text-ink' }: { label: string; value: number; tone?: string }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular ${tone}`}>{value}</p>
    </Card>
  );
}
