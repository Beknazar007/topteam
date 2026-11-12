import { useQueryClient } from '@tanstack/react-query';
import { Avatar } from '../../components/ui/Avatar';
import { LevelBar } from '../../components/ui/LevelBar';
import { Spinner } from '../../components/ui/Spinner';
import { useMe } from '../../lib/me';
import { supabase } from '../../lib/supabase';
import { InviteCard } from './InviteCard';

const ROLE: Record<string, string> = { owner: 'Владелец', coach: 'Тренер', athlete: 'Атлет' };

export function ProfilePage() {
  const me = useMe();
  const qc = useQueryClient();
  if (!me.data) return <Spinner />;
  const { profile, gym, role, stats } = me.data;

  const logout = async () => {
    await supabase.auth.signOut();
    qc.clear();
  };

  const tiles = [
    ['Тренировок', stats?.workouts ?? 0],
    ['Рекордов', stats?.pr_count ?? 0],
    ['Лучшая серия', `${stats?.best_streak ?? 0} нед.`],
    ['Пьедесталов', stats?.podiums ?? 0],
  ] as const;

  return (
    <>
      <div className="mb-5 flex items-center gap-3.5">
        <Avatar name={profile.display_name} url={profile.avatar_url} size={64} />
        <div className="min-w-0">
          <h1 className="truncate text-[24px] font-black leading-tight tracking-tight">{profile.display_name}</h1>
          <div className="text-sm text-muted">
            {profile.tg_username ? `@${profile.tg_username} · ` : ''}
            {gym?.name} · {ROLE[role ?? 'athlete']}
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

      {gym && (role === 'owner' || role === 'coach') && (
        <>
          <div className="h-section">Зал</div>
          <InviteCard gym={gym} />
        </>
      )}

      <button onClick={logout} className="mt-8 w-full py-3 text-sm font-bold text-muted">
        Выйти из аккаунта
      </button>
    </>
  );
}
