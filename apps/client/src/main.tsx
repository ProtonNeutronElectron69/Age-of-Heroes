import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { rejoinSaved } from "./online";
import { startSounds } from "./sfx";
import "./styles.css";

// After a reload (or coming back later), go straight back to an online seat if there is one.
rejoinSaved();
// Sound effects start with the player's first click or key; hover and click sounds are heard everywhere.
startSounds();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
