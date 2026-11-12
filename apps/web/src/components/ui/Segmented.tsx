export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-2xl bg-surface2 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`h-11 flex-1 rounded-xl text-sm font-extrabold transition-colors ${
            value === o.value ? 'bg-accent text-white' : 'text-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
