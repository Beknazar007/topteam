import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

export type NomPeriod = 'day' | 'week' | 'month';

export interface NomType {
  code: string;
  period: NomPeriod;
  name_m: string;
  name_f: string;
  emoji: string;
  by_sex: boolean;
  xp: number;
  sort: number;
}
export interface Standing {
  code: string;
  sex: string;
  place: number;
  user_id: string;
  score: number;
  detail: string;
  participants: number;
  profile?: { display_name: string; avatar_url: string | null };
}

export const NOM_HINT: Record<string, string> = {
  athlete: 'Больше всего очков — за тренировки, места и рекорды',
  iron: 'Больше всего тренировочных дней',
  pr: 'Больше всего личных рекордов',
  soul: 'Больше всех поддерживал других: 🔥 и комментарии',
  progress: 'Больше всего новых уровней за месяц — шанс для новичков',
};
export const nomFamily = (code: string) => code.split('_')[0];

/** Текущая гонка: топ-3 в каждой номинации периода + типы номинаций */
export function useStandings(gymId: string | undefined, period: NomPeriod, start: string) {
  return useQuery({
    queryKey: ['nominations', gymId, period, start],
    enabled: Boolean(gymId),
    queryFn: async () => {
      const [t, s] = await Promise.all([
        supabase.from('nomination_types').select('*').eq('period', period).order('sort'),
        supabase.rpc('nomination_standings', { p_gym: gymId, p_period: period, p_start: start }),
      ]);
      if (t.error) throw t.error;
      if (s.error) throw s.error;
      const rows = (s.data ?? []) as Standing[];
      const ids = [...new Set(rows.map((r) => r.user_id))];
      const p = ids.length
        ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', ids)
        : { data: [] as { id: string; display_name: string; avatar_url: string | null }[] };
      const byId = new Map((p.data ?? []).map((x) => [x.id, x]));
      return {
        types: (t.data ?? []) as NomType[],
        rows: rows.map((r) => ({ ...r, profile: byId.get(r.user_id) })),
      };
    },
  });
}

export interface Award {
  id: number;
  code: string;
  period_start: string;
  detail: string | null;
  nomination_types: { name_m: string; name_f: string; emoji: string; period: NomPeriod } | null;
}

/** Награды атлета (для профиля) */
export function useAwards(userId: string | undefined) {
  return useQuery({
    queryKey: ['awards', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nominations')
        .select('id, code, period_start, detail, nomination_types(name_m, name_f, emoji, period)')
        .eq('user_id', userId!)
        .order('period_start', { ascending: false })
        .limit(200);
      if (error) return [] as Award[]; // сервер ещё без номинаций — просто не показываем
      return (data ?? []) as unknown as Award[];
    },
  });
}
