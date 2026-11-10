import { Link } from 'react-router-dom';
import { EmptyState } from '../../components/ui/EmptyState';

export function ProfilePage() {
  return (
    <>
      <h1 className="mb-4 text-[26px] font-black tracking-tight">Профиль</h1>
      <EmptyState emoji="👤" title="Профиль появится после входа">
        <Link to="/login" className="font-bold text-accent">
          Перейти ко входу
        </Link>
      </EmptyState>
    </>
  );
}
