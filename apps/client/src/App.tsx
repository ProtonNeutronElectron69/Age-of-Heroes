import type { Replay } from "@aoh/protocol";
import type { MapDefinition } from "@aoh/rules";
import { useState } from "react";
import { useOnline } from "./online";
import { DiceShowScreen } from "./screens/DiceShowScreen";
import { CardGalleryScreen } from "./screens/CardGalleryScreen";
import { DraftScreen } from "./screens/DraftScreen";
import { EditorScreen } from "./screens/EditorScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { ModelGalleryScreen } from "./screens/ModelGalleryScreen";
import { PlayScreen } from "./screens/PlayScreen";
import { ReplayScreen } from "./screens/ReplayScreen";
import { SetupScreen } from "./screens/SetupScreen";
import { UnitGalleryScreen } from "./screens/UnitGalleryScreen";
import { MapGalleryScreen } from "./screens/MapGalleryScreen";
import { useMusicScene } from "./music";
import { useSession } from "./session";
import { useEventSounds } from "./sfx";

type View =
  | { name: "setup"; mapId?: string }
  | { name: "editor"; map: MapDefinition | null }
  | { name: "replay"; replay: Replay }
  | { name: "units" }
  | { name: "maps"; mapId?: string };

export function App() {
  const session = useSession();
  const online = useOnline();
  const [view, setView] = useState<View>({ name: "setup" });
  // Menu music everywhere outside a game; a game has its own, and its end has the victory music.
  const inGame = session !== null || view.name === "replay";
  useMusicScene(session?.state.phase === "gameOver" ? "victory" : inGame ? "play" : "menu");
  useEventSounds(session?.lastEvents ?? null, session?.events.length ?? null);

  // The card and model galleries and the dice show are design pages, opened with ?cards, ?models or ?dice in the address.
  const query = new URLSearchParams(window.location.search);
  if (query.has("cards")) return <CardGalleryScreen />;
  if (query.has("models")) return <ModelGalleryScreen filter={query.get("models") ?? ""} />;
  if (query.has("dice")) return <DiceShowScreen />;
  if (session) {
    if (session.state.phase === "draft") return <DraftScreen session={session} />;
    return <PlayScreen session={session} />;
  }
  if (online.status !== "idle") return <LobbyScreen />;
  if (view.name === "editor") {
    return <EditorScreen initial={view.map} onDone={(mapId) => setView({ name: "setup", mapId })} />;
  }
  if (view.name === "replay") {
    return <ReplayScreen replay={view.replay} onClose={() => setView({ name: "setup" })} />;
  }
  if (view.name === "units") return <UnitGalleryScreen onClose={() => setView({ name: "setup" })} />;
  if (view.name === "maps") {
    return <MapGalleryScreen initialMapId={view.mapId} onChoose={(mapId) => setView({ name: "setup", mapId })} onClose={() => setView({ name: "setup", mapId: view.mapId })} />;
  }
  return (
    <SetupScreen
      initialMapId={view.mapId}
      onOpenEditor={(map) => setView({ name: "editor", map })}
      onOpenReplay={(replay) => setView({ name: "replay", replay })}
      onOpenUnits={() => setView({ name: "units" })}
      onOpenMaps={(mapId) => setView({ name: "maps", mapId })}
    />
  );
}
