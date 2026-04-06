'use client';

import { useEffect, useRef, useState } from 'react';

interface BadgeProps {
  count: number;
}

export default function Badge({ count }: BadgeProps) {
  const prevCount = useRef(count);
  const [bounce, setBounce] = useState(false);

  useEffect(() => {
    if (count > prevCount.current) {
      setBounce(true);
      const t = setTimeout(() => setBounce(false), 300);
      return () => clearTimeout(t);
    }
    prevCount.current = count;
  }, [count]);

  if (count === 0) return null;
  return (
    <span className={`absolute -top-2 -right-2 bg-orange text-white text-xs font-heading font-bold w-5 h-5 rounded-full flex items-center justify-center ${bounce ? 'animate-cart-bounce' : ''}`} aria-label={`${count} productos en el carrito`} role="status">
      {count > 99 ? '99+' : count}
    </span>
  );
}
