export function Spinner({ label = 'Загрузка…' }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted" role="status">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-line border-t-accent" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
