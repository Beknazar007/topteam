import { useState } from 'react';
import { Avatar } from '../../components/ui/Avatar';
import { LevelBar } from '../../components/ui/LevelBar';
import { Sheet } from '../../components/ui/Sheet';
import { Spinner } from '../../components/ui/Spinner';
import { formatScore } from '../../lib/format';
import { RARITY_NAME, type Rarity } from '../../lib/game';
import { useMe } from '../../lib/me';
import { useAthlete, type Badge } from '../../lib/social';
import { formatDay, useBenchmarks, useExercises } from '../../lib/wod';

const ROLE: Record<string, string> = { owner: 'Владелец', coach: 'Тренер', athlete: 'Атлет' };
const RARITY_RING = ['border-line', 'border-rare', 'border-epic', 'border-gold'];

/** Профиль атлета (свой или чужой). children — блоки только для своего профиля. */
export function ProfileView({ userId, actions }: { userId: string; actions?: React.ReactNode }) {
  const me = useMe();
  const a = useAthlete(userId, me.data?.gym?.id);
  const benchmarks = useBenchmarks();
  const exercises = useExercises();
  const [badge, setBadge] = useState<Badge | null>(null);

  if (a.isLoading) return <Spinner />;
  if (!a.data?.profile) return <div className="py-20 text-center text-muted">Атлет не найден</div>;
  const { profile, stats, prs, history, badges, earned, role } = a.data;

  const prLabel = (key: string) => {
    const [kind, id, extra] = key.split(':');
    if (kind === 'b') {
      const b = benchmarks.data?.find((x) => x.id === Number(id));
      return { name: b?.name ?? 'Бенчмарк', sub: extra, type: b?.score_type ?? 'time' };
    }
    const e = exercises.data?.find((x) => x.id === Number(id));
    return { name: e?.name ?? 'Упражнение', sub: `${extra}RM`, type: 'weight' as const };
  };

  const tiles = [
    ['Тренировок', stats?.workouts ?? 0],
    ['Рекордов', stats?.pr_count ?? 0],
    ['Лучшая серия', `${stats?.best_streak ?? 0} нед.`],
    ['🔥 получено', stats?.fires_received ?? 0],
  ] as const;

  return (
    <>
      <div className="mb-5 flex items-center gap-3.5">
        <Avatar name={profile.display_name} url={profile.avatar_url} size={64} />
        <div className="min-w-0">
          <h1 className="truncate text-[24px] font-black leading-tight tracking-tight">{profile.display_name}</h1>
          <div className="text-sm text-muted">
            {profile.tg_username ? `@${profile.tg_username} · ` : ''}
            {ROLE[role ?? 'athlete']}
            {profile.default_scale ? ` · ${profile.default_scale}` : ''}
          </div>
        </div>
      </div>

      <LevelBar xp={stats?.xp ?? 0} streak={stats?.streak_weeks ?? 0} />

      <div className="grid grid-cols-2 gap-2.5">
        {tiles.map(([label, value]) => (
          <div key={label} className="card py-3">
            <div className="num text-[22px] font-black">{value}</div>
            <div className="text-[13px] text-muted">{label}</div>
          </div>
        ))}
      </div>

      {actions}

      <div className="h-section">Рекорды</div>
      {prs.length === 0 ? (
        <div className="card text-sm text-muted">Пока нет. Бенчмарки и силовые WOD создают рекорды автоматически.</div>
      ) : (
        <div className="card divide-y divide-line py-1">
          {prs
            .map((p) => ({ ...p, ...prLabel(p.pr_key) }))
            .sort((x, y) => x.name.localeCompare(y.name))
            .map((p) => (
              <div key={p.pr_key} className="flex items-center justify-between py-2.5">
                <div>
                  <div className="font-bold">{p.name}</div>
                  <div className="text-[12px] text-muted">
                    {p.sub} · {new Date(p.achieved_at).toLocaleDateString('ru-RU')}
                  </div>
                </div>
                <div className="num text-lg font-black text-gold">{formatScore(p.type, p.score)}</div>
              </div>
            ))}
        </div>
      )}

      <div className="h-section">
        Бейджи · {earned.size}/{badges.length}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {badges.map((b) => {
          const got = earned.has(b.code);
          return (
            <button
              key={b.code}
              onClick={() => setBadge(b)}
              className={`flex aspect-square flex-col items-center justify-center rounded-2xl border-2 bg-surface p-1 ${
                got ? RARITY_RING[b.rarity] : 'border-transparent opacity-35 grayscale'
              }`}
            >
              <span className="text-2xl">{b.emoji}</span>
              <span className="mt-0.5 line-clamp-2 text-center text-[10px] font-bold leading-tight">{b.name}</span>
            </button>
          );
        })}
      </div>

      <div className="h-section">История</div>
      {history.length === 0 ? (
        <div className="card text-sm text-muted">Результатов пока нет.</div>
      ) : (
        <div className="card divide-y divide-line py-1">
          {history.map((h) => (
            <div key={h.id} className="flex items-center justify-between py-2.5">
              <div className="min-w-0">
                <div className="truncate font-bold">{h.wods?.title}</div>
                <div className="text-[12px] text-muted">
                  {h.wods ? formatDay(h.wods.wod_date) : ''} · {h.scale}
                </div>
              </div>
              <div className="num shrink-0 text-right font-black">
                {h.is_pr && '🏆 '}
                {formatScore(h.wods?.score_type ?? 'none', h.score, h.capped)}
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={Boolean(badge)} onClose={() => setBadge(null)}>
        {badge && (
          <div className="py-4 text-center">
            <div className="text-6xl">{badge.emoji}</div>
            <div className="mt-2 text-xl font-black">{badge.name}</div>
            <div className="text-[13px] font-bold text-muted">{RARITY_NAME[badge.rarity as Rarity]}</div>
            <p className="mt-2 text-sm">{badge.description}</p>
            <p className="mt-2 text-[13px] text-muted">
              {earned.has(badge.code)
                ? `Получен ${new Date(earned.get(badge.code)!).toLocaleDateString('ru-RU')}`
                : 'Ещё не получен'}
            </p>
          </div>
        )}
      </Sheet>
    </>
  );
}
