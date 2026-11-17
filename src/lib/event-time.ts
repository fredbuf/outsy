// Single source of truth for "does this event have a real start time?".
//
// History: seven call sites used to treat a start_at of exactly 00:00 UTC as a
// date-only placeholder and hid the time. But 00:00 UTC is 8:00 PM EDT / 7:00 PM
// EST in Montréal — the most common show times — so roughly a quarter of the
// catalogue lost its start time on the event page, share card, OG image and
// chat event cards.
//
// No ingester writes a midnight-UTC placeholder (events without a real time
// are skipped at ingestion), and events.start_at has no companion "time
// unknown" flag. Until such a flag exists, every valid start_at carries a real
// time. If date-only events are ever needed, add an explicit column and read it
// here — do not infer it from the timestamp.
export function hasKnownStartTime(startAtIso: string | null | undefined): boolean {
  if (!startAtIso) return false;
  return !Number.isNaN(new Date(startAtIso).getTime());
}
