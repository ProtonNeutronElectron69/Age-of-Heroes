# Age of Heroes: Rules

This is the working rules specification. The rules engine (`packages/rules`) implements what is written here. Numbers marked *(tunable)* live in data files and may change during playtesting. Items marked **Assumption** were decided by default and are open to change.

## 1. Overview

Age of Heroes is a turn-based tactics game for 2 to 6 players. Each player commands an army of heroes and squads drawn from every era and genre, fighting on a 3D battlefield built from stacked hex pieces.

There are two rule sets, chosen when a game is set up:

| | Basic game | Advanced game |
|---|---|---|
| Card side | Front | Back |
| Stats | Move, Range, Attack, Defense | Life, Move, Range, Attack, Defense, Points, plus attributes and abilities |
| Army building | Draft a set number of cards | Snake draft within a points budget |
| Elevation | No combat bonus, no falling damage | Elevation bonuses, falling damage, Height limits on climbing |
| Line of sight | Forgiving | Strict 3D line of sight |
| Engagement | None | Engagement and passing strikes |
| Special abilities | None | Every unit has abilities |
| Terrain effects | Yes | Yes |

## 2. Unit cards

Every unit has a two-sided card.

### Front (Basic game)
- **Move**: hexes the figure can travel per turn.
- **Range**: how many hexes away it can attack. Range 1 means melee only.
- **Attack**: attack dice rolled.
- **Defense**: defense dice rolled.

In the Basic game there is no Life stat: **a figure is destroyed by any attack that deals at least 1 wound.** **Assumption.**

### Back (Advanced game)

Left panel (identity and synergy tags):
- **Faction**: the warlord or ideology the unit fights for.
- **Unit type**:
  - *Unique Hero*: a named single figure. At most one copy in a game (see Drafting).
  - *Common Hero*: a generic single figure. Can be drafted more than once.
  - *Unique Squad*: a named group of figures. At most one copy in a game.
  - *Common Squad*: a generic group of figures. Can be drafted more than once.
- **Species**, **Class**, **Personality**: tags that abilities can refer to, for example "all friendly Disciplined units get +1 Defense".
- **Size and Height**: a category (Small, Medium, Large, Huge) and a number (for example Medium 5, Huge 9). Height is the figure's height in terrain levels. It limits climbing, sets falling thresholds, determines how tall the figure's token is for line of sight, and decides engagement across height differences. Size decides immunity to some abilities (for example, a Small figure cannot pick up and throw a Huge one).
- **Footprint**: the hexes the figure occupies: 1 hex, 2x1, 3x1 or 2x2.

Right panel (stats):
- **Life**: wounds the figure can take; it is destroyed when its wounds reach its Life. Heroes usually have 4 to 8 Life; squad figures almost always have 1.
- **Move**, **Range**, **Attack**, **Defense**: as on the front, possibly with different values.
- **Points**: drafting cost.
- **Abilities**: special powers that change or break the core rules.

## 3. The battlefield

### Hexes, levels and pieces
- The battlefield is built from hex **pieces** in these shapes: 1-hex, 2-hex, 3-hex line, 3-hex triangle, 2x2 (4-hex), 7-hex and 24-hex. Pieces are unlimited in the editor.
- Pieces stack. Each piece is one **level** thick. A piece placed directly on the table is at layer 0; a figure standing on top of it is at **elevation 1**. A figure standing on a stack three pieces tall is at elevation 3.
- A piece must rest on the table or on another piece (an overhang is fine as long as at least one of its hexes is supported, directly or through a chain of supported pieces).
- Gaps are allowed, so pieces can form **bridges and overhangs**. A hex can have more than one standing surface, for example the water under a bridge and the road on top of it. A figure fits under an overhang only if the room above the surface is at least its Height. **Assumption.**

### Terrain types

Standard terrain has no special rules: **grass, sand, rock, snow, forest**.

Special terrain:

| Terrain | Effect |
|---|---|
| **Water** | Entering water from a hex that is not water or swamp ends the figure's movement. Each water hex costs 2 move. |
| **Swamp** | Entering swamp from a hex that is not water or swamp ends the figure's movement. Each swamp hex costs 2 move. A figure that ends its turn on swamp rolls 1 attack die against itself with 0 defense dice, taking 1 wound per skull. |
| **Lava** | Each time a figure enters a lava hex, roll a d20: on 1 to 12 the figure is destroyed *(tunable)*. |
| **Ice** | Each time a figure enters an ice hex, roll a d20: on 1 to 5 it slips, slides 1 more hex in the direction it was moving, and its movement ends *(tunable)*. It slides onto the highest surface in that hex that is not above it. If that hex is blocked, taken or off the battlefield it stays where it is. A slide never causes a second slip, but sliding into lava means a lava roll. If a slip leaves the figure on a hex it was only passing over (another figure is there), it goes back to the last free hex on its path. |
| **Road** | A figure that starts its turn on road, moves only through road hexes and ends its turn on road gets +3 move that turn *(tunable)*. |

Water and swamp form one "wet" group: moving from water into swamp (or the reverse) does not stop movement, but each hex still costs 2.

A figure that starts its turn in water or swamp can keep moving through it, paying 2 move per wet hex.

"Ends its turn" means the end of that unit's activation. Every figure of the unit that is standing on swamp at that point rolls, whether or not it moved. **Assumption.**

All terrain effects apply in both the Basic and the Advanced game. **Assumption.**

### Scenery

Scenery stands on a single hex, on top of the terrain there:

| Scenery | Height |
|---|---|
| **Tree** | 9 levels |
| **Ruined wall** | 3 levels |
| **Boulder** | 2 levels |

- No figure can enter or stand on a hex where scenery stands (at that level).
- Scenery blocks line of sight in both the Basic and the Advanced game, just like terrain. A short wall or boulder can be seen over by taller figures.
- Scenery must stand on terrain and fit under anything above it.
- How flying figures treat scenery will be decided with the Advanced abilities (Phase 4).

### Start zones
Each map has up to 6 start zones. The map says which zones are used for each player count, so that, for example, two players start in opposite corners. Turn order still goes round the table in seat order. Players set up their figures only in their own zone. A map can be played by any number of players it has a separate start zone for.

## 4. Setting up a game

Game options:
- **Rule set**: Basic or Advanced.
- **Players**: 2 to 6, each in a seat. Seat order is also the "to the left" order.
- **Map**.
- **Army size**: Basic: number of cards per player, 1 to 4 (default 3). Advanced: points budget (default 500).
- **Faction-pure mode** (Advanced, optional): every unit in an army must share a faction. **Assumption:** the exact reward or requirement will be set in Phase 4.
- **Round limit**: none, or a number of rounds.

### Drafting
Armies are drafted from a shared pool in a **snake draft**: the pick order reverses each round of picks (seat 1, 2, 3, 3, 2, 1, 1, 2, 3 and so on). The first picker is decided by a d20 roll.
- **Advanced**: each pick must fit within the player's remaining budget. A player who cannot afford anything, or chooses to stop, is out of the draft. The draft ends when everyone is out.
- **Basic**: each player picks cards until they have the agreed number.
- **Uniques**: a unique unit can be drafted by only one player. Common units can be drafted any number of times by anyone. **Assumption.**
- **Room to deploy**: an army can never have more figures than its start zone has spots. The draft does not allow a card that would not fit, and a player with no room left skips their remaining picks.

### Deployment
After the draft, units are deployed one at a time in the order they were drafted. (With preset armies, players take turns round the table, one unit each.) Each figure goes on a free spot in its owner's start zone where it fits.

## 5. Rounds

Each round has three parts.

### 5.1 Place activation tokens
Every player has four tokens: **1, 2, 3** and a bluff token **X**. In secret, each player places all four on their own living units' cards. One card may hold several tokens. The X token does nothing; it hides which units will act.

### 5.2 Roll initiative
Every player rolls a d20. If several players tie for the highest roll, only they roll again, until one is highest. That player goes first, and play passes to the left (increasing seat order, wrapping around) for the rest of the round.

### 5.3 Take turns
1. In initiative order, each player reveals their **1** token and takes a turn with the unit holding it.
2. Then each player, in the same order, reveals their **2** token and takes a turn.
3. Then the same for the **3** token.
4. Finally all X tokens are revealed, and a new round begins with token placement.

If the unit holding a token has been destroyed by the time the token is revealed, **that turn is lost.**

## 6. Taking a turn

The revealed unit **activates**. Each of its figures may make one move and one attack.
- A hero moves and then attacks.
- A squad's figures act in any order: figure A can move, figure B can move and attack, then figure A attacks, and so on. Each figure's move must come before its own attack. **Assumption.**
- Moving and attacking are both optional.

## 7. Movement

- Each hex moved costs 1 move, plus terrain costs (water and swamp cost 2).
- **Climbing up** costs 1 extra move for every level climbed.
- Moving down costs nothing extra.
- A figure can only stand where the open space above the ground is at least its Height (this matters under bridges). Climbing needs that much headroom where the figure starts, and dropping down needs it where the figure lands.
- A figure can move through hexes holding **friendly** figures but not **enemy** figures, and cannot end its move on an occupied hex.
- **Advanced:** a figure cannot climb a single step taller than its Height. In the Basic game there is no step limit. **Assumption.**
- Multi-hex figures move by their front hex; the rest of the footprint follows. Exact rules will be written in Phase 3.

### Flying (Advanced ability)
- While moving, a flying figure ignores terrain. It does not stop in water or swamp, does not roll for lava or ice it passes over, and pays no extra move to climb.
- Terrain affects a flying figure only if it **ends** its move on that hex.
- Flyers ignore the Height limit when climbing and **never take falling damage**.
- Flyers can pass over any figure, friend or enemy. They still take passing strikes when they leave an engaged enemy. **Assumption.**

Flying is an ability, so it only exists in the Advanced game. In the Basic game every unit walks. **Assumption.**

## 8. Attacking

### Range and targets
- Range is counted in hexes from the attacker to the target. For multi-hex figures, count from the nearest hex of each.
- Range 1 means the target must be adjacent.
- **Advanced:** an attack at range 1 needs the two figures to be engaged (see 9).

### Line of sight
Every figure is shown as a token as tall as its Height. Each token has an **eye point** (the centre of its top) and a **hit band** (a coloured band around its upper part).
- **Advanced:** the attacker needs a clear straight line from its eye point to some part of the target's hit band. Terrain and other figures (friend or enemy) block the line. The game checks this automatically; a figure's-eye camera shows the player what the figure sees.
- **Basic:** the attacker needs a clear line from its eye point to any part of the target's token. Only terrain and scenery block; other figures do not. **Assumption.**
- The ground each figure stands on never blocks the line, so a figure at the edge of a cliff can see the figure at its foot. A bridge or overhang above either figure still can.

### Rolling
1. The attacker rolls attack dice equal to its Attack, plus any bonuses.
2. The defender rolls defense dice equal to its Defense, plus any bonuses.
3. Each skull is a hit; each shield is a block. If hits are more than blocks, the difference is dealt as wounds.

Dice:
- **Attack die**: 3 skull faces, 3 blank faces.
- **Defense die**: 3 shield faces, 3 blank faces.

### Elevation (Advanced only)
Compare the elevations of the surfaces the two figures stand on.
- If the attacker is higher: **+1 attack die**, and **another +1** if the difference is at least the defender's Height.
- If the defender is higher: **+1 defense die**, and **another +1** if the difference is at least the attacker's Height.

### Wounds and destruction
- **Basic:** any wound destroys the figure.
- **Advanced:** wounds stay on the figure; when its wounds reach its Life it is destroyed. A destroyed figure is removed from the battlefield.

## 9. Engagement (Advanced only)

- Two enemy figures are **engaged** if they are adjacent and the difference in their elevations is less than the Height of the lower figure. **Assumption** (this is the "too high to fight across" rule).
- An engaged figure may only attack figures it is engaged with. It cannot shoot at distant targets.
- **Passing strike**: when a figure moves out of a hex where it was engaged with one or more enemies, each of those enemies rolls 1 attack die against it. The moving figure does not roll defense. Each skull is 1 wound.

## 10. Falling (Advanced only)

When a figure moves down by a drop of:
- at least its Height: roll 2 attack dice against it, 1 wound per skull, no defense roll *(tunable)*;
- at least double its Height: roll 4 attack dice instead *(tunable)*.

Flying figures never take falling damage.

## 11. Abilities (Advanced only)

Each ability has a name and rules text on the card, and is implemented in code as a set of hooks into the rule steps (before movement, during each step, before an attack roll, after wounds, at the end of a turn, and so on). An ability may change any rule. When an ability contradicts the core rules, the ability wins.

## 12. Winning

- **Elimination**: when a player has no figures left, they are out. The last player with figures on the battlefield wins.
- **Round limit** (optional): when the last round ends, the player with the highest score wins. Ties share the win.
  - Advanced score: the points of every unit still on the battlefield. A squad scores in proportion to its surviving figures (for example 2 of 3 figures left scores 2/3 of its points, rounded down).
  - Basic score: the number of surviving figures.
- A player may **concede** at any time. They are out of the game and their remaining turns are skipped.

## 13. Open items

These will be decided in the phase listed, with a sensible default proposed then:
- Multi-hex figure movement and rotation (Phase 3).
- Flying over scenery (Phase 4).
- Faction-pure mode reward (Phase 4).
