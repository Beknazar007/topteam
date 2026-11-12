import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sheet } from '../../components/ui/Sheet';
import { Spinner } from '../../components/ui/Spinner';
import { useMe } from '../../lib/me';
import { supabase } from '../../lib/supabase';
import { InviteCard } from './InviteCard';
import { ProfileView } from './ProfileView';
import { SettingsForm } from './SettingsSheet';

export function ProfilePage() {
  const me = useMe();
  const qc = useQueryClient();
  const [settings, setSettings] = useState(false);
  if (!me.data) return <Spinner />;
  const { profile, gym, role } = me.data;

  const logout = async () => {
    await supabase.auth.signOut();
    qc.clear();
  };

  return (
    <>
      <ProfileView
        userId={profile.id}
        actions={
          <>
            <button onClick={() => setSettings(true)} className="mt-2.5 h-11 w-full rounded-2xl bg-surface2 text-sm font-extrabold">
              ⚙️ Настройки
            </button>
            {gym && (role === 'owner' || role === 'coach') && (
              <>
                <div className="h-section">Зал · {gym.name}</div>
                <InviteCard gym={gym} />
              </>
            )}
          </>
        }
      />
      <button onClick={logout} className="mt-8 w-full py-3 text-sm font-bold text-muted">
        Выйти из аккаунта
      </button>
      <Sheet open={settings} onClose={() => setSettings(false)}>
        <SettingsForm profile={profile} onDone={() => setSettings(false)} />
      </Sheet>
    </>
  );
}
