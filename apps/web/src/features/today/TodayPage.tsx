import { LevelBar } from '../../components/ui/LevelBar';
import { EmptyState } from '../../components/ui/EmptyState';

// Данные пользователя и WOD подключаются после миграций БД (неделя 1, шаг 2–5)
const DEMO = { xp: 0, streak: 0, weekDone: 0, weekGoal: 3 };

export function TodayPage() {
  const { xp, streak, weekDone, weekGoal } = DEMO;
  return (
    <>
      <LevelBar xp={xp} streak={streak} />
      <div className="card mb-3.5 flex items-center justify-between">
        <div>
          <div className="font-extrabold">Серия {streak} нед.</div>
          <div className="mt-0.5 text-[13px] text-muted">
            {weekDone} из {weekGoal} на этой неделе
          </div>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: weekGoal }, (_, i) => (
            <span
              key={i}
              className={`h-3 w-3 rounded-full border-2 ${i < weekDone ? 'border-accent bg-accent' : 'border-line bg-surface2'}`}
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
