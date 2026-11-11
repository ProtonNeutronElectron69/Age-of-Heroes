import { findFigure, type GameEvent, type GameState, type RulesContext, type UnitCard } from "@aoh/rules";

/** Human-readable names for players, units and figures. */
export class Names {
  constructor(
    private readonly state: GameState,
    private readonly ctx: RulesContext,
  ) {}

  player(id: string): string {
    return this.state.players.find((p) => p.id === id)?.name ?? id;
  }

  playerColor(id: string): string {
    return this.state.players.find((p) => p.id === id)?.color ?? "#999";
  }

  card(unitId: string): UnitCard | undefined {
    const unit = this.state.units.find((u) => u.id === unitId);
    return unit ? this.ctx.cards.get(unit.cardId) : undefined;
  }

  unit(unitId: string): string {
    return this.card(unitId)?.name ?? unitId;
  }

  /** The unit a figure belongs to now (a mind-controlled figure moves to a new unit). */
  unitOf(figureId: string) {
    return findFigure(this.state, figureId)?.unit;
  }

  /** "Concord Fusiliers 2" for squad figures, the hero's name otherwise. */
  figure(figureId: string): string {
    const n = figureId.split("#")[1];
    const card = this.cardOfFigure(figureId);
    const name = card?.name ?? figureId;
    return card && card.figureCount > 1 ? `${name} ${n}` : name;
  }

  /** Short label shown on a figure's token, e.g. "CF2". */
  tokenLabel(figureId: string): string {
    const n = figureId.split("#")[1];
    const card = this.cardOfFigure(figureId);
    const label = card?.tokenLabel ?? "?";
    return card && card.figureCount > 1 ? `${label}${n}` : label;
  }

  cardOfFigure(figureId: string): UnitCard | undefined {
    const unit = this.unitOf(figureId);
    return unit ? this.ctx.cards.get(unit.cardId) : undefined;
  }

  /** An ability's printed name, from the figure's card. */
  ability(figureId: string, abilityId: string): string {
    return this.cardOfFigure(figureId)?.advanced.abilities.find((a) => a.id === abilityId)?.name ?? abilityId;
  }

  terrain(id: string): string {
    return this.ctx.terrain.get(id)?.name ?? id;
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** One line of the game log, or null for events not worth showing. */
export function describeEvent(e: GameEvent, names: Names): string | null {
  switch (e.type) {
    case "draftStarted":
      return `Draft roll-off: ${names.player(e.order[0]!)} picks first.`;
    case "cardDrafted":
      return `${names.player(e.player)} drafts ${names.unit(e.unitId)}.`;
    case "draftEnded":
      return "The draft is complete.";
    case "deploymentStarted":
      return "Deploy your armies in your start zones.";
    case "unitDeployed":
      return `${names.player(e.player)} deploys ${names.unit(e.unitId)}.`;
    case "startZoneGrown":
      return `${names.player(e.player)}'s start zone grows by ${e.added} ${e.added === 1 ? "hex" : "hexes"} to fit the army.`;
    case "unitNotDeployed":
      return `${names.unit(e.unitId)} cannot fit in ${names.player(e.player)}'s start zone and sits this game out.`;
    case "deploymentEnded":
      return "All armies are on the battlefield.";
    case "roundStarted":
      return `Round ${e.round} begins. Place your activation tokens.`;
    case "tokensPlaced":
      return `${names.player(e.player)} has placed their tokens.`;
    case "initiativeRolled": {
      const rolls = e.rolls.map((r) => `${names.player(r.player)} ${r.values.join(" then ")}`).join(", ");
      return `Initiative: ${rolls}. ${names.player(e.order[0]!)} goes first.`;
    }
    case "tokenRevealed":
      return e.token === "X"
        ? `${names.player(e.player)}'s X token was on ${names.unit(e.unitId)}.`
        : `${names.player(e.player)} reveals token ${e.token} on ${names.unit(e.unitId)}.`;
    case "turnLost":
      return `${names.unit(e.unitId)} has been destroyed, so ${names.player(e.player)} loses turn ${e.token}.`;
    case "turnStarted":
      return null;
    case "figureMoved": {
      let hexes = 0;
      let prev = e.from;
      for (const s of e.path) {
        if (s.hex.q !== prev.hex.q || s.hex.r !== prev.hex.r) hexes++;
        prev = s;
      }
      return hexes === 0 ? `${names.figure(e.figureId)} turns.` : `${names.figure(e.figureId)} moves ${plural(hexes, "hex")}.`;
    }
    case "terrainRoll": {
      const what =
        e.outcome === "destroyed" ? "and is destroyed" : e.outcome === "slipped" ? "and slips" : "and is safe";
      return `${names.figure(e.figureId)} rolls ${e.roll} on ${names.terrain(e.terrain)} ${what}.`;
    }
    case "figureSlid":
      return `${names.figure(e.figureId)} slides.`;
    case "attackRolled": {
      const extras = e.notes && e.notes.length > 0 ? ` (${e.notes.join(", ")})` : "";
      const result = `${plural(e.hits, "hit")}, ${plural(e.blocks, "block")}, ${plural(e.wounds, "wound")}${extras}`;
      if (e.ability && e.attackerId) {
        return `${names.figure(e.attackerId)} uses ${names.ability(e.attackerId, e.ability)} on ${names.figure(e.targetId)}: ${result}.`;
      }
      if (e.source === "fall") return `${names.figure(e.targetId)} falls: ${plural(e.wounds, "wound")}.`;
      if (e.source === "passingStrike") {
        return `${names.figure(e.attackerId!)} strikes ${names.figure(e.targetId)} as it walks away: ${plural(e.wounds, "wound")}.`;
      }
      const who = e.attackerId ? names.figure(e.attackerId) : "The swamp";
      return `${who} attacks ${names.figure(e.targetId)}: ${result}.`;
    }
    case "figureWounded":
      return null;
    case "figureDestroyed":
      return `${names.figure(e.figureId)} is destroyed.`;
    case "turnEnded":
      return null;
    case "roundEnded":
      return `Round ${e.round} is over.`;
    case "playerConceded":
      return `${names.player(e.player)} concedes.`;
    case "playerEliminated":
      return `${names.player(e.player)} is out of the game.`;
    case "draftPassed":
      return `${names.player(e.player)} is done drafting.`;
    case "abilityUsed":
      return `${names.figure(e.figureId)}: ${e.detail.replace(e.ability, names.ability(e.figureId, e.ability))}.`;
    case "abilityRoll":
      return e.targetId === e.figureId
        ? `${names.figure(e.figureId)} rolls for ${names.ability(e.figureId, e.ability)}: ${e.roll}, needs ${e.needed}. ${e.success ? "Success!" : "No effect."}`
        : `${names.figure(e.figureId)} uses ${names.ability(e.figureId, e.ability)} on ${names.figure(e.targetId)}: rolls ${e.roll}, needs ${e.needed}. ${e.success ? "Success!" : "No effect."}`;
    case "figureHealed":
      return `${names.figure(e.figureId)} is healed (${plural(e.total, "wound")} left).`;
    case "figureRevived":
      return `${names.figure(e.figureId)} returns to the battle.`;
    case "figureControlled":
      return `${names.figure(e.figureId)} now fights for ${names.player(e.player)}.`;
    case "gameOver": {
      const winners = e.result.winners.map((w) => names.player(w)).join(" and ");
      return winners ? `${winners} ${e.result.winners.length > 1 ? "share the win" : "wins"}!` : "Nobody wins.";
    }
  }
}
