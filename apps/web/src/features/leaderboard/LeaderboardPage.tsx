import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar } from '../../components/ui/Avatar';
import { EmptyState } from '../../components/ui/EmptyState';
import { Segmented } from '../../components/ui/Segmented';
import { Spinner } from '../../components/ui/Spinner';
import { formatScore } from '../../lib/format';
import { useMe, type Scale } from '../../lib/me';
import { rankRows } from '../../lib/rank';
import { useLeaderboard, type BoardRow } from '../../lib/social';
import { errorText, supabase } from '../../lib/supabase';
import { bishkekToday, formatDay, useRecentWods } from '../../lib/wod';

const MEDAL = ['', '🥇', '🥈', '🥉'];

export function LeaderboardPage() {
  const me = useMe();
  const qc = useQueryClient();
  const today = bishkekToday();
  const wods = useRecentWods(me.data?.gym?.id);
  const past = (wods.data ?? []).filter((w) => w.wod_date <= today);
  const [wodId, setWodId] = useState<string | null>(null);
  const wod = past.find((w) => w.id === wodId) ?? past[0];
  const [scale, setScale] = useState<Scale>(me.data?.profile.default_scale ?? 'RX');
  const [sex, setSex] = useState<'all' | 'm' | 'f'>('all');
  const board = useLeaderboard(wod?.id);
  const coach = me.data?.role === 'coach' || me.data?.role === 'owner';
  const myId = me.data?.profile.id;

  const rows = useMemo(() => {
    if (!wod || !board.data) return [];
    const filtered = board.data.filter((r) => r.scale === scale && (sex === 'all' || r.sex === sex));
    return rankRows(filtered, wod.score_type);
  }, [board.data, wod, scale, sex]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of board.data ?? []) c[r.scale] = (c[r.scale] ?? 0) + 1;
    return c;
  }, [board.data]);

  const remove = async (r: BoardRow) => {
    const own = r.user_id === myId;
    const msg = own
      ? 'Удалить свой результат? XP за него снимется, и ты сможешь записать заново.'
      : `Удалить результат ${r.display_name}? XP за него снимется.`;
    if (!confirm(msg)) return;
    const { error } = await supabase.rpc('delete_result', { p_result: r.result_id });
    if (error) return alert(errorText(error));
    for (const k of ['leaderboard', 'wod-results', 'me', 'prs', 'feed', 'athlete']) void qc.invalidateQueries({ queryKey: [k] });
  };

  return (
    <>
      <h1 className="mb-4 text-[26px] font-black tracking-tight">Рейтинг</h1>
      {wods.isLoading ? (
        <Spinner />
      ) : !wod ? (
        <EmptyState emoji="🏆" title="Пока нечего сравнивать">
          Рейтинг появится, когда тренер опубликует WOD и атлеты запишут результаты.
        </EmptyState>
      ) : (
        <>
          {past.length > 1 && (
            <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
              {past.map((w) => (
                <button
                  key={w.id}
                  onClick={() => setWodId(w.id)}
                  className={`shrink-0 rounded-xl px-3 py-2 text-left ${w.id === wod.id ? 'bg-accent text-white' : 'bg-surface2'}`}
                >
                  <div className="text-[11px] font-bold uppercase opacity-80">{w.wod_date === today ? 'Сегодня' : formatDay(w.wod_date)}</div>
                  <div className="max-w-[140px] truncate text-sm font-black">{w.title}</div>
                </button>
              ))}
            </div>
          )}
          <div className="mb-1 text-[22px] font-black uppercase leading-tight">{wod.title}</div>
          <div className="mb-3 text-[13px] text-muted">{formatDay(wod.wod_date)}</div>

          <Segmented
            value={scale}
            onChange={setScale}
            options={(['RX', 'Scaled', 'Beginner'] as const).map((s) => ({
              value: s,
              label: counts[s] ? `${s} · ${counts[s]}` : s,
            }))}
          />
          <div className="mt-2">
            <Segmented
              value={sex}
              onChange={setSex}
              options={[
                { value: 'all', label: 'Все' },
                { value: 'm', label: 'Мужчины' },
                { value: 'f', label: 'Женщины' },
              ]}
            />
          </div>

          <div className="mt-4">
            {board.isLoading ? (
              <Spinner />
            ) : rows.length === 0 ? (
              <EmptyState emoji="⏱️" title={`В ${scale} пока пусто`}>
                Запиши результат первым — и займи 1-е место.
              </EmptyState>
            ) : (
              rows.map((r) => (
                <div
                  key={r.result_id}
                  className={`mb-2 flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${
                    r.user_id === myId ? 'border-accent/60 bg-accent/10' : 'border-line bg-surface'
                  }`}
                >
                  <div className="num w-7 text-center text-lg font-black">{MEDAL[r.place] || r.place}</div>
                  <Link to={r.user_id === myId ? '/profile' : `/athlete/${r.user_id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                    <Avatar name={r.display_name} url={r.avatar_url} size={36} />
                    <div className="min-w-0">
                      <div className="truncate font-bold">{r.display_name}</div>
                      {r.is_pr && <div className="text-[12px] font-bold text-gold">🏆 Личный рекорд</div>}
                    </div>
                  </Link>
                  <div className="num text-right text-lg font-black">{formatScore(wod.score_type, r.score, r.capped)}</div>
                  {(coach || r.user_id === myId) && (
                    <button onClick={() => remove(r)} aria-label="Удалить результат" className="pl-1 text-muted">
                      ⋯
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </>
  );
}
