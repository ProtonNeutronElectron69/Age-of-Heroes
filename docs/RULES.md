# Age of Heroes: Rules

This is the working rules specification. The rules engine (`packages/rules`) implements what is written here. Numbers marked *(tunable)* live in data files and may change during playtesting. Items marked **Assumption** were decided by default and are open to change.

## 1. Overview

Age of Heroes is a turn-based tactics game for 2 to 6 players. Each player commands an army of heroes and squads drawn from every era and genre, fighting on a 3D battlefield built from stacked hex pieces.

In short:
- Each unit card has Life, Move, Range, Attack, Defense, Points, traits and abilities.
- Armies are drafted within a points budget: a snake draft on one device, an open draft online.
- Higher ground gives combat bonuses, long drops cause falling damage, and a figure cannot climb a single step taller than its Height.
- Line of sight is a strict 3D check, and other figures block it.
- Figures next to enemies are engaged and draw passing strikes when they leave.
- Figures face a way: an attack needs its target in front of the attacker, and a melee attack from behind rolls 2 more attack dice.
- Every unit has special abilities, and terrain has its own effects.

## 2. Unit cards

Every unit has one card.

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
- **Move**: hexes the figure can travel per turn.
- **Range**: how many hexes away it can attack. Range 1 means melee only.
- **Attack**: attack dice rolled.
- **Defense**: defense dice rolled.
- **Points**: drafting cost.
- **Abilities**: special powers that change or break the core rules.

## 3. The battlefield

### Hexes, levels and pieces
- The battlefield is built from hex **pieces** in these shapes: 1-hex, 2-hex, 3-hex line, 3-hex triangle, 2x2 (4-hex), 7-hex and 24-hex. Pieces are unlimited in the editor.
- Pieces stack. Each piece is one **level** thick. A piece placed directly on the table is at layer 0; a figure standing on top of it is at **elevation 1**. A figure standing on a stack three pieces tall is at elevation 3.
- A piece must be **held up**, as a real block would be. **Assumption.**
  - Its **contact points** are the middle of each of its hexes that rests on the table or on a held-up piece, and the middle of each side where it touches a held-up piece at its own level.
  - Its middle (the average of its hex centres) must sit over the area, or the line, between its contact points. A piece of more than one hex needs at least 2 contact points.
  - A run of pieces joined side by side that cannot stand piece by piece is checked as one body. That is how a **bridge** stands: held at both ends, with its middle on the line between them.
  - So a bridge between two pillars and a roof over a cave stand, but a slab held by two points at one edge, a piece hanging off one pillar, or a 3-hex line balanced on its middle hex does not.
- Every piece must touch the rest of the map, side by side or one on another. A piece off on its own is a problem.
- No **sealed spaces**: an empty space inside the terrain must have a way out to the open air, sideways, up or down. Caves and the space under bridges are open, so they are fine.
- Pieces that break these rules are problems, and a map with any problem cannot be played.
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

### Scenery

Scenery stands on the terrain and fills one hex or more:

| Scenery | Height | Fills |
|---|---|---|
| **Tree** | 9 levels | 1 hex |
| **Ruined wall** | 3 levels | 1 hex |
| **Boulder** | 2 levels | 1 hex |
| **Large tree** | 12 levels | 4 hexes (a 2 by 2 block) |
| **Large wall** | 7 levels | 3 hexes in a line |
| **Small ruined wall** | 5 levels | 2 hexes in a line |
| **Low wall** | 3 levels | 3 hexes in a line; gives cover |

- No figure can enter or stand on a hex that scenery fills (at that level), except that figures that walk can **climb across a low wall**: entering one of its hexes costs **1 extra move**, and no figure may end its move on it. Trees, the small ruined wall and the large wall cannot be crossed.
- Walls do not make figures engaged: figures on opposite sides of a wall are at least 2 hexes apart.
- Scenery blocks line of sight just like terrain. A short wall or boulder can be seen over by taller figures.
- Scenery must stand on terrain and fit under anything above it. Scenery bigger than one hex needs level ground under all of it.
- Flying figures fly over scenery but cannot land on it (see Flying in section 7).

**Cover (low walls):** a figure standing on a hex next to a low wall, below its top, rolls **1 extra defense die** against an attack from range when the line from the attacker to it passes over the wall. An attack from a neighbouring hex is not from range and gets no cover. Several walls do not add up.

### Start zones
Each map has up to 6 start zones. The map says which zones are used for each player count, so that, for example, two players start in opposite corners. Turn order still goes round the table in seat order. Players set up their figures only in their own zone. Start zones may not hold scenery, and a zone that grows at deployment never grows onto scenery. A map can be played by any number of players it has a separate start zone for.

### Glyphs
Glyphs are small hex tiles scattered face down on the battlefield after every unit has been deployed. The game options say how many: none, or 1 to 11 (all of them); new games start at 4, and games saved before glyphs existed have none. There is one of each kind. Each lies on a random open hex of standard terrain, never in a start zone, under a figure or on scenery, and at least 3 hexes from any other glyph where the board allows.

**Picking up**: a figure that ends a move on a glyph's hex picks it up (a flying figure too). Its player learns what it is; the other players are only told that a glyph was picked up, until it is used. A held glyph sits off to the side of the board with its player.

**Using**: a player can use any glyph they hold at any time during their own turn, before or after moving and attacking, even with a unit other than the one taking the turn. A used glyph is gone. The number in brackets is tunable (`TUNING.glyphs`). A stat glyph lies face up on the card of the unit it was played on, for everyone to see, until it ends.

| Glyph | Effect |
| --- | --- |
| Glyph of Fury | Stat glyph: +1 attack die (1) |
| Glyph of the Bulwark | Stat glyph: +1 defense die (1) |
| Glyph of the Herald | Stat glyph: +8 to its player's next initiative roll (8), rerolls in that roll-off included. Once that roll is made it is spent, and the unit can take another glyph. It is lost if the unit is destroyed (or the glyph cancelled) before the roll |
| Glyph of the Hawk | Stat glyph: +3 range for normal attacks (3), only on a unit whose card has a Range above 1; special attacks keep their own range |
| Glyph of the Stag | Stat glyph: +2 move (2) |
| Glyph of Mending | Heals every wound on one of the player's living units |
| Glyph of Resurrection | Resurrects one of the player's destroyed units, whole and unwounded. The player places every figure, one hex at a time as at deployment, each on a free spot within 3 hexes (3) of another of the player's figures on the battlefield (**Auto place** fills the nearest spots). The unit can be chosen only if all its figures fit. Its old stat glyph does not come back |
| Glyph of Blight | One enemy unit: a squad takes 1 wound on every figure; a hero loses half the Life it has left, rounded down, but at least 1 |
| Glyph of Undoing | Cancels the stat glyph on one enemy unit |
| Glyph of the Pit | A trap: the figure that picks it up takes 1 wound (1) at once |
| Glyph of Doom | A trap: the figure that picks it up is destroyed at the end of its player's second turn after the one it was picked up in (2) |

- **Stat glyphs** go on one of the player's own living units and boost every figure on that card until the whole unit is destroyed (or the glyph is cancelled); the Herald lasts for one initiative roll only. A unit can hold only one glyph at a time.
- **Traps** are sprung when picked up and are not held. Everyone sees what a trap was. A Doom figure's countdown is shown beside the board; only the turns of the figure's own player count. **Assumption.**

## 4. Setting up a game

Game options:
- **Players**: 2 to 6, each in a seat (default 2). Seat order is also the "to the left" order.
- **Map** (default Proving Grounds).
- **Army points**: a points budget per player (default 1000; the menu offers 500, 750, 1000 and 1500), any whole number from 50 to 9999, or **no limit**. With no limit, players draft until they choose to stop or their start zone is full.
- **Faction-pure mode** (optional): every unit in an army must share the faction of that player's first pick. There is no extra reward; it is a theme restriction. **Assumption.**
- **Round limit**: none (the default), or a number of rounds.
- **Glyphs**: how many glyphs are scattered on the battlefield, from none to all 11 (default 4; see Glyphs).

### Drafting
Armies are drafted from a shared pool. Hot-seat games use a **snake draft** (online games use an open draft; see Playing online): the pick order reverses each round of picks (seat 1, 2, 3, 3, 2, 1, 1, 2, 3 and so on). The first picker is decided by a d20 roll.
- **Points**: each pick must fit within the player's remaining points. A player may press "Done drafting" to stop; a player who cannot afford anything that fits is skipped. The draft ends when nobody can or will pick.
- **Uniques**: a unique unit can be drafted by only one player. Common units can be drafted any number of times by anyone (online, every unit can be drafted only once; see Playing online). **Assumption.**
- **Room to deploy**: an army can never need more hexes than its start zone has (a multi-hex figure needs one hex per footprint hex). The draft does not allow a card that would not fit, and a player with no room left skips their remaining picks. On a map whose zones grow (all premade maps), a zone counts as 40 hexes here, since it grows at deployment.

### Deployment
After the draft, units are deployed one at a time in the order they were drafted (after an open draft online, one unit each in turn; see Playing online). (With preset armies, players take turns round the table, one unit each.) Each figure goes on a free spot in its owner's start zone where it fits.
- **Growing zones**: on maps that allow it (all premade maps; custom maps choose in the editor), each start zone grows before deployment until it has a little more room than the army needs: the hexes the army covers, plus a quarter more, plus 2. Players take turns adding one hex at a time, in seat order. A zone grows into free, standable neighbouring hexes, keeping close to its own centre and away from other zones, and never takes another player's hexes. If a unit still has no spot where it fits when its turn to deploy comes, the zone grows again, up to 40 more hexes. **Assumption.**
- **Facing**: each figure starts facing the middle of the battlefield (the nearest eighth; a multi-hex figure along its base). **Assumption.**
- **No room**: if a unit cannot be placed at all (a map whose zones do not grow, or a board with no space left), it sits the game out and counts as destroyed. **Assumption.**

### Playing online
Online, the host picks the options above and shares a room code. Seats and colors follow the order players join, and the host can start once the room holds a player count the map supports. The rules are the same, with these differences:
- **Who acts**: each device acts only for its own player. The game server checks every action, so nobody can move another player's units.
- **Hidden information**: each device sees only what that player could see at a table. Other players' activation tokens and held glyphs stay hidden until revealed or used, glyphs on the battlefield stay face down, and the dice are rolled on the server, so no device can predict them.
- **Open draft**: everyone drafts at the same time instead of in snake order, and each unit can be drafted by only one player, common units too: once someone takes a unit it is greyed out for everyone. The points, faction and room rules are the same. Each player presses "Done drafting" when finished (or is finished for them when nothing left fits), and the draft ends when everyone is done. The d20 roll-off still happens: its winner deploys first, and then players deploy one unit each in turn, in roll-off order, each in the order they drafted their units.
- **Rolling initiative**: each player rolls their own d20 (section 5.2), and no roll is made, or shown to anyone, until every player has rolled.
- **Pinging**: a player can press P to point at the spot under their pointer, on the battlefield in play or on the map during the draft. An arrow in their colour arcs down onto it on every screen in the game, for about half a second; the player who pinged sees it at once, everyone else a moment later. A player looking at the draft cards rather than the map is told who pinged it. Each player can ping once a second; spectators see pings but cannot make them. A ping is not part of the game: it is not saved or replayed.
- **Watching attacks**: every attack opens with a short intro on each screen, then the dice (as each player's **Dice rolls** setting says). Clicking skips the rest of it only once every player has clicked (a player whose show has already ended counts as having clicked), so nobody's view of an attack is cut short; until then the screen says whose click it is waiting for. The player whose turn it is cannot act until everyone has finished watching or skipped, or 20 seconds after their own show has ended, whichever is first. A player who switches away from the game counts as finished. Spectators skip for themselves only.
- **Leaving**: leaving a game in progress concedes (section 12). A dropped connection or a page reload does not: the player returns to the same seat.
- **Spectators** can watch with a room code. They see what a player outside the game would see: no secret tokens.
- **Replays**: when the game ends, everyone can download its full record and watch it again move by move, with every token shown.
- **Saving**: the host can save the game at any time and download it. To carry on later, the host resumes the save in a new room, each player picks their army again, and play continues from the same moment with the same dice. The save holds the whole game, hidden tokens included, so only the host gets it.

## 5. Rounds

Each round has three parts.

### 5.1 Place activation tokens
Each player has numbered tokens for **half the unit cards their army starts the game with, rounded up**, plus a bluff token **X**: an army of 9 cards has tokens **1 to 5** and X. The number is fixed when the first round begins, so it stays the same when units are destroyed. **Assumption** for armies that gain a unit later (mind control): the count does not change.

In secret, each player places their tokens on their own living units' cards, **one token per card**. A player with at least as many living units as tokens places them all. A player with fewer places one token on each unit and chooses which tokens to leave off. The X token does nothing; it hides which units will act.

The tokens stand on the cards on the table, so everyone can see which cards hold one. A player sees the numbers on their own; the others see only the backs until a token is revealed, and a revealed token stays face up on its card until the round ends.

Older saves keep their rules: three numbered tokens and X, and in the oldest, all four placed with stacking allowed.

### 5.2 Roll initiative
Every player rolls a d20; a player whose unit holds the Glyph of the Herald (played in an earlier round) adds its bonus to each roll of this roll-off, rerolls too, and the glyph is then spent. If several players tie for the highest roll, only they roll again, until one is highest. That player goes first, and play passes to the left (increasing seat order, wrapping around) for the rest of the round. Online, the round waits until every player has rolled before any roll is made or shown (see Playing online).

### 5.3 Take turns
1. In initiative order, each player reveals their **1** token and takes a turn with the unit holding it.
2. Then each player, in the same order, reveals their **2** token and takes a turn.
3. And so on, up to the highest numbered token any player has. A player with fewer tokens is passed over once theirs run out.
4. Finally all X tokens are revealed, and a new round begins with token placement.

If the unit holding a token has been destroyed by the time the token is revealed, **that turn is lost.** A token that was left off gives that player no turn at that step.

If a player loses their last figure during their own turn (to lava, a fall or a passing strike), they are out and play moves straight on to the next turn.

## 6. Taking a turn

The revealed unit **activates**. Each of its figures may make one move and one attack.
- A hero moves and then attacks.
- A squad's figures act in any order: figure A can move, figure B can move and attack, then figure A attacks, and so on. Each figure's move must come before its own attack. **Assumption.**
- **A move may be made in pieces**: a figure can move some of its Move, then move again with what is left (for example 3 hexes, then 2 more), as long as it has not attacked. Each piece is checked and resolved as a move of its own (passing strikes, falls, terrain, glyphs). Entering water or swamp, or slipping on ice, ends the figure's movement for the turn. A terrain bonus for staying on one kind of terrain counts only if every piece stayed on it. **Assumption.**
- Moving and attacking are both optional.

## 7. Movement

- Each hex moved costs 1 move, plus terrain costs (water and swamp cost 2).
- **Climbing up** costs 1 extra move for every level climbed.
- Moving down costs nothing extra.
- A figure can only stand where the open space above the ground is at least its Height (this matters under bridges). Climbing needs that much headroom where the figure starts, and dropping down needs it where the figure lands.
- A figure can move through hexes holding **friendly** figures but not **enemy** figures, and cannot end its move on an occupied hex.
- A figure cannot climb a single step taller than its Height. **Assumption.**

### Multi-hex figures

Some figures cover 2 or more hexes (2x1, 3x1 or 2x2 footprints). **Assumption** for all of this section.
- **Standing:** the figure's front hex stands at one height. Each of its other hexes uses the ground nearest that height, at most 1 level up or down *(tunable)*. Every hex needs room for the figure's Height and no scenery. The figure's height for line of sight, height bonuses and falling is that of its highest hex.
- **Moving:** the figure moves one step at a time. Either the whole figure shifts one hex in any direction, keeping its facing, or it turns 60 degrees in place around its front hex.
- **Cost:** a shift costs 1 move, plus the largest extra terrain cost of the hexes it newly covers (water and swamp cost 1 extra), plus the most levels any of its hexes climbs. Turning in place is free.
- **Terrain:** hexes newly covered by a shift or a turn apply their effects. Each new lava hex needs its own roll, and entering water or swamp from outside it ends the move. Multi-hex figures never slip on ice.
- **Other figures:** nothing can stand on any of its hexes. It can pass through friendly figures but not enemies, like any figure.
- **Deploying:** all of its hexes must be in the start zone. It can face any direction.

### Facing

New games give every figure a **facing**: the way it looks. Games saved before this rule have none. **Assumption** for all of this section.
- **Front cone**: a figure sees the half of the battlefield in front of it, 180 degrees, the side line included. Behind it is the other half.
- **After a move**: a single-hex figure faces along its last step, to the nearest eighth of a turn. Until it attacks, its player may turn it to any of the eight directions (the R key, 45 degrees a press; Shift+R the other way). A figure that has not moved this turn keeps its facing, and once it attacks it can no longer turn (a move after attacking, such as Smoke Step's, lets it turn again).
- **Multi-hex figures** face along their base, from its middle to its front hex, so they turn by turning their base as they move.
- Figures pushed, pulled or swapped by abilities keep their facing. A figure brought back faces the middle of the battlefield.
- **Eye view** shows only what is in front of the figure: the view turns no further than the edge of its front cone.

### Flying (ability)
- A flying figure's move is counted in hexes **straight to where it lands**. Terrain, height, scenery and figures on the way do not matter, and climbing costs nothing.
- It can land on any free spot within its Move where it fits, at any height (not on scenery or another figure).
- Terrain affects it only where it lands: lava rolls as usual and swamp hurts at the end of its turn. It never slips on ice and **never takes falling damage**.
- It still takes passing strikes when it takes off from beside an engaged enemy and lands out of reach.

## 8. Attacking

### Range and targets
- Range is counted in hexes from the attacker to the target. For multi-hex figures, count between the nearest hexes of each.
- Range 1 means the target must be adjacent.
- An attack at range 1 needs the two figures to be engaged (see 9).
- **Facing**: every attack, melee or ranged (blasts and other powers aimed at a figure or a hex included), needs some part of the target in the attacker's front cone (see Facing).

### Line of sight
Line of sight treats every figure as a token as tall as its Height, whether the board shows it as a figure model or as that token (the Display setting). Each token has an **eye point** (the centre of its top) and a **hit band** (a coloured band around its upper part).
- The attacker needs a clear straight line from its eye point to some part of the target's hit band. Terrain, scenery and other figures (friend or enemy) block the line. The game checks this automatically; a figure's-eye camera shows the player what the figure sees.
- The ground each figure stands on never blocks the line, so a figure at the edge of a cliff can see the figure at its foot. A bridge or overhang above either figure still can.

### Rolling
1. The attacker rolls attack dice equal to its Attack, plus any bonuses.
2. The defender rolls defense dice equal to its Defense, plus any bonuses.
3. Each skull is a hit; each shield is a block. If hits are more than blocks, the difference is dealt as wounds.

Dice:
- **Attack die**: 3 skull faces, 3 blank faces.
- **Defense die**: 3 shield faces, 3 blank faces.

### Elevation
Compare the elevations of the surfaces the two figures stand on (for a multi-hex figure, its highest hex).
- If the attacker is higher: **+1 attack die**, and **another +1** if the difference is at least the defender's Height.
- If the defender is higher: **+1 defense die**, and **another +1** if the difference is at least the attacker's Height.

### Strike from behind
A **melee** attack (an adjacent target) from wholly outside the defender's front cone rolls **+2 attack dice** *(tunable)*. It adds to the higher-ground bonus and any others. A figure on the side line of the cone is in front, not behind. **Assumption.**

### Wounds and destruction
- Wounds stay on the figure; when its wounds reach its Life it is destroyed. A destroyed figure is removed from the battlefield.

## 9. Engagement

- Two enemy figures are **engaged** if a hex of one is next to a hex of the other and the difference in those hexes' elevations is less than the Height of the lower figure. **Assumption** (this is the "too high to fight across" rule).
- An engaged figure may only attack figures it is engaged with. It cannot shoot at distant targets.
- **Passing strike**: when a step takes a figure out of engagement with one or more enemies, each of those enemies rolls 1 attack die *(tunable)* against it before it leaves. The moving figure does not roll defense. Each skull is 1 wound. A figure destroyed this way falls where it stood. Moving while staying engaged with the same enemy draws no strike.
- The game marks risky moves (ones that draw passing strikes, fall, or cross lava or ice) in orange, and suggests the safest path to each hex.

## 10. Falling

Falling is checked on every step of a move. When a figure's highest hex moves down by a drop of:
- at least its Height: roll 2 attack dice against it, 1 wound per skull, no defense roll *(tunable)*;
- at least double its Height: roll 4 attack dice instead *(tunable)*.

Flying figures never take falling damage.

## 11. Abilities

Each ability has a name and rules text on the card, and is implemented in code as a set of hooks into the rule steps (before movement, during each step, before an attack roll, after wounds, at the end of a turn, and so on). An ability may change any rule. When an ability contradicts the core rules, the ability wins.

General rulings:
- Numbers in abilities (ranges, dice, bonuses, rolls needed) are on the card data and *tunable*.
- **Auras do not stack.** A figure gets each named bonus at most once, however many sources are nearby.
- Bonus dice from abilities add to height bonuses. Every roll lists why its dice changed.
- **Special actions** (Ember Spit, Mortar Barrage, Arc Lightning, Lantern Gaze, Grapple Line, Fae Step) are used **instead of** the figure's normal attack, and follow the normal attack rules (engagement, line of sight) unless they say otherwise.
- **Blasts** (Ember Spit, Mortar Barrage, Arc Lightning, and the units' own blasts such as grenades) hit the target and every other figure next to the hex the blast lands on. A target on one hex is hit on that hex. Against a target on several hexes, the player picks which of its hexes to aim at (click the target, then one of its red hexes); that hex must be within the blast's range, and only figures next to it are caught. No figure is hit twice by one blast: the target takes the full dice once, however many of its hexes touch the aimed hex, and every other figure caught takes the splash dice once. A blast whose card says it may be aimed at a hex (`hexTarget`) can instead land on an empty hex in range and, unless it ignores sight, in sight; it then hits only the figures next to that hex, with the splash dice. Games saved before aiming existed have no aimed hex: they replay as they were played, splashing round every hex of a big target.
- **Forced moves** (Shove, Grapple Line) move a figure without walking: there are no passing strikes and no ice slips, but the figure takes falling damage if it drops far enough and rolls for lava where it lands. **Assumption.**

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
| **Pin** | A figure this figure wounds but does not destroy cannot move on its unit's next turn (it can still attack). The pin ends when that turn ends. |
| **Shove** | After a normal attack on an adjacent single-hex enemy that is not Huge and survives, push it 1 hex straight back, onto the highest ground there no higher than it stands, if it fits and the spot is free. |
| **Grapple Line** (special action) | Range 2 to 3, in sight: pull a Small or Medium single-hex enemy into the free hex next to the figure that is nearest to where it stood. |
| **Last Stand** | When an attack destroys a figure of the squad, it makes a normal attack on its attacker as it falls, if the attacker is within its range (and engaged with it, for melee) and in sight. |
| **Fae Step** (special action) | Swap places with a friendly single-hex figure up to 5 hexes away, if each fits where the other stands and neither is pinned. No line of sight is needed. |
| **Will-o'-the-Wisp** | The figure cannot be the target of an attack or special action from more than 4 hexes away. Blasts aimed at others still catch it. |
| **Regrowth** | At the end of the squad's turn, each wounded figure of the squad standing on forest removes 1 wound. |
| **Volatile Core** | When an attack destroys a figure of the squad, every other figure next to it, friend or foe, rolls 1 defense die; on no shield it takes 1 wound. |
| **War Drums** | Other friendly Orc figures that start a move within 3 hexes of the drummer get +2 Move for that move (an aura). |
| **Corpse Feast** | When a figure of the squad destroys a figure with a normal attack, it may move up to 2 hexes, drawing no passing strikes. |
| **Challenge** | An enemy figure next to this figure may only target this figure with its attacks and special actions. |
| **Piercing** | The target rolls 1 fewer defense die (never fewer than none). |
| **Mending Hymn** | At the end of the squad's turn, the most wounded friendly hero within 3 hexes of any figure of the squad removes 1 wound. |

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
- Ember Spit: Satchel Charge (Sergeant Brannock), with range 2 and 3 dice.
- Mortar Barrage: Lobbed Grenade (Concord Grenadiers), with range 1 to 3 and 2 dice.
- Arc Lightning: Thornburst (Queen Ilyth) and Hex Bolt (Grubnak), with range 4 and 2 dice.
- Trample: Ride Them Down (Brass Hussars).
- Longshot: Whistling Arrow (Lady Suzume).
- Massed Volley: Volley Fire (Teppo Gunners), from the second attack, +1 die.
- Pin: Pinning Shot (Lady Suzume), Shock Gauntlets (Nexus Breachers).
- Shove: Shoulder Barge (Sergeant Brannock).
- Last Stand: Last Volley (Bonebow Archers).
- Smoke Step: Phase Shift (Proxima).
- Smite the Unholy: Righteous Fury (Dame Rowena).
- Piercing: Piercing Bolts (Covenant Crossbowmen).

A figure taken by mind control scores its share of its card's points for its new owner.

## 12. Winning

- **Elimination**: when a player has no figures left, they are out. The last player with figures on the battlefield wins.
- **Round limit** (optional): when the last round ends, the player with the highest score wins. Ties share the win.
  - Score: the points of every figure still on the battlefield. Each squad figure is worth its share of the card's points (for example 2 of 3 figures left scores 2/3 of the points, rounded down).
- A player may **concede** at any time. They are out of the game and their remaining turns are skipped.

## 13. Point costs

Point costs are checked against a balance model in `packages/content/src/balance.ts`: expected damage dealt and attacks survived, worked out exactly from the dice odds, adjusted for range, Move, size and abilities. Every unit must cost between 70% and 130% of what the model suggests (a test enforces it). Run `BALANCE_REPORT=1 pnpm test balance` to print the table.
