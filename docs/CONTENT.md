# Age of Heroes: Adding Content

How to add units, abilities and maps, and the rules the tests enforce. Everything here must be **original**: no names, characters, card text or stat lines copied from existing games.

## Units

Units are JSON in `packages/content/src/cards/` (`starter.json`, `legends.json`; a new drop can be a new file added to `cards.ts`). Each card is validated by `unitCardSchema` in `packages/rules/src/schema.ts`.

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
  "basic": { "move": 5, "range": 1, "attack": 3, "defense": 4 },
  "advanced": {
    "life": 2, "move": 5, "range": 1, "attack": 3, "defense": 3, "points": 140,
    "abilities": [
      { "id": "charge", "name": "Charge", "text": "A Knight that has moved this turn rolls 1 extra attack die when it attacks an adjacent enemy.", "params": { "bonus": 1 } }
    ]
  }
}
```

Rules the content tests enforce (`packages/content/test`):
- **Abilities:** every squad has exactly 1 special ability and every hero exactly 2. Flying comes on top and does not count. No repeats on a card, and every ability id must be implemented by the engine.
- **Life:** heroes have 2 to 8. Most squads have 1; only squads of 2 or 3 figures may have more, up to 3.
- **Squad size:** keep squads to 4 figures or fewer. A test checks that a 4-card army of the largest squad fits in every start zone of every map.
- **Labels and ids:** token labels and ids are unique.
- **Multi-hex units:** every multi-hex unit must be able to deploy in every start zone of every map.
- **Points:** every unit's points must be within 0.7 to 1.3 of what the balance model suggests. Aim for about 1.0. Run `BALANCE_REPORT=1 pnpm test balance` and set points near the "Fair" column, rounded to 5. Adding units shifts the scale a little for everyone, so check the whole table.
- **Roster shape:** the test currently expects 48 units in 6 factions of 8. Heroes and squads, and ranged and melee units, should each stay within about 60/40 of each other (the test allows 35% to 65%), and every faction must have heroes, squads, ranged and melee units. Update the expected counts in `content.test.ts` when the roster grows.
- **Card colours:** a new faction needs a colour theme and an emblem in `apps/client/src/ui/factionThemes.ts` (emblem glyphs are in `hexCardArt.tsx`); without one its cards are grey. Open the game with `?cards` in the address to check how a new card looks: the name and rules text shrink to fit, so very long text ends up small.
- **Unit art:** a unit's drawing goes in its faction's file in `apps/client/src/ui/art/drawings/`, under the card's id. A figure is a list of shapes in a box 200 wide and 250 tall, feet on y = 244, drawn back to front; each shape has a role (armour, cloth, blade and so on) that picks its colour, and `tint` overrides colours for one figure. Use the helpers in `build.ts` (`arm`, `leg`, `torso`, `limb`, `pts`) rather than writing paths by hand where you can. List the roles that are gear in `gear`, so the hit zone picture leaves them grey. Use `solo` for a hero and `squad` for a squad; `squad` arranges the figures for both card sides. Give `solo` the figure's `span` when it reaches far to the side, so it still fits the narrow window on the Advanced side, and give a flying figure a `hover` height. Soldiers aiming a long gun can use the shared `STANDING_AIM` and `KNEELING_AIM` stances, and a squad of unusual shapes, such as beasts, can pass `squad` its own figure positions. Check the result with `?cards=` and the unit's id. Every unit needs a drawing: the full-game browser test fails if a card in the draft has none.
- **Figure model:** a unit's 3D model goes in its faction's file in `apps/client/src/models/units/`, under the card's id (see below). Units without one are drawn as tokens.

Conventions:
- **Basic side:** heroes, and squads with more than 1 Life, usually get +1 Basic defense, because a single wound destroys a figure in the Basic game.
- **Ability text:** write it with the unit's name, in plain words. Numbers in the text must match `params`.
- **Reusing a rule:** to reuse an existing rule under a new name, keep the `id` and change `name` and `text`. Then add the mapping to the list under the abilities table in [RULES.md](RULES.md).

## Figure models

A model is built in code from a few solid shapes, with the helpers in `apps/client/src/models/build.ts`. Stage 1 is the unit's size and shape in one colour, about 1,000 triangles a figure.

- **Shape:** write the figure facing +z with its feet on y = 0 and its left at +x, in any units; finish with `figure(parts, height)`, which sizes it so the body is as tall as the card's Height. Use `human` (`human.ts`) for anything on two legs: give it where the hands and feet are and it works out the elbows and knees. `horse` (`horse.ts`) is a mount. `spine` sweeps a body along a line (a torso, a neck, a tail), `limb` joins two points, `plate` cuts a flat shape (a blade, a hat brim), and `both` mirrors a part to the other side.
- **Gear:** wrap what the figure holds in `gear(...)`: weapons, and thin things like a plume. Gear may reach over the base and above the Height; the body may not.
- **Squads:** give a squad one to three poses; its figures take them in turn.
- **The base:** a figure on one hex faces a flat side; a figure on several hexes faces its front hex and stands on the middle of its base. The body may reach up to a fifth of a hex past its base, with up to 15% of its outline off it (`OVERHANG_LIMITS`). If a unit cannot fit, give its card a larger footprint (2x1, 3x1 or 2x2) rather than shrinking it out of scale, and check the balance model and the deployment tests, since a larger base changes how the unit plays.
- **Checks:** `apps/client/test/models.test.ts` holds every model to its Height, its base and the triangle budget. Open the game with `?models=` and the unit's id to look at it; "Show tokens" draws the token shape that line of sight uses over the model.
- **Routing:** add the faction's file to `UNIT_MODELS` in `models/index.ts`.

## Abilities

An ability is engine code named by an id. To add one:

1. Implement it in `packages/rules/src/game/abilities.ts` at the right hook:
   - `abilityModifiers` for extra attack or defense dice;
   - `reduceWounds` for damage reduction;
   - `afterAttack` for reactions (it gets the RNG for rolls);
   - `endOfTurnAbilities` for end-of-turn effects;
   - movement (`movement.ts`) for things like flying and trample;
   - `AREA_IDS` / `MIND_IDS` for special actions.

   Read numbers with `param(ability, "name", default)`. Abilities apply only in the Advanced game (`hasAbility` and `abilityModifiers` already check). Update the id list in the comment at the top of the file.
2. Add a test in `packages/rules/test/abilities.test.ts`: a test card in `ABILITY_CARDS` and a case for when it applies and when it does not. Use `withOutcome` for rolls.
3. Add the id to the implemented list in `packages/content/test/content.test.ts`.
4. Give it a value multiplier in `ABILITY_VALUE` in `packages/content/src/balance.ts`. Support auras are worth more than their holder's stats suggest.
5. Describe it in the abilities table in [RULES.md](RULES.md) section 11.
6. If it produces new event types, describe them in `apps/client/src/describe.ts` (the log) and, for rolls, in `DiceOverlay` (`apps/client/src/ui/panels.tsx`).

## Maps

The easiest way is the in-game map editor. Hold Shift to place a piece beside another at the same level, drag a box in the Erase tool to clear an area, and use Random fill to roughen terrain or scatter scenery. "Show next problem" finds each problem, and "Fix problems" fixes what it can (see the map rules in RULES.md, section 3). To publish a map:
1. Build the map and export it as a file.
2. Copy it into `packages/content/src/maps/`.
3. Add it to `MAPS` in `maps/index.ts`.
4. Update the map list expected in `content.test.ts`.

The tests check that every bundled map:
- builds without problems (every piece held up and joined to the rest, no sealed spaces, no scenery in start zones);
- hosts at least 2 players;
- keeps two players' zones at least 12 hexes apart;
- has room in every start zone for a full army.

Start zones and the zones used for each player count live in the map's `startZones` and `layouts`. Set `"growZones": true` to let each zone grow at deployment to fit the drafted army (all premade maps do; see RULES.md, Deployment). The editor's zone tool has the same option as a checkbox.

## Tunable numbers

Rule numbers that may change with playtesting live in data, not engine code:
- `packages/content/src/tuning.ts`: falling dice, passing strike dice, height bonuses, straddle.
- `packages/content/src/terrain.ts`: move costs, lava and ice rolls, swamp damage.
- Ability `params` on each card.
