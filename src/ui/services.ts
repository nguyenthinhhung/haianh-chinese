import { createContext, useContext } from "react";
import type { TemplateRegistry } from "../core/templateRegistry";
import type { ThemeRegistry } from "../core/themeRegistry";
import type { Persistence } from "../platform/persistence";

export interface Services {
  templates: TemplateRegistry;
  themes: ThemeRegistry;
  persistence: Persistence;
  appVersion: string;
}

export const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error("ServicesContext is missing");
  return services;
}
