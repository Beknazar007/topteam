import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from './auth';

export type Role = 'athlete' | 'coach' | 'owner';
export type Scale = 'RX' | 'Scaled' | 'Beginner';

export interface Profile {
  id: string;
  tg_id: number;
  tg_username: string | null;
  display_name: string;
  avatar_url: string | null;
  sex: 'm' | 'f' | null;
  default_scale: Scale;
  week_goal: number;
  notify: boolean;
}
export interface Gym {
  id: string;
  name: string;
  city: string | null;
  invite_code: string;
}
export interface Stats {
  xp: number;
  level: number;
  workouts: number;
  pr_count: number;
  streak_weeks: number;
  best_streak: number;
  freezes: number;
  week_start: string | null;
  week_workouts: number;
  fires_given: number;
  fires_received: number;
  podiums: number;
  wins: number;
}
export interface Me {
  profile: Profile;
  gym: Gym | null;
  role: Role | null;
  stats: Stats | null;
}

export const ME_KEY = ['me'];

/** Текущий пользователь: профиль, зал (первый), роль и статистика. */
export function useMe() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: [...ME_KEY, uid],
    enabled: Boolean(uid),
    queryFn: async (): Promise<Me | null> => {
      const [p, m, s] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', uid!).maybeSingle(),
        supabase
          .from('gym_members')
          .select('role, joined_at, gyms(*)')
          .eq('user_id', uid!)
          .order('joined_at')
          .limit(1)
          .maybeSingle(),
        supabase.from('user_stats').select('*').eq('user_id', uid!).maybeSingle(),
      ]);
      if (p.error) throw p.error;
      if (!p.data) return null;
      const gym = (m.data?.gyms as unknown as Gym | null) ?? null;
      return { profile: p.data as Profile, gym, role: (m.data?.role as Role) ?? null, stats: (s.data as Stats) ?? null };
    },
  });
}

/** Начало текущей недели (Пн) по Бишкеку — как bishkek_week_start() в БД. */
export function bishkekWeekStart(now = new Date()): string {
  const local = new Date(now.getTime() + 6 * 3600_000); // UTC+6
  const dow = (local.getUTCDay() + 6) % 7; // 0 = Пн
  local.setUTCDate(local.getUTCDate() - dow);
  return local.toISOString().slice(0, 10);
}

/** Тренировок на этой неделе с учётом того, что week_start в БД мог остаться от прошлой недели. */
export function weekDone(stats: Stats | null): number {
  if (!stats) return 0;
  return stats.week_start === bishkekWeekStart() ? stats.week_workouts : 0;
}
