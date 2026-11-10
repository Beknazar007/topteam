import { levelProgress } from '../../lib/game';

export function LevelBar({ xp, streak }: { xp: number; streak: number }) {
  const p = levelProgress(xp);
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="flex h-11 w-11 flex-col items-center justify-center rounded-[14px] bg-gradient-to-br from-accent to-[#ff3d6e] font-black leading-none">
        <span className="text-[9px] font-bold opacity-85">LVL</span>
        {p.level}
      </div>
      <div className="flex-1">
        <div className="mb-1.5 flex justify-between text-[13px] font-bold">
          <span>{p.title}</span>
          <span className="num text-muted">
            {xp} / {p.nextAt} XP
          </span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-surface2"
          role="progressbar"
          aria-valuenow={p.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#2bbf6e] to-xp transition-[width] duration-1000"
            style={{ width: `${p.percent}%` }}
          />
        </div>
      </div>
      <div className="flex items-center gap-1 font-extrabold text-accent">
        🔥<span className="num">{streak}</span>
      </div>
    </div>
  );
}
