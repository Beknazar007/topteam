import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../../components/ui/Avatar';
import { Segmented } from '../../components/ui/Segmented';
import { Spinner } from '../../components/ui/Spinner';
import { useMe } from '../../lib/me';
import { NOM_HINT, nomFamily, useStandings, type NomPeriod, type NomType, type Standing } from '../../lib/nominations';
import { periodEnd, periodLabel, periodStart, shiftPeriod } from '../../lib/stats';
import { bishkekToday, formatDay } from '../../lib/wod';

const MEDAL = ['', '🥇', '🥈', '🥉'];

/** Номинации дня / недели / месяца: текущая гонка и победители прошлых периодов */
export function Nominations() {
  const me = useMe();
  const today = bishkekToday();
  const [period, setPeriod] = useState<NomPeriod>('day');
  const [start, setStart] = useState(today);
  const q = useStandings(me.data?.gym?.id, period, start);
  const myId = me.data?.profile.id;

  const pick = (p: NomPeriod) => {
    setPeriod(p);
    setStart(p === 'day' ? today : periodStart(p, today));
  };
  const step = (n: number) => setStart(period === 'day' ? shiftDay(start, n) : shiftPeriod(period, start, n));
  const end = period === 'day' ? start : periodEnd(period, start);
  const finished = end < today;
  const label = period === 'day' ? (start === today ? 'Сегодня' : formatDay(start)) : periodLabel(period, start);
  const canNext = (period === 'day' ? shiftDay(start, 1) : shiftPeriod(period, start, 1)) <= today;

  return (
    <>
      <Segmented
        value={period}
        onChange={pick}
        options={[
          { value: 'day', label: 'День' },
          { value: 'week', label: 'Неделя' },
          { value: 'month', label: 'Месяц' },
        ]}
      />
      <div className="mt-3 flex items-center justify-between">
        <button onClick={() => step(-1)} className="h-10 w-10 rounded-xl bg-surface2 font-black" aria-label="Раньше">
          ←
        </button>
        <div className="text-center">
          <div className="font-extrabold">{label}</div>
          <div className="text-[12px] text-muted">{finished ? 'Итоги подведены' : 'Идёт борьба · итоги в 00:10'}</div>
        </div>
        <button onClick={() => step(1)} disabled={!canNext} className="h-10 w-10 rounded-xl bg-surface2 font-black disabled:opacity-25" aria-label="Позже">
          →
        </button>
      </div>

      <div className="mt-4">
        {q.isLoading ? (
          <Spinner />
        ) : q.isError ? (
          <div className="card text-sm text-muted">Номинации появятся после обновления сервера.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {q.data!.types.flatMap((t) =>
              t.by_sex
                ? (['m', 'f'] as const).map((s) => (
                    <NomCard key={t.code + s} t={t} sex={s} rows={q.data!.rows.filter((r) => r.code === t.code && r.sex === s)} finished={finished} myId={myId} />
                  ))
                : [<NomCard key={t.code} t={t} rows={q.data!.rows.filter((r) => r.code === t.code)} finished={finished} myId={myId} />],
            )}
          </div>
        )}
      </div>
      <p className="mt-4 text-center text-[12px] leading-relaxed text-muted">
        Очки атлета: 10 за тренировку · 5 за результат в рейтинге · 5 за каждого, кого обогнал на своей доске · 5 за рекорд.
        Награда — если в номинации минимум 2 участника.
      </p>
    </>
  );
}

const shiftDay = (d: string, n: number) => {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

function NomCard({ t, sex, rows, finished, myId }: { t: NomType; sex?: 'm' | 'f'; rows: Standing[]; finished: boolean; myId?: string }) {
  const name = sex === 'f' ? t.name_f : t.name_m;
  const awarded = finished && rows.length > 0 && rows[0].participants >= 2;
  return (
    <div className={`card min-w-0 ${awarded ? 'border border-gold/40 bg-gradient-to-br from-gold/10 to-surface' : ''}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="text-lg font-black">
            {t.emoji} {name}
          </div>
          <div className="text-[12px] text-muted">{NOM_HINT[nomFamily(t.code)]}</div>
        </div>
        <div className="shrink-0 rounded-lg bg-surface2 px-2 py-1 text-[12px] font-black text-xp">+{t.xp} XP</div>
      </div>
      {rows.length === 0 ? (
        <div className="py-2 text-sm text-muted">{finished ? 'Никто не участвовал' : 'Пока никого — будь первым!'}</div>
      ) : (
        rows.map((r) => (
          <Link
            key={r.user_id}
            to={r.user_id === myId ? '/profile' : `/athlete/${r.user_id}`}
            className={`mt-1.5 flex items-center gap-2.5 rounded-xl px-2 py-1.5 ${r.user_id === myId ? 'bg-surface2' : ''}`}
          >
            <span className="w-6 text-center text-lg">{MEDAL[r.place] || r.place}</span>
            <Avatar name={r.profile?.display_name ?? '?'} url={r.profile?.avatar_url} size={32} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{r.profile?.display_name ?? 'Атлет'}</div>
              <div className="truncate text-[12px] text-muted">{r.detail}</div>
            </div>
            {awarded && r.place === 1 && <span className="shrink-0 text-[12px] font-black text-gold">🏆</span>}
          </Link>
        ))
      )}
      {rows.length > 0 && rows[0].participants < 2 && (
        <div className="mt-2 text-[12px] text-muted">Нужно минимум 2 участника, чтобы разыграть награду</div>
      )}
    </div>
  );
}
