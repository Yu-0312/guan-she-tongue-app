import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import server from "../dist/server/index.js";

const projectRoot = resolve(import.meta.dirname, "..");
const outputDir = resolve(projectRoot, "dist/client");
const basepath = process.env.VITE_ROUTER_BASEPATH ?? "/";
const basePrefix =
  basepath === "." || basepath === "./" || basepath === "/"
    ? ""
    : `/${basepath.replace(/^\/+|\/+$/g, "")}`;

const routes = [
  { route: "/", output: "index.html" },
  { route: "/quiz", output: "quiz/index.html" },
  { route: "/capture", output: "capture/index.html" },
  { route: "/results", output: "results/index.html" },
  { route: "/about", output: "about/index.html" },
  { route: "/__not-found__", output: "404.html", allowNotFound: true },
];

const renderRoute = async ({ route, output, allowNotFound = false }) => {
  const requestPath = `${basePrefix}${route}`;
  const response = await server.fetch(new Request(`http://localhost${requestPath}`), {}, {});

  if (!response.ok && !(allowNotFound && response.status === 404)) {
    throw new Error(`Unable to render ${route}: ${response.status} ${response.statusText}`);
  }

  let html = await response.text();

  html = html.replaceAll('"/./assets/', '"./assets/');
  html = html.replaceAll("'/./assets/", "'./assets/");

  html = html.replace(
    "</head>",
    '<script>if (location.protocol === "file:" && !location.hash) history.replaceState(history.state, "", location.pathname + "#/");</script></head>',
  );

  const outputPath = resolve(outputDir, output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html);
  console.log(`Created ${outputPath}`);
};

for (const route of routes) {
  await renderRoute(route);
}
