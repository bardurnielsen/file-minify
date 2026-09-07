export const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes)) return '–';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
};

/** Whole-number percent saved; negative when the output grew. */
export const percentChange = (before: number, after: number) =>
  before > 0 ? Math.round((1 - after / before) * 100) : 0;

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const cn = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(' ');
