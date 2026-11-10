const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  className: 'h-6 w-6',
};

export const FeedIcon = () => (
  <svg {...base}>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </svg>
);
export const TodayIcon = () => (
  <svg {...base}>
    <path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11" />
  </svg>
);
export const PlusIcon = () => (
  <svg {...base} strokeWidth={3} className="h-7 w-7">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const BoardIcon = () => (
  <svg {...base}>
    <path d="M8 21V11M16 21V7M12 21V3M4 21h16" />
  </svg>
);
export const ProfileIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </svg>
);
