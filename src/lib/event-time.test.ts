import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { hasKnownStartTime } from "./event-time.ts";

const montrealTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

test("8 PM EDT (midnight UTC in summer) is a known start time", () => {
  const iso = "2027-07-10T00:00:00Z";
  assert.equal(montrealTime(iso), "8:00 PM");
  assert.equal(hasKnownStartTime(iso), true);
});

test("7 PM EST (midnight UTC in winter) is a known start time", () => {
  const iso = "2026-12-05T00:00:00Z";
  assert.equal(montrealTime(iso), "7:00 PM");
  assert.equal(hasKnownStartTime(iso), true);
});

test("Postgres-style +00:00 offset at midnight UTC is a known start time", () => {
  assert.equal(hasKnownStartTime("2027-07-10T00:00:00+00:00"), true);
});

test("ordinary start times are known", () => {
  assert.equal(hasKnownStartTime("2027-07-10T23:30:00Z"), true);
  assert.equal(hasKnownStartTime("2026-12-05T02:00:00.000Z"), true);
});

test("missing or unparseable values are not known", () => {
  assert.equal(hasKnownStartTime(null), false);
  assert.equal(hasKnownStartTime(undefined), false);
  assert.equal(hasKnownStartTime(""), false);
  assert.equal(hasKnownStartTime("not a date"), false);
});

// Guard against the heuristic being reintroduced inline: the start time must
// never be inferred from the UTC clock components of start_at.
test("no source file infers an unknown start time from UTC hours", () => {
  const srcDir = join(import.meta.dirname, "..");
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
        if (/getUTCHours\(\)\s*===\s*0/.test(readFileSync(full, "utf8"))) offenders.push(full);
      }
    }
  };
  walk(srcDir);
  assert.deepEqual(offenders, []);
});
