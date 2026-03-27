import Link from "next/link";

export function SubmitEventToggle() {
  return (
    <div id="submit">
      <Link
        href="/events/new"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "10px 18px",
          borderRadius: 10,
          background: "var(--foreground)",
          color: "var(--background)",
          fontWeight: 600,
          fontSize: 14,
          textDecoration: "none",
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 13 13"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M6.5 1v11M1 6.5h11" />
        </svg>
        New event
      </Link>
    </div>
  );
}
