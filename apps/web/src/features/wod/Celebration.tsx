import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { Button } from '../../components/ui/Button';
import { formatScore } from '../../lib/format';
import { levelTitle } from '../../lib/game';
import { formatDay, type LogResponse, type Wod } from '../../lib/wod';
import { ShareButton } from '../share/ShareButton';

const RARITY_COLOR = ['text-text', 'text-rare', 'text-epic', 'text-gold'];

export function Celebration({ r, wod, onClose }: { r: LogResponse; wod: Wod; onClose: () => void }) {
  const [shown, setShown] = useState(0);
  const levelUp = r.level_after > r.level_before;

  useEffect(() => {
    if (r.is_pr || levelUp || r.badges.length) {
      void confetti({ particleCount: 120, spread: 80, origin: { y: 0.35 }, colors: ['#FF6B2C', '#FFC83D', '#3DDC84'] });
    }
    // строки XP «прибегают» по одной
    const id = window.setInterval(() => setShown((n) => n + 1), 180);
    return () => window.clearInterval(id);
  }, [r, levelUp]);

  const diff =
    r.is_pr && r.old_score != null
      ? r.score_type === 'time'
        ? `было ${formatScore('time', r.old_score)} · −${formatScore('time', r.old_score - r.score)}`
        : `было ${formatScore(r.score_type, r.old_score)}`
      : null;

  return (
    <div className="text-center">
      <div className={`text-sm font-black uppercase tracking-[0.12em] ${r.is_pr ? 'text-gold' : 'text-accent'}`}>
        {r.is_pr ? '🏆 Новый рекорд' : r.baseline ? '📍 Первый замер' : '💪 Результат записан'}
      </div>
      <div className="num my-1 text-[44px] font-black leading-tight">{formatScore(r.score_type, r.score, r.capped)}</div>
      <div className="text-sm text-muted">
        {r.scale}
        {r.place ? ` · ${r.place}-е место` : ''}
        {diff ? ` · ${diff}` : ''}
      </div>

      <div className="card my-4 text-left">
        {r.xp_items.map((i, idx) => (
          <div
            key={idx}
            className={`flex justify-between py-1 text-[15px] transition-all duration-300 ${idx < shown ? 'opacity-100' : 'translate-x-4 opacity-0'}`}
          >
            <span>+ {i.label}</span>
            <span className="num font-bold text-xp">{i.amount}</span>
          </div>
        ))}
        {r.xp_items.length === 0 && <div className="text-sm text-muted">Лимит XP на сегодня исчерпан — но результат в истории!</div>}
        <div className="mt-2 flex justify-between border-t border-line pt-2 font-black">
          <span>Итого</span>
          <span className="num text-xp">+{r.xp_total} XP</span>
        </div>
      </div>

      {levelUp && (
        <div className="mb-2 rounded-2xl bg-gradient-to-r from-accent to-[#ff3d6e] px-4 py-3 font-black">
          ▲ Уровень {r.level_after} · {levelTitle(r.level_after)}
        </div>
      )}
      {r.streak_up && (
        <div className="mb-2 rounded-2xl bg-surface2 px-4 py-3 font-bold">🔥 Цель недели выполнена! Серия {r.streak} нед.</div>
      )}
      {r.badges.map((b) => (
        <div key={b.code} className="mb-2 flex items-center gap-3 rounded-2xl bg-surface2 px-4 py-3 text-left">
          <span className="text-3xl">{b.emoji}</span>
          <div className="flex-1">
            <div className="text-[12px] font-bold uppercase text-muted">Новый бейдж</div>
            <div className={`font-black ${RARITY_COLOR[b.rarity] ?? ''}`}>{b.name}</div>
          </div>
          <span className="num font-bold text-xp">+{b.xp}</span>
        </div>
      ))}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <ShareButton
          className="h-[54px] rounded-2xl bg-surface2 font-extrabold"
          data={{
            title: wod.title,
            scoreText: formatScore(r.score_type, r.score, r.capped),
            scale: r.scale,
            isPr: r.is_pr,
            sub: diff ?? (r.place ? `${r.place}-е место` : null),
            date: formatDay(wod.wod_date),
          }}
        />
        <Button onClick={onClose}>Готово</Button>
      </div>
    </div>
  );
}
