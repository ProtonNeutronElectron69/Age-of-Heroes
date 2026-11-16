import { HEX_SIZE, LEVEL_HEIGHT, hexToWorld, playerZone, type GameState, type RulesContext } from "@aoh/rules";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import { Vector3 } from "three";
import { BoardScene, boardCenter, type Marker } from "../scene/BoardScene";
import { tableRoom } from "../scene/Table";
import { TestHook } from "../scene/TestHook";
import { useDisplay } from "../settings";
import { HexTip, useHexTip, zoneOwners } from "../ui/HexTip";
import { PingInput, Pings, useOnlinePings } from "../scene/Pings";

/**
 * The battlefield during the draft: the map with every player's start zone in
 * their colour and name, to plan an army around. The camera moves as it does in play,
 * and a middle click on a hex shows its terrain.
 */
/** A start zone's label: its player, over the middle of the zone. */
interface ZoneLabel {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly at: { readonly x: number; readonly y: number; readonly z: number };
}

/**
 * Keeps each zone label over its zone: placed by hand in the frames that are
 * drawn, as the figure labels are, so no label needs a scene object of its own.
 */
function ZoneLabelPlacer({ labels, layer, center }: { labels: readonly ZoneLabel[]; layer: RefObject<HTMLDivElement | null>; center: { x: number; z: number } }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const v = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const el = layer.current;
    if (!el) return;
    labels.forEach((label, i) => {
      const tag = el.children[i] as HTMLElement | undefined;
      if (!tag) return;
      v.set(label.at.x - center.x, label.at.y, label.at.z - center.z).project(camera);
      const shown = v.z < 1;
      tag.style.visibility = shown ? "visible" : "hidden";
      if (shown) tag.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -100%)`;
    });
  });
  return null;
}

export function DraftMap({
  state,
  ctx,
  me = null,
}: {
  state: GameState;
  ctx: RulesContext;
  /** Online: this device's player, who can ping the map with P. Null for hot-seat and spectators. */
  me?: string | null;
}) {
  const board = ctx.board;
  const display = useDisplay();
  const center = useMemo(() => boardCenter(board), [board]);
  const markers = useMemo<Marker[]>(
    () =>
      state.players.flatMap((p) =>
        // A figure may deploy on any surface of a zone hex with room to stand, under a bridge too.
        playerZone(state, p.id, ctx).flatMap((h) =>
          board
            .surfaces(h)
            .filter((s) => s.clearance >= 1)
            .map((s) => ({ step: { hex: h, elevation: s.elevation }, color: p.color, opacity: 0.75 })),
        ),
      ),
    [state.players, state.zones, ctx, board],
  );
  const labels = useMemo<ZoneLabel[]>(
    () =>
      state.players.flatMap((p) => {
        const spots = playerZone(state, p.id, ctx).flatMap((h) => {
          const top = board.topSurface(h);
          return top ? [{ ...hexToWorld(h, HEX_SIZE), y: top.elevation * LEVEL_HEIGHT }] : [];
        });
        if (spots.length === 0) return [];
        const at = {
          x: spots.reduce((n, s) => n + s.x, 0) / spots.length,
          y: Math.max(...spots.map((s) => s.y)) + LEVEL_HEIGHT,
          z: spots.reduce((n, s) => n + s.z, 0) / spots.length,
        };
        return [{ id: p.id, name: p.name, color: p.color, at }];
      }),
    [state.players, state.zones, ctx, board],
  );
  const layer = useRef<HTMLDivElement>(null);
  const zones = useMemo(() => zoneOwners(state, ctx), [state.players, state.zones, ctx]);
  const [tip, setTip] = useHexTip();
  // Online, every player on the map sees everyone's pings.
  const { pings, ping } = useOnlinePings(me, (player) => state.players.find((p) => p.id === player)?.color ?? "#999");
  return (
    <section className="draft-map" aria-label="Battlefield">
      <Canvas
        className="canvas"
        frameloop="demand"
        // Looking at the middle of the board: nothing covers this canvas, unlike the play screen's.
        camera={{ position: [0, center.span * 0.72, center.span * 0.8], fov: 45 }}
        dpr={[1, 2]}
      >
        <BoardScene
          board={board}
          terrain={ctx.terrain}
          origin={center}
          markers={markers}
          backdrop={tableRoom(display.table)}
          onInspect={setTip}
        >
          <Pings pings={pings} center={center} />
        </BoardScene>
        <PingInput enabled={me !== null} center={center} onPing={ping} />
        <ZoneLabelPlacer labels={labels} layer={layer} center={center} />
        <TestHook offset={center} />
      </Canvas>
      <div ref={layer} className="zone-labels" aria-hidden="true">
        {labels.map((l) => (
          <span key={l.id} className="zone-label" style={{ borderColor: l.color }}>
            <span className="swatch" style={{ background: l.color }} />
            {l.name}
          </span>
        ))}
      </div>
      <p className="draft-map-hint">
        Each player's start zone is marked in their colour. Drag to turn the board, right-drag or WASD to move it, and the
        wheel zooms. Middle-click a hex to read its terrain.{me !== null ? " P points at the spot under the pointer for everyone." : ""}
      </p>
      <HexTip tip={tip} board={board} terrain={ctx.terrain} zones={zones} onClose={() => setTip(null)} />
    </section>
  );
}
