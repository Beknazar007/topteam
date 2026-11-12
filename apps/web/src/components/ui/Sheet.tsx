import { useEffect, type ReactNode } from 'react';

/** Шторка снизу (модальная). */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center md:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="pb-safe max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[26px] border-t border-line bg-surface px-4 pt-3 md:max-h-[85dvh] md:rounded-[26px] md:border md:px-6 md:pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line md:hidden" />
        {children}
        <div className="h-5" />
      </div>
    </div>
  );
}
