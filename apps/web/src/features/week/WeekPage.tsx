import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { Sheet } from '../../components/ui/Sheet';
import { Spinner } from '../../components/ui/Spinner';
import { formatTime } from '../../lib/format';
import { useMe } from '../../lib/me';
import { errorText, supabase } from '../../lib/supabase';
import {
  addDays,
  bishkekToday,
  formatDay,
  KIND_LABEL,
  KINDS,
  useWeekWods,
  weekStartOf,
  type Wod,
  type WodKind,
} from '../../lib/wod';

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const range = (start: string) => {
  const a = new Date(start + 'T00:00:00Z');
  const b = new Date(addDays(start, 6) + 'T00:00:00Z');
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`
    : `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`;
};
const KIND_COLOR: Record<WodKind, string> = {
  warmup: 'text-muted',
  skill: 'text-rare',
  strength: 'text-gold',
  wod: 'text-accent',
  accessory: 'text-epic',
  cooldown: 'text-muted',
};

export function WeekPage() {
  const me = useMe();
  const qc = useQueryClient();
  const today = bishkekToday();
  const [weekStart, setWeekStart] = useState(weekStartOf(today));
  const week = useWeekWods(me.data?.gym?.id, weekStart);
  const [editing, setEditing] = useState<Wod | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (!me.data) return <Spinner />;
  if (me.data.role !== 'coach' && me.data.role !== 'owner') return <Navigate to="/" replace />;
  const gymId = me.data.gym!.id;
  const refresh = () => qc.invalidateQueries({ queryKey: ['wods'] });

  const byDay = new Map<string, Wod[]>();
  for (const w of week.data ?? []) byDay.set(w.wod_date, [...(byDay.get(w.wod_date) ?? []), w]);
  const emptyDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((d) => !byDay.has(d)).length;

  const copyPrev = async () => {
    setMsg(null);
    const { data, error } = await supabase.rpc('copy_week', {
      p_gym: gymId,
      p_from: addDays(weekStart, -7),
      p_to: weekStart,
    });
    if (error) return setMsg(errorText(error));
    setMsg(
      data
        ? `Скопировано блоков: ${data}. Отредактируй под эту неделю.`
        : 'На прошлой неделе нечего копировать в пустые дни.',
    );
    void refresh();
  };
  const move = async (w: Wod, dir: -1 | 1) => {
    const { error } = await supabase.rpc('move_wod', { p_wod: w.id, p_dir: dir });
    if (error) return setMsg(errorText(error));
    void refresh();
  };
  const toggleDay = async (date: string, show: boolean) => {
    const { error } = await supabase.rpc('set_day_visibility', { p_gym: gymId, p_date: date, p_show_early: show });
    if (error) return setMsg(errorText(error));
    void refresh();
  };

  return (
    <>
      <h1 className="mb-3 text-[26px] font-black tracking-tight">План недели</h1>
      <div className="mb-3 flex items-center justify-between rounded-2xl bg-surface p-1.5">
        <button
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          className="h-10 w-12 rounded-xl bg-surface2 text-lg font-black"
          aria-label="Прошлая неделя"
        >
          ←
        </button>
        <div className="text-center">
          <div className="font-black">{range(weekStart)}</div>
          <div className="text-[12px] text-muted">
            {weekStart === weekStartOf(today) ? 'эта неделя' : weekStart > today ? 'впереди' : 'прошла'}
          </div>
        </div>
        <button
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          className="h-10 w-12 rounded-xl bg-surface2 text-lg font-black"
          aria-label="Следующая неделя"
        >
          →
        </button>
      </div>

      {emptyDays > 0 && addDays(weekStart, 6) >= today && (
        <button
          onClick={copyPrev}
          className="mb-3 h-11 w-full rounded-2xl border border-dashed border-line text-sm font-bold text-muted"
        >
          📋 Скопировать прошлую неделю
        </button>
      )}
      {msg && <p className="mb-3 text-center text-sm font-semibold text-accent">{msg}</p>}

      {week.isLoading ? (
        <Spinner />
      ) : (
        Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((date) => {
          const blocks = byDay.get(date) ?? [];
          const isToday = date === today;
          const future = date > today;
          const shown = blocks.some((b) => b.show_early);
          return (
            <div
              key={date}
              className={`card mb-2.5 ${isToday ? 'border-accent/60' : ''} ${date < today ? 'opacity-70' : ''}`}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="font-black uppercase tracking-wide">
                  {formatDay(date)}
                  {isToday && (
                    <span className="ml-2 rounded-lg bg-accent px-2 py-0.5 text-[11px] text-white">сегодня</span>
                  )}
                </div>
                {future && blocks.length > 0 && (
                  <button
                    onClick={() => toggleDay(date, !shown)}
                    className={`rounded-xl px-2.5 py-1 text-[12px] font-bold ${shown ? 'bg-xp/15 text-xp' : 'bg-surface2 text-muted'}`}
                  >
                    {shown ? '👁 Видно заранее' : '🙈 Откроется в этот день'}
                  </button>
                )}
              </div>

              {blocks.length === 0 && <div className="mb-2 text-sm text-muted">Отдых или не запланировано</div>}
              {blocks.map((b, idx) => (
                <div key={b.id} className="mb-1.5 flex items-center gap-2 rounded-xl bg-surface2 px-3 py-2">
                  <button onClick={() => setEditing(b)} className="min-w-0 flex-1 text-left">
                    <div className={`text-[11px] font-black uppercase tracking-wider ${KIND_COLOR[b.kind]}`}>
                      {KIND_LABEL[b.kind]}
                    </div>
                    <div className="truncate font-bold">{b.title}</div>
                  </button>
                  <div className="flex shrink-0 gap-1">
                    <button
                      disabled={idx === 0}
                      onClick={() => move(b, -1)}
                      className="h-8 w-8 rounded-lg bg-surface text-sm disabled:opacity-30"
                      aria-label="Выше"
                    >
                      ↑
                    </button>
                    <button
                      disabled={idx === blocks.length - 1}
                      onClick={() => move(b, 1)}
                      className="h-8 w-8 rounded-lg bg-surface text-sm disabled:opacity-30"
                      aria-label="Ниже"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
              {date >= addDays(today, -14) && (
                <Link
                  to={`/wod/new?date=${date}&from=week`}
                  className="mt-1 inline-block text-sm font-bold text-accent"
                >
                  ＋ Блок
                </Link>
              )}
            </div>
          );
        })
      )}

      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)}>
        {editing && (
          <EditBlock
            wod={editing}
            onDone={() => {
              setEditing(null);
              void refresh();
            }}
          />
        )}
      </Sheet>
    </>
  );
}

const input =
  'w-full rounded-2xl border border-line bg-surface2 px-4 py-3 text-base font-semibold outline-none focus:border-accent';

function EditBlock({ wod, onDone }: { wod: Wod; onDone: () => void }) {
  const [title, setTitle] = useState(wod.title);
  const [kind, setKind] = useState<WodKind>(wod.kind);
  const [description, setDescription] = useState(wod.description);
  const [note, setNote] = useState(wod.coach_note ?? '');
  const [capMin, setCapMin] = useState(wod.time_cap_sec ? String(wod.time_cap_sec / 60) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const capSec = capMin.trim() ? Math.round(Number(capMin.replace(',', '.')) * 60) : null;

  const save = async () => {
    setBusy(true);
    const { error: e } = await supabase.rpc('update_wod', {
      p_wod: wod.id,
      p_title: title,
      p_description: description,
      p_coach_note: note,
      p_time_cap_sec: capSec,
      p_kind: kind,
    });
    setBusy(false);
    if (e) return setError(errorText(e));
    onDone();
  };
  const remove = async () => {
    if (!confirm(`Удалить блок «${wod.title}»?`)) return;
    const { error: e } = await supabase.rpc('delete_wod', { p_wod: wod.id });
    if (e) return setError(errorText(e));
    onDone();
  };

  return (
    <div className="grid gap-3">
      <div className="text-[20px] font-black">Блок · {formatDay(wod.wod_date)}</div>
      <div className="grid grid-cols-3 gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`h-10 rounded-xl text-sm font-extrabold ${kind === k ? 'bg-accent text-white' : 'bg-surface2 text-muted'}`}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <input className={input} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea
        className={`${input} min-h-[120px]`}
        maxLength={2000}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <textarea
        className={`${input} min-h-[60px]`}
        placeholder="Заметка тренера"
        maxLength={1000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {wod.score_type === 'time' && (
        <input
          className={input}
          inputMode="decimal"
          placeholder="Тайм-кап, минут"
          value={capMin}
          onChange={(e) => setCapMin(e.target.value)}
        />
      )}
      {wod.time_cap_sec && wod.score_type !== 'time' && (
        <div className="text-sm text-muted">Тайм-кап {formatTime(wod.time_cap_sec)}</div>
      )}
      <Button onClick={save} disabled={busy || !title.trim() || (capSec !== null && (capSec < 60 || capSec > 10800))}>
        {busy ? 'Сохраняем…' : 'Сохранить'}
      </Button>
      <button onClick={remove} className="py-2 text-sm font-bold text-muted underline">
        Удалить блок
      </button>
      {error && <p className="text-center text-sm font-semibold text-accent">{error}</p>}
    </div>
  );
}
