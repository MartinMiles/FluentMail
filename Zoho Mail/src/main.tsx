import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
// No StrictMode double effects: a mounted connected view performs only its intended reads.
createRoot(document.getElementById("root")!).render(<App />);
