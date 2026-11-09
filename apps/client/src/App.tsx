import { DraftScreen } from "./screens/DraftScreen";
import { PlayScreen } from "./screens/PlayScreen";
import { SetupScreen } from "./screens/SetupScreen";
import { useSession } from "./session";

export function App() {
  const session = useSession();
  if (!session) return <SetupScreen />;
  if (session.state.phase === "draft") return <DraftScreen session={session} />;
  return <PlayScreen session={session} />;
}
