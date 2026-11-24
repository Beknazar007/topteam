import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Segmented } from '../../components/ui/Segmented';
import { Spinner } from '../../components/ui/Spinner';
import { formatScore } from '../../lib/format';
import { useMe } from '../../lib/me';
import {
  bishkekDateOf,
  bishkekTimeOf,
  dayCounts,
  dayMonth,
  daysSince,
  hourHistogram,
  monthName,
  periodEnd,
  periodLabel,
  periodStart,
  shiftPeriod,
  summarize,
  useMyLog,
  weekdayHistogram,
  type LogEntry,
  type Period,
} from '../../lib/stats';
import { addDays, bishkekToday, formatDay, KIND_LABEL } from '../../lib/wod';

const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const PREV: Record<Period, string> = { week: 'прошлой неделе', month: 'прошлом месяце', year: 'прошлом году', all: '' };

/** Мой мониторинг: итоги за неделю/месяц/год/всё, календарь посещений, время записи, журнал */
export function StatsPage() {
  const nav = useNavigate();
  const me = useMe();
  const today = bishkekToday();
  const data = useMyLog(me.data?.profile.id, me.data?.gym?.id);
  const [period, setPeriod] = useState<Period>('month');
  const [start, setStart] = useState(() => periodStart('month', today));

  const log = useMemo(() => data.data?.log ?? [], [data.data]);
  const xp = data.data?.xp ?? [];
  const joinedAt = data.data?.joinedAt ?? null;
  const joinDate = joinedAt ? bishkekDateOf(joinedAt) : null;
  const firstDate = useMemo(() => {
    const ds = log.map((r) => r.wods?.wod_date).filter(Boolean) as string[];
    return [joinDate, ...ds].filter(Boolean).sort()[0] ?? today;
  }, [log, joinDate, today]);

  if (!me.data || data.isLoading) return <Spinner />;

  const from = period === 'all' ? firstDate : start;
  const to = period === 'all' ? today : periodEnd(period, start);
  const sum = summarize(log, xp, from, to);
  const prev = period === 'all' ? null : summarize(log, xp, shiftPeriod(period, start, -1), addDays(start, -1));
  const counts = dayCounts(log);
  const total = summarize(log, xp, '2000-01-01', today);

  const pick = (p: Period) => {
    setPeriod(p);
    setStart(periodStart(p, today));
  };
  const canNext = period !== 'all' && shiftPeriod(period, start, 1) <= today;
  const canPrev = period !== 'all' && periodEnd(period, shiftPeriod(period, start, -1)) >= periodStart(period, firstDate);

  const tiles: [string, number, number | undefined][] = [
    ['Тренировок', sum.days, prev?.days],
    ['Блоков записано', sum.blocks, prev?.blocks],
    ['Рекордов', sum.prs, prev?.prs],
    ['XP получено', sum.xp, prev?.xp],
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => nav(-1)} className="text-sm font-bold text-muted">
          ← Назад
        </button>
        <h1 className="text-[20px] font-black">Мой мониторинг</h1>
        <span className="w-12" />
      </div>

      <div className="card mb-4 flex items-center gap-3">
        <div className="text-3xl">🏠</div>
        <div className="min-w-0">
          <div className="font-extrabold">
            {joinedAt ? `В зале с ${dayMonth(joinDate!)} ${joinDate!.slice(0, 4)}` : 'В зале'}
            {me.data.gym ? ` · ${me.data.gym.name}` : ''}
          </div>
          <div className="text-[13px] text-muted">
            {joinedAt ? `${daysSince(joinedAt, today)} дн. · ` : ''}
            {total.days} трен. всего · {total.prs} рекордов
            {total.podiums ? ` · ${total.podiums} пьедесталов` : ''}
          </div>
        </div>
      </div>

      <Segmented
        value={period}
        onChange={pick}
        options={[
          { value: 'week', label: 'Неделя' },
          { value: 'month', label: 'Месяц' },
          { value: 'year', label: 'Год' },
          { value: 'all', label: 'Всё' },
        ]}
      />

      <div className="mt-3 flex items-center justify-between">
        <button
          onClick={() => setStart(shiftPeriod(period, start, -1))}
          disabled={!canPrev}
          className="h-10 w-10 rounded-xl bg-surface2 font-black disabled:opacity-25"
          aria-label="Раньше"
        >
          ←
        </button>
        <div className="font-extrabold">{period === 'all' ? `с ${dayMonth(firstDate)} ${firstDate.slice(0, 4)}` : periodLabel(period, start)}</div>
        <button
          onClick={() => setStart(shiftPeriod(period, start, 1))}
          disabled={!canNext}
          className="h-10 w-10 rounded-xl bg-surface2 font-black disabled:opacity-25"
          aria-label="Позже"
        >
          →
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {tiles.map(([label, v, p]) => (
          <div key={label} className="card py-3">
            <div className="num text-[22px] font-black">{v}</div>
            <div className="text-[13px] text-muted">{label}</div>
            {p !== undefined && <Delta now={v} prev={p} />}
          </div>
        ))}
      </div>
      {prev && <div className="mt-1.5 text-[12px] text-muted">Стрелки — сравнение с {PREV[period]}</div>}

      <div className="h-section">Посещения</div>
      <div className="card">
        {period === 'week' ? (
          <WeekStrip start={start} counts={counts} today={today} joinDate={joinDate} />
        ) : period === 'month' ? (
          <MonthGrid month={start} counts={counts} today={today} joinDate={joinDate} />
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 md:grid-cols-4">
            {monthsBetween(period === 'all' || start < firstDate ? periodStart('month', firstDate) : start, to < today ? to : today).map((m) => (
              <div key={m}>
                <div className="mb-1 text-[13px] font-extrabold">
                  {monthName(m)} {period === 'all' ? m.slice(0, 4) : ''}
                  <span className="ml-1 font-semibold text-muted">· {daysIn(counts, m)}</span>
                </div>
                <MonthGrid month={m} counts={counts} today={today} joinDate={joinDate} mini />
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center gap-3 text-[12px] text-muted">
          <Legend className="bg-[color-mix(in_srgb,var(--accent)_50%,transparent)]" label="1 блок" />
          <Legend className="bg-accent" label="2+ блока" />
          <Legend className="ring-2 ring-inset ring-text" label="сегодня" />
        </div>
      </div>

      <div className="h-section">Когда я тренируюсь</div>
      <div className="card">
        <TimeCharts log={log} from={from} to={to} />
      </div>

      <div className="h-section">Журнал</div>
      <Journal log={log.filter((r) => r.wods && r.wods.wod_date >= from && r.wods.wod_date <= to)} />
    </>
  );
}

function Delta({ now, prev }: { now: number; prev: number }) {
  const d = now - prev;
  if (d === 0) return <div className="text-[12px] font-bold text-muted">= как раньше</div>;
  return (
    <div className={`text-[12px] font-bold ${d > 0 ? 'text-xp' : 'text-muted'}`}>
      {d > 0 ? '▲' : '▼'} {Math.abs(d)}
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded ${className}`} />
      {label}
    </span>
  );
}

function cellClass(n: number, date: string, today: string, joinDate: string | null) {
  const base = n >= 2 ? 'bg-accent text-white' : n === 1 ? 'bg-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-white' : date > today ? 'opacity-30' : 'bg-surface2';
  const before = joinDate && date < joinDate && n === 0 ? 'opacity-30' : '';
  return `${base} ${before} ${date === today ? 'ring-2 ring-inset ring-text' : ''}`;
}

function WeekStrip({ start, counts, today, joinDate }: { start: string; counts: Map<string, number>; today: string; joinDate: string | null }) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {DOW.map((d, i) => {
        const date = addDays(start, i);
        const n = counts.get(date) ?? 0;
        return (
          <div key={d} className="text-center">
            <div className="mb-1 text-[11px] font-bold text-muted">{d}</div>
            <div className={`grid aspect-square place-items-center rounded-xl text-sm font-black ${cellClass(n, date, today, joinDate)}`}>
              {Number(date.slice(8, 10))}
            </div>
            <div className="mt-1 h-4 text-[11px] font-bold text-muted">{n ? `${n} бл.` : ''}</div>
          </div>
        );
      })}
    </div>
  );
}

function MonthGrid({
  month,
  counts,
  today,
  joinDate,
  mini,
}: {
  month: string;
  counts: Map<string, number>;
  today: string;
  joinDate: string | null;
  mini?: boolean;
}) {
  const first = new Date(month + 'T00:00:00Z');
  const lead = (first.getUTCDay() + 6) % 7;
  const len = Number(periodEnd('month', month).slice(8, 10));
  return (
    <div className={`grid grid-cols-7 ${mini ? 'gap-0.5' : 'gap-1.5'}`}>
      {!mini && DOW.map((d) => <div key={d} className="text-center text-[11px] font-bold text-muted">{d}</div>)}
      {Array.from({ length: lead }, (_, i) => (
        <div key={'e' + i} />
      ))}
      {Array.from({ length: len }, (_, i) => {
        const date = addDays(month, i);
        const n = counts.get(date) ?? 0;
        return (
          <div
            key={date}
            title={n ? `${formatDay(date)}: ${n} бл.` : formatDay(date)}
            className={`grid aspect-square place-items-center ${mini ? 'rounded-[4px] text-[0px]' : 'rounded-lg text-[13px] font-bold'} ${cellClass(n, date, today, joinDate)}`}
          >
            {i + 1}
          </div>
        );
      })}
    </div>
  );
}

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = periodStart('month', from); m <= to; m = shiftPeriod('month', m, 1)) out.push(m);
  return out;
}
const daysIn = (counts: Map<string, number>, month: string) => {
  const end = periodEnd('month', month);
  let n = 0;
  for (const d of counts.keys()) if (d >= month && d <= end) n++;
  return n;
};

function TimeCharts({ log, from, to }: { log: LogEntry[]; from: string; to: string }) {
  const hours = hourHistogram(log, from, to);
  const wd = weekdayHistogram(log, from, to);
  const totalH = hours.reduce((a, b) => a + b, 0);
  if (!totalH) return <div className="text-sm text-muted">За этот период записей нет.</div>;
  const used = hours.map((n, h) => [h, n] as const).filter(([, n]) => n > 0);
  const lo = Math.max(0, Math.min(...used.map(([h]) => h)) - 1);
  const hi = Math.min(23, Math.max(...used.map(([h]) => h)) + 1);
  const span = hours.slice(lo, hi + 1);
  const maxH = Math.max(...span);
  const top = used.reduce((a, b) => (b[1] > a[1] ? b : a));
  const maxW = Math.max(...wd, 1);
  const topDay = wd.indexOf(Math.max(...wd));

  return (
    <>
      <div className="text-sm">
        Чаще всего записываю результат в <b>{String(top[0]).padStart(2, '0')}:00–{String((top[0] + 1) % 24).padStart(2, '0')}:00</b>
        {Math.max(...wd) > 0 && (
          <>
            , любимый день — <b>{['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'][topDay]}</b>
          </>
        )}
      </div>
      <div className="mt-3 flex h-28 items-end gap-1">
        {span.map((n, i) => (
          <div key={i} className="flex h-full flex-1 flex-col justify-end">
            <div className="text-center text-[10px] font-bold text-muted">{n || ''}</div>
            <div className={`rounded-t-md ${n ? 'bg-accent' : 'bg-surface2'}`} style={{ height: `${n ? Math.max(8, (n / maxH) * 80) : 3}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        {span.map((_, i) => (
          <div key={i} className="flex-1 text-center text-[10px] font-bold text-muted">
            {(lo + i) % 3 === 0 || span.length <= 8 ? lo + i : ''}
          </div>
        ))}
      </div>
      <div className="mt-1 text-center text-[11px] text-muted">час записи результата</div>

      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {wd.map((n, i) => (
          <div key={i} className="text-center">
            <div className="flex h-16 flex-col justify-end">
              <div className={`rounded-md ${n ? 'bg-accent' : 'bg-surface2'}`} style={{ height: `${n ? Math.max(12, (n / maxW) * 100) : 6}%` }} />
            </div>
            <div className="mt-1 text-[11px] font-bold text-muted">{DOW[i]}</div>
            <div className="text-[11px] font-black">{n || ''}</div>
          </div>
        ))}
      </div>
      <div className="mt-1 text-center text-[11px] text-muted">тренировочных дней по дням недели</div>
    </>
  );
}

function Journal({ log }: { log: LogEntry[] }) {
  const [limit, setLimit] = useState(20);
  const days = useMemo(() => {
    const m = new Map<string, LogEntry[]>();
    for (const r of log) m.set(r.wods!.wod_date, [...(m.get(r.wods!.wod_date) ?? []), r]);
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [log]);
  if (!days.length) return <div className="card text-sm text-muted">За этот период записей нет.</div>;

  return (
    <>
      <div className="grid gap-2.5">
        {days.slice(0, limit).map(([date, rs]) => (
          <div key={date} className="card py-2.5">
            <div className="mb-1 flex items-baseline justify-between">
              <div className="font-black">{formatDay(date)}</div>
              <div className="text-[12px] text-muted">{rs.length} бл.</div>
            </div>
            <div className="divide-y divide-line">
              {[...rs]
                .sort((a, b) => a.created_at.localeCompare(b.created_at))
                .map((r) => {
                  const late = bishkekDateOf(r.created_at) !== date;
                  return (
                    <div key={r.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate font-bold">{r.wods!.title}</div>
                        <div className="text-[12px] text-muted">
                          {KIND_LABEL[r.wods!.kind]} · {r.scale} · в {bishkekTimeOf(r.created_at)}
                          {late ? ` (${dayMonth(bishkekDateOf(r.created_at))})` : ''}
                        </div>
                      </div>
                      <div className="num shrink-0 text-right font-black">
                        {r.is_pr && '🏆 '}
                        {formatScore(r.wods!.score_type, r.score, r.capped)}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
      {days.length > limit && (
        <button onClick={() => setLimit(limit + 20)} className="mt-2.5 h-11 w-full rounded-2xl bg-surface2 text-sm font-extrabold">
          Показать ещё
        </button>
      )}
    </>
  );
}
