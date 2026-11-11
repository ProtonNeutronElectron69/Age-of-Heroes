import { MAPS, SCENERY, SCENERY_TABLE, TERRAIN, TERRAIN_TABLE, buildBoard } from "@aoh/content";
import {
  HEX_SIZE,
  LEVEL_HEIGHT,
  MAX_LAYER,
  MAX_PLAYERS,
  MIN_PLAYERS,
  Rng,
  SHAPES,
  SHAPE_IDS,
  addPiece,
  addScenery,
  blankMap,
  clearStartZones,
  hexKey,
  hexToWorld,
  landingLayer,
  mapStats,
  overlappingCells,
  populateScenery,
  populateTerrain,
  removeItems,
  removePiece,
  removeProblems,
  removeScenery,
  setLayout,
  shapeCells,
  sidePlacement,
  toggleZoneHex,
  type Board,
  type Cell,
  type Hex,
  type MapDefinition,
  type MapIssue,
  type ScenerySpot,
  type ShapeId,
  type Step,
  type TerrainRules,
  type Vec3,
} from "@aoh/rules";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CylinderGeometry, Matrix4, Vector3, type InstancedMesh } from "three";
import { terrainEffect } from "../describe";
import { customMaps, downloadMap, isPremade, newMapId, readMapFile, saveCustomMap } from "../maps";
import { BoardScene, boardCenter, type Marker } from "../scene/BoardScene";
import { HEX_GAP, SEAT_COLORS } from "../scene/scale";
import { TestHook } from "../scene/TestHook";

type Tool = "piece" | "scenery" | "zone" | "erase";

interface History {
  past: MapDefinition[];
  present: MapDefinition;
  future: MapDefinition[];
}

const TOOLS: { id: Tool; label: string }[] = [
  { id: "piece", label: "Terrain" },
  { id: "scenery", label: "Scenery" },
  { id: "zone", label: "Start zones" },
  { id: "erase", label: "Erase" },
];

/** A copy of a premade map with its own id, or the custom map itself. */
function editable(map: MapDefinition | null): MapDefinition {
  if (!map) {
    const name = "New battlefield";
    return blankMap(newMapId(name), name);
  }
  if (isPremade(map.id)) {
    const name = `${map.name} (copy)`;
    return { ...structuredClone(map), id: newMapId(name), name };
  }
  return structuredClone(map);
}

function ShapeIcon({ shape }: { shape: ShapeId }) {
  const points = (cx: number, cz: number) =>
    Array.from({ length: 6 }, (_, k) => {
      const a = (Math.PI / 3) * k + Math.PI / 6;
      return `${(cx + Math.cos(a) * 5.4).toFixed(1)},${(cz + Math.sin(a) * 5.4).toFixed(1)}`;
    }).join(" ");
  const cells = SHAPES[shape].cells.map((c) => hexToWorld(c, 6));
  const xs = cells.map((c) => c.x);
  const zs = cells.map((c) => c.z);
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs) - 6, Math.max(...xs) + 6, Math.min(...zs) - 6, Math.max(...zs) + 6];
  return (
    <svg viewBox={`${minX} ${minZ} ${maxX - minX} ${maxZ - minZ}`} aria-hidden="true" className="shape-icon">
      {cells.map((c, i) => (
        <polygon key={i} points={points(c.x, c.z)} />
      ))}
    </svg>
  );
}

/** Translucent hex blocks over cells: the piece being placed, the box being erased, problem pieces. */
function CellBoxes({
  cells,
  color,
  opacity = 0.6,
  overlay = false,
}: {
  cells: readonly { hex: Hex; layer: number }[];
  color: string;
  opacity?: number;
  /** Draw through other terrain, so buried or hidden cells show. */
  overlay?: boolean;
}) {
  const geometry = useMemo(
    () => new CylinderGeometry(HEX_SIZE * HEX_GAP * 1.01, HEX_SIZE * HEX_GAP * 1.01, LEVEL_HEIGHT * 1.02, 6),
    [],
  );
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const matrix = new Matrix4();
    cells.forEach((c, i) => {
      const { x, z } = hexToWorld(c.hex, HEX_SIZE);
      m.setMatrixAt(i, matrix.makeTranslation(x, c.layer * LEVEL_HEIGHT + LEVEL_HEIGHT / 2, z));
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [cells]);
  if (cells.length === 0) return null;
  return (
    <instancedMesh
      key={cells.length}
      ref={mesh}
      args={[geometry, undefined, cells.length]}
      raycast={() => null}
      renderOrder={overlay ? 10 : 0}
    >
      <meshStandardMaterial color={color} transparent opacity={opacity} depthWrite={false} depthTest={!overlay} />
    </instancedMesh>
  );
}

/** Every cell of the given pieces. */
function pieceCells(board: Board, ids: Iterable<string>): { hex: Hex; layer: number }[] {
  const out: { hex: Hex; layer: number }[] = [];
  for (const id of ids) {
    const p = board.piece(id);
    if (p) for (const h of shapeCells(p.shape, p.origin, p.rotation)) out.push({ hex: h, layer: p.layer });
  }
  return out;
}

/** Where the camera should look to show a problem, or null if it has no place on the board. */
function problemPoint(board: Board, issue: MapIssue): Vec3 | null {
  if (issue.pieceId) {
    const cells = pieceCells(board, [issue.pieceId]);
    if (cells.length === 0) return null;
    let x = 0;
    let z = 0;
    for (const c of cells) {
      const w = hexToWorld(c.hex, HEX_SIZE);
      x += w.x;
      z += w.z;
    }
    return { x: x / cells.length, y: (cells[0]!.layer + 1) * LEVEL_HEIGHT, z: z / cells.length };
  }
  if (issue.hex) {
    const w = hexToWorld(issue.hex, HEX_SIZE);
    const top = board.topSurface(issue.hex);
    return { x: w.x, y: (top?.elevation ?? 0) * LEVEL_HEIGHT, z: w.z };
  }
  return null;
}

/** A tip that opens after the pointer rests on its button for a second. */
function DelayedTip({ tip, children }: { tip: ReactNode | null; children: (props: TipHandlers) => ReactNode }) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const handlers: TipHandlers = {
    onMouseEnter: (e) => {
      if (!tip) return;
      const r = e.currentTarget.getBoundingClientRect();
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setAt({ left: r.left, top: r.bottom + 6 }), 1000);
    },
    onMouseLeave: () => {
      window.clearTimeout(timer.current);
      setAt(null);
    },
  };
  return (
    <>
      {children(handlers)}
      {at &&
        tip &&
        createPortal(
          <div className="delayed-tip" role="tooltip" style={{ left: at.left, top: at.top }}>
            {tip}
          </div>,
          document.body,
        )}
    </>
  );
}

interface TipHandlers {
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => void;
  onMouseLeave: () => void;
}

function terrainTip(t: TerrainRules): ReactNode | null {
  const effect = terrainEffect(t);
  return effect ? (
    <>
      <strong>{t.name}</strong>
      {effect}
    </>
  ) : null;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Pointer travel (pixels) before a press in the erase tool becomes a box. */
const BOX_PIXELS = 6;

/**
 * Erase tool: drag with the left button to draw a box. Every piece with a hex
 * inside the box (at any level) and every piece of scenery inside it is picked.
 */
function BoxSelect({
  board,
  origin,
  onBox,
  onPick,
}: {
  board: Board;
  origin: { x: number; z: number };
  onBox: (box: Box | null) => void;
  onPick: (pieces: Set<string>, scenery: Set<string>, done: boolean) => void;
}) {
  const camera = useThree((s) => s.camera);
  const dom = useThree((s) => s.gl.domElement);
  const latest = useRef({ board, origin, onBox, onPick });
  latest.current = { board, origin, onBox, onPick };
  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    let dragging = false;
    let points: { id: string; scenery: boolean; at: Vector3 }[] = [];
    const v = new Vector3();
    const pick = (x: number, y: number) => {
      const r = dom.getBoundingClientRect();
      const [x0, x1] = [Math.min(start!.x, x), Math.max(start!.x, x)];
      const [y0, y1] = [Math.min(start!.y, y), Math.max(start!.y, y)];
      const pieces = new Set<string>();
      const scenery = new Set<string>();
      for (const p of points) {
        v.copy(p.at).project(camera);
        if (v.z > 1) continue;
        const sx = r.left + ((v.x + 1) / 2) * r.width;
        const sy = r.top + ((1 - v.y) / 2) * r.height;
        if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) (p.scenery ? scenery : pieces).add(p.id);
      }
      return { pieces, scenery, box: { left: x0, top: y0, width: x1 - x0, height: y1 - y0 } };
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY };
      dragging = false;
      const { board, origin } = latest.current;
      points = board.cells().map((c) => {
        const { x, z } = hexToWorld(c.hex, HEX_SIZE);
        return { id: c.pieceId, scenery: false, at: new Vector3(x - origin.x, (c.layer + 1) * LEVEL_HEIGHT, z - origin.z) };
      });
      for (const spot of board.scenery()) {
        const { x, z } = hexToWorld(spot.placement.hex, HEX_SIZE);
        const y = (spot.placement.elevation + 0.5) * LEVEL_HEIGHT;
        points.push({ id: spot.placement.id, scenery: true, at: new Vector3(x - origin.x, y, z - origin.z) });
      }
    };
    const move = (e: PointerEvent) => {
      if (!start) return;
      if (!dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) < BOX_PIXELS) return;
      dragging = true;
      const { pieces, scenery, box } = pick(e.clientX, e.clientY);
      latest.current.onBox(box);
      latest.current.onPick(pieces, scenery, false);
    };
    const up = (e: PointerEvent) => {
      if (start && dragging) {
        const { pieces, scenery } = pick(e.clientX, e.clientY);
        latest.current.onPick(pieces, scenery, true);
        latest.current.onBox(null);
      }
      start = null;
      dragging = false;
    };
    dom.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      dom.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [camera, dom]);
  return null;
}

/** A fresh seed for each random fill. Randomness here only shapes the map being drawn. */
const fillRng = () => new Rng(Math.floor(Math.random() * 2 ** 32));

export function EditorScreen({ initial, onDone }: { initial: MapDefinition | null; onDone: (mapId?: string) => void }) {
  const [history, setHistory] = useState<History>(() => ({ past: [], present: editable(initial), future: [] }));
  const map = history.present;
  const [saved, setSaved] = useState<MapDefinition | null>(() => (initial && !isPremade(initial.id) ? map : null));
  const [origin, setOrigin] = useState(() => boardCenter(buildBoard(map).board));
  const [tool, setTool] = useState<Tool>("piece");
  const [shape, setShape] = useState<ShapeId>("flower7");
  const [terrain, setTerrain] = useState("grass");
  const [rotation, setRotation] = useState(0);
  const [autoLayer, setAutoLayer] = useState(true);
  const [manualLayer, setManualLayer] = useState(0);
  const [sceneryKind, setSceneryKind] = useState(SCENERY[0]!.id);
  const [seat, setSeat] = useState(0);
  const [hoverHex, setHoverHex] = useState<Hex | null>(null);
  const [hoverCell, setHoverCell] = useState<Cell | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);
  /** The cell under the pointer and the side of it nearest the pointer, for Shift placement. */
  const [side, setSide] = useState<{ cell: Cell; origin: Hex; direction: number } | null>(null);
  const [fillLevel, setFillLevel] = useState(2);
  const [problemIndex, setProblemIndex] = useState(-1);
  const [focus, setFocus] = useState<{ point: Vec3; key: number } | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [boxPick, setBoxPick] = useState<{ pieces: Set<string>; scenery: Set<string> } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const { board, issues } = useMemo(() => buildBoard(map), [map]);
  const errors = issues.filter((i) => i.severity === "error");
  const problemPieces = useMemo(
    () => new Set(issues.filter((i) => i.severity === "error" && i.pieceId).map((i) => i.pieceId!)),
    [issues],
  );
  const removable = issues.some(
    (i) => i.severity === "error" && (i.code === "unsupported" || i.code === "overlap" || i.code === "unknownTerrain" || i.sceneryId),
  );
  const stats = mapStats(map, board);
  const playerCounts = board.playerCounts();
  const unsaved = saved !== map;

  const commit = (next: MapDefinition) => {
    setHistory((h) => ({ past: [...h.past, h.present].slice(-100), present: next, future: [] }));
    setStatus(null);
  };
  const undo = () =>
    setHistory((h) => (h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] } : h));
  const redo = () =>
    setHistory((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1) } : h));
  const replace = (next: MapDefinition) => {
    setHistory({ past: [], present: next, future: [] });
    setOrigin(boardCenter(buildBoard(next).board));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "r" || e.key === "R") {
        setRotation((r) => (r + (e.shiftKey ? 5 : 1)) % 6);
      } else if (e.key === "Shift") {
        setShiftHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(false);
    };
    const onBlur = () => setShiftHeld(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // ---- Piece placement preview -----------------------------------------
  // With Shift held over a piece, the new piece goes beside it at the same level, pointing away from it.
  const sideways = tool === "piece" && shiftHeld && side !== null && hoverCell !== null;
  const ghostRotation = sideways ? (rotation + side!.direction) % 6 : rotation;
  const ghostCells =
    tool === "piece" && hoverHex
      ? shapeCells(shape, sideways ? side!.origin : hoverHex, ghostRotation)
      : [];
  const ghostLayer = sideways ? side!.cell.layer : autoLayer ? landingLayer(board, ghostCells) : manualLayer;
  const ghostBlocked = overlappingCells(board, ghostCells, ghostLayer).length > 0;

  const placePiece = (origin: Hex, rot = rotation, fixedLayer?: number) => {
    const cells = shapeCells(shape, origin, rot);
    const layer = fixedLayer ?? (autoLayer ? landingLayer(board, cells) : manualLayer);
    if (overlappingCells(board, cells, layer).length > 0) {
      setStatus("That space is already filled at this level.");
      return;
    }
    commit(addPiece(map, { shape, terrain, origin, rotation: rot, layer }).map);
  };

  const onSurfaceClick = (step: Step, cell: Cell) => {
    switch (tool) {
      case "piece":
        if (shiftHeld && side && side.cell === cell) placePiece(side.origin, (rotation + side.direction) % 6, cell.layer);
        else placePiece(cell.hex);
        break;
      case "scenery":
        if (board.sceneryAt(step.hex, step.elevation)) setStatus("There is already scenery there.");
        else commit(addScenery(map, sceneryKind, step.hex, step.elevation));
        break;
      case "zone":
        commit(toggleZoneHex(map, seat, cell.hex));
        break;
      case "erase":
        commit(removePiece(map, cell.pieceId));
        break;
    }
  };

  // ---- Markers -----------------------------------------------------------
  const markers: Marker[] = [];
  for (const zone of map.startZones) {
    for (const h of zone.hexes) {
      const top = board.topSurface(h);
      if (top) markers.push({ step: { hex: h, elevation: top.elevation }, color: SEAT_COLORS[zone.seat]!, opacity: 0.5 });
    }
  }
  if (hoverCell && tool === "erase" && !box) {
    const piece = board.piece(hoverCell.pieceId);
    if (piece) {
      for (const h of shapeCells(piece.shape, piece.origin, piece.rotation)) {
        markers.push({ step: { hex: h, elevation: piece.layer + 1 }, color: "#ff3b30", opacity: 0.7 });
      }
    }
  }
  if (hoverCell && (tool === "scenery" || tool === "zone")) {
    const top = board.surfaces(hoverCell.hex).find((s) => s.elevation > hoverCell.layer);
    if (top) markers.push({ step: { hex: hoverCell.hex, elevation: top.elevation }, color: "#ffffff", opacity: 0.6 });
  }

  // ---- Problems, fills and box erase -------------------------------------
  const located = errors.map((i) => ({ issue: i, point: problemPoint(board, i) })).filter((p) => p.point !== null);
  const focusedIssue = problemIndex >= 0 ? located[problemIndex % Math.max(located.length, 1)]?.issue : undefined;
  const showNextProblem = () => {
    if (located.length === 0) return;
    const next = (problemIndex + 1) % located.length;
    setProblemIndex(next);
    setFocus({ point: located[next]!.point!, key: Date.now() });
    setStatus(`Problem ${next + 1} of ${located.length}: ${located[next]!.issue.message}`);
  };
  const removeAllProblems = () => {
    const result = removeProblems(map, TERRAIN_TABLE, SCENERY_TABLE);
    if (result.map === map) return;
    commit(result.map);
    setProblemIndex(-1);
    setStatus(
      `Removed ${result.pieces} ${result.pieces === 1 ? "piece" : "pieces"}` +
        (result.scenery > 0 ? ` and ${result.scenery} scenery.` : "."),
    );
  };
  const fillTerrain = () => {
    const result = populateTerrain(map, fillLevel, fillRng(), TERRAIN_TABLE);
    if (result.added === 0) {
      setStatus(
        fillLevel < 2
          ? "Level 1 is the table: lay it out by hand, then fill level 2 and up."
          : `There is no open standard terrain at level ${fillLevel - 1} to build on.`,
      );
      return;
    }
    commit(result.map);
    setStatus(`Added ${result.added} ${result.added === 1 ? "piece" : "pieces"} on level ${fillLevel}.`);
  };
  const fillScenery = () => {
    const result = populateScenery(map, fillLevel, fillRng(), TERRAIN_TABLE, SCENERY_TABLE);
    if (result.added === 0) {
      setStatus(`There is no free standard terrain on level ${fillLevel} with room for scenery.`);
      return;
    }
    commit(result.map);
    setStatus(`Added ${result.added} scenery on level ${fillLevel}.`);
  };
  const onBoxPick = (pieces: Set<string>, scenery: Set<string>, done: boolean) => {
    if (!done) {
      setBoxPick({ pieces, scenery });
      return;
    }
    setBoxPick(null);
    if (pieces.size === 0 && scenery.size === 0) return;
    commit(removeItems(map, pieces, scenery));
    setStatus(
      `Erased ${pieces.size} ${pieces.size === 1 ? "piece" : "pieces"}` +
        (scenery.size > 0 ? ` and ${scenery.size} scenery.` : "."),
    );
  };
  if (boxPick) {
    for (const spot of board.scenery()) {
      if (boxPick.scenery.has(spot.placement.id)) {
        markers.push({ step: { hex: spot.placement.hex, elevation: spot.placement.elevation }, color: "#ff3b30", opacity: 0.8 });
      }
    }
  }
  const fillLevelControl = (
    <div className="control-row">
      <span>Level</span>
      <button type="button" aria-label="Fill level down" onClick={() => setFillLevel((l) => Math.max(1, l - 1))}>
        −
      </button>
      <span aria-live="polite" data-testid="fill-level">
        {fillLevel}
      </span>
      <button
        type="button"
        aria-label="Fill level up"
        onClick={() => setFillLevel((l) => Math.min(MAX_LAYER + 1, l + 1))}
      >
        +
      </button>
    </div>
  );

  // ---- Files -------------------------------------------------------------
  const save = (): boolean => {
    if (map.pieces.length === 0) {
      setStatus("Add some terrain before saving.");
      return false;
    }
    if (!saveCustomMap(map)) {
      setStatus("This browser would not save the map. Export it as a file instead.");
      return false;
    }
    setSaved(map);
    setStatus("Saved to My maps in this browser.");
    return true;
  };

  const importFile = async (file: File) => {
    try {
      let loaded = await readMapFile(file);
      if (isPremade(loaded.id)) loaded = { ...loaded, id: newMapId(loaded.name) };
      replace(loaded);
      setSaved(null);
      setStatus(`Imported "${loaded.name}".`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "That file could not be read.");
    }
  };

  const confirmDiscard = () => !unsaved || window.confirm("Discard the changes you have not saved?");

  const openMap = (id: string) => {
    const source = MAPS.find((m) => m.id === id) ?? customMaps().find((m) => m.id === id);
    if (!source || !confirmDiscard()) return;
    const next = editable(source);
    replace(next);
    setSaved(isPremade(source.id) ? null : next);
  };

  const hoverSurface = hoverCell ? board.surfaces(hoverCell.hex).find((s) => s.elevation > hoverCell.layer) : undefined;

  return (
    <div className="screen editor">
      <Canvas className="canvas" camera={{ position: [0, 30, 34], fov: 45 }} dpr={[1, 2]}>
        <BoardScene
          board={board}
          terrain={TERRAIN_TABLE}
          origin={origin}
          markers={markers}
          onSurfaceClick={onSurfaceClick}
          onSurfaceHover={(_, cell) => {
            setHoverCell(cell);
            if (cell) setHoverHex(cell.hex);
            else setSide(null);
          }}
          onCellPointer={(cell, point) => {
            const next = sidePlacement(cell.hex, point);
            if (side && side.cell === cell && side.direction === next.direction) return;
            setSide({ cell, ...next });
          }}
          leftButton={tool === "erase" ? "select" : "camera"}
          focus={focus}
          onSceneryClick={tool === "erase" ? (spot: ScenerySpot) => commit(removeScenery(map, spot.placement.id)) : undefined}
          ground={{
            onHover: (h) => {
              setHoverHex(h);
              setHoverCell(null);
            },
            onClick: (h) => {
              if (tool === "piece") placePiece(h);
            },
          }}
        >
          {ghostCells.length > 0 && (
            <CellBoxes
              cells={ghostCells.map((h) => ({ hex: h, layer: ghostLayer }))}
              color={ghostBlocked ? "#ff3b30" : (TERRAIN_TABLE.get(terrain)?.color ?? "#ffffff")}
            />
          )}
          <CellBoxes cells={pieceCells(board, problemPieces)} color="#ff9f1c" opacity={0.3} overlay />
          {focusedIssue?.pieceId && (
            <CellBoxes cells={pieceCells(board, [focusedIssue.pieceId])} color="#ff9f1c" opacity={0.75} overlay />
          )}
          {boxPick && <CellBoxes cells={pieceCells(board, boxPick.pieces)} color="#ff3b30" opacity={0.55} overlay />}
        </BoardScene>
        {tool === "erase" && <BoxSelect board={board} origin={origin} onBox={setBox} onPick={onBoxPick} />}
        <TestHook offset={origin} />
      </Canvas>
      {box && (
        <div className="erase-box" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} />
      )}

      <aside className="hud-left editor-tools">
        <section className="panel" aria-label="Tools">
          <div className="segmented tool-tabs" role="tablist" aria-label="Editing tool">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tool === t.id}
                className={tool === t.id ? "on" : ""}
                onClick={() => setTool(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tool === "piece" && (
            <>
              <h2>Piece</h2>
              <div className="shape-grid">
                {SHAPE_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`shape-button ${shape === id ? "on" : ""}`}
                    aria-pressed={shape === id}
                    aria-label={`${SHAPES[id].name} piece`}
                    onClick={() => setShape(id)}
                  >
                    <ShapeIcon shape={id} />
                    <span>{SHAPES[id].name}</span>
                  </button>
                ))}
              </div>
              <h2>Terrain</h2>
              <div className="terrain-grid">
                {TERRAIN.map((t) => (
                  <DelayedTip key={t.id} tip={terrainTip(t)}>
                    {(tip) => (
                      <button
                        type="button"
                        className={`terrain-button ${terrain === t.id ? "on" : ""}`}
                        aria-pressed={terrain === t.id}
                        onClick={() => setTerrain(t.id)}
                        {...tip}
                      >
                        <span className="swatch" style={{ background: t.color }} />
                        {t.name}
                      </button>
                    )}
                  </DelayedTip>
                ))}
              </div>
              <div className="control-row">
                <span>Rotate</span>
                <button type="button" aria-label="Rotate left" onClick={() => setRotation((r) => (r + 5) % 6)}>
                  ⟲
                </button>
                <button type="button" aria-label="Rotate right" onClick={() => setRotation((r) => (r + 1) % 6)}>
                  ⟳
                </button>
                <span className="muted small">R key</span>
              </div>
              <div className="control-row">
                <label>
                  <input type="checkbox" checked={autoLayer} onChange={(e) => setAutoLayer(e.target.checked)} /> Stack on
                  top
                </label>
                {!autoLayer && (
                  <>
                    <button type="button" aria-label="Lower" onClick={() => setManualLayer((l) => Math.max(0, l - 1))}>
                      −
                    </button>
                    <span aria-live="polite">Level {manualLayer + 1}</span>
                    <button type="button" aria-label="Raise" onClick={() => setManualLayer((l) => Math.min(39, l + 1))}>
                      +
                    </button>
                  </>
                )}
              </div>
              <p className="muted small">
                Pieces land on top of whatever is under them. Hold Shift to put a piece beside another at the same
                level; join pieces from one pillar to another to make a bridge.
              </p>
              <h2>Random fill</h2>
              {fillLevelControl}
              <div className="actions">
                <button type="button" onClick={fillTerrain}>
                  Add terrain to level {fillLevel}
                </button>
              </div>
              <p className="muted small">
                Scatters small pieces on standard terrain, matching the terrain under them. Click again for more.
              </p>
            </>
          )}

          {tool === "scenery" && (
            <>
              <h2>Scenery</h2>
              <div className="terrain-grid">
                {SCENERY.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`terrain-button ${sceneryKind === s.id ? "on" : ""}`}
                    aria-pressed={sceneryKind === s.id}
                    onClick={() => setSceneryKind(s.id)}
                  >
                    <span className="swatch" style={{ background: s.color }} />
                    {s.name}
                  </button>
                ))}
              </div>
              <p className="muted small">Click terrain to place. Scenery blocks movement and line of sight.</p>
              <h2>Random fill</h2>
              {fillLevelControl}
              <div className="actions">
                <button type="button" onClick={fillScenery}>
                  Add scenery on level {fillLevel}
                </button>
              </div>
              <p className="muted small">
                Scatters scenery on standard terrain at that level, away from start zones and other scenery.
              </p>
            </>
          )}

          {tool === "zone" && (
            <>
              <h2>Start zone</h2>
              <div className="seat-grid">
                {Array.from({ length: MAX_PLAYERS }, (_, s) => {
                  const size = stats.zones.find((z) => z.seat === s)?.size ?? 0;
                  return (
                    <button
                      key={s}
                      type="button"
                      className={`terrain-button ${seat === s ? "on" : ""}`}
                      aria-pressed={seat === s}
                      onClick={() => setSeat(s)}
                    >
                      <span className="swatch" style={{ background: SEAT_COLORS[s] }} />
                      Zone {s + 1}
                      <span className="muted small">{size} hexes</span>
                    </button>
                  );
                })}
              </div>
              <p className="muted small">
                Click hexes to add them to the zone, or click again to remove. A Basic army of 4 cards can need 16
                hexes; an Advanced army of 600 points up to 32.
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={map.growZones === true}
                  onChange={(e) => commit({ ...map, growZones: e.target.checked })}
                />
                Grow each zone at deployment to fit the army drafted
              </label>
              <div className="actions">
                <button
                  type="button"
                  disabled={map.startZones.length === 0}
                  onClick={() => {
                    commit(clearStartZones(map));
                    setStatus("Start zones cleared.");
                  }}
                >
                  Reset start zones
                </button>
              </div>
              <p className="muted small">
                {map.growZones
                  ? "Zones you draw are the starting point; each one grows into nearby free hexes when its army needs more room."
                  : "Zones are used exactly as drawn, and the draft stops each player at what fits in their zone."}
              </p>
            </>
          )}

          {tool === "erase" && (
            <p className="muted small">
              Click a piece or a piece of scenery to remove it, or drag a box to remove everything in it at every
              level. In this tool the right button turns the camera.
            </p>
          )}

          <div className="actions">
            <button type="button" onClick={undo} disabled={history.past.length === 0}>
              Undo
            </button>
            <button type="button" onClick={redo} disabled={history.future.length === 0}>
              Redo
            </button>
          </div>
          <p className="muted small hover-info">
            {hoverHex ? `Hex ${hexKey(hoverHex)}` : "Point at the table"}
            {hoverSurface ? `, level ${hoverSurface.elevation} ${TERRAIN_TABLE.get(hoverSurface.terrain)?.name.toLowerCase()}` : ""}
            {tool === "piece" && ghostCells.length > 0
              ? sideways
                ? `. Beside it on level ${ghostLayer + 1}`
                : `. Lands on level ${ghostLayer + 1}`
              : ""}
          </p>
        </section>
      </aside>

      <aside className="hud-right editor-side">
        <section className="panel" aria-label="Map details">
          <h2>Map</h2>
          <label className="field">
            Name
            <input
              value={map.name}
              maxLength={48}
              onChange={(e) => setHistory((h) => ({ ...h, present: { ...h.present, name: e.target.value } }))}
            />
          </label>
          <label className="field">
            Description
            <textarea
              rows={2}
              value={map.description}
              maxLength={300}
              onChange={(e) => setHistory((h) => ({ ...h, present: { ...h.present, description: e.target.value } }))}
            />
          </label>
          <p className="muted small">
            {stats.pieces} pieces, {stats.hexes} hexes, highest level {stats.maxElevation}, {stats.scenery} scenery.
            {playerCounts.length > 0
              ? ` Playable by ${playerCounts[0]} to ${playerCounts.at(-1)} players.`
              : " Needs start zones for at least 2 players."}
          </p>
        </section>

        <section className="panel" aria-label="Problems">
          <h2>{errors.length === 0 ? "No problems" : `${errors.length} problem${errors.length === 1 ? "" : "s"}`}</h2>
          {errors.length > 0 && (
            <ul className="issues">
              {errors.slice(0, 6).map((i, n) => (
                <li key={n}>{i.message}</li>
              ))}
              {errors.length > 6 && <li>and {errors.length - 6} more</li>}
            </ul>
          )}
          {errors.length > 0 && (
            <div className="actions">
              <button type="button" onClick={showNextProblem} disabled={located.length === 0}>
                Show next problem
              </button>
              <button type="button" onClick={removeAllProblems} disabled={!removable}>
                Remove problem pieces
              </button>
            </div>
          )}
        </section>

        {map.startZones.length >= MIN_PLAYERS && (
          <section className="panel" aria-label="Start zone layouts">
            <h2>Zones used per player count</h2>
            {Array.from({ length: Math.min(map.startZones.length, MAX_PLAYERS) - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS).map(
              (n) => {
                const current = map.layouts[String(n)] ?? Array.from({ length: n }, (_, k) => k);
                return (
                  <div key={n} className="layout-row">
                    <span className={playerCounts.includes(n) ? "" : "bad"}>{n}p</span>
                    {current.map((z, k) => (
                      <select
                        key={k}
                        aria-label={`${n} players, player ${k + 1} zone`}
                        value={z}
                        onChange={(e) => {
                          const next = [...current];
                          next[k] = Number(e.target.value);
                          const isDefault = next.every((v, j) => v === j);
                          commit(setLayout(map, n, isDefault ? null : next));
                        }}
                      >
                        {map.startZones.map((zone) => (
                          <option key={zone.seat} value={zone.seat}>
                            {zone.seat + 1}
                          </option>
                        ))}
                      </select>
                    ))}
                  </div>
                );
              },
            )}
            <p className="muted small">List zones clockwise so turns go round the table.</p>
          </section>
        )}

        <section className="panel" aria-label="Files">
          <h2>Files</h2>
          <select
            aria-label="Open a map"
            value=""
            onChange={(e) => {
              if (e.target.value) openMap(e.target.value);
            }}
          >
            <option value="">Open a map...</option>
            <optgroup label="Premade maps (opens a copy)">
              {MAPS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="My maps">
              {customMaps().map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          </select>
          <div className="actions">
            <button type="button" onClick={save}>
              Save
            </button>
            <button type="button" onClick={() => downloadMap(map)} disabled={map.pieces.length === 0}>
              Export file
            </button>
            <button type="button" onClick={() => fileInput.current?.click()}>
              Import file
            </button>
            <button
              type="button"
              onClick={() => {
                if (!confirmDiscard()) return;
                replace(editable(null));
                setSaved(null);
              }}
            >
              New
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = "";
              }}
            />
          </div>
          {status && (
            <p className="status" role="status">
              {status}
            </p>
          )}
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={errors.length > 0 || playerCounts.length === 0}
              onClick={() => {
                if (save()) onDone(map.id);
              }}
            >
              Save and play
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirmDiscard()) onDone();
              }}
            >
              Back
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}
