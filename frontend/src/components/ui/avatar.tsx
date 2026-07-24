import { cn, colorFromString, initialsOf, resolveImageUrl } from '@/lib/utils';

const SIZES = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-12 text-base',
  xl: 'size-16 text-xl',
} as const;

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
  /** Small status pip in the lower-right corner. */
  online?: boolean;
}

/**
 * Falls back to colour-coded initials when there is no image, which keeps
 * staff lists legible without every record needing a photo.
 */
export function Avatar({ name, src, size = 'md', className, online }: AvatarProps) {
  const url = resolveImageUrl(src);

  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      {url ? (
        <img
          src={url}
          alt={name}
          loading="lazy"
          className={cn(
            SIZES[size],
            'rounded-full object-cover ring-1 ring-line bg-surface-sunken',
          )}
        />
      ) : (
        <span
          aria-label={name}
          className={cn(
            SIZES[size],
            colorFromString(name),
            'flex items-center justify-center rounded-full font-semibold text-white ring-1 ring-black/5',
          )}
        >
          {initialsOf(name)}
        </span>
      )}
      {online !== undefined && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full ring-2 ring-surface',
            size === 'xs' || size === 'sm' ? 'size-2' : 'size-2.5',
            online ? 'bg-success' : 'bg-ink-subtle',
          )}
        />
      )}
    </span>
  );
}

export interface AvatarGroupProps {
  people: { name: string; avatarUrl?: string | null }[];
  max?: number;
  size?: keyof typeof SIZES;
}

export function AvatarGroup({ people, max = 4, size = 'sm' }: AvatarGroupProps) {
  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;

  return (
    <div className="flex items-center -space-x-2">
      {shown.map((person, index) => (
        <Avatar
          key={`${person.name}-${index}`}
          name={person.name}
          src={person.avatarUrl}
          size={size}
          className="ring-2 ring-surface rounded-full"
        />
      ))}
      {overflow > 0 && (
        <span
          className={cn(
            SIZES[size],
            'flex items-center justify-center rounded-full bg-surface-sunken font-semibold text-ink-muted ring-2 ring-surface',
          )}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
