import { Platform } from "react-native";

type AppRouter = {
  push: (href: any) => void;
  replace: (href: any) => void;
};

function browserLocation() {
  return (globalThis as typeof globalThis & {
    location?: {
      assign?: (href: string) => void;
      replace?: (href: string) => void;
      href?: string;
    };
  }).location;
}

export function pushPublicRoute(router: AppRouter, href: string) {
  const location = browserLocation();
  if (Platform.OS === "web" && location) {
    if (typeof location.assign === "function") {
      location.assign(href);
    } else {
      location.href = href;
    }
    return;
  }
  router.push(href as any);
}

export function replacePublicRoute(router: AppRouter, href: string) {
  const location = browserLocation();
  if (Platform.OS === "web" && location) {
    if (typeof location.replace === "function") {
      location.replace(href);
    } else {
      location.href = href;
    }
    return;
  }
  router.replace(href as any);
}
