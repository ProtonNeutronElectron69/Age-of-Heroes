import { MAPS, SCENERY, TERRAIN, TERRAIN_TABLE, buildBoard } from "@aoh/content";
import {
  HEX_SIZE,
  LEVEL_HEIGHT,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SHAPES,
  SHAPE_IDS,
  addPiece,
  addScenery,
  blankMap,
  hexKey,
  hexToWorld,
  landingLayer,
  mapStats,
  overlappingCells,
  removePiece,
  removeScenery,
  setLayout,
  shapeCells,
  toggleZoneHex,
  type Cell,
  type Hex,
  type MapDefinition,
  type ScenerySpot,
  type ShapeId,
  type Step,
} from "@aoh/rules";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { CylinderGeometry } from "three";
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

function Ghost({ cells, layer, color }: { cells: Hex[]; layer: number; color: string }) {
  const geometry = useMemo(
    () => new CylinderGeometry(HEX_SIZE * HEX_GAP, HEX_SIZE * HEX_GAP, LEVEL_HEIGHT, 6),
    [],
  );
  return (
    <>
      {cells.map((h) => {
        const { x, z } = hexToWorld(h, HEX_SIZE);
        return (
          <mesh
            key={hexKey(h)}
            geometry={geometry}
            position={[x, layer * LEVEL_HEIGHT + LEVEL_HEIGHT / 2, z]}
            raycast={() => null}
          >
            <meshStandardMaterial color={color} transparent opacity={0.6} depthWrite={false} />
          </mesh>
        );
      })}
    </>
  );
}

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
  const fileInput = useRef<HTMLInputElement>(null);

  const { board, issues } = useMemo(() => buildBoard(map), [map]);
  const errors = issues.filter((i) => i.severity === "error");
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- Piece placement preview -----------------------------------------
  const ghostCells = tool === "piece" && hoverHex ? shapeCells(shape, hoverHex, rotation) : [];
  const ghostLayer = autoLayer ? landingLayer(board, ghostCells) : manualLayer;
  const ghostBlocked = overlappingCells(board, ghostCells, ghostLayer).length > 0;

  const placePiece = (origin: Hex) => {
    const cells = shapeCells(shape, origin, rotation);
    const layer = autoLayer ? landingLayer(board, cells) : manualLayer;
    if (overlappingCells(board, cells, layer).length > 0) {
      setStatus("That space is already filled at this level.");
      return;
    }
    commit(addPiece(map, { shape, terrain, origin, rotation, layer }).map);
  };

  const onSurfaceClick = (step: Step, cell: Cell) => {
    switch (tool) {
      case "piece":
        placePiece(cell.hex);
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
  if (hoverCell && tool === "erase") {
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
          }}
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
            <Ghost
              cells={ghostCells}
              layer={ghostLayer}
              color={ghostBlocked ? "#ff3b30" : (TERRAIN_TABLE.get(terrain)?.color ?? "#ffffff")}
            />
          )}
        </BoardScene>
        <TestHook offset={origin} />
      </Canvas>

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
                  <button
                    key={t.id}
                    type="button"
                    className={`terrain-button ${terrain === t.id ? "on" : ""}`}
                    aria-pressed={terrain === t.id}
                    onClick={() => setTerrain(t.id)}
                  >
                    <span className="swatch" style={{ background: t.color }} />
                    {t.name}
                  </button>
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
                Pieces land on top of whatever is under them. Lay a piece across two pillars to make a bridge.
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
              <p className="muted small">
                {map.growZones
                  ? "Zones you draw are the starting point; each one grows into nearby free hexes when its army needs more room."
                  : "Zones are used exactly as drawn, and the draft stops each player at what fits in their zone."}
              </p>
            </>
          )}

          {tool === "erase" && <p className="muted small">Click a piece or a piece of scenery to remove it.</p>}

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
            {tool === "piece" && ghostCells.length > 0 ? `. Lands on level ${ghostLayer + 1}` : ""}
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
