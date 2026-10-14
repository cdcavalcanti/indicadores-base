/**
 * Ícones SVG de traço fino (sem dependência externa).
 * Todos herdam a cor via currentColor.
 */

type P = { className?: string };

const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function IconGrid({ className = 'w-[17px] h-[17px]' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...S}>
      <rect x="3" y="3" width="7.5" height="9.5" rx="1.8" />
      <rect x="13.5" y="3" width="7.5" height="5.5" rx="1.8" />
      <rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1.8" />
      <rect x="3" y="15.5" width="7.5" height="5.5" rx="1.8" />
    </svg>
  );
}

export function IconTrend({ className = 'w-[17px] h-[17px]' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...S}>
      <path d="M3 17l5.2-5.2 3.8 3 8-8.8" />
      <path d="M15.5 6h4.5v4.5" />
    </svg>
  );
}

export function IconRentabilidade({ className = 'w-[17px] h-[17px]' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...S}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 14.5c0 1.1 1.1 1.8 3 1.8s3-.7 3-2c0-2.6-5.7-1.4-5.7-4 0-1.2 1.1-1.8 2.7-1.8s2.8.7 2.8 1.7" />
      <path d="M12 6.2v1.5M12 16.3v1.5" />
    </svg>
  );
}

export function IconCobranca({ className = 'w-[17px] h-[17px]' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...S}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 9.7v4.6M18 9.7v4.6" />
    </svg>
  );
}

/* --- Logos de marca (cores oficiais, não seguem currentColor) --- */

export function LogoInstagram({ className = 'w-[17px] h-[17px]' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <defs>
        <linearGradient id="ig-grad" x1="4" y1="21" x2="20" y2="3" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFD600" />
          <stop offset="0.3" stopColor="#FF7A00" />
          <stop offset="0.55" stopColor="#FF0069" />
          <stop offset="0.8" stopColor="#D300C5" />
          <stop offset="1" stopColor="#7638FA" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="url(#ig-grad)" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.1" stroke="url(#ig-grad)" strokeWidth="2" />
      <circle cx="17.1" cy="6.9" r="1.15" fill="url(#ig-grad)" />
    </svg>
  );
}

export function LogoMeta({ className = 'w-[17px] h-[17px]' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <defs>
        <linearGradient id="meta-grad" x1="2" y1="12" x2="22" y2="12" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0064E0" />
          <stop offset="1" stopColor="#0082FB" />
        </linearGradient>
      </defs>
      <path
        d="M12 12c-1.7-3-3.3-5.4-5.8-5.4C3.9 6.6 2 9 2 12s1.9 5.4 4.2 5.4c2.5 0 4.1-2.4 5.8-5.4 1.7-3 3.3-5.4 5.8-5.4C20.1 6.6 22 9 22 12s-1.9 5.4-4.2 5.4c-2.5 0-4.1-2.4-5.8-5.4z"
        stroke="url(#meta-grad)"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LogoWhatsApp({ className = 'w-[17px] h-[17px]' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      {/* balão com cauda */}
      <path
        d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.7-1.2A9 9 0 1 0 12 3z"
        stroke="#25D366"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      {/* fone */}
      <path
        d="M9 8.4c.3-.7 1-.7 1.3-.1l.7 1.3c.2.4 0 .8-.3 1.1l-.4.4c.5 1.1 1.5 2.1 2.6 2.6l.4-.4c.3-.3.7-.5 1.1-.3l1.3.7c.6.3.6 1 0 1.4-.7.5-1.6.7-2.4.4-2-.6-3.9-2.5-4.5-4.5-.3-.8-.1-1.8.2-2.6z"
        fill="#25D366"
      />
    </svg>
  );
}

export function LogoGoogleAds({ className = 'w-[17px] h-[17px]' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path d="M12 4.8 5.6 16.6" stroke="#FBBC04" strokeWidth="4.4" strokeLinecap="round" />
      <path d="M12 4.8l6.4 11.8" stroke="#4285F4" strokeWidth="4.4" strokeLinecap="round" />
      <circle cx="5.6" cy="16.6" r="2.6" fill="#34A853" />
    </svg>
  );
}

export function IconPulse({ className = 'w-[17px] h-[17px]' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...S}>
      <path d="M3 12h4l2.5-7 5 14 2.5-7h4" />
    </svg>
  );
}

export function IconStore({ className = 'w-[14px] h-[14px]' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...S}>
      <path d="M4 9.5 5.5 4h13L20 9.5" />
      <path d="M4 9.5a2.6 2.6 0 0 0 5.3 0 2.6 2.6 0 0 0 5.4 0 2.6 2.6 0 0 0 5.3 0" />
      <path d="M5 12v8h14v-8" />
      <path d="M9.5 20v-5h5v5" />
    </svg>
  );
}

export function IconMeta({ className = 'w-[14px] h-[14px]' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...S}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.6" />
    </svg>
  );
}

export function IconCalendar({ className = 'w-[14px] h-[14px]' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...S}>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}
