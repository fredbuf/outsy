import { useState } from "react";
import { Check, Star, Ticket } from "lucide-react";

type PublicStatus = "going" | "interested" | null;

const BRAND = { light: "#5EA8FF", base: "#3B82F6", deep: "#2563E2" };
const GOING = "rgb(48, 209, 88)";
const INTERESTED = BRAND.light;

const ITEMS = [
  { key: "going" as const,      label: "Going",      Icon: Check, tone: GOING },
  { key: "interested" as const, label: "Interested", Icon: Star,  tone: INTERESTED },
];

export function PublicRsvpButton({
  value,
  onChange,
  onTicketsClick,
}: {
  value?: PublicStatus;
  onChange?: (s: PublicStatus) => void;
  onTicketsClick?: () => void;
}) {
  const [internal, setInternal] = useState<PublicStatus>(value ?? null);
  const status = value ?? internal;
  const set = (s: PublicStatus) => {
    setInternal(s);
    onChange?.(s);
  };

  return (
    <div className="flex items-center justify-center gap-2">
      {ITEMS.map(({ key, label, Icon, tone }) => {
        const active = status === key;
        return (
          <button
            key={key}
            onClick={() => set(active ? null : key)}
            aria-label={label}
            aria-pressed={active}
            style={
              active
                ? { backgroundColor: `${tone}1F`, color: tone, borderColor: `${tone}66` }
                : undefined
            }
            className={`flex items-center justify-center gap-2 h-12 rounded-full border transition-all duration-300 ease-out overflow-hidden ${
              active
                ? "px-5 border"
                : "w-12 border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            <Icon size={18} strokeWidth={2.5} />
            {active && <span className="whitespace-nowrap">{label}</span>}
          </button>
        );
      })}
      <button
        onClick={onTicketsClick}
        aria-label="Get tickets"
        title="Get tickets"
        style={{
          background: `linear-gradient(135deg, ${BRAND.light} 0%, ${BRAND.deep} 100%)`,
          boxShadow: `0 6px 18px ${BRAND.base}55, inset 0 1px 0 rgba(255,255,255,0.25)`,
        }}
        className="flex items-center justify-center gap-2 h-12 px-5 shrink-0 rounded-full text-white transition-[filter] duration-300 ease-out hover:brightness-110 active:brightness-95"
      >
        <Ticket size={18} strokeWidth={2.5} />
        <span className="whitespace-nowrap font-bold">Get tickets</span>
      </button>
    </div>
  );
}
