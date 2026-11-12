import { NavLink } from 'react-router-dom';
import { BoardIcon, FeedIcon, PlusIcon, ProfileIcon, TodayIcon } from './icons';

const item = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-2xl px-4 py-3 font-bold transition-colors ${
    isActive ? 'bg-surface2 text-text' : 'text-muted hover:bg-surface hover:text-text'
  }`;

/** Боковое меню для планшетов и компьютеров (≥ md). */
export function SideNav({ onLog }: { onLog: () => void }) {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-bg px-4 py-6 md:flex">
      <div className="mb-8 px-4 text-[26px] font-black tracking-tight">
        TOP<span className="text-accent">TEAM</span>
      </div>
      <nav className="grid gap-1">
        <NavLink to="/" end className={item}>
          <TodayIcon /> Сегодня
        </NavLink>
        <NavLink to="/feed" className={item}>
          <FeedIcon /> Лента
        </NavLink>
        <NavLink to="/leaderboard" className={item}>
          <BoardIcon /> Рейтинг
        </NavLink>
        <NavLink to="/profile" className={item}>
          <ProfileIcon /> Профиль
        </NavLink>
      </nav>
      <button
        onClick={onLog}
        className="mt-6 flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-extrabold text-white shadow-[0_8px_24px_rgba(255,107,44,.35)] active:scale-[0.98]"
      >
        <PlusIcon /> Записать
      </button>
    </aside>
  );
}
