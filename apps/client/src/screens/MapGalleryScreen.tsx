import { MAPS, SEAT_COLORS, SEAT_COLOR_NAMES, TERRAIN, buildBoard, contextFor } from "@aoh/content";
import type { MapDefinition } from "@aoh/rules";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import { customMaps } from "../maps";
import { BoardScene, boardCenter, type Marker } from "../scene/BoardScene";
import { tableRoom } from "../scene/Table";
import { TestHook } from "../scene/TestHook";
import { useDisplay } from "../settings";
import { HexTip, useHexTip } from "../ui/HexTip";
import "./map-gallery.css";

const TERRAIN_NAMES = new Map(TERRAIN.map((t) => [t.id, t.name]));

/** What a map holds, for the panel beside its preview. */
function mapFacts(map: MapDefinition) {
  const { board } = buildBoard(map);
  const hexes = board.hexes();
  const tops = new Map<string, number>();
  for (const h of hexes) {
    const top = board.topSurface(h);
    if (top) tops.set(top.terrain, (tops.get(top.terrain) ?? 0) + 1);
  }
  const terrain = [...tops].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ name: TERRAIN_NAMES.get(id) ?? id, share: Math.round((100 * n) / Math.max(1, hexes.length)) }));
  return { board, hexes: hexes.length, levels: board.maxElevation(), scenery: board.scenery().length, counts: board.playerCounts(), terrain };
}

/**
 * The map gallery: every battlefield, premade and the player's own, to look round in 3D before
 * choosing one. Each start zone shows in the colour of the seat that would take it, for the
 * number of players picked. The camera turns, pans and zooms as on the board in play, and a
 * middle click on a hex says what it is.
 */
export function MapGalleryScreen({ initialMapId, onChoose, onClose }: { initialMapId?: string; onChoose: (mapId: string) => void; onClose: () => void }) {
  const maps = useMemo(() => [...MAPS, ...customMaps()], []);
  const [mapId, setMapId] = useState(() => (maps.some((m) => m.id === initialMapId) ? initialMapId! : maps[0]!.id));
  const map = maps.find((m) => m.id === mapId) ?? maps[0]!;
  const facts = useMemo(() => mapFacts(map), [map]);
  const ctx = useMemo(() => contextFor(map).ctx, [map]);
  const [chosenPlayers, setPlayers] = useState<number | null>(null);
  const players = chosenPlayers !== null && facts.counts.includes(chosenPlayers) ? chosenPlayers : (facts.counts[0] ?? 0);
  const center = useMemo(() => boardCenter(facts.board), [facts.board]);
  const markers = useMemo<Marker[]>(
    () =>
      Array.from({ length: players }, (_, seat) =>
        facts.board.startZone(facts.board.zoneFor(seat, players)).flatMap((h) =>
          facts.board
            .surfaces(h)
            .filter((s) => s.clearance >= 1)
            .map((s) => ({ step: { hex: h, elevation: s.elevation }, color: SEAT_COLORS[seat]!, opacity: 0.7 })),
        ),
      ).flat(),
    [facts.board, players],
  );
  const display = useDisplay();
  const [tip, setTip] = useHexTip();
  const premade = (m: MapDefinition) => MAPS.some((p) => p.id === m.id);

  return (
    <div className="map-gallery">
      <header className="mg-head">
        <h1>Maps</h1>
        <p className="muted">Look round each battlefield before you choose it. Drag to turn, right drag or WASD to move, scroll to zoom; middle click a hex to read it.</p>
        <button type="button" onClick={onClose}>
          Back
        </button>
      </header>
      <nav className="mg-list" aria-label="Maps">
        <ul>
          {maps.map((m) => (
            <li key={m.id}>
              <button type="button" className={m.id === map.id ? "on" : ""} aria-pressed={m.id === map.id} data-map={m.id} onClick={() => setMapId(m.id)}>
                <b>{m.name}</b>
                <small>{premade(m) ? "Premade" : "My map"}</small>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <section className="mg-view" aria-label={`${map.name} preview`}>
        <Canvas key={map.id} className="canvas" frameloop="demand" camera={{ position: [0, center.span * 0.72, center.span * 0.8], fov: 45 }} dpr={[1, 2]}>
          <BoardScene board={facts.board} terrain={ctx.terrain} origin={center} markers={markers} backdrop={tableRoom(display.table)} onInspect={setTip} />
          <TestHook offset={center} />
        </Canvas>
        <HexTip tip={tip} board={facts.board} terrain={ctx.terrain} onClose={() => setTip(null)} />
      </section>
      <aside className="mg-info" aria-label="About this map">
        <h2>{map.name}</h2>
        <p>{map.description || "No description."}</p>
        <dl>
          <dt>Players</dt>
          <dd>{facts.counts.length === 0 ? "No start zones" : facts.counts.length > 1 ? `${facts.counts[0]} to ${facts.counts[facts.counts.length - 1]}` : facts.counts[0]}</dd>
          <dt>Size</dt>
          <dd>{facts.hexes} hexes, up to {facts.levels} levels high</dd>
          <dt>Scenery</dt>
          <dd>{facts.scenery === 0 ? "None" : `${facts.scenery} pieces`}</dd>
          <dt>Ground</dt>
          <dd>{facts.terrain.slice(0, 5).map((t) => `${t.name} ${t.share}%`).join(", ")}</dd>
        </dl>
        {facts.counts.length > 0 && (
          <div className="mg-zones">
            <h3>Start zones for</h3>
            <div role="radiogroup" aria-label="Start zones for">
              {facts.counts.map((n) => (
                <button key={n} type="button" role="radio" aria-checked={n === players} className={n === players ? "on" : ""} onClick={() => setPlayers(n)}>
                  {n} players
                </button>
              ))}
            </div>
            <ul className="mg-seats">
              {Array.from({ length: players }, (_, seat) => (
                <li key={seat}>
                  <span className="swatch" style={{ background: SEAT_COLORS[seat] }} /> {SEAT_COLOR_NAMES[seat]}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button type="button" className="primary" onClick={() => onChoose(map.id)}>
          Play on this map
        </button>
      </aside>
    </div>
  );
}
