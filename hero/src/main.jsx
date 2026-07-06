import React from "react";
import ReactDOM from "react-dom/client";

import Hero from "./components/Hero";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <main className="min-h-screen bg-primary">
      <Hero />
    </main>
  </React.StrictMode>
);
