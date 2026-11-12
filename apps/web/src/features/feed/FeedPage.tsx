import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar } from '../../components/ui/Avatar';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import { formatScore, type ScoreType } from '../../lib/format';
import { levelTitle } from '../../lib/game';
import { useMe } from '../../lib/me';
import { timeAgo } from '../../lib/rank';
import { useComments, useFeed, useMyFires, type FeedItem } from '../../lib/social';
import { errorText, supabase } from '../../lib/supabase';

export function FeedPage() {
  const me = useMe();
  const feed = useFeed(me.data?.gym?.id);
  const items = feed.data?.pages.flat() ?? [];
  const fires = useMyFires(items.map((i) => i.id), me.data?.profile.id);

  return (
    <>
      <h1 className="mb-4 text-[26px] font-black tracking-tight">Лента</h1>
      {feed.isLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState emoji="🔥" title="Пока тихо">
          Здесь будут результаты, рекорды и бейджи твоего зала.
        </EmptyState>
      ) : (
        <>
          {items.map((i) => (
            <FeedCard key={i.id} item={i} fired={fires.data?.has(i.id) ?? false} myId={me.data!.profile.id} />
          ))}
          {feed.hasNextPage && (
            <button
              onClick={() => feed.fetchNextPage()}
              disabled={feed.isFetchingNextPage}
              className="h-12 w-full rounded-2xl bg-surface2 text-sm font-bold"
            >
              {feed.isFetchingNextPage ? 'Загрузка…' : 'Показать ещё'}
            </button>
          )}
        </>
      )}
    </>
  );
}

function FeedCard({ item, fired: firedInit, myId }: { item: FeedItem; fired: boolean; myId: string }) {
  const [fired, setFired] = useState<boolean | null>(null);
  const [fireCount, setFireCount] = useState<number | null>(null);
  const [showComments, setShowComments] = useState(false);
  const isFired = fired ?? firedInit;
  const count = fireCount ?? item.fire_count;
  const own = item.user_id === myId;
  const name = item.profiles?.display_name ?? 'Атлет';
  const p = item.payload;

  const toggleFire = async () => {
    if (own) return;
    // оптимистично
    setFired(!isFired);
    setFireCount(count + (isFired ? -1 : 1));
    if (!isFired && 'vibrate' in navigator) navigator.vibrate?.(15);
    const { data, error } = await supabase.rpc('toggle_fire', { p_item: item.id });
    if (error) {
      setFired(isFired);
      setFireCount(count);
      return;
    }
    const r = data as { fired: boolean; fire_count: number };
    setFired(r.fired);
    setFireCount(r.fire_count);
  };

  return (
    <div className="card mb-3">
      <div className="mb-2.5 flex items-center gap-2.5">
        <Link to={own ? '/profile' : `/athlete/${item.user_id}`}>
          <Avatar name={name} url={item.profiles?.avatar_url} size={38} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link to={own ? '/profile' : `/athlete/${item.user_id}`} className="block truncate font-bold">
            {name}
          </Link>
          <div className="text-[12px] text-muted">{timeAgo(item.created_at)}</div>
        </div>
      </div>

      {item.kind === 'result' && (
        <div className={`rounded-2xl px-4 py-3 ${p.is_pr ? 'bg-gradient-to-br from-gold/20 to-surface2' : 'bg-surface2'}`}>
          <div className="text-[12px] font-bold uppercase tracking-wider text-muted">
            {String(p.title)} · {String(p.scale)}
          </div>
          <div className="num text-[28px] font-black leading-tight">
            {formatScore(p.score_type as ScoreType, Number(p.score), Boolean(p.capped))}
          </div>
          {Boolean(p.is_pr) && (
            <div className="text-sm font-bold text-gold">
              🏆 Личный рекорд
              {p.old_score != null && ` · было ${formatScore(p.score_type as ScoreType, Number(p.old_score))}`}
            </div>
          )}
        </div>
      )}
      {item.kind === 'badge' && (
        <div className="flex items-center gap-3 rounded-2xl bg-surface2 px-4 py-3">
          <span className="text-4xl">{String(p.emoji)}</span>
          <div>
            <div className="text-[12px] font-bold uppercase text-muted">Новый бейдж</div>
            <div className="text-lg font-black">{String(p.name)}</div>
          </div>
        </div>
      )}
      {item.kind === 'level' && (
        <div className="rounded-2xl bg-gradient-to-r from-accent/30 to-surface2 px-4 py-3 text-lg font-black">
          ▲ Уровень {String(p.level)} · {levelTitle(Number(p.level))}
        </div>
      )}
      {item.kind === 'streak' && (
        <div className="rounded-2xl bg-surface2 px-4 py-3 text-lg font-black">
          🔥 Серия {String(p.weeks)} нед. — цель недели выполнена
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <button
          onClick={toggleFire}
          disabled={own}
          className={`flex h-10 items-center gap-1.5 rounded-xl px-3 font-bold transition-transform active:scale-95 ${
            isFired ? 'bg-accent/20 text-accent' : 'bg-surface2 text-muted'
          } ${own ? 'opacity-70' : ''}`}
          aria-pressed={isFired}
          aria-label="Поддержать 🔥"
        >
          🔥 <span className="num">{count || ''}</span>
        </button>
        <button
          onClick={() => setShowComments((v) => !v)}
          className="flex h-10 items-center gap-1.5 rounded-xl bg-surface2 px-3 font-bold text-muted"
        >
          💬 <span className="num">{item.comment_count || ''}</span>
        </button>
      </div>
      {showComments && <Comments itemId={item.id} myId={myId} />}
    </div>
  );
}

function Comments({ itemId, myId }: { itemId: number; myId: string }) {
  const comments = useComments(itemId, true);
  const me = useMe();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const coach = me.data?.role === 'coach' || me.data?.role === 'owner';

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['comments', itemId] });
    void qc.invalidateQueries({ queryKey: ['feed'] });
  };
  const send = async () => {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('add_comment', { p_item: itemId, p_body: body });
    setBusy(false);
    if (e) return setError(errorText(e));
    setBody('');
    refresh();
  };
  const remove = async (id: number) => {
    if (!confirm('Удалить комментарий?')) return;
    const { error: e } = await supabase.rpc('delete_comment', { p_id: id });
    if (e) return setError(errorText(e));
    refresh();
  };

  return (
    <div className="mt-3 border-t border-line pt-3">
      {comments.data?.map((c) => (
        <div key={c.id} className="mb-2 flex gap-2">
          <Avatar name={c.profiles?.display_name ?? '?'} url={c.profiles?.avatar_url} size={28} />
          <div className="min-w-0 flex-1 rounded-2xl bg-surface2 px-3 py-2">
            <div className="flex justify-between gap-2 text-[12px]">
              <span className="font-bold">{c.profiles?.display_name}</span>
              <span className="text-muted">{timeAgo(c.created_at)}</span>
            </div>
            <div className="whitespace-pre-wrap break-words text-sm">{c.body}</div>
            {(c.user_id === myId || coach) && (
              <button onClick={() => remove(c.id)} className="mt-0.5 text-[11px] text-muted underline">
                удалить
              </button>
            )}
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          className="h-11 min-w-0 flex-1 rounded-2xl border border-line bg-surface2 px-3 text-sm outline-none focus:border-accent"
          placeholder="Поддержи словом…"
          maxLength={500}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && body.trim() && !busy && send()}
        />
        <button
          onClick={send}
          disabled={!body.trim() || busy}
          className="h-11 rounded-2xl bg-accent px-4 text-sm font-extrabold text-white disabled:opacity-50"
        >
          ➤
        </button>
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-accent">{error}</p>}
    </div>
  );
}
