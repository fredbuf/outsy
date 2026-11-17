import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  canViewPaymentContact,
  resolvePaymentContactUpdate,
  type PaymentContactViewer,
} from "./payment-contact-access.ts";

const stranger: PaymentContactViewer = {
  userId: "user-1",
  isHost: false,
  rsvpResponse: null,
  hasInvite: false,
};

// ── Authorized ────────────────────────────────────────────────────────────────

test("host or cohost can view the payment contact", () => {
  assert.equal(canViewPaymentContact({ ...stranger, isHost: true }), true);
});

test("invited user can view the payment contact", () => {
  assert.equal(canViewPaymentContact({ ...stranger, hasInvite: true }), true);
});

test("user who RSVP'd going or maybe can view the payment contact", () => {
  assert.equal(canViewPaymentContact({ ...stranger, rsvpResponse: "going" }), true);
  assert.equal(canViewPaymentContact({ ...stranger, rsvpResponse: "maybe" }), true);
});

// ── Unauthorized ──────────────────────────────────────────────────────────────

test("unauthenticated visitor can never view the payment contact", () => {
  assert.equal(canViewPaymentContact({ ...stranger, userId: null }), false);
  // Even if other signals were somehow true, no session means no access.
  assert.equal(
    canViewPaymentContact({ userId: null, isHost: true, rsvpResponse: "going", hasInvite: true }),
    false,
  );
});

test("signed-in user with no relationship to the event is refused", () => {
  assert.equal(canViewPaymentContact(stranger), false);
});

test("declining (can't go) or an unknown response does not grant access", () => {
  assert.equal(canViewPaymentContact({ ...stranger, rsvpResponse: "cant_go" }), false);
  assert.equal(canViewPaymentContact({ ...stranger, rsvpResponse: "" }), false);
  assert.equal(canViewPaymentContact({ ...stranger, rsvpResponse: "anything" }), false);
});

// ── PATCH write rule ──────────────────────────────────────────────────────────

test("omitted paymentContact leaves the stored value untouched", () => {
  assert.deepEqual(resolvePaymentContactUpdate({}, "interac"), { write: false });
});

test("provided paymentContact is trimmed, capped and written", () => {
  assert.deepEqual(resolvePaymentContactUpdate({ paymentContact: "  a@b.co " }, "interac"), {
    write: true,
    value: "a@b.co",
  });
  const long = resolvePaymentContactUpdate({ paymentContact: "x".repeat(500) }, "interac");
  assert.equal(long.write && long.value?.length, 200);
});

test("explicit null or empty paymentContact clears the stored value", () => {
  assert.deepEqual(resolvePaymentContactUpdate({ paymentContact: null }, "interac"), { write: true, value: null });
  assert.deepEqual(resolvePaymentContactUpdate({ paymentContact: "  " }, "interac"), { write: true, value: null });
});

test("no payment method always clears the contact", () => {
  assert.deepEqual(resolvePaymentContactUpdate({}, null), { write: true, value: null });
  assert.deepEqual(resolvePaymentContactUpdate({ paymentContact: "a@b.co" }, null), { write: true, value: null });
});

// ── Source guards ─────────────────────────────────────────────────────────────
// The event page and edit page render on the server with no auth context, so
// anything they pass to a client component ships to every visitor.

const read = (rel: string) => readFileSync(join(import.meta.dirname, "..", rel), "utf8");

test("event page never passes the payment contact to the client", () => {
  const src = read("app/events/[id]/page.tsx");
  assert.doesNotMatch(src, /paymentContact=/);
  assert.match(src, /hasPaymentContact=\{Boolean\(/);
});

test("edit page never selects or passes the payment contact", () => {
  assert.doesNotMatch(read("app/events/[id]/edit/page.tsx"), /payment_contact/);
});

test("payment-contact route authenticates and applies the access rule", () => {
  const src = read("app/api/events/[id]/payment-contact/route.ts");
  assert.match(src, /status: 401/);
  assert.match(src, /status: 403/);
  assert.match(src, /canViewPaymentContact\(/);
});

test("private event pages are marked noindex", () => {
  assert.match(read("app/events/[id]/page.tsx"), /visibility === "private" \? \{ robots: \{ index: false, follow: false \} \}/);
  assert.match(read("app/events/[id]/moments/page.tsx"), /robots: \{ index: false, follow: false \}/);
});
