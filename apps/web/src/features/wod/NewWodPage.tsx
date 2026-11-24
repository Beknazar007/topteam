import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Segmented';
import { Spinner } from '../../components/ui/Spinner';
import { useMe } from '../../lib/me';
import { errorText, supabase } from '../../lib/supabase';
import type { ScoreType } from '../../lib/format';
import {
  addDays,
  bishkekToday,
  formatDay,
  KIND_LABEL,
  KINDS,
  useBenchmarks,
  useExercises,
  type Benchmark,
  type Exercise,
  type WodFormat,
  type WodKind,
} from '../../lib/wod';

const input =
  'w-full rounded-2xl border border-line bg-surface2 px-4 py-3 text-base font-semibold outline-none focus:border-accent';

type Mode = 'benchmark' | 'custom' | 'strength';
type Fmt = Exclude<WodFormat, 'max_weight'>;
const CATEGORY: Record<string, string> = { girl: 'Girls', hero: 'Hero', open: 'Open', custom: 'Другие' };
const DEFAULT_SCORE: Record<Fmt, ScoreType> = {
  for_time: 'time',
  amrap: 'rounds_reps',
  emom: 'none',
  other: 'none',
};

/** Черновик одного блока программы дня */
type Draft = {
  key: number;
  kind: WodKind;
  mode: Mode;
  benchmarkId: number | null;
  title: string;
  format: Fmt;
  scoreType: ScoreType;
  description: string;
  capMin: string;
  exerciseId: number | null;
  repMax: number;
  note: string;
};

let nextKey = 1;
function newDraft(kind: WodKind = 'wod'): Draft {
  const d: Draft = {
    key: nextKey++,
    kind: 'wod',
    mode: 'custom',
    benchmarkId: null,
    title: '',
    format: 'for_time',
    scoreType: 'time',
    description: '',
    capMin: '',
    exerciseId: null,
    repMax: 1,
    note: '',
  };
  return withKind(d, kind);
}

const noScoreKind = (k: WodKind) => k === 'warmup' || k === 'cooldown';

/** Смена типа блока с разумными настройками по умолчанию */
function withKind(d: Draft, k: WodKind): Draft {
  if (k === 'strength') return { ...d, kind: k, mode: 'strength' };
  if (k === 'warmup' || k === 'cooldown' || k === 'skill' || k === 'accessory')
    return { ...d, kind: k, mode: 'custom', format: 'other', scoreType: 'none' };
  return { ...d, kind: k, mode: d.mode === 'strength' ? 'custom' : d.mode };
}

const capSecOf = (d: Draft) => (d.capMin.trim() ? Math.round(Number(d.capMin.replace(',', '.')) * 60) : null);
const effModeOf = (d: Draft): Mode => (noScoreKind(d.kind) ? 'custom' : d.mode);

/** Что не так с блоком (null — всё хорошо) */
function draftProblem(d: Draft): string | null {
  const mode = effModeOf(d);
  if (mode === 'benchmark') return d.benchmarkId ? null : 'выбери бенчмарк';
  if (mode === 'strength') return d.exerciseId ? null : 'выбери упражнение';
  if (!d.title.trim()) return 'нужно название';
  if (!d.description.trim()) return 'нужны упражнения';
  const cap = capSecOf(d);
  if (cap !== null && !(cap >= 60 && cap <= 10800)) return 'тайм-кап от 1 до 180 мин';
  return null;
}

/** Аргументы create_wod для блока */
function draftArgs(d: Draft, gym: string, date: string, exercises: Exercise[] | undefined) {
  const base = { p_gym: gym, p_date: date, p_coach_note: d.note.trim() || null, p_kind: d.kind };
  const mode = effModeOf(d);
  if (mode === 'benchmark') return { ...base, p_benchmark_id: d.benchmarkId };
  if (mode === 'strength') {
    const ex = exercises?.find((e) => e.id === d.exerciseId);
    const name = ex?.name ?? '';
    return {
      ...base,
      p_title: `${name} ${d.repMax}RM`,
      p_format: 'max_weight',
      p_score_type: 'weight',
      p_exercise_id: d.exerciseId,
      p_rep_max: d.repMax,
      p_description: d.description.trim() || `Найди свой ${d.repMax}RM в ${name}`,
    };
  }
  return {
    ...base,
    p_title: d.title.trim(),
    p_format: d.format,
    p_score_type: noScoreKind(d.kind) ? 'none' : d.scoreType,
    p_description: d.description.trim(),
    p_time_cap_sec: capSecOf(d),
  };
}

export function NewWodPage() {
  const me = useMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const exercises = useExercises();
  const today = bishkekToday();
  const [params] = useSearchParams();
  const fromWeek = params.get('from') === 'week';
  const paramDate = params.get('date');

  const [date, setDate] = useState(paramDate && /^\d{4}-\d{2}-\d{2}$/.test(paramDate) ? paramDate : today);
  const [blocks, setBlocks] = useState<Draft[]>(() => [newDraft('wod')]);
  const [open, setOpen] = useState<number>(() => blocks[0].key);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me.data) return <Spinner />;
  if (me.data.role !== 'coach' && me.data.role !== 'owner') return <Navigate to="/" replace />;

  const update = (key: number, d: Draft) => setBlocks((bs) => bs.map((b) => (b.key === key ? d : b)));
  const remove = (key: number) => setBlocks((bs) => bs.filter((b) => b.key !== key));
  const move = (i: number, dir: -1 | 1) =>
    setBlocks((bs) => {
      const j = i + dir;
      if (j < 0 || j >= bs.length) return bs;
      const c = [...bs];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  const add = () => {
    const d = newDraft('wod');
    setBlocks((bs) => [...bs, d]);
    setOpen(d.key);
  };

  const problems = blocks.map(draftProblem);
  const valid = blocks.length > 0 && problems.every((p) => p === null);

  // Публикуем по порядку; опубликованные блоки убираем из формы, чтобы при ошибке не создать дубли
  const publish = async () => {
    setBusy(true);
    setError(null);
    for (const b of blocks) {
      const { error: e } = await supabase.rpc('create_wod', draftArgs(b, me.data!.gym!.id, date, exercises.data));
      if (e) {
        setBusy(false);
        setOpen(b.key);
        await qc.invalidateQueries({ queryKey: ['wods'] });
        return setError(`Блок «${KIND_LABEL[b.kind]}»: ${errorText(e)}`);
      }
      setBlocks((bs) => bs.filter((x) => x.key !== b.key));
    }
    setBusy(false);
    await qc.invalidateQueries({ queryKey: ['wods'] });
    nav(fromWeek ? '/week' : '/', { replace: true });
  };

  return (
    <div className="pt-safe-5 mx-auto max-w-md px-4 pb-10 md:max-w-xl">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => nav(-1)} className="text-sm font-bold text-muted">
          ← Назад
        </button>
        <h1 className="text-[20px] font-black">Программа дня</h1>
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
        min={addDays(today, -14)}
        max={addDays(today, 60)}
        onChange={(e) => e.target.value && setDate(e.target.value)}
      />
      <div className="mt-1 text-[13px] text-muted">{formatDay(date)}</div>

      <Label>Блоки · {blocks.length}</Label>
      <div className="grid gap-2.5">
        {blocks.map((b, i) => (
          <BlockCard
            key={b.key}
            n={i + 1}
            draft={b}
            problem={problems[i]}
            open={open === b.key}
            onOpen={() => setOpen(open === b.key ? -1 : b.key)}
            onChange={(d) => update(b.key, d)}
            onRemove={blocks.length > 1 ? () => remove(b.key) : undefined}
            onUp={i > 0 ? () => move(i, -1) : undefined}
            onDown={i < blocks.length - 1 ? () => move(i, 1) : undefined}
            exercises={exercises.data}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        disabled={busy}
        className="mt-2.5 h-12 w-full rounded-2xl border border-dashed border-accent/60 font-extrabold text-accent"
      >
        ＋ Добавить блок
      </button>

      <Button className="mt-6" onClick={publish} disabled={!valid || busy}>
        {busy ? 'Публикуем…' : `Опубликовать программу · ${blocks.length} ${plural(blocks.length)}`}
      </Button>
      {!valid && blocks.length > 0 && (
        <p className="mt-2 text-center text-[13px] text-muted">Заполни отмеченные блоки</p>
      )}
      {error && <p className="mt-3 text-center text-sm font-semibold text-accent">{error}</p>}
    </div>
  );
}

const plural = (n: number) =>
  n % 10 === 1 && n % 100 !== 11 ? 'блок' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'блока' : 'блоков';

function BlockCard({
  n,
  draft: d,
  problem,
  open,
  onOpen,
  onChange,
  onRemove,
  onUp,
  onDown,
  exercises,
}: {
  n: number;
  draft: Draft;
  problem: string | null;
  open: boolean;
  onOpen: () => void;
  onChange: (d: Draft) => void;
  onRemove?: () => void;
  onUp?: () => void;
  onDown?: () => void;
  exercises: Exercise[] | undefined;
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...d, [k]: v });
  const summary =
    effModeOf(d) === 'strength'
      ? exercises?.find((e) => e.id === d.exerciseId)?.name
      : effModeOf(d) === 'benchmark'
        ? null
        : d.title.trim();

  return (
    <div className={`card !p-0 overflow-hidden ${open ? 'ring-1 ring-accent/50' : ''}`}>
      <div className="flex items-center gap-2 px-3.5 py-3">
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface2 text-sm font-black">{n}</span>
          <span className="min-w-0">
            <span className="block text-[12px] font-bold uppercase tracking-wider text-accent">
              {KIND_LABEL[d.kind]}
            </span>
            <span className="block truncate font-extrabold">
              {summary || <span className="text-muted">{problem ? `— ${problem}` : 'Бенчмарк'}</span>}
            </span>
          </span>
        </button>
        {problem && !open && <span className="text-accent">●</span>}
        <button type="button" onClick={onUp} disabled={!onUp} className="h-8 w-8 rounded-lg bg-surface2 text-sm disabled:opacity-30" aria-label="Выше">
          ↑
        </button>
        <button type="button" onClick={onDown} disabled={!onDown} className="h-8 w-8 rounded-lg bg-surface2 text-sm disabled:opacity-30" aria-label="Ниже">
          ↓
        </button>
      </div>
      {open && (
        <div className="border-t border-line px-3.5 pb-4">
          <BlockForm d={d} set={set} onChange={onChange} exercises={exercises} />
          {onRemove && (
            <button type="button" onClick={onRemove} className="mt-4 w-full text-sm font-bold text-muted">
              🗑 Убрать блок
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function BlockForm({
  d,
  set,
  onChange,
  exercises,
}: {
  d: Draft;
  set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  onChange: (d: Draft) => void;
  exercises: Exercise[] | undefined;
}) {
  const benchmarks = useBenchmarks();
  const bList = benchmarks.data;
  const grouped = useMemo(() => {
    const g = new Map<string, Benchmark[]>();
    for (const b of bList ?? []) g.set(b.category, [...(g.get(b.category) ?? []), b]);
    return [...g.entries()];
  }, [bList]);
  const bm = bList?.find((b) => b.id === d.benchmarkId);
  const noScore = noScoreKind(d.kind);
  const mode = effModeOf(d);

  return (
    <>
      <Label>Блок</Label>
      <div className="grid grid-cols-3 gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onChange(withKind(d, k))}
            className={`h-11 rounded-xl text-sm font-extrabold ${d.kind === k ? 'bg-accent text-white' : 'bg-surface2 text-muted'}`}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {!noScore && (
        <>
          <Label>Тип</Label>
          <Segmented
            value={d.mode}
            onChange={(m) => set('mode', m)}
            options={[
              { value: 'custom', label: 'Свой' },
              { value: 'benchmark', label: 'Бенчмарк' },
              { value: 'strength', label: 'Силовая' },
            ]}
          />
        </>
      )}

      {mode === 'benchmark' && (
        <div className="mt-3">
          {benchmarks.isLoading && <Spinner />}
          {grouped.map(([cat, list]) => (
            <div key={cat} className="mb-3">
              <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-muted">
                {CATEGORY[cat] ?? cat}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {list.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => set('benchmarkId', b.id)}
                    className={`rounded-xl px-3 py-2 text-sm font-bold ${d.benchmarkId === b.id ? 'bg-accent text-white' : 'bg-surface2'}`}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {bm && (
            <div className="rounded-2xl bg-surface2 p-3.5">
              <div className="font-black">{bm.name}</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-muted">{bm.description}</div>
              {bm.time_cap_sec && (
                <div className="mt-1 text-[13px] text-muted">Тайм-кап {bm.time_cap_sec / 60} мин</div>
              )}
            </div>
          )}
        </div>
      )}

      {mode === 'custom' && (
        <div className="mt-3 grid gap-3">
          <input
            className={input}
            placeholder="Название (напр. «EMOM 10 мин — взятие в сед»)"
            maxLength={80}
            value={d.title}
            onChange={(e) => set('title', e.target.value)}
          />
          {!noScore && (
            <Segmented
              value={d.format}
              onChange={(f) => onChange({ ...d, format: f, scoreType: DEFAULT_SCORE[f] })}
              options={[
                { value: 'for_time', label: 'For Time' },
                { value: 'amrap', label: 'AMRAP' },
                { value: 'emom', label: 'EMOM' },
                { value: 'other', label: 'Other' },
              ]}
            />
          )}
          <textarea
            className={`${input} min-h-[120px]`}
            placeholder={'Упражнения, по строке на каждое:\n21-15-9\nThrusters 43/30 кг\nPull-ups'}
            maxLength={2000}
            value={d.description}
            onChange={(e) => set('description', e.target.value)}
          />
          {!noScore && (
            <div>
              <div className="mb-1.5 text-sm font-bold">Как считать результат</div>
              <select className={input} value={d.scoreType} onChange={(e) => set('scoreType', e.target.value as ScoreType)}>
                <option value="time">Время</option>
                <option value="rounds_reps">Раунды + повторы</option>
                <option value="reps">Повторы</option>
                <option value="weight">Вес</option>
                <option value="none">Без счёта (просто отметка)</option>
              </select>
            </div>
          )}
          {!noScore && (
            <input
              className={input}
              inputMode="decimal"
              placeholder="Тайм-кап, минут (необязательно)"
              value={d.capMin}
              onChange={(e) => set('capMin', e.target.value)}
            />
          )}
        </div>
      )}

      {mode === 'strength' && (
        <div className="mt-3 grid gap-3">
          <select
            className={input}
            value={d.exerciseId ?? ''}
            onChange={(e) => set('exerciseId', Number(e.target.value) || null)}
          >
            <option value="">Выбери упражнение</option>
            {exercises?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <Segmented
            value={d.repMax}
            onChange={(v) => set('repMax', v)}
            options={[1, 3, 5].map((n) => ({ value: n, label: `${n}RM` }))}
          />
          <textarea
            className={`${input} min-h-[80px]`}
            placeholder="Описание (необязательно), напр. «20 минут на поиск 1ПМ»"
            maxLength={2000}
            value={d.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </div>
      )}

      <Label>Заметка тренера</Label>
      <textarea
        className={`${input} min-h-[60px]`}
        placeholder="Необязательно: переход 3 мин, масштабирование, советы"
        maxLength={1000}
        value={d.note}
        onChange={(e) => set('note', e.target.value)}
      />
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 mt-5 text-[13px] font-bold uppercase tracking-[0.08em] text-muted">{children}</div>;
}
