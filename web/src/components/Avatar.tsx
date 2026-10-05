interface AvatarProps {
  name: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Avatar({ name, color, size = 'md' }: AvatarProps) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  const dims = { sm: 'h-10 w-10 text-sm', md: 'h-16 w-16 text-xl', lg: 'h-20 w-20 text-2xl' }[size];
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
