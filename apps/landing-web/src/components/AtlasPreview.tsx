import { useId } from 'react';

export function AtlasPreview() {
  const rawId = useId();
  const id = rawId.replaceAll(':', '');
  const atlasGradient = `atlas-gradient-${id}`;
  const atlasGlow = `atlas-glow-${id}`;

  return (
    <div className="lp-atlas" aria-hidden="true">
      <div className="lp-atlas__halo" />
      <svg className="lp-atlas__graphic" viewBox="0 0 560 420" role="presentation">
        <defs>
          <linearGradient id={atlasGradient} x1="0%" y1="10%" x2="100%" y2="90%">
            <stop offset="0%" className="lp-atlas__stop lp-atlas__stop--aqua" />
            <stop offset="48%" className="lp-atlas__stop lp-atlas__stop--mint" />
            <stop offset="100%" className="lp-atlas__stop lp-atlas__stop--lavender" />
          </linearGradient>
          <filter id={atlasGlow} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g className="lp-atlas__brain">
          <path
            d="M278 71C240 37 187 49 168 91c-42-1-70 29-65 69-36 24-33 76 3 96-15 42 16 83 59 80 19 38 76 40 113 3V71Z"
            fill={`url(#${atlasGradient})`}
          />
          <path
            d="M282 71c38-34 91-22 110 20 42-1 70 29 65 69 36 24 33 76-3 96 15 42-16 83-59 80-19 38-76 40-113 3V71Z"
            fill={`url(#${atlasGradient})`}
          />
          <path className="lp-atlas__seam" d="M280 79v251" />
          <path className="lp-atlas__ridge" d="M164 96c41 22 67 60 70 106" />
          <path className="lp-atlas__ridge" d="M109 163c48 2 82 22 103 58" />
          <path className="lp-atlas__ridge" d="M113 260c45-24 85-24 121-2" />
          <path className="lp-atlas__ridge" d="M168 333c12-41 38-68 78-82" />
          <path className="lp-atlas__ridge" d="M396 96c-41 22-67 60-70 106" />
          <path className="lp-atlas__ridge" d="M451 163c-48 2-82 22-103 58" />
          <path className="lp-atlas__ridge" d="M447 260c-45-24-85-24-121-2" />
          <path className="lp-atlas__ridge" d="M392 333c-12-41-38-68-78-82" />
        </g>

        <g className="lp-atlas__connections">
          <path d="M175 143 243 184 316 140 390 191 338 273 250 293 169 246Z" />
          <path d="M243 184 250 293M316 140l22 133M169 246l169 27M175 143l215 48" />
        </g>

        <g className="lp-atlas__nodes" filter={`url(#${atlasGlow})`}>
          <circle cx="175" cy="143" r="8" />
          <circle cx="243" cy="184" r="10" />
          <circle cx="316" cy="140" r="7" />
          <circle cx="390" cy="191" r="9" />
          <circle cx="338" cy="273" r="10" />
          <circle cx="250" cy="293" r="7" />
          <circle cx="169" cy="246" r="8" />
        </g>
      </svg>
      <div className="lp-atlas__orbit lp-atlas__orbit--one" />
      <div className="lp-atlas__orbit lp-atlas__orbit--two" />
    </div>
  );
}
