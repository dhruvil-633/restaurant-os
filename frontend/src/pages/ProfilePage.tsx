import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, LogOut, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { PageHeader } from '@/components/shared/PageHeader';
import { formatDateTime, titleCase } from '@/lib/utils';
import { getErrorMessage } from '@/services/api';
import { profileService } from '@/services';
import { useAuthStore } from '@/store/authStore';

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name'),
  phone: z.string().max(32).optional(),
  avatarUrl: z.string().url('Enter a valid URL').or(z.literal('')).optional(),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z
      .string()
      .min(8, 'Use at least 8 characters')
      .regex(/[a-z]/, 'Include a lowercase letter')
      .regex(/[A-Z]/, 'Include an uppercase letter')
      .regex(/\d/, 'Include a number'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

export default function ProfilePage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name ?? '',
      phone: user?.phone ?? '',
      avatarUrl: user?.avatarUrl ?? '',
    },
  });

  const passwordForm = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });

  const updateProfile = useMutation({
    mutationFn: (values: ProfileForm) => profileService.update(values),
    onSuccess: (updated) => {
      setUser(updated);
      toast.success('Profile updated');
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not update your profile')),
  });

  const changePassword = useMutation({
    mutationFn: (values: PasswordForm) =>
      profileService.changePassword(values.currentPassword, values.newPassword),
    onSuccess: async () => {
      toast.success('Password changed', { description: 'Please sign in again.' });
      passwordForm.reset();
      // The API revokes every session on a password change, so sign out cleanly.
      await logout();
      navigate('/login', { replace: true });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not change your password')),
  });

  return (
    <>
      <PageHeader title="Profile" description="Your account details and password." />

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <Card className="h-fit">
          <CardContent className="flex flex-col items-center p-6 text-center">
            <Avatar name={user?.name ?? 'User'} src={user?.avatarUrl} size="xl" />
            <p className="mt-4 text-lg font-semibold text-ink">{user?.name}</p>
            <p className="text-sm text-ink-muted">{user?.email}</p>
            <Badge tone="brand" className="mt-3">
              {titleCase(user?.role ?? '')}
            </Badge>

            <dl className="mt-6 w-full space-y-2 border-t border-line pt-4 text-left text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-subtle">Last sign-in</dt>
                <dd className="text-right font-medium text-ink">
                  {user?.lastLoginAt ? formatDateTime(user.lastLoginAt) : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-subtle">Member since</dt>
                <dd className="text-right font-medium text-ink">
                  {user?.createdAt ? formatDateTime(user.createdAt) : '—'}
                </dd>
              </div>
            </dl>

            <Button
              variant="secondary"
              className="mt-5 w-full"
              onClick={() => void logout().then(() => navigate('/login', { replace: true }))}
            >
              <LogOut />
              Sign out
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Your details</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={profileForm.handleSubmit((values) => updateProfile.mutate(values))}
                className="space-y-4"
              >
                <Field label="Full name" required error={profileForm.formState.errors.name?.message}>
                  <Input {...profileForm.register('name')} />
                </Field>
                <Field label="Phone" error={profileForm.formState.errors.phone?.message}>
                  <Input {...profileForm.register('phone')} placeholder="+91 98765 43210" />
                </Field>
                <Field
                  label="Avatar URL"
                  error={profileForm.formState.errors.avatarUrl?.message}
                  hint="Paste a link to a photo, or leave it blank to use your initials."
                >
                  <Input {...profileForm.register('avatarUrl')} placeholder="https://…" />
                </Field>

                <Button type="submit" loading={updateProfile.isPending}>
                  <Save />
                  Save changes
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Change password</CardTitle>
              <p className="mt-0.5 text-sm text-ink-muted">
                You’ll be signed out of every device, including this one.
              </p>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={passwordForm.handleSubmit((values) => changePassword.mutate(values))}
                className="space-y-4"
              >
                <Field
                  label="Current password"
                  required
                  error={passwordForm.formState.errors.currentPassword?.message}
                >
                  <Input
                    type="password"
                    autoComplete="current-password"
                    {...passwordForm.register('currentPassword')}
                  />
                </Field>
                <Field
                  label="New password"
                  required
                  error={passwordForm.formState.errors.newPassword?.message}
                >
                  <Input
                    type="password"
                    autoComplete="new-password"
                    {...passwordForm.register('newPassword')}
                  />
                </Field>
                <Field
                  label="Confirm new password"
                  required
                  error={passwordForm.formState.errors.confirmPassword?.message}
                >
                  <Input
                    type="password"
                    autoComplete="new-password"
                    {...passwordForm.register('confirmPassword')}
                  />
                </Field>

                <Button type="submit" variant="secondary" loading={changePassword.isPending}>
                  <KeyRound />
                  Change password
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
