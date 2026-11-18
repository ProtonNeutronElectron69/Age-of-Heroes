import { GLYPHS, glyphEffect } from "@aoh/content";
import {
  glyphProblem,
  summonPlacements,
  type FigurePlacement,
  type GameState,
  type GlyphKind,
  type PlayerId,
  type RulesContext,
} from "@aoh/rules";
import { useState } from "react";
import type { Names } from "../describe";

interface Props {
  state: GameState;
  ctx: RulesContext;
  names: Names;
  /** The players whose held glyphs this screen may show face up. */
  shown: readonly PlayerId[];
  /** The player who may use a glyph now (their turn, on this device, nothing pending), or null. */
  user: PlayerId | null;
  onUse: (glyphId: string, unitId: string, placements?: FigurePlacement[]) => void;
}

function Chip({ kind }: { kind: GlyphKind }) {
  const g = GLYPHS[kind];
  return (
    <span className="glyph-chip" style={{ background: g.color }} aria-hidden>
      {g.mark}
    </span>
  );
}

/**
 * The glyphs off to the side of the board: each player's held glyphs (face up only to their owner),
 * the stat glyphs in play, the curses counting down, and how many still lie on the battlefield.
 */
export function GlyphPanel({ state, ctx, names, shown, user, onUse }: Props) {
  const [choosing, setChoosing] = useState<string | null>(null);
  const glyphs = state.glyphs;
  if (!glyphs) return null;
  const held = state.players.filter((p) => (glyphs.held[p.id]?.length ?? 0) > 0);
  if (glyphs.onBoard.length === 0 && held.length === 0 && glyphs.boosts.length === 0 && glyphs.curses.length === 0) return null;

  /** The units a held glyph may go on now, with the spots for a summoned unit. */
  const targets = (glyphId: string, kind: GlyphKind) =>
    user === null
      ? []
      : state.units.flatMap((u) => {
          if (glyphProblem(state, user, glyphId, u.id, ctx)) return [];
          if (kind !== "summon") return [{ unitId: u.id, placements: undefined as FigurePlacement[] | undefined }];
          const placements = summonPlacements(state, user, u.id, ctx);
          return placements ? [{ unitId: u.id, placements }] : [];
        });

  return (
    <section className="panel glyph-panel" aria-label="Glyphs">
      <h2>Glyphs</h2>
      {glyphs.onBoard.length > 0 && (
        <p className="muted small">
          {glyphs.onBoard.length} face down on the battlefield. End a move on one to pick it up.
        </p>
      )}
      {held.map((p) => {
        const list = glyphs.held[p.id]!;
        const open = shown.includes(p.id);
        return (
          <div key={p.id} className="glyph-held" data-player={p.id}>
            <p className="glyph-owner">
              <span className="swatch" style={{ background: names.playerColor(p.id) }} /> {names.player(p.id)} holds{" "}
              {list.length} {list.length === 1 ? "glyph" : "glyphs"}
            </p>
            {open && (
              <ul className="glyph-list">
                {list.map((h) => {
                  if (!h.kind) return null;
                  const kind = h.kind;
                  const mine = user === p.id;
                  const options = mine ? targets(h.id, kind) : [];
                  return (
                    <li key={h.id} data-glyph={kind}>
                      <div className="glyph-line">
                        <Chip kind={kind} />
                        <strong>{GLYPHS[kind].name}</strong>
                        {mine && (
                          <button
                            type="button"
                            className="glyph-use"
                            aria-expanded={choosing === h.id}
                            disabled={options.length === 0}
                            title={options.length === 0 ? "No unit it can be used on now" : "Choose a unit for it"}
                            onClick={() => setChoosing(choosing === h.id ? null : h.id)}
                          >
                            Use
                          </button>
                        )}
                      </div>
                      <p className="muted small">{glyphEffect(kind, ctx.tuning?.glyphs)}</p>
                      {mine && choosing === h.id && options.length > 0 && (
                        <div className="glyph-targets" role="group" aria-label={`Use ${GLYPHS[kind].name} on`}>
                          {options.map((o) => (
                            <button
                              key={o.unitId}
                              type="button"
                              onClick={() => {
                                setChoosing(null);
                                onUse(h.id, o.unitId, o.placements);
                              }}
                            >
                              {names.unit(o.unitId)}
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
      {glyphs.boosts.length > 0 && (
        <ul className="glyph-list" aria-label="Glyphs in play">
          {glyphs.boosts.map((b) => (
            <li key={b.glyphId} className="glyph-line" data-boost={b.kind}>
              <Chip kind={b.kind} />
              <span>
                {GLYPHS[b.kind].name} on <strong>{names.unit(b.unitId)}</strong>
              </span>
            </li>
          ))}
        </ul>
      )}
      {glyphs.curses.length > 0 && (
        <ul className="glyph-list" aria-label="Curses">
          {glyphs.curses.map((c) => (
            <li key={c.glyphId} className="glyph-line">
              <Chip kind="curse" />
              <span>
                Doom strikes <strong>{names.figure(c.figureId)}</strong> when {names.player(c.player)} ends{" "}
                {c.turnsLeft === 1 ? "a turn" : `${c.turnsLeft} more turns`}.
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
