# Age of Heroes: Adding Content

How to add units, abilities and maps, and the rules the tests enforce. Everything here must be **original**: no names, characters, card text or stat lines copied from existing games.

## Units

Units are JSON in `packages/content/src/cards/` (`starter.json`, `legends.json`, `reinforcements.json`, `hive.json`; a new drop can be a new file added to `cards.ts`). Each card is validated by `unitCardSchema` in `packages/rules/src/schema.ts`.

```jsonc
{
  "id": "silverlance-knights",          // unique, kebab-case
  "name": "Silverlance Knights",
  "tokenLabel": "SK",                   // 1 to 3 characters, unique across the roster
  "faction": "Dawnhold Covenant",
  "unitType": "commonSquad",            // uniqueHero | commonHero | uniqueSquad | commonSquad
  "figureCount": 3,                     // 1 for heroes; 2 to 4 for squads
  "species": "Human",                   // tags abilities can refer to (Elf, Undead, Oni...)
  "unitClass": "Knight",
  "personality": "Valiant",             // Disciplined squads benefit from Rally the Line
  "size": "medium",                     // small | medium | large | huge
  "height": 5,                          // in terrain levels
  "footprint": "1",                     // 1 | 2x1 | 3x1 | 2x2
  "life": 2, "move": 5, "range": 1, "attack": 3, "defense": 3, "points": 140,
  "abilities": [
    { "id": "charge", "name": "Charge", "text": "A Knight that has moved this turn rolls 1 extra attack die when it attacks an adjacent enemy.", "params": { "bonus": 1 } }
  ]
}
```

Rules the content tests enforce (`packages/content/test`):
- **Abilities:** every squad has exactly 1 special ability and every hero exactly 2. Flying comes on top and does not count. No repeats on a card, and every ability id must be implemented by the engine.
- **Life:** heroes have 2 to 8. Squads have 1 to 3: most have 2, and only squads of 2 or 3 figures may have 3. Keep 1 Life for the most fragile squads (low Defense, many cheap figures).
- **Squad size:** keep squads to 4 figures or fewer. A test checks that a 4-card army of the largest squad fits in every start zone of every map.
- **Labels and ids:** token labels and ids are unique.
- **Multi-hex units:** every multi-hex unit must be able to deploy in every start zone of every map.
- **Points:** every unit's points must be within 0.7 to 1.3 of what the balance model suggests. Aim for about 1.0. Run `BALANCE_REPORT=1 pnpm test balance --silent=false` (the test runner hides the table without `--silent=false`) and set points near the "Fair" column, rounded to 5. Adding units shifts the scale a little for everyone, so check the whole table.
- **Roster shape:** the test currently expects 56 units in 7 factions of 8. Heroes and squads, and ranged and melee units, should each stay within about 60/40 of each other (the test allows 35% to 65%), and every faction must have heroes, squads, ranged and melee units. Update the expected counts in `content.test.ts`, and the card counts in the `models` and `gallery` browser tests (`apps/client/e2e`), when the roster grows.
- **Card colours:** a new faction needs a colour theme and an emblem in `apps/client/src/ui/factionThemes.ts` (emblem glyphs are in `hexCardArt.tsx`); without one its cards are grey. Open the game with `?cards` in the address to check how a new card looks: the name and rules text shrink to fit, so very long text ends up small.
- **Unit art:** a unit's drawing goes in its faction's file in `apps/client/src/ui/art/drawings/`, under the card's id. A figure is a list of shapes in a box 200 wide and 250 tall, feet on y = 244, drawn back to front; each shape has a role (armour, cloth, blade and so on) that picks its colour, and `tint` overrides colours for one figure. Use the helpers in `build.ts` (`arm`, `leg`, `torso`, `limb`, `pts`) rather than writing paths by hand where you can. The hit zone picture paints the drawing's body red and its gear grey, so wrap in `held()` what the unit's model counts as gear: anything the figure holds (weapons, shields, staffs, books), plus the few small pieces the model itself marks as gear, such as some plumes. Worn things (coats, capes, quivers, packs) are body. A test checks that every figure of a unit whose model holds gear draws some. Use `solo` for a hero and `squad` for a squad; `squad` arranges the figures to fit the card's art window. Give `solo` the figure's `span` when it reaches far to the side, so it still fits that narrow window, and give a flying figure a `hover` height. Soldiers aiming a long gun can use the shared `STANDING_AIM` and `KNEELING_AIM` stances, and a squad of unusual shapes, such as beasts, can pass `squad` its own figure positions. Check the result with `?cards=` and the unit's id. Every unit needs a drawing: the full-game browser test fails if a card in the draft has none.
- **Figure model:** a unit's 3D model goes in its faction's file in `apps/client/src/models/units/`, under the card's id (see below). Units without one are drawn as tokens, on the board too.

Conventions:
- **Ability text:** write it with the unit's name, in plain words. Numbers in the text must match `params`.
- **Reusing a rule:** to reuse an existing rule under a new name, keep the `id` and change `name` and `text`. Then add the mapping to the list under the abilities table in [RULES.md](RULES.md).

## Figure models

A model is built in code from a few solid shapes, with the helpers in `apps/client/src/models/build.ts`. Stage 1 is the unit's size and shape in one colour, about 1,000 triangles a figure, on a light brown base whose rim carries a second colour.

- **Shape:** write the figure facing +z with its feet on y = 0 and its left at +x, in any units; finish with `figure(parts, height)`, which stands it on its base and sizes it so that body and base together are as tall as the card's Height. The lowest point of the model always rests on the base. Put a figure that flies or hovers on a flight stand (`flightStand` in `gear.ts`), as tabletop miniatures do; the stand does not count towards its Height or its fit. Use `human` (`human.ts`) for anything on two legs: give it where the hands and feet are and it works out the elbows and knees; `hollow` gives a machine an open frame for a chest. `horse` (`horse.ts`) is a mount. `spine` sweeps a body along a line (a torso, a neck, a tail), `limb` joins two points, `plate` cuts a flat shape (a blade, a hat brim), and `both` mirrors a part to the other side.
- **Gear:** wrap what the figure holds in `gear(...)`: weapons, and slight things that stand above the head, like a plume or antlers. Gear may reach over the base and above the Height; the body may not.
- **Squads:** give a squad one to three poses; its figures take them in turn. Finish them together with `squad(poses, height)`, so they share one scale: the tallest pose stands the full Height and a kneeling or crouching one comes out shorter, which is fine. `poses.ts` has the shared stances: aiming a long gun or a crossbow, standing or kneeling, and an archer loosing at full draw.
- **Shared gear:** `gear.ts` has `spear`, `roundShield`, `bow`, `arrow` and `flightStand`. Move a weapon there when a second unit needs it. `pointing(from, to)` gives the turn that lays a weapon along two points, such as a gun across both hands.
- **The base:** the base comes from the card's footprint (`base.ts`), not from the model: a disc a little smaller than the hex, or one piece with a lobe on each hex of a larger footprint and a waist between them. Stand a large figure's feet on the lobes. A figure on one hex faces a flat side; a figure on several hexes faces its front hex and stands on the middle of its base. The body may reach up to a fifth of a hex past its hexes, with up to 15% of its outline off them (`OVERHANG_LIMITS`). If a unit cannot fit, give its card a larger footprint (2x1, 3x1 or 2x2) rather than shrinking it out of scale, and check the balance model and the deployment tests, since a larger base changes how the unit plays.
- **Checks:** `apps/client/test/models.test.ts` holds every model to its Height, its base and the triangle budget (3,000 a figure, counting its high-only parts and the ground on its base). A fine detail that only High should draw (a trim, a buckle) is a part with `high: true`; Low leaves it out. In `detailed.ts`, wrap such parts in `fine([...])`, which also counts them as gear so they never change the figure's Height or fit; `trimRect`, `rivets`, `hoopRing`, `plume`, `jointGuards`, `bracer` and `leafAt` make the common ones. Open the game with `?models=` and the unit's id to look at it.
- **Hit zones:** line of sight in new games uses boxes made from each detailed model (`models/hitShape.ts`): one box round each part, body parts as body and gear and flight stands as gear, without High's details or the base. They are stored in `packages/content/src/hitShapes.json`, which the rules read. `apps/client/test/hitShapes.test.ts` fails when a model no longer matches them; write them again with `HIT_SHAPES_WRITE=1 pnpm --filter @aoh/client exec vitest run hitShapes`, then run it once more. That changes line of sight for the unit in games with hit zones, so say so in the pull request. So give anything a figure holds (a weapon, a shield, a banner pole) the gear role (`gear()` in `build.ts`); worn things and the figure itself are body. "Show tokens" draws the token shape that line of sight uses over the model, and "Colours" switches between the three colour schemes.
- **Routing:** add the faction's file to `UNIT_MODELS` in `models/index.ts`. Every unit card must have a model; the tests fail for a card without one.
- **Detailed models (stage 2):** every unit also has a detailed model in `models/detailed.ts`, drawn in the detailed look. Build it like the classic one, in the same poses and with the same `figure` or `squad` Height, and give every part a paint with `paint(parts, "coat")` (the paints and their colours are in `paint.ts`; `coat` takes the scheme's model colour). `paintBody` paints the parts of a `human` (hips, chest, sleeves, hands, legs, feet) in one go; `face`, `cuffs` and `bootTops` add common detail; `spikes` and `underside` add a ridge or a lighter belly to a body swept with `spine`. A mount or a flight stand is painted too (`horseP`, `standP`). Add it to `DETAILED_MODELS`. A faction can instead build both looks from one set of poses, as the Sunken Hive does (`units/hive.ts`): each builder makes the painted figure, with a flag for the fine detail, and the classic model is the same parts without their paint. The tests hold it to the same Height, fit and triangle budget as the classic model, with the same number of poses, and every part painted.

## Abilities

An ability is engine code named by an id. To add one:

1. Implement it in `packages/rules/src/game/abilities.ts` at the right hook:
   - `abilityModifiers` for extra attack or defense dice;
   - `reduceWounds` for damage reduction;
   - `afterAttack` for reactions (it gets the RNG for rolls);
   - `endOfTurnAbilities` for end-of-turn effects;
   - movement (`movement.ts`) for things like flying and trample;
   - `AREA_IDS` / `MIND_IDS` for special actions. A blast (an `AREA_IDS` ability) reads `range`, `minRange`, `dice`, `splashDice` and `ignoresSight`; give it `"hexTarget": 1` if its text lets it land on an empty hex (the `blast` command), and say so in the text;
   - `POWER_KINDS` for a power: a special action of one of the newer kinds (drain, crush, sweep, aimed at a figure with `attack`; throw, stomp, breath, raise and orders, used with the `power` command in `combat.ts`). A new kind needs its rule in `combat.ts` and a control on the play screen;
   - `grantExtraAttacks` in `combat.ts` for more attacks in a turn, and `resolve` in `strike.ts` for anything that changes one attack's wounds (Shieldbearers, Second Wind in `woundFigure`).

   Read numbers with `param(ability, "name", default)`. Update the id list in the comment at the top of the file.
2. Add a test in `packages/rules/test/abilities.test.ts` (or the file for its drop, such as `abilities-drop2.test.ts`): a test card and a case for when it applies and when it does not. Use `withOutcome` for rolls.
3. Add the id to the implemented list in `packages/content/test/content.test.ts`. A test there keeps every ability (Flying aside) on at most two units.
4. Give it a value multiplier in `ABILITY_VALUE` in `packages/content/src/balance.ts`. Support auras are worth more than their holder's stats suggest.
5. Describe it in the abilities table in [RULES.md](RULES.md) section 11.
6. If it produces new event types, describe them in `apps/client/src/describe.ts` (the log) and, for rolls, in `DiceOverlay` (`apps/client/src/ui/panels.tsx`).

## Maps

The easiest way is the in-game map editor. Hold Shift to place a piece beside another at the same level, drag a box in the Erase tool to clear an area, and use Random fill to roughen terrain or scatter scenery. "Show next problem" finds each problem, and "Fix problems" fixes what it can (see the map rules in RULES.md, section 3). To publish a map:

Scenery kinds are data in `packages/content/src/scenery.ts`: a name, a Height and a line of sight shape, plus `footprint` for a piece bigger than one hex (one of the figure footprints, such as "2x1", "3x1" or "2x2"), `cover` for the extra defense dice it gives a figure next to it against attacks from range across it, and `climb` for the extra move it costs a walking figure to climb across it (scenery without `climb` cannot be crossed). In the editor, pieces bigger than one hex turn with R (or the Rotate buttons), and a preview shows where they would go, red where they cannot. Each kind's model is drawn in `SceneryMesh` (`apps/client/src/scene/BoardScene.tsx`), in flat colours in the classic look and, in the detailed look, with one of the textured finishes in `apps/client/src/scene/sceneryArt.ts` for each part.
1. Build the map and export it as a file.
2. Copy it into `packages/content/src/maps/`.
3. Add it to `MAPS` in `maps/index.ts`.
4. Update the map list expected in `content.test.ts`.
5. Give it a small picture on the main menu: a `.m-<map id>` rule in `apps/client/src/screens/menu/menu.css`, next to the others. It shows in the map picker's button and list. Check that the menu still works in every style (`node e2e/menu.mjs` after a build).

A map can also be laid out in code, as Riverbend and Shattered Crown were: a throwaway script decides each hex's terrain and height, writes the pieces (`layer` 0 upward), adds scenery and start zones, checks the result with `buildBoard` in a throwaway Vitest file in `packages/content/test` (no `issues`, and every start zone reachable on foot), and writes the JSON into `src/maps/`. Riverbend writes one `single` piece per level; for a large map, merge solid stacks into 2, 3, 4 and 7-hex pieces to keep the file small, as Shattered Crown does. Give each start zone at least 16 hexes, and keep zones far enough apart that ranged units cannot reach one from another on the first turn (Riverbend's two are 12 hexes apart, Shattered Crown's six at least 10). Delete the scripts once the map is saved, then follow steps 3 to 5.

The tests check that every bundled map:
- builds without problems (every piece held up and joined to the rest, no sealed spaces, no scenery in start zones);
- hosts at least 2 players;
- keeps two players' zones at least 12 hexes apart;
- has room in every start zone for a full army.

Start zones and the zones used for each player count live in the map's `startZones` and `layouts`. Set `"growZones": true` to let each zone grow at deployment to fit the drafted army (all premade maps do; see RULES.md, Deployment). The editor's zone tool has the same option as a checkbox.

## Tunable numbers

Rule numbers that may change with playtesting live in data, not engine code:
- `packages/content/src/tuning.ts`: falling dice, passing strike dice, height bonuses, straddle, and the glyphs' numbers (`glyphs`: each stat glyph's bonus, the pit's wounds, the curse's turns and how far a summoned unit may be placed).
- `packages/content/src/glyphs.ts`: each glyph's name, colour and mark, and the words that explain it (`glyphEffect`, which reads the tuned numbers). Glyph names are original, like unit names.
- `packages/content/src/terrain.ts`: move costs, lava and ice rolls, swamp damage.
- A new terrain gets its detailed look in `apps/client/src/scene/tileArt.ts`: a painter for its top in `TOPS`, one for its sides in `SIDES`, and its finish in `TILE_FINISH`. Without them it is drawn in its flat colour.
- Ability `params` on each card.
