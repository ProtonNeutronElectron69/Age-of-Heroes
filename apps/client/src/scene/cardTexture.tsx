import type { UnitCard } from "@aoh/rules";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { CanvasTexture, SRGBColorSpace, type Texture } from "three";
import { factionTheme } from "../ui/factionThemes";
import { HexCard } from "../ui/HexCard";

/**
 * A unit card as a picture for the 3D table. The card is the same drawing the
 * screens show (`HexCard`), painted once into a canvas. Its name and ability
 * names are set as plain lettering, since a picture cannot use the page's fonts
 * or fitted text; the rules text is left for the card shown beside the board.
 */

/** The card drawing's box, in card units (see `HexCard`), and how many pixels a unit gets. */
export const CARD_BOX = { x: -6, y: -6, width: 532, height: 512 } as const;
const PIXELS = 1.5;

const cache = new Map<string, Promise<Texture>>();

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Lettering for the name banner and the rules panel. */
function lettering(card: UnitCard): string {
  const t = factionTheme(card.faction);
  const comma = card.name.indexOf(", ");
  const title = comma < 0 ? card.name : card.name.slice(0, comma);
  const epithet = comma < 0 ? null : card.name.slice(comma + 2);
  // The banner is 146 wide; long names are squeezed to fit.
  const fit = (text: string, size: number) => (text.length * size * 0.62 > 140 ? ` textLength="140" lengthAdjust="spacingAndGlyphs"` : "");
  const out = [
    `<text x="176" y="${epithet ? 88 : 96}" font-size="17" font-weight="700" text-anchor="middle" fill="${t.onPrimary}"${fit(title, 17)}>${escape(title)}</text>`,
  ];
  if (epithet) {
    out.push(`<text x="176" y="106" font-size="11" font-weight="600" text-anchor="middle" fill="${t.onPrimary}" fill-opacity="0.9"${fit(epithet, 11)}>${escape(epithet)}</text>`);
  }
  card.abilities.forEach((a, i) => {
    const name = a.name.toUpperCase();
    out.push(
      `<text x="134" y="${172 + i * 30}" font-size="11.5" font-weight="700" fill="${t.heading}"${name.length * 7.6 > 116 ? ` textLength="116" lengthAdjust="spacingAndGlyphs"` : ""}>${escape(name)}</text>`,
      `<path d="M134,${180 + i * 30} H250 M134,${186 + i * 30} H232" stroke="${t.ink}" stroke-opacity="0.28" stroke-width="1.6"/>`,
    );
  });
  return out.join("");
}

/**
 * Cards are painted one at a time, with a pause after each, so a table full of
 * cards does not hold up the board's first frames or the rest of the page.
 */
let queue: Promise<unknown> = Promise.resolve();
const PAUSE_MS = 30;

function paint(card: UnitCard, ownerColor: string): Promise<Texture> {
  const painted = queue.then(() => paintNow(card, ownerColor));
  queue = painted.then(
    () => undefined,
    () => undefined,
  );
  return painted;
}

function paintNow(card: UnitCard, ownerColor: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    // Outside React's own work, so drawing the card at once is allowed.
    window.setTimeout(() => {
      try {
        const holder = document.createElement("div");
        const root = createRoot(holder);
        flushSync(() => root.render(<HexCard card={card} ownerColor={ownerColor} />));
        const svg = holder.querySelector("svg");
        if (!svg) throw new Error("The card did not draw");
        svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        svg.setAttribute("width", String(CARD_BOX.width * PIXELS));
        svg.setAttribute("height", String(CARD_BOX.height * PIXELS));
        const markup = new XMLSerializer()
          .serializeToString(svg)
          .replace(/<\/svg>\s*$/, `<style>text{font-family:Georgia,"Times New Roman",serif}</style>${lettering(card)}</svg>`);
        root.unmount();
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = CARD_BOX.width * PIXELS;
          canvas.height = CARD_BOX.height * PIXELS;
          canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
          const texture = new CanvasTexture(canvas);
          texture.colorSpace = SRGBColorSpace;
          texture.anisotropy = 4;
          resolve(texture);
        };
        image.onerror = () => reject(new Error(`The card picture for ${card.id} did not load`));
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
      } catch (e) {
        reject(e as Error);
      }
    }, PAUSE_MS);
  });
}

/** The picture of a card with its owner's colour on the token disc. Painted once and kept for the visit. */
export function cardTexture(card: UnitCard, ownerColor: string): Promise<Texture> {
  const key = `${card.id}|${ownerColor}`;
  let found = cache.get(key);
  if (!found) {
    found = paint(card, ownerColor);
    cache.set(key, found);
  }
  return found;
}
