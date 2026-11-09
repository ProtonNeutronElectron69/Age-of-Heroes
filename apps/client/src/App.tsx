import { MAPS, TERRAIN, TERRAIN_TABLE } from "@aoh/content";
import { Board, SHAPES, hexKey, type Cell, type TerrainRules } from "@aoh/rules";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import { BoardScene } from "./scene/BoardScene";
import { SEAT_COLORS } from "./scene/scale";
import { DicePanel } from "./ui/DicePanel";

function describeEffect(t: TerrainRules): string {
  const parts: string[] = [];
  if (t.stopGroup) parts.push("stops movement on entry");
  if (t.moveCost && t.moveCost !== 1) parts.push(`${t.moveCost} move per hex`);
  if (t.endTurnSelfAttack) parts.push(`end turn here: ${t.endTurnSelfAttack.attackDice} attack die vs ${t.endTurnSelfAttack.defenseDice} defense`);
  if (t.entryDestroyOnOrBelow) parts.push(`d20 on entry, destroyed on 1 to ${t.entryDestroyOnOrBelow}`);
  if (t.slip) parts.push(`d20 on entry, slip on 1 to ${t.slip.onOrBelow}`);
  if (t.stayOnBonusMove) parts.push(`+${t.stayOnBonusMove} move if the whole turn is on road`);
  return parts.join("; ");
}

export function App() {
  const map = MAPS[0]!;
  const { board, issues } = useMemo(() => Board.fromMap(map, TERRAIN_TABLE), [map]);
  const [hovered, setHovered] = useState<Cell | null>(null);

  const hoverInfo = useMemo(() => {
    if (!hovered) return null;
    const surfaces = board.surfaces(hovered.hex);
    const piece = board.piece(hovered.pieceId);
    return { surfaces, piece };
  }, [board, hovered]);

  return (
    <div className="app">
      <Canvas className="canvas" camera={{ position: [-5, 27, 30], fov: 45 }} dpr={[1, 2]}>
        <BoardScene board={board} terrain={TERRAIN_TABLE} hovered={hovered} onHover={setHovered} />
      </Canvas>

      <aside className="hud">
        <header className="panel">
          <h1>Age of Heroes</h1>
          <p className="muted">Phase 0 preview: map model, terrain and rules engine.</p>
          <p className="map-name">{map.name}</p>
          <p className="muted small">{map.description}</p>
          {issues.length > 0 && (
            <ul className="issues">
              {issues.map((i, n) => (
                <li key={n}>{i.message}</li>
              ))}
            </ul>
          )}
        </header>

        <section className="panel">
          <h2>Hex</h2>
          {hovered && hoverInfo ? (
            <dl className="facts">
              <dt>Position</dt>
              <dd>{hexKey(hovered.hex)}</dd>
              {hoverInfo.surfaces.map((s) => (
                <div key={s.elevation} className="fact-row">
                  <dt>Level {s.elevation}</dt>
                  <dd>
                    {TERRAIN_TABLE.get(s.terrain)?.name ?? s.terrain}
                    {Number.isFinite(s.clearance) ? `, ${s.clearance} levels of room above` : ""}
                  </dd>
                </div>
              ))}
              <dt>Under cursor</dt>
              <dd>
                {TERRAIN_TABLE.get(hovered.terrain)?.name ?? hovered.terrain} block at level {hovered.layer + 1}, part of
                a {hoverInfo.piece ? SHAPES[hoverInfo.piece.shape].name : "?"} piece
              </dd>
            </dl>
          ) : (
            <p className="muted small">Point at a hex to inspect it.</p>
          )}
        </section>

        <DicePanel />

        <section className="panel">
          <h2>Terrain</h2>
          <ul className="legend">
            {TERRAIN.map((t) => (
              <li key={t.id}>
                <span className="swatch" style={{ background: t.color }} />
                <span>
                  <strong>{t.name}</strong>
                  {t.category === "special" && <span className="muted small"> {describeEffect(t)}</span>}
                </span>
              </li>
            ))}
          </ul>
          <h2>Start zones</h2>
          <ul className="seats">
            {map.startZones.map((z) => (
              <li key={z.seat}>
                <span className="swatch" style={{ background: SEAT_COLORS[z.seat] }} /> Seat {z.seat + 1}
              </li>
            ))}
          </ul>
        </section>

        <p className="muted small hint">Drag to rotate, right-drag to pan, scroll to zoom.</p>
      </aside>
    </div>
  );
}
