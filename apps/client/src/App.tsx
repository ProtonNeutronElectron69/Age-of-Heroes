import type { Replay } from "@aoh/protocol";
import type { MapDefinition } from "@aoh/rules";
import { useState } from "react";
import { useOnline } from "./online";
import { CardGalleryScreen } from "./screens/CardGalleryScreen";
import { DraftScreen } from "./screens/DraftScreen";
import { EditorScreen } from "./screens/EditorScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { ModelGalleryScreen } from "./screens/ModelGalleryScreen";
import { PlayScreen } from "./screens/PlayScreen";
import { ReplayScreen } from "./screens/ReplayScreen";
import { SetupScreen } from "./screens/SetupScreen";
import { useSession } from "./session";

type View =
  | { name: "setup"; mapId?: string }
  | { name: "editor"; map: MapDefinition | null }
  | { name: "replay"; replay: Replay };

export function App() {
  const session = useSession();
  const online = useOnline();
  const [view, setView] = useState<View>({ name: "setup" });

  // The card and model galleries are design pages, opened with ?cards or ?models in the address.
  const query = new URLSearchParams(window.location.search);
  if (query.has("cards")) return <CardGalleryScreen />;
  if (query.has("models")) return <ModelGalleryScreen filter={query.get("models") ?? ""} />;
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
  return (
    <SetupScreen
      initialMapId={view.mapId}
      onOpenEditor={(map) => setView({ name: "editor", map })}
      onOpenReplay={(replay) => setView({ name: "replay", replay })}
    />
  );
}
