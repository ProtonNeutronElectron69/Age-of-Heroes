import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { rejoinSaved } from "./online";
import "./styles.css";

// After a reload (or coming back later), go straight back to an online seat if there is one.
rejoinSaved();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
