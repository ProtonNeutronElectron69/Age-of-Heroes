import { type KeyboardEvent, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** One map the picker offers. */
export interface MapChoice {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** The player counts the map hosts. */
  readonly counts: readonly number[];
  /** A map made in the editor and kept in this browser. */
  readonly mine: boolean;
}

interface Props {
  readonly choices: readonly MapChoice[];
  readonly value: string;
  readonly onChange: (id: string) => void;
  /** The number of players chosen, if any: maps that cannot host it are dimmed (still choosable). */
  readonly players: number | null;
}

/** "2 players", "2 to 6 players". */
export function playersText(counts: readonly number[]): string {
  if (counts.length === 0) return "no players";
  return counts.length > 1 ? `${counts[0]} to ${counts[counts.length - 1]} players` : `${counts[0]} players`;
}

function Thumb({ choice }: { choice: MapChoice }): ReactNode {
  return <span className={`mp-mhex${choice.mine ? " mp-mhex-mine" : ` m-${choice.id}`}`} aria-hidden="true" />;
}

/** Where the open list goes: under the button, or above it when there is more room there. */
interface Place {
  readonly left: number;
  readonly width: number;
  readonly top?: number;
  readonly bottom?: number;
  readonly maxHeight: number;
}

/**
 * The Battlefield choice on the main menu: a button showing the chosen map that opens a list of
 * every map (premade first, then the player's own), styled by the menu style. It follows the
 * select-only combobox pattern: focus stays on the button, the arrow keys move through the list,
 * Enter or Space chooses, Escape closes, and typing jumps to a map by name.
 */
export function MapPicker({ choices, value, onChange, players }: Props): ReactNode {
  const id = useId();
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-opt-${i}`;
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<Place | null>(null);
  const typed = useRef({ text: "", at: 0 });
  const chosen = Math.max(0, choices.findIndex((c) => c.id === value));
  const current = choices[chosen];
  const dimmed = (c: MapChoice) => players !== null && !c.counts.includes(players);
  const stage = () => button.current?.closest<HTMLElement>(".menu-stage") ?? null;

  const show = (at: number) => {
    setActive(at);
    setOpen(true);
  };
  const close = (focus = true) => {
    setOpen(false);
    if (focus) button.current?.focus();
  };
  const choose = (i: number) => {
    const c = choices[i];
    if (c) onChange(c.id);
    close();
  };

  // Place the list on the menu's stage (which may be scaled) under the button, within the stage.
  useLayoutEffect(() => {
    if (!open) return;
    const b = button.current;
    const s = stage();
    if (!b || !s) return;
    const sr = s.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    const scale = sr.width / s.offsetWidth || 1;
    const left = (br.left - sr.left) / scale;
    const width = Math.max(br.width / scale, 300);
    const below = (sr.bottom - br.bottom) / scale - 12;
    const above = (br.top - sr.top) / scale - 12;
    const clampedLeft = Math.min(left, s.offsetWidth - width - 8);
    if (below >= 220 || below >= above) setPlace({ left: clampedLeft, width, top: (br.bottom - sr.top) / scale + 4, maxHeight: below });
    else setPlace({ left: clampedLeft, width, bottom: (sr.bottom - br.top) / scale + 4, maxHeight: above });
  }, [open]);

  // Close when the pointer goes down anywhere else, or the window changes size.
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !button.current?.contains(t)) close(false);
    };
    const resize = () => close(false);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("resize", resize);
    };
  }, [open]);

  // Keep the active option in view.
  useEffect(() => {
    if (open) list.current?.querySelector(`#${CSS.escape(optionId(active))}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, place]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = choices.length - 1;
    const move = (to: number) => {
      e.preventDefault();
      if (!open) show(to);
      else setActive(Math.max(0, Math.min(last, to)));
    };
    switch (e.key) {
      case "ArrowDown":
        return move(open ? active + 1 : chosen);
      case "ArrowUp":
        return move(open ? active - 1 : chosen);
      case "Home":
        return open ? move(0) : undefined;
      case "End":
        return open ? move(last) : undefined;
      case "PageDown":
        return open ? move(active + 5) : undefined;
      case "PageUp":
        return open ? move(active - 5) : undefined;
      case "Enter":
      case " ":
        e.preventDefault();
        return open ? choose(active) : show(chosen);
      case "Escape":
        if (open) {
          e.preventDefault();
          close();
        }
        return;
      case "Tab":
        if (open) close(false);
        return;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          // Type to jump: letters typed close together build up a name to match.
          const now = performance.now();
          const text = (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase();
          typed.current = { text, at: now };
          const from = open ? active : chosen;
          const order = [...choices.keys()].map((k) => (from + (text.length === 1 ? 1 : 0) + k) % choices.length);
          const hit = order.find((k) => choices[k]!.name.toLowerCase().startsWith(text));
          if (hit !== undefined) {
            e.preventDefault();
            if (open) setActive(hit);
            else onChange(choices[hit]!.id);
          }
        }
    }
  };

  const premade = choices.filter((c) => !c.mine);
  const option = (c: MapChoice) => {
    const i = choices.indexOf(c);
    const dim = dimmed(c);
    return (
      <div
        key={c.id}
        id={optionId(i)}
        role="option"
        aria-selected={i === chosen}
        aria-describedby={dim ? `${id}-dim` : undefined}
        data-map={c.id}
        className={`mp-pick-opt${i === active ? " active" : ""}${i === chosen ? " on" : ""}${dim ? " dim" : ""}`}
        onPointerEnter={() => setActive(i)}
        onClick={() => choose(i)}
      >
        <Thumb choice={c} />
        <span className="mp-pick-text">
          <b>{c.name}</b>
          <small>
            {playersText(c.counts)}
            {dim && players !== null ? `, not ${players}` : ""}
          </small>
          {c.description && <span className="mp-pick-desc">{c.description}</span>}
        </span>
      </div>
    );
  };

  const popup =
    open && place ? (
      <div
        ref={list}
        id={listId}
        role="listbox"
        aria-label="Maps"
        className="mp-pick-list"
        style={{ left: place.left, width: place.width, top: place.top, bottom: place.bottom, maxHeight: place.maxHeight }}
      >
        <span id={`${id}-dim`} hidden>
          {players !== null ? `This map does not host ${players} players.` : ""}
        </span>
        {premade.map(option)}
        {choices.length > premade.length && (
          <div role="group" aria-label="My maps" className="mp-pick-group">
            <div className="mp-pick-head" aria-hidden="true">
              My maps
            </div>
            {choices.filter((c) => c.mine).map(option)}
          </div>
        )}
      </div>
    ) : null;
  const target = open ? stage() : null;

  return (
    <>
      <button
        ref={button}
        type="button"
        role="combobox"
        aria-label="Map"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(active) : undefined}
        className={`mp-pick${open ? " open" : ""}`}
        onClick={() => (open ? close() : show(chosen))}
        onKeyDown={onKey}
      >
        {current && <Thumb choice={current} />}
        <span className="mp-pick-text">
          <b>{current?.name}</b>
          <small>{current ? playersText(current.counts) : ""}</small>
        </span>
        <span className="mp-pick-arrow" aria-hidden="true" />
      </button>
      {popup && (target ? createPortal(popup, target) : popup)}
    </>
  );
}
