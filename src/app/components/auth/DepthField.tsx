type Point = readonly [number, number];

/** Nested, offset contours turn a flat field into a shared point of depth. */
function contourPoint(depth: number, angle: number): Point {
  const spread = Math.pow(depth, 1.28);
  const radiusX = 32 + 1200 * spread;
  const radiusY = 22 + 880 * spread;
  const rotation = -0.54 + depth * 0.12;
  const ripple = 1 + 0.055 * Math.sin(angle * 3 + depth * 2);
  const x = Math.cos(angle) * radiusX * ripple;
  const y = Math.sin(angle) * radiusY * ripple;
  return [
    810 + depth * 120 + x * Math.cos(rotation) - y * Math.sin(rotation),
    910 - depth * 240 + x * Math.sin(rotation) + y * Math.cos(rotation),
  ];
}

function pathThrough(points: readonly Point[], closed = false): string {
  const pointAt = (index: number): Point =>
    points[
      closed
        ? (index + points.length) % points.length
        : Math.max(0, Math.min(index, points.length - 1))
    ];
  const coordinates = ([x, y]: Point) => `${x.toFixed(1)} ${y.toFixed(1)}`;
  const segments = Array.from(
    { length: closed ? points.length : points.length - 1 },
    (_, index) => {
      const previous = pointAt(index - 1);
      const start = pointAt(index);
      const end = pointAt(index + 1);
      const next = pointAt(index + 2);
      const first: Point = [
        start[0] + (end[0] - previous[0]) / 6,
        start[1] + (end[1] - previous[1]) / 6,
      ];
      const second: Point = [
        end[0] - (next[0] - start[0]) / 6,
        end[1] - (next[1] - start[1]) / 6,
      ];
      return `C${coordinates(first)} ${coordinates(second)} ${coordinates(
        end
      )}`;
    }
  );
  return `M${coordinates(points[0])} ${segments.join(" ")}${
    closed ? " Z" : ""
  }`;
}

// All geometry is deterministic and built once, shared by server and client.
// This is decoration: no timers, pointer tracking, runtime randomness, or state.
const CONTOURS = Array.from({ length: 32 }, (_, index) => {
  const depth = index / 31;
  return pathThrough(
    Array.from({ length: 16 }, (_, step) =>
      contourPoint(depth, (step / 16) * Math.PI * 2)
    ),
    true
  );
});

const BRANCH_ANGLES = [-2.8, -2.1, -1.45, -0.65, 0.15, 1.05, 1.85, 2.5];
const BRANCHES = BRANCH_ANGLES.map((angle) =>
  pathThrough(
    Array.from({ length: 16 }, (_, step) => {
      const depth = step / 15;
      return contourPoint(depth, angle + depth * 0.32);
    })
  )
);

const COLLECTIONS = BRANCH_ANGLES.flatMap((angle, branch) =>
  [0.2, 0.38, 0.6, 0.85].map((depth, index) => ({
    point: contourPoint(depth, angle + depth * 0.32),
    prominent: (branch + index) % 3 === 0,
  }))
);

const FIELD = (
  <svg
    className="depth-field__art"
    viewBox="0 0 1600 1200"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
    focusable="false"
  >
    <g className="depth-field__contours">
      {CONTOURS.map((d, index) => (
        <path
          key={index}
          d={d}
          opacity={index % 4 === 0 ? 0.75 : 0.36}
        />
      ))}
    </g>
    <g className="depth-field__branches">
      {BRANCHES.map((d) => (
        <path
          key={d}
          d={d}
        />
      ))}
    </g>
    <g className="depth-field__collections">
      {COLLECTIONS.map(({ point: [cx, cy], prominent }, index) => (
        <g key={index}>
          {prominent ? (
            <circle
              cx={cx}
              cy={cy}
              r={8}
              className="depth-field__ring"
            />
          ) : null}
          <circle
            cx={cx}
            cy={cy}
            r={prominent ? 2.6 : 1.5}
          />
        </g>
      ))}
    </g>
    <g className="depth-field__focus">
      <circle
        cx="810"
        cy="910"
        r="9"
        className="depth-field__ring"
      />
      <circle
        cx="810"
        cy="910"
        r="3"
      />
    </g>
  </svg>
);

/** A still, full-bleed field of branching work converging into collected knowledge. */
export function DepthField() {
  return (
    <div
      className="depth-field"
      aria-hidden="true"
    >
      <div className="depth-field__canvas">{FIELD}</div>
    </div>
  );
}
