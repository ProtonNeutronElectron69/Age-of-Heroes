import type { DieFace } from "@aoh/rules";
import { CanvasTexture, Color, Float32BufferAttribute, IcosahedronGeometry, MeshStandardMaterial, SRGBColorSpace, type Quaternion } from "three";
import { CUBE_FACES, CUBE_NORMALS, D20_RADIUS, type DieKind } from "./diceRoll";

export type { DieKind };

/**
 * How the 3D dice look: the attack and defense cubes and the initiative d20s. They are thrown
 * into a tray (`ThrownDice` in `DiceTray.tsx`), played back from a throw worked out in advance
 * (`diceRoll.ts`), and land on results the rules have already rolled.
 */

// ---- Faces ----------------------------------------------------------------------

/** The skull and shield from the dice panel (24 by 24 drawings). */
const SKULL =
  "M12 3c-4.4 0-8 3.2-8 7.4 0 2.5 1.3 4.6 3.3 5.9V19c0 .6.4 1 1 1h1.2v-2h1.5v2h2v-2h1.5v2h1.2c.6 0 1-.4 1-1v-2.7c2-1.3 3.3-3.4 3.3-5.9C20 6.2 16.4 3 12 3Zm-3.2 9.6a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6Zm6.4 0a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6Z";
const SHIELD = "M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z";

/** Colours as in the dice panel: light red with red skulls, light blue with blue shields. */
const LOOK: Record<DieKind, { body: string; edge: string; mark: string }> = {
  attack: { body: "#f7d9d2", edge: "#d6a99e", mark: "#d23a26" },
  defense: { body: "#c6dbf7", edge: "#8fadd6", mark: "#2f7ad8" },
};

function faceTexture(kind: DieKind, face: DieFace): CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d")!;
  const look = LOOK[kind];
  g.fillStyle = look.edge;
  g.fillRect(0, 0, size, size);
  g.fillStyle = look.body;
  g.beginPath();
  g.roundRect(size * 0.04, size * 0.04, size * 0.92, size * 0.92, size * 0.14);
  g.fill();
  if (face !== "blank") {
    g.save();
    g.translate(size * 0.14, size * 0.14);
    g.scale((size * 0.72) / 24, (size * 0.72) / 24);
    g.fillStyle = look.mark;
    g.fill(new Path2D(face === "skull" ? SKULL : SHIELD));
    g.restore();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

let cubeMaterials: Record<DieKind, MeshStandardMaterial[]> | null = null;
/** The six face materials of each kind of cube die, made once and shared. */
export function cubeMaterialsFor(kind: DieKind): MeshStandardMaterial[] {
  cubeMaterials ??= {
    attack: CUBE_FACES.attack.map((f) => new MeshStandardMaterial({ map: faceTexture("attack", f), roughness: 0.32 })),
    defense: CUBE_FACES.defense.map((f) => new MeshStandardMaterial({ map: faceTexture("defense", f), roughness: 0.32 })),
  };
  return cubeMaterials[kind];
}


// ---- The d20 ---------------------------------------------------------------------

/** Each triangle's corner positions in its atlas cell (u, v), top corner first, anticlockwise. */
const CELL_CORNERS = [
  [0.5, 0.92],
  [0.06, 0.16],
  [0.94, 0.16],
] as const;
const ATLAS_COLUMNS = 5;
const ATLAS_ROWS = 4;

let sharedD20: IcosahedronGeometry | null = null;

/**
 * The d20's shape, `D20_RADIUS` from middle to corner, with atlas places for its numbers: face i
 * shows i + 1, its number's top at the face's first corner, as `d20Faces` in `diceRoll.ts` has it.
 */
export function d20Geometry(): IcosahedronGeometry {
  if (sharedD20) return sharedD20;
  const geometry = new IcosahedronGeometry(D20_RADIUS, 0);
  const uv: number[] = [];
  for (let f = 0; f < geometry.getAttribute("position").count / 3; f++) {
    const col = f % ATLAS_COLUMNS;
    const row = Math.floor(f / ATLAS_COLUMNS);
    for (const [u, v] of CELL_CORNERS) uv.push((col + u) / ATLAS_COLUMNS, 1 - (row + 1 - v) / ATLAS_ROWS);
  }
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  sharedD20 = geometry;
  return geometry;
}

const d20Materials = new Map<string, MeshStandardMaterial>();

/**
 * A d20 in a player's colour, so each player can tell their die in the tray: a darker rim round
 * each face, as the cubes have, and the numbers 1 to 20 in dark or light ink, whichever reads
 * better on the colour. Made once for each colour and shared.
 */
export function d20MaterialFor(color: string): MeshStandardMaterial {
  const made = d20Materials.get(color);
  if (made) return made;
  const body = new Color(color);
  const edge = body.clone().multiplyScalar(0.62);
  const light = 0.2126 * body.r + 0.7152 * body.g + 0.0722 * body.b > 0.36;
  const cell = 160;
  const canvas = document.createElement("canvas");
  canvas.width = cell * ATLAS_COLUMNS;
  canvas.height = cell * ATLAS_ROWS;
  const g = canvas.getContext("2d")!;
  g.fillStyle = `#${edge.getHexString()}`;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `700 ${Math.round(cell * 0.38)}px Georgia, "Times New Roman", serif`;
  for (let f = 0; f < 20; f++) {
    const left = (f % ATLAS_COLUMNS) * cell;
    const top = Math.floor(f / ATLAS_COLUMNS) * cell;
    // The face, a little inside its triangle so the rim shows.
    const corners = CELL_CORNERS.map(([u, v]) => [left + u * cell, top + (1 - v) * cell] as const);
    const mid = corners.reduce(([x, y], [cx, cy]) => [x + cx / 3, y + cy / 3], [0, 0]);
    g.fillStyle = `#${body.getHexString()}`;
    g.beginPath();
    corners.forEach(([x, y], i) => {
      const px = mid[0] + (x - mid[0]) * 0.86;
      const py = mid[1] + (y - mid[1]) * 0.86;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    g.closePath();
    g.fill();
    const text = String(f + 1);
    const y = mid[1] + cell * 0.03;
    g.fillStyle = light ? "#1b1405" : "#fbf7ee";
    g.fillText(text, mid[0], y);
    // 6 and 9 are underlined, as on real dice.
    if (text === "6" || text === "9") g.fillRect(mid[0] - cell * 0.09, y + cell * 0.16, cell * 0.18, cell * 0.025);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new MeshStandardMaterial({ map: texture, roughness: 0.32, flatShading: true });
  d20Materials.set(color, material);
  return material;
}

/** The face a cube die shows on top when turned by `q`. */
export function cubeTopFace(kind: DieKind, q: Quaternion): DieFace {
  let best = 0;
  let bestUp = -Infinity;
  CUBE_NORMALS.forEach((n, i) => {
    const up = n.clone().applyQuaternion(q).y;
    if (up > bestUp) {
      bestUp = up;
      best = i;
    }
  });
  return CUBE_FACES[kind][best]!;
}
