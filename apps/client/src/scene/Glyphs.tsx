import { HEX_SIZE, LEVEL_HEIGHT, hexToWorld, type GlyphKind, type GlyphState } from "@aoh/rules";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { CanvasTexture, SRGBColorSpace, type Group, type Sprite, type SpriteMaterial } from "three";
import { useReducedMotion } from "../motion";
import { useBoardActivity } from "./activity";
import { glyphFace } from "./Table";
import { useWake } from "./wake";

/** A face-down glyph tile: a thin hex with a rune on top. */
function GlyphTile() {
  return (
    <>
      <mesh position={[0, 0.05, 0]} raycast={() => null}>
        <cylinderGeometry args={[HEX_SIZE * 0.74, HEX_SIZE * 0.78, 0.1, 6]} />
        <meshStandardMaterial color="#7a1f24" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.105, 0]} raycast={() => null}>
        <cylinderGeometry args={[HEX_SIZE * 0.6, HEX_SIZE * 0.6, 0.02, 6]} />
        <meshStandardMaterial color="#b89a64" roughness={0.9} />
      </mesh>
      {/* The rune: a flat golden diamond with a bar across it. */}
      <mesh position={[0, 0.12, 0]} rotation={[0, Math.PI / 4, 0]} scale={[1, 0.15, 1]} raycast={() => null}>
        <octahedronGeometry args={[HEX_SIZE * 0.3, 0]} />
        <meshStandardMaterial color="#e8c374" metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.13, 0]} raycast={() => null}>
        <boxGeometry args={[HEX_SIZE * 0.5, 0.02, HEX_SIZE * 0.08]} />
        <meshStandardMaterial color="#5a3a12" />
      </mesh>
    </>
  );
}

/**
 * Glyphs lying face down on the battlefield: thin hex tiles with a rune on top. They all look the
 * same, as nobody knows which is which until a figure picks one up. They take no clicks, so the
 * hex under them can still be chosen.
 */
export function GlyphTiles({ glyphs }: { glyphs: GlyphState["onBoard"] }) {
  return (
    <>
      {glyphs.map((g) => {
        const { x, z } = hexToWorld(g.hex, HEX_SIZE);
        return (
          <group key={g.id} position={[x, g.elevation * LEVEL_HEIGHT, z]}>
            <GlyphTile />
          </group>
        );
      })}
    </>
  );
}

/** A glyph just picked up, where it lay. */
export interface GlyphPickup {
  readonly key: string;
  readonly hex: { readonly q: number; readonly r: number };
  readonly elevation: number;
  /** What it is, or null where this viewer may not know (another player's glyph). */
  readonly kind: GlyphKind | null;
  /** How high it rises above its hex: over the figure that picked it up. */
  readonly lift: number;
}

/** How long a pickup shows, in seconds. */
export const PICKUP_SECONDS = 1.4;
/** The share of it spent lifting the tile off the board and turning it over. */
const LIFT_SHARE = 0.3;
/** The longest a pickup waits for the figure to land on the glyph. */
const HOP_WAIT_SECONDS = 3;
const FACE_SIZE = 2.2 * HEX_SIZE;

let back: CanvasTexture | null = null;

/** A glyph's back, shown face up to a viewer who may not know what it is: the rune and a question mark. */
function glyphBack(): CanvasTexture {
  if (back) return back;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d")!;
  const r = size / 2;
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (Math.PI / 3) * i;
    if (i === 0) g.moveTo(r + Math.cos(a) * (r - 4), r + Math.sin(a) * (r - 4));
    else g.lineTo(r + Math.cos(a) * (r - 4), r + Math.sin(a) * (r - 4));
  }
  g.closePath();
  g.fillStyle = "#7a1f24";
  g.fill();
  g.lineWidth = 7;
  g.strokeStyle = "#e8c374";
  g.stroke();
  g.fillStyle = "#e8c374";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = "bold 120px Georgia, serif";
  g.fillText("?", r, r + 6);
  back = new CanvasTexture(canvas);
  back.colorSpace = SRGBColorSpace;
  return back;
}

/**
 * Glyphs being picked up: once the figure has landed, the tile lifts off its hex, spinning, and
 * turns into its face (art and name; a question mark for another player's glyph), which hangs over
 * the figure a moment and fades. Under reduced motion the face just shows and fades.
 */
export function GlyphPickups({ pickups, onDone }: { pickups: readonly GlyphPickup[]; onDone: (key: string) => void }) {
  return (
    <>
      {pickups.map((p) => (
        <Pickup key={p.key} pickup={p} onDone={onDone} />
      ))}
    </>
  );
}

function Pickup({ pickup, onDone }: { pickup: GlyphPickup; onDone: (key: string) => void }) {
  const invalidate = useThree((s) => s.invalidate);
  const wake = useWake();
  const activity = useBoardActivity();
  const reduced = useReducedMotion();
  const tile = useRef<Group>(null);
  const face = useRef<Sprite>(null);
  const clock = useRef({ waited: 0, started: -1, done: false });
  const report = useRef(onDone);
  report.current = onDone;
  useEffect(() => wake(), []);
  const { x, z } = hexToWorld(pickup.hex, HEX_SIZE);
  const y = pickup.elevation * LEVEL_HEIGHT;

  useFrame((_, delta) => {
    const c = clock.current;
    const t3 = tile.current;
    const s = face.current;
    if (c.done || !t3 || !s) return;
    invalidate();
    if (c.started < 0) {
      // Wait for the figure to land on the glyph first; the tile still lies on its hex meanwhile.
      if (activity.hopping.size > 0 && c.waited < HOP_WAIT_SECONDS) {
        c.waited += Math.min(delta, 0.1);
        return;
      }
      c.started = performance.now();
    }
    const u = Math.min(1, (performance.now() - c.started) / 1000 / PICKUP_SECONDS);
    const material = s.material as SpriteMaterial;
    const top = y + pickup.lift;
    if (reduced) {
      t3.visible = false;
      s.visible = true;
      s.position.set(x, top, z);
      s.scale.set(FACE_SIZE, FACE_SIZE, 1);
      material.opacity = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
    } else {
      // The tile lifts and spins, shrinking as its face grows out of it.
      const lift = Math.min(1, u / LIFT_SHARE);
      const eased = 1 - (1 - lift) * (1 - lift);
      t3.visible = lift < 1;
      t3.position.set(x, y + eased * pickup.lift, z);
      t3.rotation.set(eased * Math.PI, eased * Math.PI * 2, 0);
      t3.scale.setScalar(1 - 0.7 * eased);
      const grow = Math.min(1, Math.max(0, (u - LIFT_SHARE * 0.6) / 0.15));
      s.visible = grow > 0;
      const size = FACE_SIZE * (grow < 1 ? grow * 1.1 : 1.1 - 0.1 * Math.min(1, (u - LIFT_SHARE * 0.6 - 0.15) / 0.1));
      s.position.set(x, top + 0.25 * HEX_SIZE * Math.max(0, u - 0.5), z);
      s.scale.set(size, size, 1);
      material.opacity = u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;
    }
    if (u >= 1) {
      c.done = true;
      t3.visible = false;
      s.visible = false;
      invalidate();
      report.current(pickup.key);
    }
  });

  return (
    <>
      <group ref={tile} position={[x, y, z]}>
        <GlyphTile />
      </group>
      <sprite ref={face} visible={false} renderOrder={10} raycast={() => null}>
        <spriteMaterial map={pickup.kind ? glyphFace(pickup.kind) : glyphBack()} transparent depthTest={false} />
      </sprite>
    </>
  );
}
