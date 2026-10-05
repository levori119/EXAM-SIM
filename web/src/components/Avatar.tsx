interface AvatarProps {
  name: string;
  color: string;
  size?: 'md' | 'lg';
}

export function Avatar({ name, color, size = 'md' }: AvatarProps) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  const dims = size === 'lg' ? 'h-20 w-20 text-2xl' : 'h-16 w-16 text-xl';
  return (
    <div
      className={`${dims} flex shrink-0 items-center justify-center rounded-full font-bold text-white shadow-md`}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
