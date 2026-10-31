/**
 * Turns the loose "date + 5:00 PM" strings the apps send into real instants,
 * interpreted in Moroccan local time (Africa/Casablanca, which follows the
 * Ramadan clock change automatically through the tz database).
 */
export const BUSINESS_TZ = "Africa/Casablanca";

const _timeRe = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/;

/** "5:00 PM" | "17:00" -> minutes since midnight, or null when not parseable. */
export const parseClockMinutes = (raw?: string | null): number | null => {
  if (!raw) return null;
  const m = _timeRe.exec(String(raw).trim());
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const period = (m[3] || "").toUpperCase();
  if (Number.isNaN(hour) || Number.isNaN(minute) || minute > 59) return null;
  if (period === "AM" || period === "PM") {
    if (hour < 1 || hour > 12) return null;
    if (period === "PM" && hour !== 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + minute;
};

/** Calendar parts of an instant as seen in the business time zone. */
const zonedParts = (date: Date, tz: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
};

/** Local wall-clock time in `tz` -> UTC instant. */
export const zonedToUtc = (
  year: number,
  month: number,
  day: number,
  minutesOfDay: number,
  tz: string = BUSINESS_TZ,
): Date => {
  const hour = Math.floor(minutesOfDay / 60);
  const minute = minutesOfDay % 60;
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  // Two passes settle the offset even across a DST/Ramadan boundary.
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), tz);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    guess += Date.UTC(year, month - 1, day, hour, minute, 0) - asUtc;
  }
  return new Date(guess);
};

/** First YYYY-MM-DD found in the value (the calendar day the user picked). */
export const extractDateParts = (
  value?: string | null,
): { year: number; month: number; day: number } | null => {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  if (!m) {
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return null;
    const p = zonedParts(d, BUSINESS_TZ);
    return { year: p.year, month: p.month, day: p.day };
  }
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
};

/**
 * start/end instants for a booking. If the end clock time is not after the start,
 * the work is assumed to finish the next day (night shifts, events).
 */
export const buildSchedule = (
  date?: string | null,
  startTime?: string | null,
  endTime?: string | null,
): { startAt?: Date; endAt?: Date } => {
  const day = extractDateParts(date);
  const start = parseClockMinutes(startTime);
  if (!day || start == null) return {};
  const startAt = zonedToUtc(day.year, day.month, day.day, start);

  const end = parseClockMinutes(endTime);
  if (end == null) return { startAt };

  let durationMin = end - start;
  if (durationMin <= 0) durationMin += 24 * 60;
  return { startAt, endAt: new Date(startAt.getTime() + durationMin * 60_000) };
};
