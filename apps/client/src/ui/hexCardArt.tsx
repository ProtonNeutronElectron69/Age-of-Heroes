import type { ReactNode } from "react";
import type { EmblemId } from "./factionThemes";

/**
 * Small original glyphs for the unit cards, drawn around (0, 0). Emblems fit a
 * circle of radius 14; stat icons fit a circle of radius 9. `ink` is the glyph
 * colour and `ground` the colour behind it, for cut-out details.
 */

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export function Emblem({ id, ink, ground }: { id: EmblemId; ink: string; ground: string }): ReactNode {
  switch (id) {
    case "gear":
      return (
        <g fill={ink}>
          {range(8).map((i) => (
            <rect key={i} x={-2.6} y={-14} width={5.2} height={6} rx={0.8} transform={`rotate(${i * 45})`} />
          ))}
          <circle r={9.6} />
          <circle r={5.4} fill={ground} />
          <circle r={2.3} />
        </g>
      );
    case "haze":
      return (
        <g fill="none" stroke={ink} strokeWidth={2.2} strokeLinecap="round">
          <path d="M-9.5,-1.5 A9.5,9.5 0 0 1 9.5,-1.5 Z" fill={ink} stroke="none" />
          <path d="M-12,3.5 q3,-2.6 6,0 t6,0 t6,0 t6,0" />
          <path d="M-9,8.5 q3,-2.6 6,0 t6,0 t6,0" />
          <path d="M-6,13 q3,-2.6 6,0 t6,0" />
        </g>
      );
    case "leaf":
      return (
        <g>
          <path d="M0,-14 C9,-8 11,3 0,13 C-11,3 -9,-8 0,-14 Z" fill={ink} />
          <path
            d="M0,-8 V14 M0,-2 L4.6,-5.6 M0,-2 L-4.6,-5.6 M0,3.6 L5,0 M0,3.6 L-5,0"
            fill="none"
            stroke={ground}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </g>
      );
    case "nodes":
      return (
        <g>
          <path d="M0,-13 L11.3,-6.5 V6.5 L0,13 L-11.3,6.5 V-6.5 Z" fill="none" stroke={ink} strokeWidth={2} strokeLinejoin="round" />
          <path d="M0,0 V-13 M0,0 L11.3,6.5 M0,0 L-11.3,6.5" fill="none" stroke={ink} strokeWidth={1.6} />
          <g fill={ink}>
            <circle r={3.4} />
            <circle cy={-13} r={2.6} />
            <circle cx={11.3} cy={6.5} r={2.6} />
            <circle cx={-11.3} cy={6.5} r={2.6} />
          </g>
        </g>
      );
    case "skull":
      return (
        <g>
          <path d="M-10.5,-2 A10.5,10.5 0 0 1 10.5,-2 V3.5 L7,6.2 V12.5 H-7 V6.2 L-10.5,3.5 Z" fill={ink} />
          <g fill={ground}>
            <ellipse cx={-4.4} cy={-1.4} rx={2.9} ry={3.2} />
            <ellipse cx={4.4} cy={-1.4} rx={2.9} ry={3.2} />
            <path d="M0,2.4 L1.8,5.8 H-1.8 Z" />
            <rect x={-3.6} y={8.6} width={1.3} height={3.9} />
            <rect x={-0.65} y={8.6} width={1.3} height={3.9} />
            <rect x={2.3} y={8.6} width={1.3} height={3.9} />
          </g>
        </g>
      );
    case "sun":
      return (
        <g fill="none" stroke={ink} strokeWidth={2.2} strokeLinecap="round">
          <path d="M-7.5,5 A7.5,7.5 0 0 1 7.5,5 Z" fill={ink} stroke="none" />
          {[-72, -36, 0, 36, 72].map((a) => (
            <path key={a} d="M0,-5.8 V-11.4" transform={`translate(0,5) rotate(${a})`} />
          ))}
          <path d="M-13,8.6 H13 M-8,12.8 H8" />
        </g>
      );
    case "star":
      return <path d="M0,-13 L3.4,-4.4 L12.4,-4 L5.4,1.8 L7.6,10.6 L0,5.8 L-7.6,10.6 L-5.4,1.8 L-12.4,-4 L-3.4,-4.4 Z" fill={ink} />;
  }
}

export type StatIconId = "move" | "range" | "attack" | "defense";

export function StatIcon({ id, ink }: { id: StatIconId; ink: string }): ReactNode {
  switch (id) {
    case "move":
      // A marching boot.
      return <path d="M-5.2,-8.4 H1.6 V0.6 L7.4,3.2 Q9.2,4 9.2,6 V8.2 H-5.2 Z M-5.2,5.4 H9" fill={ink} fillRule="evenodd" />;
    case "range":
      // A drawn bow and its arrow.
      return (
        <g fill="none" stroke={ink} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <path d="M-3.6,-8.6 Q9.4,0 -3.6,8.6" />
          <path d="M-3.6,-8.6 L-6.4,0 L-3.6,8.6" strokeWidth={1} />
          <path d="M-6.4,0 H8.6 M5.6,-2.6 L8.8,0 L5.6,2.6" />
        </g>
      );
    case "attack":
      // A sword, point up.
      return (
        <g fill={ink} transform="rotate(38)">
          <path d="M0,-10.4 L2,-7.4 V3 H-2 V-7.4 Z" />
          <rect x={-5} y={3} width={10} height={2.2} rx={0.6} />
          <rect x={-1.1} y={5.2} width={2.2} height={3.6} />
          <circle cy={9.6} r={1.5} />
        </g>
      );
    case "defense":
      return (
        <g>
          <path d="M-7.2,-8 H7.2 V-0.6 Q7.2,6.4 0,9.4 Q-7.2,6.4 -7.2,-0.6 Z" fill={ink} />
        </g>
      );
  }
}
