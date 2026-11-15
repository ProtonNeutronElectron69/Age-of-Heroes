import type { ThreeEvent } from "@react-three/fiber";
import type { Footprint, UnitCard } from "@aoh/rules";
import { useEffect, useMemo, useState } from "react";
import { CanvasTexture, CircleGeometry, Color, Float32BufferAttribute, RepeatWrapping, SRGBColorSpace, Shape, ShapeGeometry, type Texture } from "three";
import type { TableStyle } from "../settings";
import { TEST_MODE } from "../testMode";
import { factionTheme } from "../ui/factionThemes";
import { CARD_BOX, cardTexture } from "./cardTexture";
import { CardFigure } from "./Figures";
import { TABLE_CARD, cardSlot, type Bounds, type CardSpot, type TableLayout } from "./tableLayout";

/**
 * The gaming table the board stands on, in the player's choice of three
 * styles, and the unit cards laid out round it. The table top is at height 0,
 * where the board's lowest level begins.
 *
 * Browser tests (`TEST_MODE`) get a simpler table that draws much faster without a
 * graphics card: plainer lighting, no texture sharpening, a floor shaded by its
 * corners instead of a picture, and table and floor drawn last so the pixels the
 * board hides are skipped. Players always get the full table.
 */

// ---- Painted surfaces ----------------------------------------------------------

/** A small repeatable random number source, so a surface looks the same every visit. */
function noise(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function painted(size: number, paint: (g: CanvasRenderingContext2D, size: number) => void): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  paint(canvas.getContext("2d")!, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  if (!TEST_MODE) texture.anisotropy = 8;
  return texture;
}

/** Boards side by side with grain along them, butt joints and dark seams. */
function planks(base: string, seam: string, boards: number, seed: number): CanvasTexture {
  return painted(512, (g, size) => {
    const random = noise(seed);
    const h = size / boards;
    for (let i = 0; i < boards; i++) {
      g.fillStyle = base;
      g.fillRect(0, i * h, size, h);
      // Each board is a little lighter or darker than its neighbours.
      const shade = random();
      g.fillStyle = shade > 0.5 ? `rgba(255,236,200,${(shade - 0.5) * 0.22})` : `rgba(30,14,0,${(0.5 - shade) * 0.3})`;
      g.fillRect(0, i * h, size, h);
      for (let k = 0; k < 16; k++) {
        const y = i * h + random() * h;
        g.strokeStyle = `rgba(40,20,5,${0.05 + random() * 0.13})`;
        g.lineWidth = 0.6 + random() * 1.2;
        g.beginPath();
        g.moveTo(0, y);
        const bend = (random() - 0.5) * 5;
        g.bezierCurveTo(size / 3, y + bend, (2 * size) / 3, y - bend, size, y);
        g.stroke();
      }
      g.fillStyle = seam;
      g.fillRect(0, i * h, size, 2);
      const joint = random() * size;
      g.fillRect(joint, i * h, 2, h);
    }
  });
}

/** Cloth or concrete: one colour with fine speckles. */
function speckled(base: string, light: string, dark: string, seed: number): CanvasTexture {
  return painted(256, (g, size) => {
    const random = noise(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < 5200; i++) {
      g.fillStyle = random() > 0.5 ? light : dark;
      g.globalAlpha = 0.05 + random() * 0.1;
      g.fillRect(random() * size, random() * size, 1 + random() * 1.4, 1 + random() * 1.4);
    }
    g.globalAlpha = 1;
  });
}

/** The floor: lit under the table and falling away to the room's darkness. */
function pool(middle: string, edge: string): CanvasTexture {
  return painted(256, (g, size) => {
    const fade = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    fade.addColorStop(0, middle);
    fade.addColorStop(0.55, edge);
    fade.addColorStop(1, edge);
    g.fillStyle = fade;
    g.fillRect(0, 0, size, size);
  });
}

/** The test-mode floor: a disc shaded from its middle to its rim, with no picture to sample. */
function floorDisc(radius: number, middle: string, edge: string): CircleGeometry {
  const g = new CircleGeometry(radius, 48);
  const count = g.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  const from = new Color(middle);
  const to = new Color(edge);
  // The first vertex is the middle; the rest are the rim.
  for (let i = 0; i < count; i++) (i === 0 ? from : to).toArray(colors, i * 3);
  g.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return g;
}

/** A table surface: lit with roughness for players, or with the simpler lighting in test mode. */
function Surface({ color, map, roughness }: { color?: string; map?: Texture | null; roughness: number }) {
  const look = { ...(color ? { color } : {}), ...(map ? { map } : {}) };
  return TEST_MODE ? <meshLambertMaterial {...look} /> : <meshStandardMaterial {...look} roughness={roughness} />;
}

// ---- Styles ---------------------------------------------------------------------

interface Look {
  /** The room's darkness, behind everything. */
  readonly room: string;
  readonly floor: readonly [string, string];
  readonly top: () => CanvasTexture;
  /** World units one repeat of the top's surface covers. */
  readonly tile: number;
  readonly edge: string;
  readonly legs: string;
  readonly legWidth: number;
  /** A raised rail round the table top: its width and height. */
  readonly rail?: { readonly width: number; readonly height: number; readonly color: string };
  /** A mat under the board. */
  readonly mat?: { readonly color: string; readonly trim: string };
}

const LOOKS: Record<TableStyle, Look> = {
  // A heavy oak table in a warm, dark room.
  tavern: {
    room: "#120d0a",
    floor: ["#4a3626", "#120d0a"],
    top: () => planks("#8a5c30", "rgba(28,14,4,0.75)", 4, 11),
    tile: 14,
    edge: "#5a3a1c",
    legs: "#3f2814",
    legWidth: 1.9,
  },
  // A gaming table: green cloth inside a polished wooden rail.
  felt: {
    room: "#0c1118",
    floor: ["#2b3646", "#0c1118"],
    top: () => speckled("#1f6144", "#3f8a66", "#103625", 23),
    tile: 5,
    edge: "#4a2a14",
    legs: "#3a2010",
    legWidth: 1.6,
    rail: { width: 1.5, height: 0.5, color: "#5c3418" },
  },
  // A dark play mat rolled out on a pale workshop table.
  mat: {
    room: "#16171a",
    floor: ["#565a60", "#16171a"],
    top: () => planks("#cdb083", "rgba(120,92,50,0.4)", 2, 37),
    tile: 16,
    edge: "#a78a5c",
    legs: "#3a3f47",
    legWidth: 0.9,
    mat: { color: "#24272c", trim: "#8d939c" },
  },
};

/** How thick the table top is, how far the floor is below it, and how far in from the corners the legs stand. */
const TOP_THICKNESS = 0.9;
const TABLE_HEIGHT = 20;
const LEG_INSET = 2.2;
/** The floor is a disc this many times the table's size (in test mode, past it is the room's own colour). */
const FLOOR_REACH = 9;
const TEST_FLOOR_REACH = 5;

export function tableRoom(style: TableStyle): string {
  return LOOKS[style].room;
}

/** A flat rectangle with rounded corners, lying on the table. */
function roundedRect(b: Bounds, radius: number): ShapeGeometry {
  const w = b.maxX - b.minX;
  const d = b.maxZ - b.minZ;
  const r = Math.min(radius, w / 2, d / 2);
  const s = new Shape();
  s.moveTo(-w / 2 + r, -d / 2);
  s.lineTo(w / 2 - r, -d / 2);
  s.absarc(w / 2 - r, -d / 2 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(w / 2, d / 2 - r);
  s.absarc(w / 2 - r, d / 2 - r, r, 0, Math.PI / 2, false);
  s.lineTo(-w / 2 + r, d / 2);
  s.absarc(-w / 2 + r, d / 2 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-w / 2, -d / 2 + r);
  s.absarc(-w / 2 + r, -d / 2 + r, r, Math.PI, Math.PI * 1.5, false);
  return new ShapeGeometry(s, 6);
}

function grow(b: Bounds, by: number): Bounds {
  return { minX: b.minX - by, maxX: b.maxX + by, minZ: b.minZ - by, maxZ: b.maxZ + by };
}

/** The table, its legs and the floor under it. Nothing here takes clicks. */
export function GamingTable({ layout, style }: { layout: TableLayout; style: TableStyle }) {
  const look = LOOKS[style];
  const top = useMemo(() => look.top(), [look]);
  const floor = useMemo(() => (TEST_MODE ? null : pool(look.floor[0], look.floor[1])), [look]);
  const matSurface = useMemo(() => (look.mat ? speckled(look.mat.color, "#4a4f57", "#0e0f11", 41) : null), [look]);
  useEffect(
    () => () => {
      top.dispose();
      floor?.dispose();
      matSurface?.dispose();
    },
    [top, floor, matSurface],
  );

  // A rail goes round the outside, so the cards still have the whole top.
  const slab = look.rail ? grow(layout.table, look.rail.width) : layout.table;
  const width = slab.maxX - slab.minX;
  const depth = slab.maxZ - slab.minZ;
  const cx = (slab.minX + slab.maxX) / 2;
  const cz = (slab.minZ + slab.maxZ) / 2;
  useMemo(() => {
    top.repeat.set(width / look.tile, depth / look.tile);
    matSurface?.repeat.set((layout.mat.maxX - layout.mat.minX) / 4, (layout.mat.maxZ - layout.mat.minZ) / 4);
  }, [top, matSurface, width, depth, look, layout.mat]);

  const matShapes = useMemo(() => (look.mat ? { trim: roundedRect(layout.mat, 0.9), cloth: roundedRect(grow(layout.mat, -0.18), 0.75) } : null), [look, layout.mat]);
  useEffect(
    () => () => {
      matShapes?.trim.dispose();
      matShapes?.cloth.dispose();
    },
    [matShapes],
  );

  const testFloor = useMemo(
    () => (TEST_MODE ? floorDisc(Math.max(width, depth) * TEST_FLOOR_REACH, look.floor[0], look.floor[1]) : null),
    [width, depth, look],
  );
  useEffect(() => () => testFloor?.dispose(), [testFloor]);

  // In test mode the table is drawn after the board and the figures, so the pixels they hide are never filled.
  const still = { raycast: () => null, ...(TEST_MODE ? { renderOrder: 1 } : {}) };
  const legX = width / 2 - LEG_INSET;
  const legZ = depth / 2 - LEG_INSET;
  const rail = look.rail;
  return (
    <group position={[cx, 0, cz]}>
      {/* The top's surface, just under the board, and the slab it belongs to. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} {...still}>
        <planeGeometry args={[width, depth]} />
        <Surface map={top} roughness={0.85} />
      </mesh>
      <mesh position={[0, -TOP_THICKNESS / 2 - 0.04, 0]} {...still}>
        <boxGeometry args={[width, TOP_THICKNESS, depth]} />
        <Surface color={look.edge} roughness={0.8} />
      </mesh>
      {/* The frame under the top, and the legs. */}
      <mesh position={[0, -TOP_THICKNESS - 1.1, 0]} {...still}>
        <boxGeometry args={[legX * 2, 2.2, legZ * 2]} />
        <Surface color={look.legs} roughness={0.85} />
      </mesh>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}:${sz}`} position={[sx * legX, -TABLE_HEIGHT / 2 - TOP_THICKNESS / 2, sz * legZ]} {...still}>
            <boxGeometry args={[look.legWidth, TABLE_HEIGHT - TOP_THICKNESS, look.legWidth]} />
            <Surface color={look.legs} roughness={0.85} />
          </mesh>
        )),
      )}
      {rail &&
        [
          { at: [0, 0, depth / 2 - rail.width / 2], size: [width, rail.height, rail.width] },
          { at: [0, 0, -depth / 2 + rail.width / 2], size: [width, rail.height, rail.width] },
          { at: [width / 2 - rail.width / 2, 0, 0], size: [rail.width, rail.height, depth - rail.width * 2] },
          { at: [-width / 2 + rail.width / 2, 0, 0], size: [rail.width, rail.height, depth - rail.width * 2] },
        ].map((r, i) => (
          <mesh key={i} position={[r.at[0]!, rail.height / 2, r.at[2]!]} {...still}>
            <boxGeometry args={[r.size[0]!, r.size[1]!, r.size[2]!]} />
            <Surface color={rail.color} roughness={0.45} />
          </mesh>
        ))}
      {look.mat && matShapes && (
        <group position={[(layout.mat.minX + layout.mat.maxX) / 2 - cx, 0, (layout.mat.minZ + layout.mat.maxZ) / 2 - cz]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh geometry={matShapes.trim} position={[0, 0, -0.012]} {...still}>
            <Surface color={look.mat.trim} roughness={0.9} />
          </mesh>
          <mesh geometry={matShapes.cloth} position={[0, 0, 0.004]} {...still}>
            <Surface map={matSurface} roughness={0.95} />
          </mesh>
        </group>
      )}
      {testFloor ? (
        <mesh geometry={testFloor} rotation={[-Math.PI / 2, 0, 0]} position={[0, -TABLE_HEIGHT, 0]} raycast={() => null} renderOrder={2}>
          <meshBasicMaterial vertexColors />
        </mesh>
      ) : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -TABLE_HEIGHT, 0]} {...still}>
          <circleGeometry args={[Math.max(width, depth) * FLOOR_REACH, 48]} />
          <meshBasicMaterial map={floor} />
        </mesh>
      )}
    </group>
  );
}

// ---- Unit cards on the table -----------------------------------------------------

/** A unit's card on the table, with the figures that are not on the board. */
export interface TableUnit {
  readonly unitId: string;
  readonly card: UnitCard;
  /** The owning player's colour. */
  readonly color: string;
  /** How many figures the unit started with. */
  readonly figures: number;
  /** Figures (by their place in the unit) waiting on the card to be deployed. */
  readonly waiting: readonly number[];
  /** Figures destroyed and stood back on the card. */
  readonly destroyed: readonly number[];
}

/** The card's outline, as `HexCard` draws it, in card units. */
const A = 86.6025;
const OUTLINE: readonly (readonly [number, number])[] = [
  [260 - A, 0],
  [260, 50],
  [260 + A, 0],
  [260 + 2 * A, 50],
  [260 + 2 * A, 150],
  [260 + 3 * A, 200],
  [260 + 3 * A, 300],
  [260 + 2 * A, 350],
  [260 + 2 * A, 450],
  [260 + A, 500],
  [260, 450],
  [260 - A, 500],
  [260 - 2 * A, 450],
  [260 - 2 * A, 350],
  [260 - 3 * A, 300],
  [260 - 3 * A, 200],
  [260 - 2 * A, 150],
  [260 - 2 * A, 50],
];

/** The card as a flat seven-hex shape, face up, with the card's picture mapped onto it. */
function cardShape(): ShapeGeometry {
  const s = new Shape();
  OUTLINE.forEach(([x, y], i) => {
    const u = (x - CARD_BOX.x) / CARD_BOX.width;
    const v = 1 - (y - CARD_BOX.y) / CARD_BOX.height;
    if (i === 0) s.moveTo(u, v);
    else s.lineTo(u, v);
  });
  const g = new ShapeGeometry(s);
  // The shape is drawn in the picture's own 0 to 1 box, which is also its texture mapping; then sized for the table.
  g.translate(-0.5, -0.5, 0);
  g.scale((TABLE_CARD.width * CARD_BOX.width) / 519.615, (TABLE_CARD.depth * CARD_BOX.height) / 500, 1);
  return g;
}

let sharedCardShape: ShapeGeometry | null = null;

/** How far above the table top a card lies. */
const CARD_LIFT = 0.03;

function TableCard({
  spot,
  unit,
  onClick,
  onHover,
}: {
  spot: CardSpot;
  unit: TableUnit;
  onClick?: (unitId: string) => void;
  onHover?: (unitId: string | null) => void;
}) {
  const [picture, setPicture] = useState<Texture | null>(null);
  useEffect(() => {
    let live = true;
    cardTexture(unit.card, unit.color).then(
      (t) => live && setPicture(t),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [unit.card, unit.color]);
  sharedCardShape ??= cardShape();
  const theme = factionTheme(unit.card.faction);
  const footprint: Footprint = unit.card.footprint;
  const onCard = [...unit.waiting, ...unit.destroyed];
  return (
    <group position={[spot.x, CARD_LIFT, spot.z]} rotation={[0, spot.yaw, 0]}>
      <mesh
        geometry={sharedCardShape}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if (e.delta > 5) return;
          e.stopPropagation();
          onClick?.(unit.unitId);
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onHover?.(unit.unitId);
        }}
        onPointerOut={() => onHover?.(null)}
      >
        {/* Until the picture is painted the card shows its faction's colour. */}
        {picture ? <Surface key="picture" map={picture} roughness={0.8} /> : <Surface key="plain" color={theme.primary} roughness={0.8} />}
      </mesh>
      {onCard.map((i) => {
        const slot = cardSlot(i, unit.figures);
        return (
          <group key={i} position={[slot.x, 0.01, slot.z]}>
            <CardFigure
              cardId={unit.card.id}
              footprint={footprint}
              pose={i}
              faction={unit.card.faction}
              color={unit.color}
              height={unit.card.height}
            />
          </group>
        );
      })}
    </group>
  );
}

/** Every unit's card at its place round the table. */
export function TableCards({
  layout,
  units,
  onClick,
  onHover,
}: {
  layout: TableLayout;
  units: readonly TableUnit[];
  onClick?: (unitId: string) => void;
  onHover?: (unitId: string | null) => void;
}) {
  const byId = useMemo(() => new Map(units.map((u) => [u.unitId, u])), [units]);
  return (
    <>
      {layout.cards.map((spot) => {
        const unit = byId.get(spot.unitId);
        return unit ? <TableCard key={spot.unitId} spot={spot} unit={unit} onClick={onClick} onHover={onHover} /> : null;
      })}
    </>
  );
}
