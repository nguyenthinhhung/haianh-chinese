import { createContext, useContext } from "react";
import type { TemplateRegistry } from "../core/templateRegistry";
import type { ThemeRegistry } from "../core/themeRegistry";
import type { Persistence } from "../platform/persistence";
import type { Screens } from "../platform/screens";

export interface Services {
  templates: TemplateRegistry;
  themes: ThemeRegistry;
  persistence: Persistence;
  screens: Screens;
  appVersion: string;
}

export const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error("ServicesContext is missing");
  return services;
}
