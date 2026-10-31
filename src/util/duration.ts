/** Parses values like "15m", "2h", "30d", "3600" (seconds) into milliseconds. */
export const parseDurationMs = (value: string | number | undefined, fallbackMs: number): number => {
  if (typeof value === "number") return value * 1000;
  if (!value) return fallbackMs;
  const match = /^\s*(\d+)\s*(ms|s|m|h|d|w)?\s*$/i.exec(String(value));
  if (!match) return fallbackMs;
  const n = Number(match[1]);
  const unit = (match[2] || "s").toLowerCase();
  const factor: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  return n * factor[unit];
};
