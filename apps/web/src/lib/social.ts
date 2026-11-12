import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { Profile, Role, Stats } from './me';
import type { Scale } from './me';
import type { ScoreType } from './format';

type Who = { display_name: string; avatar_url: string | null };

export interface FeedItem {
  id: number;
  gym_id: string;
  user_id: string;
  kind: 'result' | 'badge' | 'level' | 'streak';
  result_id: string | null;
  payload: Record<string, unknown>;
  fire_count: number;
  comment_count: number;
  created_at: string;
  profiles: Who | null;
}
export interface Comment {
  id: number;
  feed_item_id: number;
  user_id: string;
  body: string;
  created_at: string;
  profiles: Who | null;
}
export interface BoardRow {
  result_id: string;
  wod_id: string;
  user_id: string;
  scale: Scale;
  score: number;
  capped: boolean;
  is_pr: boolean;
  display_name: string;
  avatar_url: string | null;
  sex: 'm' | 'f' | null;
  created_at: string;
}

const PAGE = 20;

export function useFeed(gymId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['feed', gymId],
    enabled: Boolean(gymId),
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from('feed_items')
        // явная связь: у feed_items есть ещё связь с profiles через fires
        .select('*, profiles!feed_items_user_id_fkey(display_name, avatar_url)')
        .eq('gym_id', gymId!)
        .order('id', { ascending: false })
        .limit(PAGE);
      if (pageParam) q = q.lt('id', pageParam);
      const { data, error } = await q;
      if (error) throw error;
      return data as FeedItem[];
    },
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].id : null),
  });
}

/** id постов, где я поставил 🔥 */
export function useMyFires(itemIds: number[], userId: string | undefined) {
  return useQuery({
    queryKey: ['my-fires', itemIds.join(','), userId],
    enabled: itemIds.length > 0 && Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fires')
        .select('feed_item_id')
        .eq('user_id', userId!)
        .in('feed_item_id', itemIds);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.feed_item_id as number));
    },
  });
}

export function useComments(itemId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['comments', itemId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comments')
        .select('*, profiles(display_name, avatar_url)')
        .eq('feed_item_id', itemId)
        .order('created_at');
      if (error) throw error;
      return data as Comment[];
    },
  });
}

export function useLeaderboard(wodId: string | undefined) {
  return useQuery({
    queryKey: ['leaderboard', wodId],
    enabled: Boolean(wodId),
    queryFn: async () => {
      const { data, error } = await supabase.from('wod_leaderboard').select('*').eq('wod_id', wodId!);
      if (error) throw error;
      return (data as BoardRow[]).map((r) => ({ ...r, score: Number(r.score) }));
    },
  });
}

export interface HistoryRow {
  id: string;
  scale: Scale;
  score: number;
  capped: boolean;
  is_pr: boolean;
  created_at: string;
  wods: { title: string; wod_date: string; score_type: ScoreType } | null;
}
export interface Badge {
  code: string;
  name: string;
  emoji: string;
  rarity: 0 | 1 | 2 | 3;
  description: string;
  sort: number;
}

/** Всё для страницы атлета. */
export function useAthlete(userId: string | undefined, gymId: string | undefined) {
  return useQuery({
    queryKey: ['athlete', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const [p, s, prs, hist, all, mine, mem] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId!).maybeSingle(),
        supabase.from('user_stats').select('*').eq('user_id', userId!).maybeSingle(),
        supabase.from('personal_records').select('pr_key, score, achieved_at').eq('user_id', userId!),
        supabase
          .from('results')
          .select('id, scale, score, capped, is_pr, created_at, wods(title, wod_date, score_type)')
          .eq('user_id', userId!)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase.from('badges').select('*').eq('enabled', true).order('sort'),
        supabase.from('user_badges').select('code, earned_at').eq('user_id', userId!),
        gymId
          ? supabase.from('gym_members').select('role').eq('gym_id', gymId).eq('user_id', userId!).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return {
        profile: p.data as Profile | null,
        stats: s.data as Stats | null,
        prs: (prs.data ?? []).map((r) => ({ ...r, score: Number(r.score) })) as { pr_key: string; score: number; achieved_at: string }[],
        history: ((hist.data ?? []) as unknown as HistoryRow[]).map((r) => ({ ...r, score: Number(r.score) })),
        badges: (all.data ?? []) as Badge[],
        earned: new Map((mine.data ?? []).map((b) => [b.code as string, b.earned_at as string])),
        role: ((mem.data as { role?: Role } | null)?.role ?? null) as Role | null,
      };
    },
  });
}
