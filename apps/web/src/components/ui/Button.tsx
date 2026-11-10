import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'ghost' | 'telegram';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white',
  ghost: 'bg-surface2 text-text',
  telegram: 'bg-tg text-white',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl text-base font-extrabold tracking-wide transition-transform active:scale-[0.97] disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
