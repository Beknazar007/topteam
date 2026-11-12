// Telegram Mini App: определение среды, оформление, параметр запуска (код зала).
import { pendingInvite } from './auth';

interface WebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number }; start_param?: string };
  platform: string;
  ready(): void;
  expand(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  disableVerticalSwipes?(): void;
}
declare global {
  interface Window {
    Telegram?: { WebApp?: WebApp };
  }
}

/** WebApp, только если приложение реально открыто внутри Telegram (есть подписанные initData). */
export const webApp: WebApp | null =
  typeof window !== 'undefined' && window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : null;

export const BOT_USERNAME = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined) ?? 'TopTeam07Bot';

/**
 * Ссылка, открывающая главное Mini App бота сразу (без «Start»).
 * С кодом зала — startapp=<КОД>: initMiniApp() сохранит код, онбординг вступит в зал автоматически.
 */
export function botLink(inviteCode?: string) {
  return `https://t.me/${BOT_USERNAME}?startapp=${inviteCode ?? 'open'}`;
}

export function initMiniApp() {
  if (!webApp) return;
  webApp.ready();
  webApp.expand();
  for (const f of [
    () => webApp.setHeaderColor?.('#0B0C0F'),
    () => webApp.setBackgroundColor?.('#0B0C0F'),
    () => webApp.disableVerticalSwipes?.(),
  ]) {
    try {
      f();
    } catch {
      /* старая версия Telegram */
    }
  }
  // t.me/<bot>/app?startapp=<КОД> или join_<КОД>
  const sp = webApp.initDataUnsafe.start_param?.match(/^(?:join_)?([A-Za-z0-9]{6})$/);
  if (sp) pendingInvite.set(sp[1]);
}
