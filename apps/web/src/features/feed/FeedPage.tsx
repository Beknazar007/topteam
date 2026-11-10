import { EmptyState } from '../../components/ui/EmptyState';

export function FeedPage() {
  return (
    <>
      <h1 className="mb-4 text-[26px] font-black tracking-tight">Лента</h1>
      <EmptyState emoji="🔥" title="Пока тихо">
        Здесь будут результаты, рекорды и бейджи твоего зала.
      </EmptyState>
    </>
  );
}
