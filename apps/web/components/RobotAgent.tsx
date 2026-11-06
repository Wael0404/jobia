/**
 * Jobia's agent mascot. Pure inline SVG animated with CSS (transform/opacity
 * only, GPU-friendly). It is decorative: hidden from assistive technology,
 * the surrounding UI states the real status in text.
 *
 * States must reflect what the backend is really doing:
 *  - idle      → waiting for the user
 *  - searching → a search is running (reads offers through its magnifier)
 *  - sending   → applications are being sent (CVs fly out)
 *  - done      → the last search finished
 */
export type RobotState = "idle" | "searching" | "sending" | "done";

export function RobotAgent({ state, size = 180 }: { state: RobotState; size?: number }) {
  return (
    <div className="robot" data-state={state} style={{ width: size, height: size * 0.8 }} aria-hidden="true">
      <svg viewBox="0 0 200 160" width="100%" height="100%" focusable="false">
        <ellipse className="r-shadow" cx="100" cy="150" rx="38" ry="5" />

        {/* Job offers sliding into the magnifier while searching. */}
        <g className="r-offers">
          {[0, 1, 2].map((i) => (
            <g key={i} className="r-offer" style={{ animationDelay: `${i * 0.6}s` }}>
              <rect x="168" y="70" width="26" height="32" rx="4" />
              <line x1="173" y1="78" x2="189" y2="78" />
              <line x1="173" y1="85" x2="185" y2="85" />
              <line x1="173" y1="92" x2="187" y2="92" />
            </g>
          ))}
        </g>

        {/* CVs flying out while applications are being sent. */}
        <g className="r-cvs">
          {[0, 1, 2].map((i) => (
            <g key={i} className="r-cv" style={{ animationDelay: `${i * 0.5}s` }}>
              <rect x="128" y="96" width="20" height="25" rx="3" />
              <text x="138" y="112" textAnchor="middle">
                CV
              </text>
            </g>
          ))}
        </g>

        <g className="r-body">
          <line className="r-antenna-stem" x1="100" y1="30" x2="100" y2="16" />
          <circle className="r-antenna" cx="100" cy="13" r="5" />

          <rect className="r-head" x="60" y="30" width="80" height="60" rx="18" />
          <rect className="r-screen" x="70" y="42" width="60" height="36" rx="10" />
          <g className="r-eyes">
            <ellipse className="r-eye" cx="88" cy="58" rx="6" ry="6" />
            <ellipse className="r-eye" cx="112" cy="58" rx="6" ry="6" />
          </g>
          <path className="r-mouth" d="M92 69 Q100 74 108 69" />
          <path className="r-mouth-happy" d="M90 67 Q100 78 110 67" />

          <rect className="r-torso" x="72" y="94" width="56" height="40" rx="12" />
          <circle className="r-core" cx="100" cy="114" r="6" />
          <rect className="r-arm" x="58" y="98" width="12" height="28" rx="6" />

          <g className="r-tool">
            <rect className="r-arm" x="130" y="98" width="12" height="28" rx="6" />
            <circle className="r-lens" cx="152" cy="92" r="12" />
            <line className="r-handle" x1="144" y1="101" x2="138" y2="110" />
          </g>
        </g>

        <g className="r-sparkles">
          <path d="M40 40 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" />
          <path d="M160 28 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z" />
          <path d="M34 110 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
        </g>
      </svg>
    </div>
  );
}
