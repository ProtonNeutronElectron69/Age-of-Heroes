import { GLYPHS, glyphEffect } from "@aoh/content";
import {
  glyphProblem,
  summonPlacements,
  type GameState,
  type GlyphKind,
  type PlayerId,
  type RulesContext,
} from "@aoh/rules";
import { useState } from "react";
import type { Names } from "../describe";
import { glyphArtUrl } from "./glyphArt";

interface Props {
  state: GameState;
  ctx: RulesContext;
  names: Names;
  /** The players whose held glyphs this screen may show face up. */
  shown: readonly PlayerId[];
  /** The player who may use a glyph now (their turn, on this device, nothing pending), or null. */
  user: PlayerId | null;
  onUse: (glyphId: string, unitId: string) => void;
  /** A Glyph of Resurrection: the player places the unit's figures on the board next. */
  onResurrect: (glyphId: string, unitId: string) => void;
  /** The Glyph of Resurrection whose unit is being placed, if any. */
  resurrecting: string | null;
}

function Chip({ kind }: { kind: GlyphKind }) {
  const g = GLYPHS[kind];
  // The glyph's art where the page can draw it, else its letter.
  const art = glyphArtUrl(kind);
  return (
    <span className="glyph-chip" style={{ background: art ? `${g.color} url(${art}) center / cover` : g.color }} aria-hidden>
      {art ? null : g.mark}
    </span>
  );
}

/**
 * The glyphs off to the side of the board: each player's held glyphs (face up only to their owner),
 * the stat glyphs in play, the curses counting down, and how many still lie on the battlefield.
 */
export function GlyphPanel({ state, ctx, names, shown, user, onUse, onResurrect, resurrecting }: Props) {
  const [choosing, setChoosing] = useState<string | null>(null);
  const glyphs = state.glyphs;
  if (!glyphs) return null;
  const held = state.players.filter((p) => (glyphs.held[p.id]?.length ?? 0) > 0);
  if (glyphs.onBoard.length === 0 && held.length === 0 && glyphs.boosts.length === 0 && glyphs.curses.length === 0) return null;

  /** The units a held glyph may go on now; a unit to resurrect needs room for all its figures. */
  const targets = (glyphId: string, kind: GlyphKind) =>
    user === null
      ? []
      : state.units.filter(
          (u) => !glyphProblem(state, user, glyphId, u.id, ctx) && (kind !== "summon" || summonPlacements(state, user, u.id, ctx) !== null),
        );

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
                            disabled={options.length === 0 || resurrecting !== null}
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
                          {options.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => {
                                setChoosing(null);
                                if (kind === "summon") onResurrect(h.id, u.id);
                                else onUse(h.id, u.id);
                              }}
                            >
                              {names.unit(u.id)}
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
