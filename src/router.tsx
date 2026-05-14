import { QueryClient } from "@tanstack/react-query";
import { createHashHistory } from "@tanstack/history";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const normalizeBasepath = (basepath: string | undefined) => {
  if (!basepath || basepath === "." || basepath === "./" || basepath === "/") return "/";
  return `/${basepath.replace(/^\/+|\/+$/g, "")}`;
};

const getRouterBasepath = () => normalizeBasepath(import.meta.env.VITE_ROUTER_BASEPATH);

const getFileHistory = () => {
  if (typeof window === "undefined") return undefined;
  return window.location.protocol === "file:" ? createHashHistory() : undefined;
};

export const getRouter = () => {
  const queryClient = new QueryClient();
  const fileHistory = getFileHistory();

  const router = createRouter({
    routeTree,
    basepath: fileHistory ? "/" : getRouterBasepath(),
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    ...(fileHistory ? { history: fileHistory } : {}),
  });

  return router;
};
