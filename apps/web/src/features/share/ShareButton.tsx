import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toPng } from 'html-to-image';
import { levelTitle } from '../../lib/game';
import { useMe } from '../../lib/me';
import { webApp } from '../../lib/telegram';

export interface ShareData {
  title: string;
  scoreText: string;
  scale: string;
  isPr: boolean;
  sub?: string | null; // «было 4:12 · −0:14» / «2-е место»
  date: string; // "ПТ, 13 ноября"
}

/** Кнопка «Поделиться»: рисует карточку 9:16 (1080×1920) и отдаёт в системное меню или скачивает. */
export function ShareButton({ data, className = '' }: { data: ShareData; className?: string }) {
  const me = useMe();
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [render, setRender] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const share = async () => {
    setBusy(true);
    setRender(true);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const node = ref.current!;
      const dataUrl = await toPng(node, { pixelRatio: 3, cacheBust: true });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `topteam-${Date.now()}.png`, { type: 'image/png' });
      const text = `${data.title}: ${data.scoreText}${data.isPr ? ' 🏆 PR' : ''} — TopTeam`;
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text }).catch(() => {});
      } else if (webApp) {
        setPreview(dataUrl); // во встроенном браузере Telegram — сохранить долгим нажатием
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = file.name;
        a.click();
      }
    } finally {
      setBusy(false);
      setRender(false);
    }
  };

  const level = me.data?.stats?.level ?? 1;
  return (
    <>
      <button onClick={share} disabled={busy} className={className}>
        {busy ? 'Готовим…' : '📤 Поделиться'}
      </button>
      {preview &&
        createPortal(
          <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/90 p-6" onClick={() => setPreview(null)}>
            <img src={preview} alt="Карточка результата" className="max-h-[75vh] rounded-2xl" />
            <div className="text-center text-sm font-semibold text-white/80">Нажми и удерживай картинку, чтобы сохранить или переслать</div>
            <button className="h-11 rounded-2xl bg-surface2 px-6 font-bold">Закрыть</button>
          </div>,
          document.body,
        )}
      {render &&
        createPortal(
          <div style={{ position: 'fixed', left: -10000, top: 0 }} aria-hidden>
            <div
              ref={ref}
              style={{ width: 360, height: 640, fontFamily: 'Inter, system-ui, sans-serif' }}
              className="relative flex flex-col overflow-hidden bg-[#0B0C0F] p-7 text-white"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(255,107,44,.55),transparent_55%),radial-gradient(circle_at_15%_80%,rgba(194,24,91,.35),transparent_50%)]" />
              <div className="relative flex h-full flex-col">
                <div className="text-[26px] font-black tracking-tight">
                  TOP<span style={{ color: '#FF6B2C' }}>TEAM</span>
                </div>
                <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/60">{data.date}</div>
                <div className="mt-auto">
                  {data.isPr && (
                    <div
                      className="mb-3 inline-block rounded-full px-3 py-1 text-[13px] font-black uppercase tracking-wider"
                      style={{ background: '#FFC83D', color: '#0B0C0F' }}
                    >
                      🏆 Новый рекорд
                    </div>
                  )}
                  <div className="text-[30px] font-black uppercase leading-none">{data.title}</div>
                  <div className="mt-2 text-[76px] font-black leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {data.scoreText}
                  </div>
                  <div className="mt-2 text-[16px] font-bold text-white/80">
                    {data.scale}
                    {data.sub ? ` · ${data.sub}` : ''}
                  </div>
                </div>
                <div className="mt-auto flex items-end justify-between border-t border-white/15 pt-4">
                  <div>
                    <div className="text-[18px] font-black">{me.data?.profile.display_name}</div>
                    <div className="text-[13px] text-white/60">{me.data?.gym?.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] font-bold text-white/60">LVL {level}</div>
                    <div className="text-[13px] font-black" style={{ color: '#3DDC84' }}>
                      {levelTitle(level)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
