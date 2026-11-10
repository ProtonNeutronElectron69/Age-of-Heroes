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
- **Roster shape:** the test currently expects 30 units, 6 factions of 5, 15 heroes and 15 squads, and 15 ranged and 15 melee. Every faction must have heroes, squads, ranged and melee units. Update the expected counts in `content.test.ts` when the roster grows, keeping the balance.

Conventions:
- **Basic side:** heroes, and squads with more than 1 Life, usually get +1 Basic defense, because a single wound destroys a figure in the Basic game.
- **Ability text:** write it with the unit's name, in plain words. Numbers in the text must match `params`.
- **Reusing a rule:** to reuse an existing rule under a new name, keep the `id` and change `name` and `text`. Then add the mapping to the list under the abilities table in [RULES.md](RULES.md).

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

The easiest way is the in-game map editor:
1. Build the map and export it as a file.
2. Copy it into `packages/content/src/maps/`.
3. Add it to `MAPS` in `maps/index.ts`.
4. Update the map list expected in `content.test.ts`.

The tests check that every bundled map:
- builds without issues;
- hosts at least 2 players;
- keeps two players' zones at least 12 hexes apart;
- has room in every start zone for a full army.

Start zones and the zones used for each player count live in the map's `startZones` and `layouts`.

## Tunable numbers

Rule numbers that may change with playtesting live in data, not engine code:
- `packages/content/src/tuning.ts`: falling dice, passing strike dice, height bonuses, straddle.
- `packages/content/src/terrain.ts`: move costs, lava and ice rolls, swamp damage.
- Ability `params` on each card.
