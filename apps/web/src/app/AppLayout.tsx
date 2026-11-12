import { Outlet } from 'react-router-dom';
import { BottomNav } from '../components/ui/BottomNav';
import { SideNav } from '../components/ui/SideNav';
import { LogProvider, useLog } from '../features/wod/LogContext';

function Shell() {
  const { openLog } = useLog();
  return (
    <>
      <SideNav onLog={() => openLog()} />
      <main className="pt-safe-5 pb-nav mx-auto max-w-md px-4 md:ml-60 md:mr-0 md:max-w-none md:px-10 md:pb-12 md:pt-8">
        <div className="md:mx-auto md:max-w-2xl">
          <Outlet />
        </div>
      </main>
      <BottomNav onLog={() => openLog()} />
    </>
  );
}

export function AppLayout() {
  return (
    <LogProvider>
      <Shell />
    </LogProvider>
  );
}
