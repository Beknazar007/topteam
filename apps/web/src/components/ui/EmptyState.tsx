import type { ReactNode } from 'react';

export function EmptyState({ emoji, title, children }: { emoji: string; title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 py-10 text-center">
      <div className="text-4xl">{emoji}</div>
      <div className="font-extrabold">{title}</div>
      {children && <div className="max-w-[260px] text-sm text-muted">{children}</div>}
    </div>
  );
}
