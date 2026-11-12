import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Segmented';
import { encodeRoundsReps, formatTime } from '../../lib/format';
import { useMe, type Scale } from '../../lib/me';
import { errorText, supabase } from '../../lib/supabase';
import { FORMAT_LABEL, type LogResponse, type Wod } from '../../lib/wod';

const box =
  'num h-16 w-full rounded-2xl border border-line bg-surface2 text-center text-[30px] font-black outline-none focus:border-accent';

const int = (s: string) => (s.trim() === '' ? NaN : Number(s));

export function ResultForm({ wod, onDone }: { wod: Wod; onDone: (r: LogResponse) => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const [scale, setScale] = useState<Scale>(me.data?.profile.default_scale ?? 'Scaled');
  const [a, setA] = useState(''); // минуты / раунды / повторы / кг
  const [b, setB] = useState(''); // секунды / повторы
  const [capped, setCapped] = useState(false);
  const [capReps, setCapReps] = useState('');
  const [rpe, setRpe] = useState(7);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const score = (() => {
    switch (wod.score_type) {
      case 'time': {
        if (capped) return int(capReps);
        const m = int(a || '0');
        const s = int(b || '0');
        return s >= 60 ? NaN : m * 60 + s;
      }
      case 'rounds_reps':
        return encodeRoundsReps(int(a || '0'), int(b || '0'));
      case 'reps':
        return int(a);
      case 'weight':
        return Number(a.replace(',', '.'));
      default:
        return 1;
    }
  })();
  const valid = Number.isFinite(score) && score > 0;

  const save = async () => {
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('log_result', {
      p_wod: wod.id,
      p_scale: scale,
      p_score: score,
      p_capped: capped,
      p_rpe: rpe,
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (e) return setError(errorText(e));
    // Обновить всё, что зависит от результата
    void qc.invalidateQueries({ queryKey: ['me'] });
    void qc.invalidateQueries({ queryKey: ['wod-results'] });
    void qc.invalidateQueries({ queryKey: ['prs'] });
    void qc.invalidateQueries({ queryKey: ['leaderboard'] });
    void qc.invalidateQueries({ queryKey: ['feed'] });
    if ('vibrate' in navigator) navigator.vibrate?.(30);
    onDone(data as LogResponse);
  };

  const field = (label: string, value: string, set: (v: string) => void, placeholder = '0', decimal = false) => (
    <label className="flex-1">
      <input
        className={box}
        inputMode={decimal ? 'decimal' : 'numeric'}
        placeholder={placeholder}
        value={value}
        onChange={(e) => set(decimal ? e.target.value.replace(/[^\d.,]/g, '') : e.target.value.replace(/\D/g, ''))}
      />
      <span className="mt-1 block text-center text-[12px] font-semibold text-muted">{label}</span>
    </label>
  );

  return (
    <>
      <div className="mb-3">
        <div className="text-[20px] font-black">{wod.title}</div>
        <div className="text-sm text-muted">
          {FORMAT_LABEL[wod.format]}
          {wod.time_cap_sec ? ` · кап ${formatTime(wod.time_cap_sec)}` : ''}
        </div>
      </div>

      <Segmented
        value={scale}
        onChange={setScale}
        options={[
          { value: 'RX', label: 'RX' },
          { value: 'Scaled', label: 'Scaled' },
          { value: 'Beginner', label: 'Beginner' },
        ]}
      />

      <div className="my-4">
        {wod.score_type === 'time' && !capped && (
          <div className="flex items-start gap-2">
            {field('мин', a, setA)}
            <span className="pt-3 text-3xl font-black text-muted">:</span>
            {field('сек', b, setB, '00')}
          </div>
        )}
        {wod.score_type === 'time' && capped && field('повторов успел сделать', capReps, setCapReps)}
        {wod.score_type === 'rounds_reps' && (
          <div className="flex items-start gap-2">
            {field('раундов', a, setA)}
            <span className="pt-3 text-3xl font-black text-muted">+</span>
            {field('повторов', b, setB)}
          </div>
        )}
        {wod.score_type === 'reps' && field('повторов', a, setA)}
        {wod.score_type === 'weight' && field('кг', a, setA, '0', true)}
        {wod.score_type === 'none' && (
          <div className="card text-center font-bold">✓ Отметь, что выполнил тренировку</div>
        )}
        {wod.score_type === 'time' && wod.time_cap_sec && (
          <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={capped} onChange={(e) => setCapped(e.target.checked)} className="h-5 w-5 accent-[#ff6b2c]" />
            Не уложился в тайм-кап
          </label>
        )}
      </div>

      <div className="mb-1 flex justify-between text-sm font-bold">
        <span>RPE — насколько тяжело</span>
        <span className="num text-accent">{rpe}</span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        value={rpe}
        onChange={(e) => setRpe(Number(e.target.value))}
        className="mb-4 w-full accent-[#ff6b2c]"
      />
      <textarea
        className="mb-4 min-h-[60px] w-full rounded-2xl border border-line bg-surface2 px-4 py-3 text-base outline-none focus:border-accent"
        placeholder="Заметка: веса, масштабирование, ощущения…"
        maxLength={500}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button onClick={save} disabled={!valid || busy}>
        {busy ? 'Сохраняем…' : 'Сохранить'}
      </Button>
      {error && <p className="mt-3 text-center text-sm font-semibold text-accent">{error}</p>}
    </>
  );
}
