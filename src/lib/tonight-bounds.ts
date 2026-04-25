// Shared helper: Happening Tonight time window (America/Toronto).
//
// Window: today 5:00 PM → tomorrow 3:00 AM.
// After-midnight rule: if Toronto local time is between 00:00 and 02:59,
// treat it as the previous evening (yesterday 5PM → today 3AM).
//
// Works in both browser and Node.js (server) environments — pure Intl math,
// no platform-specific APIs.

export interface TonightBounds {
  /** ISO string — tonight window open (today or yesterday 17:00 Toronto) */
  windowStart: string;
  /** ISO string — tonight window close (tomorrow or today 03:00 Toronto) */
  windowEnd: string;
  /** ISO string — graceCutoff = now - 1 hr; callers may optionally apply this */
  graceCutoff: string;
}

export function tonightBoundsIso(now: Date = new Date()): TonightBounds {
  const tz = "America/Toronto";

  // Full local datetime string: "YYYY-MM-DD, HH:MM:SS"
  const toLocalStr = (d: Date) =>
    d.toLocaleString("en-CA", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  const localNow = toLocalStr(now); // "YYYY-MM-DD, HH:MM:SS"
  const [datePart, timePart] = localNow.split(", ");
  const currentHour = parseInt(timePart.slice(0, 2), 10);

  // After midnight but before 3 AM → treat as previous evening
  let todayStr = datePart;
  if (currentHour < 3) {
    const [y, m, d] = datePart.split("-").map(Number);
    const prevDay = new Date(Date.UTC(y, m - 1, d - 1));
    todayStr = prevDay.toISOString().slice(0, 10);
  }

  const [y, m, d] = todayStr.split("-").map(Number);

  // Convert a Toronto local date+hour to a UTC millisecond timestamp.
  // Works by computing the UTC↔local offset via a round-trip through toLocaleString.
  const toUtcMs = (dateStr: string, hour: number): number => {
    const approxUtc = new Date(
      `${dateStr}T${String(hour).padStart(2, "0")}:00:00Z`
    );
    const local = approxUtc.toLocaleString("en-CA", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const [lDate, lTime] = local.split(", ");
    const utcGuess = new Date(`${lDate}T${lTime}Z`);
    const offsetMs = approxUtc.getTime() - utcGuess.getTime();
    return (
      new Date(`${dateStr}T${String(hour).padStart(2, "0")}:00:00Z`).getTime() +
      offsetMs
    );
  };

  const windowStartMs = toUtcMs(todayStr, 17); // today(-ish) 17:00
  const tomorrowStr = new Date(Date.UTC(y, m - 1, d + 1))
    .toISOString()
    .slice(0, 10);
  const windowEndMs = toUtcMs(tomorrowStr, 3); // tomorrow(-ish) 03:00
  const graceCutoffMs = now.getTime() - 60 * 60 * 1000; // now − 1 hr

  return {
    windowStart: new Date(windowStartMs).toISOString(),
    windowEnd: new Date(windowEndMs).toISOString(),
    graceCutoff: new Date(graceCutoffMs).toISOString(),
  };
}
