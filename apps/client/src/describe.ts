import type { GameEvent, GameState, RulesContext, UnitCard } from "@aoh/rules";

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

  /** "Concord Fusiliers 2" for squad figures, the hero's name otherwise. */
  figure(figureId: string): string {
    const [unitId, n] = figureId.split("#");
    const unit = this.state.units.find((u) => u.id === unitId);
    const name = this.unit(unitId ?? "");
    return unit && unit.figures.length > 1 ? `${name} ${n}` : name;
  }

  /** Short label shown on a figure's token, e.g. "CF2". */
  tokenLabel(figureId: string): string {
    const [unitId, n] = figureId.split("#");
    const unit = this.state.units.find((u) => u.id === unitId);
    const label = this.card(unitId ?? "")?.tokenLabel ?? "?";
    return unit && unit.figures.length > 1 ? `${label}${n}` : label;
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
    case "figureMoved":
      return `${names.figure(e.figureId)} moves ${plural(e.path.length, "hex")}.`;
    case "terrainRoll": {
      const what =
        e.outcome === "destroyed" ? "and is destroyed" : e.outcome === "slipped" ? "and slips" : "and is safe";
      return `${names.figure(e.figureId)} rolls ${e.roll} on ${names.terrain(e.terrain)} ${what}.`;
    }
    case "figureSlid":
      return `${names.figure(e.figureId)} slides.`;
    case "attackRolled": {
      const who = e.attackerId ? names.figure(e.attackerId) : "The swamp";
      return `${who} attacks ${names.figure(e.targetId)}: ${plural(e.hits, "hit")}, ${plural(e.blocks, "block")}, ${plural(e.wounds, "wound")}.`;
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
    case "gameOver": {
      const winners = e.result.winners.map((w) => names.player(w)).join(" and ");
      return winners ? `${winners} ${e.result.winners.length > 1 ? "share the win" : "wins"}!` : "Nobody wins.";
    }
  }
}
