import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Sheet } from '../../components/ui/Sheet';
import { useAuth } from '../../lib/auth';
import { useMe } from '../../lib/me';
import { bishkekToday, useRecentWods, useWodResults, type LogResponse, type Wod } from '../../lib/wod';
import { Celebration } from './Celebration';
import { ResultForm } from './ResultSheet';

type Ctx = { openLog: (wod?: Wod) => void };
const LogCtx = createContext<Ctx>({ openLog: () => {} });
// eslint-disable-next-line react-refresh/only-export-components
export const useLog = () => useContext(LogCtx);

/** Шторка «Записать результат» + празднование, доступные из любого экрана (кнопка ＋). */
export function LogProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const me = useMe();
  const wods = useRecentWods(me.data?.gym?.id);
  const results = useWodResults((wods.data ?? []).map((w) => w.id), session?.user.id);
  const [state, setState] = useState<{ open: boolean; wod?: Wod; done?: LogResponse }>({ open: false });

  const openLog = useCallback(
    (wod?: Wod) => {
      if (!wod) {
        const today = bishkekToday();
        wod = (wods.data ?? []).find((w) => w.wod_date === today && !results.data?.mine.has(w.id));
      }
      setState({ open: true, wod });
    },
    [wods.data, results.data],
  );
  const close = useCallback(() => setState({ open: false }), []);
  const value = useMemo(() => ({ openLog }), [openLog]);
  const coach = me.data?.role === 'coach' || me.data?.role === 'owner';

  return (
    <LogCtx.Provider value={value}>
      {children}
      <Sheet open={state.open} onClose={close}>
        {state.done && state.wod ? (
          <Celebration r={state.done} wod={state.wod} onClose={close} />
        ) : state.wod ? (
          <ResultForm wod={state.wod} onDone={(done) => setState((s) => ({ ...s, done }))} />
        ) : (
          <div className="py-6 text-center">
            <div className="mb-2 text-4xl">🏋️</div>
            <div className="font-extrabold">Нет WOD для записи</div>
            <p className="mx-auto mt-1 max-w-[260px] text-sm text-muted">
              {coach ? 'Опубликуй тренировку дня — и зал сможет записывать результаты.' : 'WOD дня ещё не опубликован, или ты уже записал все результаты сегодня.'}
            </p>
            {coach && (
              <Link to="/wod/new" onClick={close} className="mt-4 inline-block font-bold text-accent">
                ＋ Новый WOD
              </Link>
            )}
          </div>
        )}
      </Sheet>
    </LogCtx.Provider>
  );
}
