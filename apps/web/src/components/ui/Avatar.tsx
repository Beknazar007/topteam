export function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const style = { width: size, height: size, fontSize: size * 0.38 };
  if (url) return <img src={url} alt="" style={style} className="shrink-0 rounded-full object-cover" />;
  return (
    <div
      style={style}
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3a3f4b] to-surface2 font-extrabold text-text"
    >
      {initials || '🙂'}
    </div>
  );
}
