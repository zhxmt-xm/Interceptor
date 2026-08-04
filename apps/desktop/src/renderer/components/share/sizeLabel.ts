/** 人类可读的字节数；Capture 列表、Inspector 与正文查看器共用同一套档位。 */
export function sizeLabel(bytes: number, locale = 'en'): string {
  const format = (value: number, maximumFractionDigits: number): string =>
    new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
  if (bytes <= 0) {
    return '0 B';
  }
  if (bytes < 1024) {
    return `${format(bytes, 0)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${format(bytes / 1024, bytes < 10 * 1024 ? 1 : 0)} KB`;
  }
  return `${format(bytes / (1024 * 1024), bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
