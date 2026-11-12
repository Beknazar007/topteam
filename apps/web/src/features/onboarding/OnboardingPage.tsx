import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Segmented';
import { Spinner } from '../../components/ui/Spinner';
import { pendingInvite } from '../../lib/auth';
import { ME_KEY, useMe, type Scale } from '../../lib/me';
import { errorText, supabase } from '../../lib/supabase';

const input =
  'h-12 w-full rounded-2xl border border-line bg-surface2 px-4 text-base font-semibold outline-none focus:border-accent';

export function OnboardingPage() {
  const me = useMe();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ME_KEY });

  // Автовступление по коду из QR-ссылки
  const autoJoined = useRef(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  useEffect(() => {
    const code = pendingInvite.get();
    if (!me.data || autoJoined.current || !code) return;
    autoJoined.current = true;
    if (me.data.gym?.invite_code === code) {
      pendingInvite.clear();
      return;
    }
    if (me.data.gym) {
      pendingInvite.clear(); // MVP: один зал
      return;
    }
    supabase.rpc('join_gym', { p_code: code }).then(({ error }) => {
      pendingInvite.clear();
      if (error) setJoinError(errorText(error));
      else void refresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.data]);

  if (me.isLoading || !me.data) return <Spinner />;
  const { gym, profile } = me.data;
  if (gym && profile.sex) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto min-h-full max-w-md px-4 pb-10 pt-8">
      <div className="mb-1 text-sm font-bold text-muted">Привет, {profile.display_name} 👋</div>
      {!gym ? <GymStep onDone={refresh} initialError={joinError} /> : <ProfileStep onDone={refresh} />}
    </div>
  );
}

function GymStep({ onDone, initialError }: { onDone: () => void; initialError: string | null }) {
  const [mode, setMode] = useState<'join' | 'create'>('join');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('Бишкек');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  useEffect(() => setError(initialError), [initialError]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const { error: e } =
      mode === 'join'
        ? await supabase.rpc('join_gym', { p_code: code })
        : await supabase.rpc('create_gym', { p_name: name, p_city: city });
    setBusy(false);
    if (e) setError(errorText(e));
    else onDone();
  };

  return (
    <>
      <h1 className="mb-5 text-[28px] font-black leading-tight tracking-tight">Твой зал</h1>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'join', label: 'Вступить' },
          { value: 'create', label: 'Создать зал' },
        ]}
      />
      <div className="mt-5 grid gap-3">
        {mode === 'join' ? (
          <>
            <p className="text-sm text-muted">
              Отсканируй QR-код на стене зала или введи код, который дал тренер.
            </p>
            <input
              className={`${input} num text-center text-2xl uppercase tracking-[0.3em]`}
              placeholder="ABC123"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              autoCapitalize="characters"
            />
            <Button onClick={submit} disabled={busy || code.length !== 6}>
              {busy ? 'Вступаем…' : 'Вступить в зал'}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">Ты станешь владельцем зала и сможешь назначать тренеров.</p>
            <input className={input} placeholder="Название зала" value={name} onChange={(e) => setName(e.target.value)} />
            <input className={input} placeholder="Город" value={city} onChange={(e) => setCity(e.target.value)} />
            <Button onClick={submit} disabled={busy || name.trim().length < 2}>
              {busy ? 'Создаём…' : 'Создать зал'}
            </Button>
          </>
        )}
        {error && <p className="text-center text-sm font-semibold text-accent">{error}</p>}
      </div>
    </>
  );
}

function ProfileStep({ onDone }: { onDone: () => void }) {
  const [sex, setSex] = useState<'m' | 'f'>('m');
  const [scale, setScale] = useState<Scale>('Scaled');
  const [goal, setGoal] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    const { data } = await supabase.auth.getUser();
    const { error: e } = await supabase
      .from('profiles')
      .update({ sex, default_scale: scale, week_goal: goal })
      .eq('id', data.user!.id);
    setBusy(false);
    if (e) setError(errorText(e));
    else onDone();
  };

  return (
    <>
      <h1 className="mb-5 text-[28px] font-black leading-tight tracking-tight">Пара вопросов</h1>
      <div className="grid gap-5">
        <Field label="Пол" hint="Для отдельных рейтингов М и Ж">
          <Segmented
            value={sex}
            onChange={setSex}
            options={[
              { value: 'm', label: 'Мужской' },
              { value: 'f', label: 'Женский' },
            ]}
          />
        </Field>
        <Field label="Твой уровень" hint="Можно менять для каждой тренировки">
          <Segmented
            value={scale}
            onChange={setScale}
            options={[
              { value: 'Beginner', label: 'Beginner' },
              { value: 'Scaled', label: 'Scaled' },
              { value: 'RX', label: 'RX' },
            ]}
          />
        </Field>
        <Field label="Цель на неделю" hint="Столько тренировок — и серия 🔥 растёт">
          <Segmented
            value={goal}
            onChange={setGoal}
            options={[2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
          />
        </Field>
        <Button onClick={save} disabled={busy}>
          {busy ? 'Сохраняем…' : 'Готово'}
        </Button>
        {error && <p className="text-center text-sm font-semibold text-accent">{error}</p>}
      </div>
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 font-extrabold">{label}</div>
      <div className="mb-2 text-[13px] text-muted">{hint}</div>
      {children}
    </div>
  );
}
