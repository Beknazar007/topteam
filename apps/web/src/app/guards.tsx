import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useMe } from '../lib/me';
import { supabase } from '../lib/supabase';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';

/** Только для вошедших. */
export function RequireAuth() {
  const { session, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <Outlet />;
}

/** Вошёл + есть зал + заполнен профиль, иначе — на онбординг. */
export function RequireOnboarded() {
  const me = useMe();
  if (me.isLoading) return <Spinner />;
  if (me.isError || !me.data) {
    return (
      <div className="mx-auto max-w-md px-4 pt-20 text-center">
        <p className="mb-4 font-bold">Не удалось загрузить профиль.</p>
        <Button variant="ghost" onClick={() => me.refetch()}>
          Повторить
        </Button>
        <button className="mt-4 text-sm text-muted" onClick={() => supabase.auth.signOut()}>
          Выйти
        </button>
      </div>
    );
  }
  if (!me.data.gym || !me.data.profile.sex) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
