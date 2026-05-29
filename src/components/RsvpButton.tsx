import { useState } from "react";
import { Check, Sparkles, X } from "lucide-react";

type Status = "going" | "maybe" | "cant" | null;

const ITEMS = [
  { key: "going" as const,  label: "Going",    Icon: Check,    tone: "rgb(48, 209, 88)"  },
  { key: "maybe" as const,  label: "Maybe",    Icon: Sparkles, tone: "rgb(255, 214, 10)" },
  { key: "cant"  as const,  label: "Can't go", Icon: X,        tone: "rgb(255, 69, 58)"  },
];

export function RsvpButton({
  value,
  onChange,
}: {
  value?: Status;
  onChange?: (s: Status) => void;
}) {
  const [internal, setInternal] = useState<Status>(value ?? null);
  const status = value ?? internal;
  const set = (s: Status) => {
    setInternal(s);
    onChange?.(s);
  };

  return (
    <div className="flex items-center justify-center gap-3">
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
                ? { backgroundColor: `${tone}1F`, color: tone, borderColor: `${tone}55` }
                : undefined
            }
            className={`flex items-center justify-center gap-2 h-12 rounded-full border transition-all duration-300 ease-out overflow-hidden ${
              active
                ? "px-5 border"
                : "w-12 border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            <Icon size={18} strokeWidth={2.5} />
            {active && <span className="whitespace-nowrap font-bold">{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
