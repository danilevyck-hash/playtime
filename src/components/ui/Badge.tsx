interface BadgeProps {
  count: number;
}

export default function Badge({ count }: BadgeProps) {
  if (count === 0) return null;
  return (
    <span className="absolute -top-2 -right-2 bg-orange text-white text-xs font-heading font-bold w-5 h-5 rounded-full flex items-center justify-center">
      {count > 99 ? '99+' : count}
    </span>
  );
}
