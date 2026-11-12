import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Segmented';
import { Spinner } from '../../components/ui/Spinner';
import { useMe } from '../../lib/me';
import { errorText, supabase } from '../../lib/supabase';
import type { ScoreType } from '../../lib/format';
import { addDays, bishkekToday, formatDay, useBenchmarks, useExercises, type Benchmark, type WodFormat } from '../../lib/wod';

const input =
  'w-full rounded-2xl border border-line bg-surface2 px-4 py-3 text-base font-semibold outline-none focus:border-accent';

type Mode = 'benchmark' | 'custom' | 'strength';
const CATEGORY: Record<string, string> = { girl: 'Girls', hero: 'Hero', open: 'Open', custom: 'Другие' };
const DEFAULT_SCORE: Record<Exclude<WodFormat, 'max_weight'>, ScoreType> = {
  for_time: 'time',
  amrap: 'rounds_reps',
  emom: 'none',
  other: 'none',
};

export function NewWodPage() {
  const me = useMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const benchmarks = useBenchmarks();
  const exercises = useExercises();
  const today = bishkekToday();

  const [date, setDate] = useState(today);
  const [mode, setMode] = useState<Mode>('benchmark');
  const [benchmarkId, setBenchmarkId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [format, setFormat] = useState<Exclude<WodFormat, 'max_weight'>>('for_time');
  const [scoreType, setScoreType] = useState<ScoreType>('time');
  const [description, setDescription] = useState('');
  const [capMin, setCapMin] = useState('');
  const [exerciseId, setExerciseId] = useState<number | null>(null);
  const [repMax, setRepMax] = useState(1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bList = benchmarks.data;
  const grouped = useMemo(() => {
    const g = new Map<string, Benchmark[]>();
    for (const b of bList ?? []) g.set(b.category, [...(g.get(b.category) ?? []), b]);
    return [...g.entries()];
  }, [bList]);
  const bm = benchmarks.data?.find((b) => b.id === benchmarkId);
  const ex = exercises.data?.find((e) => e.id === exerciseId);

  if (!me.data) return <Spinner />;
  if (me.data.role !== 'coach' && me.data.role !== 'owner') return <Navigate to="/" replace />;

  const capSec = capMin.trim() ? Math.round(Number(capMin.replace(',', '.')) * 60) : null;
  const valid =
    mode === 'benchmark'
      ? Boolean(bm)
      : mode === 'strength'
        ? Boolean(ex)
        : title.trim().length > 0 && description.trim().length > 0 && (capSec === null || (capSec >= 60 && capSec <= 10800));

  const publish = async () => {
    setBusy(true);
    setError(null);
    const base = { p_gym: me.data!.gym!.id, p_date: date, p_coach_note: note.trim() || null };
    const args =
      mode === 'benchmark'
        ? { ...base, p_benchmark_id: benchmarkId }
        : mode === 'strength'
          ? {
              ...base,
              p_title: `${ex!.name} ${repMax}RM`,
              p_format: 'max_weight',
              p_score_type: 'weight',
              p_exercise_id: exerciseId,
              p_rep_max: repMax,
              p_description: description.trim() || `Найди свой ${repMax}RM в ${ex!.name}`,
            }
          : {
              ...base,
              p_title: title.trim(),
              p_format: format,
              p_score_type: scoreType,
              p_description: description.trim(),
              p_time_cap_sec: capSec,
            };
    const { error: e } = await supabase.rpc('create_wod', args);
    setBusy(false);
    if (e) return setError(errorText(e));
    await qc.invalidateQueries({ queryKey: ['wods'] });
    nav('/', { replace: true });
  };

  return (
    <div className="pt-safe-5 mx-auto max-w-md px-4 pb-10 md:max-w-xl">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => nav(-1)} className="text-sm font-bold text-muted">
          ← Назад
        </button>
        <h1 className="text-[20px] font-black">Новый WOD</h1>
        <span className="w-12" />
      </div>

      <Label>Дата</Label>
      <Segmented
        value={date === today ? 'today' : date === addDays(today, 1) ? 'tomorrow' : 'other'}
        onChange={(v) => setDate(v === 'today' ? today : v === 'tomorrow' ? addDays(today, 1) : date)}
        options={[
          { value: 'today', label: 'Сегодня' },
          { value: 'tomorrow', label: 'Завтра' },
          { value: 'other', label: 'Другая' },
        ]}
      />
      <input
        type="date"
        className={`${input} mt-2`}
        value={date}
        min={addDays(today, -7)}
        max={addDays(today, 14)}
        onChange={(e) => e.target.value && setDate(e.target.value)}
      />
      <div className="mt-1 text-[13px] text-muted">{formatDay(date)}</div>

      <Label>Тип</Label>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'benchmark', label: 'Бенчмарк' },
          { value: 'custom', label: 'Свой' },
          { value: 'strength', label: 'Силовая' },
        ]}
      />

      {mode === 'benchmark' && (
        <div className="mt-3">
          {benchmarks.isLoading && <Spinner />}
          {grouped.map(([cat, list]) => (
            <div key={cat} className="mb-3">
              <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-muted">{CATEGORY[cat] ?? cat}</div>
              <div className="flex flex-wrap gap-1.5">
                {list.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setBenchmarkId(b.id)}
                    className={`rounded-xl px-3 py-2 text-sm font-bold ${benchmarkId === b.id ? 'bg-accent text-white' : 'bg-surface2'}`}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {bm && (
            <div className="card">
              <div className="font-black">{bm.name}</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-muted">{bm.description}</div>
              {bm.time_cap_sec && <div className="mt-1 text-[13px] text-muted">Тайм-кап {bm.time_cap_sec / 60} мин</div>}
            </div>
          )}
        </div>
      )}

      {mode === 'custom' && (
        <div className="mt-3 grid gap-3">
          <input className={input} placeholder="Название (напр. «Пятничный чиппер»)" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
          <Segmented
            value={format}
            onChange={(f) => {
              setFormat(f);
              setScoreType(DEFAULT_SCORE[f]);
            }}
            options={[
              { value: 'for_time', label: 'For Time' },
              { value: 'amrap', label: 'AMRAP' },
              { value: 'emom', label: 'EMOM' },
              { value: 'other', label: 'Other' },
            ]}
          />
          <textarea
            className={`${input} min-h-[140px]`}
            placeholder={'Упражнения, по строке на каждое:\n21-15-9\nThrusters 43/30 кг\nPull-ups'}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div>
            <div className="mb-1.5 text-sm font-bold">Как считать результат</div>
            <select className={input} value={scoreType} onChange={(e) => setScoreType(e.target.value as ScoreType)}>
              <option value="time">Время</option>
              <option value="rounds_reps">Раунды + повторы</option>
              <option value="reps">Повторы</option>
              <option value="weight">Вес</option>
              <option value="none">Без счёта (просто отметка)</option>
            </select>
          </div>
          <input
            className={input}
            inputMode="decimal"
            placeholder="Тайм-кап, минут (необязательно)"
            value={capMin}
            onChange={(e) => setCapMin(e.target.value)}
          />
        </div>
      )}

      {mode === 'strength' && (
        <div className="mt-3 grid gap-3">
          <select className={input} value={exerciseId ?? ''} onChange={(e) => setExerciseId(Number(e.target.value) || null)}>
            <option value="">Выбери упражнение</option>
            {exercises.data?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <Segmented
            value={repMax}
            onChange={setRepMax}
            options={[1, 3, 5].map((n) => ({ value: n, label: `${n}RM` }))}
          />
          <textarea
            className={`${input} min-h-[80px]`}
            placeholder="Описание (необязательно), напр. «20 минут на поиск 1ПМ»"
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      )}

      <Label>Заметка тренера</Label>
      <textarea
        className={`${input} min-h-[70px]`}
        placeholder="Необязательно: стимул, масштабирование, советы"
        maxLength={1000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <Button className="mt-6" onClick={publish} disabled={!valid || busy}>
        {busy ? 'Публикуем…' : 'Опубликовать'}
      </Button>
      {error && <p className="mt-3 text-center text-sm font-semibold text-accent">{error}</p>}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 mt-5 text-[13px] font-bold uppercase tracking-[0.08em] text-muted">{children}</div>;
}
