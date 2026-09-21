const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export function formatFileSize(bytes: number, locale: string): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const maximumFractionDigits = unit === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  const amount = new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
  return `${amount} ${UNITS[unit]}`;
}
