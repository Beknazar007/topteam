import { NavLink } from 'react-router-dom';
import { BoardIcon, FeedIcon, PlusIcon, ProfileIcon, TodayIcon } from './icons';

const tab = ({ isActive }: { isActive: boolean }) =>
  `flex w-16 flex-col items-center gap-0.5 text-[10px] font-semibold ${isActive ? 'text-text' : 'text-muted'}`;

export function BottomNav({ onLog }: { onLog: () => void }) {
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex h-[66px] max-w-md items-center justify-around">
        <NavLink to="/feed" className={tab}>
          <FeedIcon />
          Лента
        </NavLink>
        <NavLink to="/" end className={tab}>
          <TodayIcon />
          Сегодня
        </NavLink>
        <button
          onClick={onLog}
          aria-label="Записать результат"
          className="-mt-6 flex h-14 w-14 items-center justify-center rounded-[18px] bg-accent text-white shadow-[0_8px_24px_rgba(255,107,44,.45)] active:scale-95"
        >
          <PlusIcon />
        </button>
        <NavLink to="/leaderboard" className={tab}>
          <BoardIcon />
          Рейтинг
        </NavLink>
        <NavLink to="/profile" className={tab}>
          <ProfileIcon />
          Профиль
        </NavLink>
      </div>
    </nav>
  );
}
