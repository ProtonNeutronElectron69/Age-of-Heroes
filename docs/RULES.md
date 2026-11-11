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
- **Life**: wounds the figure can take; it is destroyed when its wounds reach its Life. Heroes have 2 to 8 Life. Most squad figures have 1; a few tough squads of only 2 or 3 figures have up to 3 Life per figure.
- **Move**, **Range**, **Attack**, **Defense**: as on the front, possibly with different values.
- **Points**: drafting cost.
- **Abilities**: special powers that change or break the core rules.

## 3. The battlefield

### Hexes, levels and pieces
- The battlefield is built from hex **pieces** in these shapes: 1-hex, 2-hex, 3-hex line, 3-hex triangle, 2x2 (4-hex), 7-hex and 24-hex. Pieces are unlimited in the editor.
- Pieces stack. Each piece is one **level** thick. A piece placed directly on the table is at layer 0; a figure standing on top of it is at **elevation 1**. A figure standing on a stack three pieces tall is at elevation 3.
- A piece must be held up:
  - it rests on the table, or at least one of its hexes rests on a piece that is held up (an overhang);
  - or, with nothing under it, it is part of a **bridge**: a run of pieces joined side by side at one level that touches held-up pieces on two opposite sides. Opposite means two sides facing at least 120 degrees apart, so a piece touching one pillar, or lying along one wall, is not held up. **Assumption.**
- Pieces that are not held up are problems: a map with any cannot be played.
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
- Flying figures fly over scenery but cannot land on it (see Flying in section 7).

### Start zones
Each map has up to 6 start zones. The map says which zones are used for each player count, so that, for example, two players start in opposite corners. Turn order still goes round the table in seat order. Players set up their figures only in their own zone. A map can be played by any number of players it has a separate start zone for.

## 4. Setting up a game

Game options:
- **Rule set**: Basic or Advanced.
- **Players**: 2 to 6, each in a seat. Seat order is also the "to the left" order.
- **Map**.
- **Army size**: Basic: number of cards per player, 1 to 4 (default 3). Advanced: a points budget per player (default 400), any whole number from 50 to 9999, or **no limit**. With no limit, players draft until they choose to stop or their start zone is full.
- **Faction-pure mode** (Advanced, optional): every unit in an army must share the faction of that player's first pick. There is no extra reward; it is a theme restriction. **Assumption.**
- **Round limit**: none, or a number of rounds.

### Drafting
Armies are drafted from a shared pool in a **snake draft**: the pick order reverses each round of picks (seat 1, 2, 3, 3, 2, 1, 1, 2, 3 and so on). The first picker is decided by a d20 roll.
- **Advanced**: each pick must fit within the player's remaining points. A player may press "Done drafting" to stop; a player who cannot afford anything that fits is skipped. The draft ends when nobody can or will pick.
- **Basic**: each player picks cards until they have the agreed number.
- **Uniques**: a unique unit can be drafted by only one player. Common units can be drafted any number of times by anyone. **Assumption.**
- **Room to deploy**: an army can never need more hexes than its start zone has (a multi-hex figure needs one hex per footprint hex). The draft does not allow a card that would not fit, and a player with no room left skips their remaining picks. On a map whose zones grow (all premade maps), a zone counts as 40 hexes here, since it grows at deployment.

### Deployment
After the draft, units are deployed one at a time in the order they were drafted. (With preset armies, players take turns round the table, one unit each.) Each figure goes on a free spot in its owner's start zone where it fits.
- **Growing zones**: on maps that allow it (all premade maps; custom maps choose in the editor), each start zone grows before deployment until it has a little more room than the army needs: the hexes the army covers, plus a quarter more, plus 2. Players take turns adding one hex at a time, in seat order. A zone grows into free, standable neighbouring hexes, keeping close to its own centre and away from other zones, and never takes another player's hexes. If a unit still has no spot where it fits when its turn to deploy comes, the zone grows again, up to 40 more hexes. **Assumption.**
- **No room**: if a unit cannot be placed at all (a map whose zones do not grow, or a board with no space left), it sits the game out and counts as destroyed. **Assumption.**

### Playing online
Online, the host picks the options above and shares a room code. Seats and colors follow the order players join, and the host can start once the room holds a player count the map supports. The rules are the same, with these differences:
- **Who acts**: each device acts only for its own player. The game server checks every action, so nobody can move another player's units.
- **Hidden information**: each device sees only what that player could see at a table. Other players' activation tokens stay hidden until revealed, and the dice are rolled on the server, so no device can predict them.
- **Leaving**: leaving a game in progress concedes (section 12). A dropped connection or a page reload does not: the player returns to the same seat.
- **Spectators** can watch with a room code. They see what a player outside the game would see: no secret tokens.
- **Replays**: when the game ends, everyone can download its full record and watch it again move by move, with every token shown.
- **Saving**: the host can save the game at any time and download it. To carry on later, the host resumes the save in a new room, each player picks their army again, and play continues from the same moment with the same dice. The save holds the whole game, hidden tokens included, so only the host gets it.

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

If a player loses their last figure during their own turn (to lava, a fall or a passing strike), they are out and play moves straight on to the next turn.

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

### Multi-hex figures

Some figures cover 2 or more hexes (2x1, 3x1 or 2x2 footprints). **Assumption** for all of this section.
- **Standing:** the figure's front hex stands at one height. Each of its other hexes uses the ground nearest that height, at most 1 level up or down *(tunable)*. Every hex needs room for the figure's Height and no scenery. The figure's height for line of sight, height bonuses and falling is that of its highest hex.
- **Moving:** the figure moves one step at a time. Either the whole figure shifts one hex in any direction, keeping its facing, or it turns 60 degrees in place around its front hex.
- **Cost:** a shift costs 1 move, plus the largest extra terrain cost of the hexes it newly covers (water and swamp cost 1 extra), plus the most levels any of its hexes climbs. Turning in place is free.
- **Terrain:** hexes newly covered by a shift or a turn apply their effects. Each new lava hex needs its own roll, and entering water or swamp from outside it ends the move. Multi-hex figures never slip on ice.
- **Other figures:** nothing can stand on any of its hexes. It can pass through friendly figures but not enemies, like any figure.
- **Deploying:** all of its hexes must be in the start zone. It can face any direction.

### Flying (Advanced ability)
- A flying figure's move is counted in hexes **straight to where it lands**. Terrain, height, scenery and figures on the way do not matter, and climbing costs nothing.
- It can land on any free spot within its Move where it fits, at any height (not on scenery or another figure).
- Terrain affects it only where it lands: lava rolls as usual and swamp hurts at the end of its turn. It never slips on ice and **never takes falling damage**.
- It still takes passing strikes when it takes off from beside an engaged enemy and lands out of reach.
- Flying is an ability, so it only exists in the Advanced game. In the Basic game every unit walks.

## 8. Attacking

### Range and targets
- Range is counted in hexes from the attacker to the target. For multi-hex figures, count between the nearest hexes of each.
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
Compare the elevations of the surfaces the two figures stand on (for a multi-hex figure, its highest hex).
- If the attacker is higher: **+1 attack die**, and **another +1** if the difference is at least the defender's Height.
- If the defender is higher: **+1 defense die**, and **another +1** if the difference is at least the attacker's Height.

### Wounds and destruction
- **Basic:** any wound destroys the figure.
- **Advanced:** wounds stay on the figure; when its wounds reach its Life it is destroyed. A destroyed figure is removed from the battlefield.

## 9. Engagement (Advanced only)

- Two enemy figures are **engaged** if a hex of one is next to a hex of the other and the difference in those hexes' elevations is less than the Height of the lower figure. **Assumption** (this is the "too high to fight across" rule).
- An engaged figure may only attack figures it is engaged with. It cannot shoot at distant targets.
- **Passing strike**: when a step takes a figure out of engagement with one or more enemies, each of those enemies rolls 1 attack die *(tunable)* against it before it leaves. The moving figure does not roll defense. Each skull is 1 wound. A figure destroyed this way falls where it stood. Moving while staying engaged with the same enemy draws no strike.
- The game marks risky moves (ones that draw passing strikes, fall, or cross lava or ice) in orange, and suggests the safest path to each hex.

## 10. Falling (Advanced only)

Falling is checked on every step of a move. When a figure's highest hex moves down by a drop of:
- at least its Height: roll 2 attack dice against it, 1 wound per skull, no defense roll *(tunable)*;
- at least double its Height: roll 4 attack dice instead *(tunable)*.

Flying figures never take falling damage.

## 11. Abilities (Advanced only)

Each ability has a name and rules text on the card, and is implemented in code as a set of hooks into the rule steps (before movement, during each step, before an attack roll, after wounds, at the end of a turn, and so on). An ability may change any rule. When an ability contradicts the core rules, the ability wins. Abilities do not exist in the Basic game.

General rulings:
- Numbers in abilities (ranges, dice, bonuses, rolls needed) are on the card data and *tunable*.
- **Auras do not stack.** A figure gets each named bonus at most once, however many sources are nearby.
- Bonus dice from abilities add to height bonuses. Every roll lists why its dice changed.
- **Special actions** (Ember Spit, Mortar Barrage, Arc Lightning, Lantern Gaze) are used **instead of** the figure's normal attack, and follow the normal attack rules (engagement, line of sight) unless they say otherwise.

| Ability | What it does |
|---|---|
| **Flying** | See 7. |
| **Trample** | May move through Small and Medium enemies (not end on them). Each one moved through rolls 1 defense die; on no shield it takes 1 wound. |
| **Smoke Step** | After attacking, the figure may move up to 2 hexes, drawing no passing strikes. |
| **Massed Volley** | The third and later attacks by figures of the same squad on the same target in one turn get +2 attack dice. |
| **Grove Song** | Other friendly Elves within 3 hexes of the singer get +1 attack die. |
| **Rally the Line** | Friendly Disciplined squad figures within 4 hexes of the commander get +1 defense die. |
| **Deflector Field** | Friendly figures next to the guardian (not the guardian itself) get +1 defense die against attacks from 3 or more hexes away. |
| **Hidden in the Leaves** | On forest, +2 defense dice against attacks from 4 or more hexes away. |
| **Moss Armor** | +1 defense die against attacks from 4 or more hexes away. |
| **Brace** | +2 defense dice when attacked by an adjacent enemy that moved this turn. |
| **Answering Blade** | When defending against an adjacent attacker and rolling more shields than it rolled skulls, the attacker takes 1 wound. |
| **Thick Hide** | Attacks from 3 or more hexes away deal 1 less wound. |
| **Salvage Protocol** | When a figure of the squad destroys an enemy, one destroyed figure of that squad returns, unwounded, on a free spot next to the attacker. |
| **Field Dressing** | At the end of the medic's turn, remove 1 wound from the most wounded friendly hero next to her (or herself). |
| **Ember Spit** (special action) | Range 3: 2 attack dice against the target, and 1 attack die against every other figure next to the target (friend or foe, never the attacker). Each defends normally. |
| **Mortar Barrage** (special action) | Range 3 to 8, **needs no line of sight**: 3 attack dice against the target and 1 against every other figure next to it. |
| **Lantern Gaze** (special action) | Range 4, in sight: target an enemy Small or Medium figure that is not unique and roll a d20. On 16 or more it leaves its unit and joins your army as a unit of its own (you can place tokens on it from the next round). |
| **Arc Lightning** (special action) | Range 5, in sight: 3 attack dice against the target, and 1 attack die against every other figure next to the target (friend or foe, never the attacker). Each defends normally. |
| **Charge** | +1 attack die when attacking an adjacent enemy after moving this turn. (Brace answers it.) |
| **Steady Aim** | +1 attack die if the figure has not moved this turn. |
| **Longshot** | +1 attack die against a figure 5 or more hexes away. |
| **Pack Hunt** | +1 attack die when another figure of the same squad is next to the target. |
| **Way of the Blade** (duelist) | +1 attack die when attacking an adjacent hero. |
| **Bloodrage** | +1 attack die once any figure of the squad has been destroyed. |
| **Smite the Unholy** | +2 attack dice against Undead and Oni figures. |
| **Command the Dead** | Other friendly Undead figures within 4 hexes of the necromancer get +1 attack die (an aura). |
| **Shield Wall** | +1 defense die while another figure of the same squad stands next to the defender. |
| **Soul Reap** | When the figure destroys a figure with an attack, it removes 1 wound from itself. |
| **Reboot** | When a figure of the squad is destroyed by an attack, roll a d20. On 17 or more it stands back up where it fell, with no wounds. |
| **Reassemble** | At the end of the squad's turn, if any of its figures are destroyed, roll a d20. On 15 or more one of them returns, with no wounds, next to a figure of the squad that is still standing. |
| **Fury** | +1 attack die while the figure has at least 1 wound. |

Every squad has 1 special ability and every hero has 2; Flying comes on top and does not count. Many cards give one of these rules a name of their own, and the card text spells it out. For example:
- Flying: Jet Packs (Skyhook Raiders).
- Smoke Step: Hit and Run (Skyhook Raiders), Drifting Lantern (Kenzo).
- Charge: Lightning Draw (Lady Asagiri).
- Way of the Blade: Officer's Sabre (Captain Vance).
- Steady Aim: Targeting Array (Sentinel K-7).
- Moss Armor: Ember Scales (Cinderjaw).
- Hidden in the Leaves: Forest Veil (Sylvanne).
- Trample: Crushing Stride (Siege Walker Atlas), Crushing Coils (Marrowcoil).
- Thick Hide: Bone Plates (Marrowcoil).
- Smite the Unholy: Blessed Rounds (Sister Maren).
- Answering Blade: Grave Riposte (Vorhal).
- Field Dressing: Benediction (Solenne).
- Deflector Field: Arcane Ward (Orrin Vael).
- Ember Spit: Grave Blight (Morvane), with range 4.
- Fury: Oni Fury (Ashfang Oni).

A figure taken by mind control scores its share of its card's points for its new owner.

## 12. Winning

- **Elimination**: when a player has no figures left, they are out. The last player with figures on the battlefield wins.
- **Round limit** (optional): when the last round ends, the player with the highest score wins. Ties share the win.
  - Advanced score: the points of every figure still on the battlefield. Each squad figure is worth its share of the card's points (for example 2 of 3 figures left scores 2/3 of the points, rounded down).
  - Basic score: the number of surviving figures.
- A player may **concede** at any time. They are out of the game and their remaining turns are skipped.

## 13. Point costs

Point costs are checked against a balance model in `packages/content/src/balance.ts`: expected damage dealt and attacks survived, worked out exactly from the dice odds, adjusted for range, Move, size and abilities. Every unit must cost between 70% and 130% of what the model suggests (a test enforces it). Run `BALANCE_REPORT=1 pnpm test balance` to print the table.
