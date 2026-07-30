import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/authStore';
import { ROLE_HOME } from '@/constants/navigation';

const schema = z.object({
  email: z.string().min(1, 'Enter your email').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((state) => state.login);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: FormValues): Promise<void> => {
    try {
      await login(values.email, values.password);
      const role = useAuthStore.getState().user?.role;
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? (role ? ROLE_HOME[role] : '/'), { replace: true });
      toast.success('Signed in');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not sign in');
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Welcome back</h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          Sign in to pick up where the last shift left off.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email" required error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@restaurant.com"
            invalid={Boolean(errors.email)}
            {...register('email')}
          />
        </Field>

        <Field label="Password" htmlFor="password" required error={errors.password?.message}>
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            invalid={Boolean(errors.password)}
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="pointer-events-auto rounded p-0.5 text-ink-subtle transition-colors hover:text-ink"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            }
            {...register('password')}
          />
        </Field>

        <div className="flex justify-end">
          <Link
            to="/forgot-password"
            className="text-[13px] font-medium text-brand transition-colors hover:text-brand-hover"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          {!isSubmitting && <LogIn />}
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-[13px] text-ink-muted">
        Setting up a new restaurant?{' '}
        <Link to="/register" className="font-medium text-brand hover:text-brand-hover">
          Create the owner account
        </Link>
      </p>
    </div>
  );
}
