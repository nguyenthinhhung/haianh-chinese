import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createPersistence } from "./platform";
import { createScreens, isAudiencePage } from "./platform/screens";
import { createTemplateRegistry } from "./templates";
import { createThemeRegistry } from "./themes";
import { App } from "./ui/App";
import { AudiencePage } from "./ui/AudiencePage";
import "./ui/app.css";
import { ServicesContext, type Services } from "./ui/services";

const services: Services = {
  templates: createTemplateRegistry(),
  themes: createThemeRegistry(),
  persistence: createPersistence(),
  screens: createScreens(),
  appVersion: __APP_VERSION__,
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ServicesContext.Provider value={services}>
      {isAudiencePage() ? <AudiencePage /> : <App />}
    </ServicesContext.Provider>
  </StrictMode>,
);
