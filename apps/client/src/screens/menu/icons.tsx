/** Line icons for the main menu, drawn in the text colour. */
export type IconName = "swords" | "globe" | "hourglass" | "scroll" | "eye" | "map" | "cards";

const PATHS: Record<IconName, React.ReactNode> = {
  swords: (
    <g strokeLinecap="round">
      <path d="M4 4l11 11M20 4L9 15" />
      <path d="M12 18l4-4M12 18l-4-4" />
      <path d="M15 17l3 3M9 17l-3 3" />
    </g>
  ),
  globe: (
    <g>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </g>
  ),
  hourglass: (
    <g strokeLinejoin="round">
      <path d="M6 3h12M6 21h12" />
      <path d="M7 3h10l-5 9 5 9H7l5-9z" />
    </g>
  ),
  scroll: (
    <g strokeLinejoin="round">
      <path d="M7 4h11a2 2 0 0 1 0 4H8" />
      <path d="M7 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8" />
      <path d="M9 12h6M9 16h4" />
    </g>
  ),
  eye: (
    <g>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </g>
  ),
  map: (
    <g strokeLinejoin="round">
      <path d="M12 2l8.5 5v10L12 22l-8.5-5V7z" />
      <path d="M12 2v20M3.5 7l17 10" />
    </g>
  ),
  cards: (
    <g strokeLinejoin="round">
      <rect x="3" y="6" width="11" height="15" rx="1.5" />
      <path d="M8 3h11.5A1.5 1.5 0 0 1 21 4.5V18" />
    </g>
  ),
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

/** The compass rose on the Atlas style's left page. */
export function CompassRose({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth={1.4}>
        <circle cx="50" cy="50" r="44" />
        <circle cx="50" cy="50" r="36" strokeDasharray="2 3" />
        <path d="M50 4L56 44 96 50 56 56 50 96 44 56 4 50 44 44z" fill="currentColor" fillOpacity={0.18} />
        <path d="M50 4v92M4 50h92" />
        <path d="M50 22l4 24-4 4-4-4z" fill="currentColor" />
      </g>
      <text x="50" y="16" textAnchor="middle" fontSize="9" fill="currentColor">
        N
      </text>
    </svg>
  );
}
