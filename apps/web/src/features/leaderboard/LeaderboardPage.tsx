import { EmptyState } from '../../components/ui/EmptyState';

export function LeaderboardPage() {
  return (
    <>
      <h1 className="mb-4 text-[26px] font-black tracking-tight">Рейтинг</h1>
      <EmptyState emoji="🏆" title="Рейтинг дня пуст">
        Запиши результат первым — и займи вершину.
      </EmptyState>
    </>
  );
}
