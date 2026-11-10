import { Outlet } from 'react-router-dom';
import { BottomNav } from '../components/ui/BottomNav';

export function AppLayout() {
  // Шторка ввода результата появится в неделе 2
  const openLog = () => {};
  return (
    <div className="mx-auto min-h-full max-w-md px-4 pb-28 pt-5">
      <Outlet />
      <BottomNav onLog={openLog} />
    </div>
  );
}
