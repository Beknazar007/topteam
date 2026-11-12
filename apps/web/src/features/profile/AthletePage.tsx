import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useMe } from '../../lib/me';
import { useAthlete } from '../../lib/social';
import { errorText, supabase } from '../../lib/supabase';
import { ProfileView } from './ProfileView';

export function AthletePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const me = useMe();
  const qc = useQueryClient();
  const a = useAthlete(id, me.data?.gym?.id);
  if (id === me.data?.profile.id) return <Navigate to="/profile" replace />;
  const isOwner = me.data?.role === 'owner';
  const role = a.data?.role;

  const setRole = async (r: 'coach' | 'athlete') => {
    const { error } = await supabase.rpc('set_member_role', { p_gym: me.data!.gym!.id, p_user: id, p_role: r });
    if (error) return alert(errorText(error));
    void qc.invalidateQueries({ queryKey: ['athlete', id] });
  };

  return (
    <>
      <button onClick={() => nav(-1)} className="mb-3 text-sm font-bold text-muted">
        ← Назад
      </button>
      <ProfileView
        userId={id!}
        actions={
          isOwner && role && role !== 'owner' ? (
            <button
              onClick={() => setRole(role === 'coach' ? 'athlete' : 'coach')}
              className="mt-2.5 h-11 w-full rounded-2xl bg-surface2 text-sm font-extrabold"
            >
              {role === 'coach' ? 'Снять роль тренера' : '🎓 Сделать тренером'}
            </button>
          ) : null
        }
      />
    </>
  );
}
