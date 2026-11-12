import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Segmented';
import type { Profile, Scale } from '../../lib/me';
import { errorText, supabase } from '../../lib/supabase';

export function SettingsForm({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(profile.display_name);
  const [sex, setSex] = useState<'m' | 'f'>(profile.sex ?? 'm');
  const [scale, setScale] = useState<Scale>(profile.default_scale);
  const [goal, setGoal] = useState(profile.week_goal);
  const [notify, setNotify] = useState(profile.notify);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    const { error: e } = await supabase
      .from('profiles')
      .update({ display_name: name.trim(), sex, default_scale: scale, week_goal: goal, notify })
      .eq('id', profile.id);
    setBusy(false);
    if (e) return setError(errorText(e));
    void qc.invalidateQueries({ queryKey: ['me'] });
    void qc.invalidateQueries({ queryKey: ['athlete'] });
    onDone();
  };

  return (
    <div className="grid gap-4">
      <div className="text-[20px] font-black">Настройки</div>
      <label>
        <div className="mb-1.5 text-sm font-bold">Имя в зале</div>
        <input
          className="h-12 w-full rounded-2xl border border-line bg-surface2 px-4 font-semibold outline-none focus:border-accent"
          maxLength={64}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div>
        <div className="mb-1.5 text-sm font-bold">Пол</div>
        <Segmented value={sex} onChange={setSex} options={[{ value: 'm', label: 'Мужской' }, { value: 'f', label: 'Женский' }]} />
      </div>
      <div>
        <div className="mb-1.5 text-sm font-bold">Уровень по умолчанию</div>
        <Segmented
          value={scale}
          onChange={setScale}
          options={(['Beginner', 'Scaled', 'RX'] as const).map((s) => ({ value: s, label: s }))}
        />
      </div>
      <div>
        <div className="mb-1.5 text-sm font-bold">Цель тренировок в неделю</div>
        <Segmented value={goal} onChange={setGoal} options={[2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} />
      </div>
      <label className="flex items-center justify-between rounded-2xl bg-surface2 px-4 py-3 font-bold">
        Уведомления в Telegram
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-5 w-5 accent-[#ff6b2c]" />
      </label>
      <Button onClick={save} disabled={busy || name.trim().length < 1}>
        {busy ? 'Сохраняем…' : 'Сохранить'}
      </Button>
      {error && <p className="text-center text-sm font-semibold text-accent">{error}</p>}
    </div>
  );
}
