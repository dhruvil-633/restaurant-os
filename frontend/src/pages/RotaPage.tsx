import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/shared/PageHeader';
import { QUERY_KEYS } from '@/constants/socketEvents';
import { cn, formatTime, toDateTimeInputValue } from '@/lib/utils';
import { getErrorMessage } from '@/services/api';
import { employeeService } from '@/services';
import type { Shift } from '@/types';

/** Monday of the week containing the given date. */
function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);
  result.setHours(0, 0, 0, 0);
  return result;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * The weekly rota.
 *
 * The shifts API already existed but had no screen, so a manager could only
 * schedule staff by calling the endpoint directly.
 */
export default function RotaPage() {
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    employeeId: '',
    startsAt: '',
    endsAt: '',
    label: 'Shift',
    notes: '',
  });

  const weekEnd = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 7);
    return end;
  }, [weekStart]);

  const shifts = useQuery({
    queryKey: ['shifts', weekStart.toISOString()],
    queryFn: () =>
      employeeService.shifts({ from: weekStart.toISOString(), to: weekEnd.toISOString() }),
  });

  const employees = useQuery({
    queryKey: QUERY_KEYS.employees,
    queryFn: () => employeeService.list({ limit: 100 }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['shifts'] });

  const createShift = useMutation({
    mutationFn: () =>
      employeeService.createShift({
        employeeId: form.employeeId,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        label: form.label || 'Shift',
        notes: form.notes || undefined,
      }),
    onSuccess: () => {
      toast.success('Shift scheduled');
      setDialogOpen(false);
      void invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not schedule that shift')),
  });

  const removeShift = useMutation({
    mutationFn: (id: string) => employeeService.removeShift(id),
    onSuccess: () => {
      toast.success('Shift removed');
      void invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not remove the shift')),
  });

  // One bucket per weekday so the grid renders without re-scanning the list.
  const byDay = useMemo(() => {
    const buckets: Record<number, Shift[]> = {};
    for (let index = 0; index < 7; index += 1) buckets[index] = [];
    for (const shift of shifts.data ?? []) {
      const day = (new Date(shift.startsAt).getDay() + 6) % 7;
      buckets[day]?.push(shift);
    }
    return buckets;
  }, [shifts.data]);

  const moveWeek = (direction: number): void => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + direction * 7);
    setWeekStart(next);
  };

  const openFor = (dayIndex: number): void => {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + dayIndex);
    day.setHours(10, 0, 0, 0);
    const end = new Date(day);
    end.setHours(18, 0, 0, 0);

    setForm({
      employeeId: employees.data?.data[0]?.id ?? '',
      startsAt: toDateTimeInputValue(day),
      endsAt: toDateTimeInputValue(end),
      label: 'Shift',
      notes: '',
    });
    setDialogOpen(true);
  };

  const isThisWeek = startOfWeek(new Date()).getTime() === weekStart.getTime();
  const valid =
    Boolean(form.employeeId) &&
    Boolean(form.startsAt) &&
    Boolean(form.endsAt) &&
    new Date(form.endsAt) > new Date(form.startsAt);

  return (
    <>
      <PageHeader
        title="Rota"
        description="Who is on, and when. Tap a day to put someone on."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => moveWeek(-1)}
              aria-label="Previous week"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setWeekStart(startOfWeek(new Date()))}
            >
              {isThisWeek ? 'This week' : 'Today'}
            </Button>
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => moveWeek(1)}
              aria-label="Next week"
            >
              <ChevronRight />
            </Button>
          </div>
        }
      />

      {shifts.isError ? (
        <ErrorState onRetry={() => void shifts.refetch()} />
      ) : shifts.isLoading ? (
        <div className="grid gap-3 lg:grid-cols-7">
          {DAY_LABELS.map((day) => (
            <Skeleton key={day} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-7">
          {DAY_LABELS.map((label, index) => {
            const date = new Date(weekStart);
            date.setDate(date.getDate() + index);
            const entries = byDay[index] ?? [];
            const isToday = new Date().toDateString() === date.toDateString();

            return (
              <Card
                key={label}
                className={cn('flex flex-col', isToday && 'border-brand ring-1 ring-brand/30')}
              >
                <div className="flex items-baseline justify-between border-b border-line px-3 py-2.5">
                  <span
                    className={cn('text-sm font-semibold', isToday ? 'text-brand' : 'text-ink')}
                  >
                    {label}
                  </span>
                  <span className="text-[11px] text-ink-subtle">{date.getDate()}</span>
                </div>

                <CardContent className="flex-1 space-y-2 p-2.5">
                  {entries.length === 0 ? (
                    <p className="py-4 text-center text-[11px] text-ink-subtle">Nobody on</p>
                  ) : (
                    entries.map((shift) => (
                      <div
                        key={shift.id}
                        className="group rounded-lg border border-line bg-surface-sunken p-2"
                      >
                        <p className="truncate text-[13px] font-medium text-ink">
                          {shift.employeeName}
                        </p>
                        <p className="mt-0.5 text-[11px] text-ink-muted">
                          {formatTime(shift.startsAt)} to {formatTime(shift.endsAt)}
                        </p>
                        <div className="mt-1.5 flex items-center justify-between gap-1">
                          <Badge tone="info" size="sm">
                            {shift.label}
                          </Badge>
                          <button
                            type="button"
                            onClick={() => removeShift.mutate(shift.id)}
                            className="rounded p-1 text-ink-subtle opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                            aria-label={`Remove shift for ${shift.employeeName ?? 'this person'}`}
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}

                  <button
                    type="button"
                    onClick={() => openFor(index)}
                    className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-line py-1.5 text-[11px] text-ink-subtle transition-colors hover:border-brand hover:text-brand"
                  >
                    <Plus className="size-3" />
                    Add
                  </button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {(shifts.data?.length ?? 0) === 0 && !shifts.isLoading && (
        <EmptyState
          className="mt-4"
          icon={<CalendarDays />}
          title="No shifts this week"
          description="Tap Add on any day to put someone on."
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule a shift</DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <Field label="Who" required>
              <Select
                value={form.employeeId}
                onValueChange={(value) => setForm({ ...form, employeeId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a team member" />
                </SelectTrigger>
                <SelectContent>
                  {(employees.data?.data ?? []).map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.name} · {employee.position}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts" required>
                <Input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
                />
              </Field>
              <Field label="Ends" required>
                <Input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(event) => setForm({ ...form, endsAt: event.target.value })}
                />
              </Field>
            </div>

            <Field label="Label">
              <Input
                value={form.label}
                onChange={(event) => setForm({ ...form, label: event.target.value })}
                placeholder="Lunch, Dinner, Close"
              />
            </Field>

            <Field label="Notes">
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!valid}
              loading={createShift.isPending}
              onClick={() => createShift.mutate()}
            >
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
