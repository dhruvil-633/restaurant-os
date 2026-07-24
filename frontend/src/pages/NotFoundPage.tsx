import { Link } from 'react-router-dom';
import { ArrowLeft, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/authStore';
import { ROLE_HOME } from '@/constants/navigation';

export default function NotFoundPage() {
  const role = useAuthStore((state) => state.user?.role);
  const home = role ? ROLE_HOME[role] : '/';

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <span className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-surface-sunken text-ink-subtle">
        <Compass className="size-7" />
      </span>
      <p className="text-sm font-semibold uppercase tracking-wider text-brand">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
        This page isn’t on the menu
      </h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted text-balance">
        The link may be out of date, or the screen may not be available for your role.
      </p>
      <Button className="mt-6" asChild>
        <Link to={home}>
          <ArrowLeft />
          Back to safety
        </Link>
      </Button>
    </div>
  );
}
