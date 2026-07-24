import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { getErrorMessage } from '@/services/api';
import { profileService } from '@/services';

const schema = z.object({
  email: z.string().min(1, 'Enter your email').email('Enter a valid email address'),
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  /** Returned only when SMTP is unconfigured, so the flow stays testable. */
  const [devToken, setDevToken] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues): Promise<void> => {
    try {
      const result = await profileService.forgotPassword(values.email);
      setDevToken(result?.resetToken ?? null);
      setSent(true);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not send the reset link'));
    }
  };

  if (sent) {
    return (
      <div className="text-center">
        <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-success-soft">
          <CheckCircle2 className="size-7 text-success" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Check your inbox</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted text-balance">
          If <span className="font-medium text-ink">{getValues('email')}</span> is registered, a
          reset link is on its way. It expires in 30 minutes.
        </p>

        {devToken && (
          <div className="mt-6 rounded-xl border border-warning/30 bg-warning-soft p-4 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-warning-soft-ink">
              Development mode
            </p>
            <p className="mt-1 text-[13px] text-warning-soft-ink">
              No SMTP credentials are configured, so the email was logged instead of sent. Use this
              link to continue:
            </p>
            <Link
              to={`/reset-password?token=${devToken}`}
              className="mt-2 block break-all rounded-lg bg-surface px-2.5 py-2 font-mono text-[11px] text-brand hover:underline"
            >
              /reset-password?token={devToken}
            </Link>
          </div>
        )}

        <Button variant="secondary" className="mt-6" asChild>
          <Link to="/login">
            <ArrowLeft />
            Back to sign in
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Reset your password</h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          Enter your email and we’ll send a link to set a new one.
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

        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          {!isSubmitting && <Mail />}
          Send reset link
        </Button>
      </form>

      <Link
        to="/login"
        className="mt-6 flex items-center justify-center gap-1.5 text-[13px] font-medium text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3.5" />
        Back to sign in
      </Link>
    </div>
  );
}
