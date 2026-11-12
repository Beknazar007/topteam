import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { callFunction, supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';

const FEATURES = [
  ['⚡', 'Результат за 10 секунд'],
  ['🏆', 'Рейтинг зала каждый день'],
  ['🔥', 'Серии, уровни и бейджи'],
] as const;

const PENDING_KEY = 'topteam.pendingLogin';
type Pending = { nonce: string; secret: string; url: string; until: number };

function loadPending(): Pending | null {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as Pending | null;
    return p && p.until > Date.now() ? p : null;
  } catch {
    return null;
  }
}
function savePending(p: Pending | null) {
  try {
    if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* приватный режим */
  }
}
function randomSecret() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function LoginPage() {
  const { session } = useAuth();
  const [pending, setPending] = useState<Pending | null>(loadPending);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const finishing = useRef(false);

  const poll = useCallback(async (p: Pending) => {
    if (finishing.current) return;
    const { status, data } = await callFunction<{ status?: string; token_hash?: string }>('auth-finish', {
      nonce: p.nonce,
      client_secret: p.secret,
    }).catch(() => ({ status: 0, data: {} as { status?: string; token_hash?: string } }));
    if (data.status === 'ok' && data.token_hash) {
      finishing.current = true;
      const { error: otpErr } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
      savePending(null);
      setPending(null);
      finishing.current = false;
      if (otpErr) setError('Не удалось войти. Попробуй ещё раз.');
      return;
    }
    if (status >= 400 && status < 500) {
      savePending(null);
      setPending(null);
      setError(data.status === 'expired' ? 'Время входа истекло. Нажми кнопку ещё раз.' : 'Вход прерван. Попробуй ещё раз.');
    }
  }, []);

  // Опрос раз в 2 сек, пока ждём подтверждения в Telegram (и сразу при возврате в приложение)
  useEffect(() => {
    if (!pending) return;
    const tick = () => {
      if (pending.until < Date.now()) {
        savePending(null);
        setPending(null);
        setError('Время входа истекло. Нажми кнопку ещё раз.');
        return;
      }
      void poll(pending);
    };
    const id = window.setInterval(tick, 2000);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    tick();
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pending, poll]);

  if (session) return <Navigate to="/" replace />;

  const start = async () => {
    setError(null);
    setStarting(true);
    try {
      const secret = randomSecret();
      const { status, data } = await callFunction<{ nonce: string; url: string; expires_in: number }>('auth-start', {
        client_secret: secret,
      });
      if (status !== 200 || !data.url) throw new Error('auth-start ' + status);
      const p = { nonce: data.nonce, secret, url: data.url, until: Date.now() + data.expires_in * 1000 };
      savePending(p);
      setPending(p);
      window.location.href = data.url; // открывает приложение Telegram
    } catch {
      setError('Сервер входа недоступен. Проверь интернет и попробуй ещё раз.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col justify-end bg-[radial-gradient(circle_at_70%_25%,rgba(255,107,44,.35),transparent_55%),radial-gradient(circle_at_20%_60%,rgba(194,24,91,.25),transparent_50%)] px-5 pb-10 pt-8">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-[52px] font-black leading-[0.95] tracking-tight">
          TOP<span className="text-accent">TEAM</span>
        </h1>
        <p className="mt-3 text-[17px] leading-snug text-muted">
          Цифровая доска твоего зала.
          <br />
          Записывай. Бей рекорды. Качай уровень.
        </p>
        <ul className="my-7 grid gap-2.5">
          {FEATURES.map(([icon, text]) => (
            <li key={text} className="flex items-center gap-3 font-semibold">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface text-xl">{icon}</span>
              {text}
            </li>
          ))}
        </ul>

        {pending ? (
          <div className="card mb-3 text-center">
            <div className="mb-1 animate-pulse text-2xl">✈️</div>
            <div className="font-extrabold">Ждём подтверждения в Telegram…</div>
            <div className="mt-1 text-sm text-muted">
              Нажми «Start» в боте и вернись сюда — вход произойдёт автоматически.
            </div>
            <a href={pending.url} className="mt-3 inline-block font-bold text-tg">
              Открыть бота ещё раз
            </a>
            <button
              className="mt-2 block w-full text-sm text-muted"
              onClick={() => {
                savePending(null);
                setPending(null);
              }}
            >
              Отмена
            </button>
          </div>
        ) : (
          <Button variant="telegram" onClick={start} disabled={starting}>
            {starting ? 'Открываем Telegram…' : '✈️ Войти через Telegram'}
          </Button>
        )}
        {error && <p className="mt-3 text-center text-sm font-semibold text-accent">{error}</p>}
      </div>
    </div>
  );
}
