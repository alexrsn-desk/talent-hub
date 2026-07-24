import { useMemo } from "react";
import { useWeeklyStandards } from "@/hooks/use-weekly-standards";

/**
 * FlowPipe — four tributaries (plates) merging into a vertical pipe that fills toward
 * a "complete week" disc at the bottom. Calm by default: lime fill, no numbers, slow drift.
 * Visually alive as plate completion rises; behind-pace tributaries thin & desaturate rather
 * than alarm-red (urgency lives in the checklist below).
 */

const LIME = "#BEF264";
const LIME_DIM = "#4A5D2C";
const OUTLINE = "rgba(255,255,255,0.10)";
const OUTLINE_STRONG = "rgba(255,255,255,0.18)";
const MUTED = "#6B7280";

export function FlowPipe({ compact = false }: { compact?: boolean }) {
  const { data } = useWeeklyStandards(1);

  const plates = data?.plates || [];
  const overall = useMemo(() => {
    if (!plates.length) return 0;
    return Math.max(0, Math.min(1, plates.reduce((s, p) => s + Math.min(1, p.avgPct), 0) / plates.length));
  }, [plates]);

  const complete = overall >= 0.98;
  const height = compact ? 180 : 220;

  // Layout: four tributaries at x = 60, 180, 300, 420 → merge to central pipe at x=240
  const tributaryX = [60, 180, 300, 420];
  const pipeX = 240;
  const pipeW = 44;

  return (
    <div className="w-full flex justify-center py-3" aria-hidden>
      <svg
        viewBox={`0 0 480 ${height}`}
        width="100%"
        style={{ maxWidth: 520, height, overflow: "visible" }}
      >
        <defs>
          <linearGradient id="pipeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={LIME} stopOpacity="0.15" />
            <stop offset="100%" stopColor={LIME} stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="tribFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={LIME} stopOpacity="0.05" />
            <stop offset="100%" stopColor={LIME} stopOpacity="0.35" />
          </linearGradient>
          <radialGradient id="discGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={LIME} stopOpacity={complete ? 0.9 : 0.15 + overall * 0.5} />
            <stop offset="70%" stopColor={LIME} stopOpacity={complete ? 0.4 : 0.05 + overall * 0.2} />
            <stop offset="100%" stopColor={LIME} stopOpacity="0" />
          </radialGradient>
          <filter id="soften" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.6" />
          </filter>
        </defs>

        {/* --- Four tributaries: curved paths from top down to junction at (pipeX, 70) --- */}
        {tributaryX.map((tx, i) => {
          const plate = plates[i];
          const fill = plate ? Math.max(0.08, Math.min(1, plate.avgPct)) : 0.08;
          const behind = plate?.behindPace;
          const desat = behind ? 0.35 : 1;
          const strokeW = 8 + fill * 6; // 8-14
          const y0 = 4;
          const y1 = 70;
          const midY = 40;
          // control point pulls toward the pipe center for smooth merge
          const cx1 = tx;
          const cy1 = midY;
          const cx2 = (tx + pipeX) / 2;
          const cy2 = midY + 10;
          const d = `M ${tx} ${y0} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${pipeX} ${y1}`;
          return (
            <g key={i} style={{ opacity: desat }}>
              {/* outline */}
              <path
                d={d}
                stroke={OUTLINE}
                strokeWidth={strokeW + 2}
                fill="none"
                strokeLinecap="round"
              />
              {/* fill */}
              <path
                d={d}
                stroke="url(#tribFill)"
                strokeWidth={strokeW}
                fill="none"
                strokeLinecap="round"
              />
              {/* drifting dashes = slow flow */}
              <path
                d={d}
                stroke={LIME}
                strokeWidth={2}
                strokeOpacity={0.35 + fill * 0.4}
                fill="none"
                strokeLinecap="round"
                strokeDasharray="3 14"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="0"
                  to="-34"
                  dur={`${6 - fill * 2.5}s`}
                  repeatCount="indefinite"
                />
              </path>
            </g>
          );
        })}

        {/* --- Central vertical pipe --- */}
        {(() => {
          const pipeTop = 68;
          const pipeBottom = height - 46;
          const pipeH = pipeBottom - pipeTop;
          const fillH = pipeH * overall;
          const fillY = pipeBottom - fillH;
          return (
            <>
              {/* outline */}
              <rect
                x={pipeX - pipeW / 2}
                y={pipeTop}
                width={pipeW}
                height={pipeH}
                rx={pipeW / 2}
                fill="rgba(0,0,0,0.25)"
                stroke={OUTLINE_STRONG}
                strokeWidth={1}
              />
              {/* fill (clipped to rounded rect) */}
              <clipPath id="pipeClip">
                <rect
                  x={pipeX - pipeW / 2}
                  y={pipeTop}
                  width={pipeW}
                  height={pipeH}
                  rx={pipeW / 2}
                />
              </clipPath>
              <g clipPath="url(#pipeClip)">
                <rect
                  x={pipeX - pipeW / 2}
                  y={fillY}
                  width={pipeW}
                  height={fillH}
                  fill="url(#pipeFill)"
                  style={{ transition: "y 700ms ease, height 700ms ease" }}
                />
                {/* liquid surface shimmer */}
                <ellipse
                  cx={pipeX}
                  cy={fillY}
                  rx={pipeW / 2 - 2}
                  ry={3}
                  fill={LIME}
                  fillOpacity={0.5}
                  style={{ transition: "cy 700ms ease" }}
                />
                {/* drifting bubbles */}
                {[0, 1, 2].map((k) => (
                  <circle key={k} cx={pipeX - 8 + k * 8} r={1.6} fill={LIME} fillOpacity={0.45}>
                    <animate
                      attributeName="cy"
                      from={pipeBottom - 4}
                      to={fillY + 6}
                      dur={`${4 + k * 0.8}s`}
                      repeatCount="indefinite"
                      begin={`${k * 0.7}s`}
                    />
                    <animate
                      attributeName="fill-opacity"
                      values="0;0.5;0"
                      dur={`${4 + k * 0.8}s`}
                      repeatCount="indefinite"
                      begin={`${k * 0.7}s`}
                    />
                  </circle>
                ))}
              </g>

              {/* --- Goal disc at the bottom --- */}
              <circle
                cx={pipeX}
                cy={pipeBottom + 24}
                r={26}
                fill="url(#discGlow)"
              />
              <circle
                cx={pipeX}
                cy={pipeBottom + 24}
                r={18}
                fill="none"
                stroke={complete ? LIME : OUTLINE_STRONG}
                strokeWidth={1.5}
                style={{ transition: "stroke 500ms ease" }}
              />
              <circle
                cx={pipeX}
                cy={pipeBottom + 24}
                r={complete ? 12 : 4 + overall * 8}
                fill={complete ? LIME : LIME_DIM}
                fillOpacity={complete ? 0.9 : 0.4 + overall * 0.5}
                filter="url(#soften)"
                style={{ transition: "r 700ms ease, fill-opacity 700ms ease" }}
              />
            </>
          );
        })()}

        {/* --- Label under disc --- */}
        <text
          x={pipeX}
          y={height - 4}
          textAnchor="middle"
          fontSize="9"
          fontWeight={600}
          letterSpacing="1.5"
          fill={complete ? LIME : MUTED}
          style={{ textTransform: "uppercase" }}
        >
          {complete ? "In rhythm" : "A complete week"}
        </text>
      </svg>
    </div>
  );
}
