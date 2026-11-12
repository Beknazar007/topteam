import { LevelBar } from '../../components/ui/LevelBar';
import { EmptyState } from '../../components/ui/EmptyState';
import { useMe, weekDone } from '../../lib/me';

export function TodayPage() {
  const { data } = useMe();
  const stats = data?.stats ?? null;
  const goal = data?.profile.week_goal ?? 3;
  const done = weekDone(stats);
  const streak = stats?.streak_weeks ?? 0;

  return (
    <>
      <LevelBar xp={stats?.xp ?? 0} streak={streak} />
      <div className="card mb-3.5 flex items-center justify-between">
        <div>
          <div className="font-extrabold">Серия {streak} нед.</div>
          <div className="mt-0.5 text-[13px] text-muted">
            {Math.min(done, goal)} из {goal} на этой неделе
          </div>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: goal }, (_, i) => (
            <span
              key={i}
              className={`h-3 w-3 rounded-full border-2 ${i < done ? 'border-accent bg-accent' : 'border-line bg-surface2'}`}
            />
          ))}
        </div>
      </div>
      <EmptyState emoji="🏋️" title="WOD дня ещё не опубликован">
        Как только тренер добавит тренировку, она появится здесь, а тебе придёт сообщение в Telegram.
      </EmptyState>
    </>
  );
}
