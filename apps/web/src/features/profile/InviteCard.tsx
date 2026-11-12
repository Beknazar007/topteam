import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Gym } from '../../lib/me';
import { botLink } from '../../lib/telegram';

/** Приглашение в зал: ссылка /join/КОД + QR для печати на стену. */
export function InviteCard({ gym }: { gym: Gym }) {
  // QR ведёт в бота: «Start» → кнопка Mini App «Вступить в зал» (вход и вступление — автоматически)
  const link = botLink(gym.invite_code);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 480, color: { dark: '#0B0C0F', light: '#FFFFFF' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [link]);

  const share = async () => {
    const text = `Вступай в ${gym.name} в TopTeam: ${link}`;
    if (navigator.share) {
      await navigator.share({ title: 'TopTeam', text, url: link }).catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="font-extrabold">Пригласить в зал</div>
          <div className="text-[13px] text-muted">QR откроет TopTeam в Telegram и сразу добавит в зал</div>
        </div>
        <div className="num rounded-xl bg-surface2 px-3 py-1.5 text-lg font-black tracking-[0.2em]">{gym.invite_code}</div>
      </div>
      {qr && (
        <a href={qr} download={`topteam-${gym.invite_code}.png`} className="mx-auto mb-3 block w-44">
          <img src={qr} alt={`QR-код для вступления в ${gym.name}`} className="w-44 rounded-xl" />
        </a>
      )}
      <button onClick={share} className="h-11 w-full rounded-2xl bg-surface2 text-sm font-extrabold">
        {copied ? '✓ Ссылка скопирована' : 'Поделиться ссылкой'}
      </button>
    </div>
  );
}
