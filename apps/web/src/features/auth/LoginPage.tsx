import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';

const FEATURES = [
  ['⚡', 'Результат за 10 секунд'],
  ['🏆', 'Рейтинг зала каждый день'],
  ['🔥', 'Серии, уровни и бейджи'],
] as const;

export function LoginPage() {
  const navigate = useNavigate();
  // Вход через Telegram подключается на шаге 3 недели 1 (docs/04-architecture.md §3)
  const login = () => navigate('/');

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
        <Button variant="telegram" onClick={login}>
          ✈️ Войти через Telegram
        </Button>
      </div>
    </div>
  );
}
