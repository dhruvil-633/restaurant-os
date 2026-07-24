import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Award, Clock, Star, Timer, TrendingUp, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
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
import { Field, Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
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
import { cn, formatCurrency, formatDuration, formatRelativeTime, titleCase } from '@/lib/utils';
import { getErrorMessage } from '@/services/api';
import { employeeService, userService } from '@/services';
import type { UserRole } from '@/types';

const ROLES: UserRole[] = ['owner', 'manager', 'cashier', 'waiter', 'chef', 'kitchen_staff'];

const userSchema = z.object({
  name: z.string().trim().min(2, 'Enter a full name'),
  email: z.string().email('Enter a valid email'),
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .regex(/[a-z]/, 'Include a lowercase letter')
    .regex(/[A-Z]/, 'Include an uppercase letter')
    .regex(/\d/, 'Include a number'),
  role: z.enum(['owner', 'manager', 'cashier', 'waiter', 'chef', 'kitchen_staff']),
  phone: z.string().optional(),
});

type UserForm = z.infer<typeof userSchema>;

export default function TeamPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const users = useQuery({
    queryKey: QUERY_KEYS.users,
    queryFn: () => userService.list({ limit: 100 }),
  });

  const performance = useQuery({
    queryKey: QUERY_KEYS.performance,
    queryFn: () => employeeService.performance(),
  });

  const employees = useQuery({
    queryKey: QUERY_KEYS.employees,
    queryFn: () => employeeService.list({ limit: 100 }),
  });

  const form = useForm<UserForm>({
    resolver: zodResolver(userSchema),
    defaultValues: { name: '', email: '', password: '', role: 'waiter', phone: '' },
  });

  const createUser = useMutation({
    mutationFn: (values: UserForm) => userService.create(values),
    onSuccess: (user) => {
      toast.success(`${user.name} can now sign in`);
      setDialogOpen(false);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.users });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not create the account')),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      userService.update(id, { isActive }),
    onSuccess: (user) => {
      toast.success(`${user.name} is ${user.isActive ? 'active' : 'deactivated'}`);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.users });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not update the account')),
  });

  const staff = performance.data?.staff ?? [];
  const top = performance.data?.topPerformer;

  return (
    <>
      <PageHeader
        title="Team"
        description="Accounts, performance and who is carrying the shift."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <UserPlus />
            Add staff
          </Button>
        }
      />

      <Tabs defaultValue="performance">
        <TabsList>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="records">HR records</TabsTrigger>
        </TabsList>

        {/* ── Performance ────────────────────────────────────────── */}
        <TabsContent value="performance">
          {performance.isError ? (
            <ErrorState onRetry={() => void performance.refetch()} />
          ) : performance.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24 w-full rounded-2xl" />
              ))}
            </div>
          ) : staff.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title="No completed orders in this period"
              description="Performance is measured from completed orders over the last 30 days."
            />
          ) : (
            <>
              {top && (
                <Card className="mb-4 overflow-hidden border-brand/30 bg-gradient-to-br from-brand-soft to-transparent">
                  <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                    <Avatar name={top.name} src={top.avatarUrl} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Award className="size-4 text-brand" />
                        <span className="text-xs font-semibold uppercase tracking-wide text-brand">
                          Top performer
                        </span>
                      </div>
                      <p className="mt-1 text-lg font-semibold text-ink">{top.name}</p>
                      <p className="text-sm text-ink-muted">
                        {top.ordersServed} orders · {formatCurrency(top.revenue)} ·{' '}
                        {formatDuration(top.averageServiceMinutes)} average service
                      </p>
                    </div>
                    <div className="shrink-0 text-center">
                      <p className="text-3xl font-semibold tabular text-brand">
                        {top.performanceScore}
                      </p>
                      <p className="text-[11px] text-ink-subtle">out of 100</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-3">
                {staff.map((member, index) => (
                  <Card key={member.userId ?? index}>
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span className="w-5 shrink-0 text-center text-sm font-semibold text-ink-subtle tabular">
                            {index + 1}
                          </span>
                          <Avatar name={member.name} src={member.avatarUrl} size="md" />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">{member.name}</p>
                            <p className="text-[11px] text-ink-subtle">{titleCase(member.role)}</p>
                          </div>
                        </div>

                        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                          <Metric icon={TrendingUp} label="Orders" value={String(member.ordersServed)} />
                          <Metric icon={Star} label="Revenue" value={formatCurrency(member.revenue, { compact: true })} />
                          <Metric
                            icon={Timer}
                            label="Avg. service"
                            value={formatDuration(member.averageServiceMinutes)}
                          />
                          <Metric
                            icon={Clock}
                            label="Attendance"
                            value={member.attendanceRate !== null ? `${member.attendanceRate}%` : '—'}
                          />
                        </div>

                        <div className="w-full shrink-0 sm:w-32">
                          <div className="flex items-baseline justify-between">
                            <span className="text-[11px] text-ink-subtle">Score</span>
                            <span className="text-sm font-semibold tabular text-ink">
                              {member.performanceScore}
                            </span>
                          </div>
                          <Progress
                            value={member.performanceScore}
                            size="sm"
                            className="mt-1"
                            tone={
                              member.performanceScore >= 75
                                ? 'success'
                                : member.performanceScore >= 55
                                  ? 'warning'
                                  : 'danger'
                            }
                          />
                          {member.averageRating !== null && (
                            <p className="mt-1 text-[11px] text-ink-subtle">
                              {member.averageRating.toFixed(1)}★ from {member.reviewCount} reviews
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Accounts ───────────────────────────────────────────── */}
        <TabsContent value="accounts">
          <Card>
            <CardContent className="p-0">
              {users.isLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-14 w-full" />
                  ))}
                </div>
              ) : (
                <TableWrapper>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Last seen</TableHead>
                        <TableHead className="text-right">Active</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(users.data?.data ?? []).map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <Avatar name={user.name} src={user.avatarUrl} size="sm" />
                              <span className="font-medium text-ink">{user.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge tone="brand" size="sm">
                              {titleCase(user.role)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-ink-muted">{user.email}</TableCell>
                          <TableCell className="text-sm text-ink-muted">
                            {user.lastLoginAt ? formatRelativeTime(user.lastLoginAt) : 'Never'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Switch
                              checked={user.isActive}
                              onCheckedChange={(value) =>
                                toggleActive.mutate({ id: user.id, isActive: value })
                              }
                              aria-label={`Toggle ${user.name}`}
                            />
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

        {/* ── HR records ─────────────────────────────────────────── */}
        <TabsContent value="records">
          <Card>
            <CardHeader>
              <CardTitle>Employee records</CardTitle>
              <p className="mt-0.5 text-sm text-ink-muted">
                The HR view — salaries, departments and hire dates.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {employees.isLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-14 w-full" />
                  ))}
                </div>
              ) : (
                <TableWrapper>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Position</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead className="text-right">Monthly salary</TableHead>
                        <TableHead>Hired</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(employees.data?.data ?? []).map((employee) => (
                        <TableRow key={employee.id}>
                          <TableCell className="font-mono text-xs text-ink-muted">
                            {employee.employeeCode}
                          </TableCell>
                          <TableCell className="font-medium text-ink">{employee.name}</TableCell>
                          <TableCell className="text-sm text-ink-muted">{employee.position}</TableCell>
                          <TableCell>
                            <Badge size="sm" tone={employee.department === 'Kitchen' ? 'accent' : 'info'}>
                              {employee.department}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular">
                            {formatCurrency(employee.monthlySalary)}
                          </TableCell>
                          <TableCell className="text-sm text-ink-muted">{employee.hiredAt}</TableCell>
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

      {/* ── Add staff ────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a staff account</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((values) => createUser.mutate(values))}>
            <DialogBody className="space-y-4">
              <Field label="Full name" required error={form.formState.errors.name?.message}>
                <Input {...form.register('name')} placeholder="Sneha Kulkarni" />
              </Field>
              <Field label="Email" required error={form.formState.errors.email?.message}>
                <Input type="email" {...form.register('email')} placeholder="sneha@restaurant.com" />
              </Field>
              <Field label="Phone" error={form.formState.errors.phone?.message}>
                <Input {...form.register('phone')} placeholder="+91 98765 43210" />
              </Field>
              <Field label="Role" required>
                <Select
                  value={form.watch('role')}
                  onValueChange={(value) => form.setValue('role', value as UserRole)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {titleCase(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Temporary password"
                required
                error={form.formState.errors.password?.message}
                hint="Emailed to them, and they can change it after signing in."
              >
                <Input type="text" {...form.register('password')} />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={createUser.isPending}>
                Create account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className={cn('rounded-lg bg-surface-sunken px-2.5 py-2')}>
      <div className="flex items-center gap-1 text-ink-subtle">
        <Icon className="size-3" />
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-0.5 text-sm font-semibold tabular text-ink">{value}</p>
    </div>
  );
}
