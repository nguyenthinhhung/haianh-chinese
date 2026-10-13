import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createPersistence } from "./platform";
import { createTemplateRegistry } from "./templates";
import { createThemeRegistry } from "./themes";
import { App } from "./ui/App";
import "./ui/app.css";
import { ServicesContext, type Services } from "./ui/services";

const services: Services = {
  templates: createTemplateRegistry(),
  themes: createThemeRegistry(),
  persistence: createPersistence(),
  appVersion: __APP_VERSION__,
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ServicesContext.Provider value={services}>
      <App />
    </ServicesContext.Provider>
  </StrictMode>,
);
