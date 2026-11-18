import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";
import { Shell } from "./Shell.tsx";

const root = document.getElementById("root");
if (root === null) throw new Error("The page has no #root element");

createRoot(root).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
);
