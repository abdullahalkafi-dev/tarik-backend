/**
 * Hourly job billing helpers.
 * Rate is MAD/hour. Total is rounded to whole MAD.
 */

const _timeRe = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/;

function parseTimeToMinutes(raw?: string | null): number | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || s === "null") return null;

  const m = _timeRe.exec(s);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const period = (m[3] || "").toUpperCase();
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (minute > 59) return null;

  if (period === "AM" || period === "PM") {
    if (hour < 1 || hour > 12) return null;
    if (period === "PM" && hour !== 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + minute;
}

/** Hours between start/end strings ("5:00 PM" or "17:00"). Null if unusable. */
export function parseHoursBetween(
  startTime?: string | null,
  endTime?: string | null,
): number | null {
  const a = parseTimeToMinutes(startTime);
  const b = parseTimeToMinutes(endTime);
  if (a == null || b == null) return null;
  let mins = b - a;
  if (mins <= 0) mins += 24 * 60; // overnight
  if (mins <= 0) return null;
  return mins / 60;
}

/**
 * Total charge for an hourly job: rate × hours, rounded to whole MAD.
 * If times are missing, returns Math.round(rate) (one unit of rate).
 */
export function calcHourlyTotalMAD(
  rate: number,
  startTime?: string | null,
  endTime?: string | null,
): number {
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 0;
  const hours = parseHoursBetween(startTime, endTime);
  if (hours == null || hours <= 0) {
    return Math.round(safeRate);
  }
  return Math.round(safeRate * hours);
}
