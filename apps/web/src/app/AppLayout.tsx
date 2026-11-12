import { Outlet } from 'react-router-dom';
import { BottomNav } from '../components/ui/BottomNav';
import { LogProvider, useLog } from '../features/wod/LogContext';

function Shell() {
  const { openLog } = useLog();
  return (
    <div className="mx-auto min-h-full max-w-md px-4 pb-28 pt-5">
      <Outlet />
      <BottomNav onLog={() => openLog()} />
    </div>
  );
}

export function AppLayout() {
  return (
    <LogProvider>
      <Shell />
    </LogProvider>
  );
}
