import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LevelBar } from '../../components/ui/LevelBar';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import { useMe, weekDone } from '../../lib/me';
import { formatScore, formatTime } from '../../lib/format';
import { errorText, supabase } from '../../lib/supabase';
import {
  bishkekToday,
  FORMAT_LABEL,
  formatDay,
  useMyPrs,
  useRecentWods,
  useWodResults,
  type Result,
  type Wod,
} from '../../lib/wod';
import { useLog } from '../wod/LogContext';

export function TodayPage() {
  const { data } = useMe();
  const stats = data?.stats ?? null;
  const goal = data?.profile.week_goal ?? 3;
  const done = weekDone(stats);
  const streak = stats?.streak_weeks ?? 0;
  const coach = data?.role === 'coach' || data?.role === 'owner';

  const wods = useRecentWods(data?.gym?.id);
  const results = useWodResults((wods.data ?? []).map((w) => w.id), data?.profile.id);
  const today = bishkekToday();
  const list = wods.data ?? [];
  const todays = list.filter((w) => w.wod_date === today);
  const upcoming = list.filter((w) => w.wod_date > today).reverse();
  const missed = list.filter((w) => w.wod_date < today && !results.data?.mine.has(w.id));

  return (
    <>
      <LevelBar xp={stats?.xp ?? 0} streak={streak} />
      <div className="card mb-3.5 flex items-center justify-between">
        <div>
          <div className="font-extrabold">Серия {streak} нед.</div>
          <div className="mt-0.5 text-[13px] text-muted">
            {Math.min(done, goal)} из {goal} на этой неделе
            {stats?.freezes ? ` · ❄️ ${stats.freezes}` : ''}
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

      {coach && (
        <Link
          to="/wod/new"
          className="mb-3.5 flex h-12 items-center justify-center rounded-2xl border border-dashed border-accent/60 font-extrabold text-accent"
        >
          ＋ Новый WOD
        </Link>
      )}

      {wods.isLoading ? (
        <Spinner />
      ) : todays.length ? (
        todays.map((w) => <WodCard key={w.id} wod={w} mine={results.data?.mine.get(w.id)} count={results.data?.counts.get(w.id) ?? 0} coach={coach} />)
      ) : (
        <EmptyState emoji="🏋️" title="WOD дня ещё не опубликован">
          {coach
            ? 'Нажми «＋ Новый WOD» — тренировка появится у всего зала.'
            : 'Как только тренер добавит тренировку, она появится здесь.'}
        </EmptyState>
      )}

      {missed.length > 0 && (
        <>
          <div className="h-section">Не записал результат?</div>
          {missed.map((w) => (
            <WodCard key={w.id} wod={w} count={results.data?.counts.get(w.id) ?? 0} coach={coach} compact />
          ))}
        </>
      )}

      {upcoming.length > 0 && coach && (
        <>
          <div className="h-section">Запланировано</div>
          {upcoming.map((w) => (
            <WodCard key={w.id} wod={w} count={0} coach={coach} compact future />
          ))}
        </>
      )}
    </>
  );
}

function WodCard({
  wod,
  mine,
  count,
  coach,
  compact,
  future,
}: {
  wod: Wod;
  mine?: Result;
  count: number;
  coach: boolean;
  compact?: boolean;
  future?: boolean;
}) {
  const { openLog } = useLog();
  const { data } = useMe();
  const prs = useMyPrs(data?.profile.id);
  const qc = useQueryClient();
  const scale = data?.profile.default_scale ?? 'Scaled';
  const prKey = wod.benchmark_id
    ? `b:${wod.benchmark_id}:${scale}`
    : wod.exercise_id && wod.rep_max
      ? `e:${wod.exercise_id}:${wod.rep_max}`
      : null;
  const pr = prKey ? prs.data?.get(prKey) : undefined;

  const remove = async () => {
    if (!confirm(`Удалить WOD «${wod.title}»?`)) return;
    const { error } = await supabase.rpc('delete_wod', { p_wod: wod.id });
    if (error) alert(errorText(error));
    else void qc.invalidateQueries({ queryKey: ['wods'] });
  };

  return (
    <div className="card mb-3 overflow-hidden">
      <div className="mb-1 flex items-center justify-between text-[12px] font-bold uppercase tracking-[0.08em] text-muted">
        <span>{formatDay(wod.wod_date)} · WOD</span>
        <span className="rounded-lg bg-surface2 px-2 py-0.5 text-accent">{FORMAT_LABEL[wod.format]}</span>
      </div>
      <div className="text-[24px] font-black uppercase leading-tight tracking-tight">{wod.title}</div>
      {!compact && <div className="mt-1.5 whitespace-pre-wrap text-[15px] leading-snug">{wod.description}</div>}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
        {wod.time_cap_sec && <span>Тайм-кап {formatTime(wod.time_cap_sec)}</span>}
        {pr !== undefined && (
          <span className="font-bold text-gold">
            Твой PR: {formatScore(wod.score_type, pr)}
            {wod.benchmark_id ? ` (${scale})` : ''}
          </span>
        )}
      </div>
      {!compact && wod.coach_note && (
        <div className="mt-2 rounded-xl bg-surface2 px-3 py-2 text-[13px]">
          <span className="font-bold">Тренер: </span>
          {wod.coach_note}
        </div>
      )}

      {!future &&
        (mine ? (
          <div className="mt-3 flex items-center justify-between rounded-2xl bg-surface2 px-4 py-3">
            <span className="text-sm font-bold text-muted">Твой результат · {mine.scale}</span>
            <span className="num text-lg font-black">
              {mine.is_pr && '🏆 '}
              {formatScore(wod.score_type, Number(mine.score), mine.capped)}
            </span>
          </div>
        ) : (
          <button
            onClick={() => openLog(wod)}
            className="mt-3 h-12 w-full rounded-2xl bg-accent font-extrabold tracking-wide text-white active:scale-[0.98]"
          >
            ЗАПИСАТЬ РЕЗУЛЬТАТ
          </button>
        ))}

      <div className="mt-2.5 flex items-center justify-between text-[13px] text-muted">
        <span>{future ? 'Появится у атлетов в этот день' : `Уже записали: ${count}`}</span>
        {coach && count === 0 && (
          <button onClick={remove} className="font-semibold text-muted underline">
            Удалить
          </button>
        )}
      </div>
    </div>
  );
}
