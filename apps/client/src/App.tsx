import type { MapDefinition } from "@aoh/rules";
import { useState } from "react";
import { DraftScreen } from "./screens/DraftScreen";
import { EditorScreen } from "./screens/EditorScreen";
import { PlayScreen } from "./screens/PlayScreen";
import { SetupScreen } from "./screens/SetupScreen";
import { useSession } from "./session";

type View = { name: "setup"; mapId?: string } | { name: "editor"; map: MapDefinition | null };

export function App() {
  const session = useSession();
  const [view, setView] = useState<View>({ name: "setup" });

  if (session) {
    if (session.state.phase === "draft") return <DraftScreen session={session} />;
    return <PlayScreen session={session} />;
  }
  if (view.name === "editor") {
    return <EditorScreen initial={view.map} onDone={(mapId) => setView({ name: "setup", mapId })} />;
  }
  return <SetupScreen initialMapId={view.mapId} onOpenEditor={(map) => setView({ name: "editor", map })} />;
}
