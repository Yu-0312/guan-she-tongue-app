import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import server from "../dist/server/index.js";

const projectRoot = resolve(import.meta.dirname, "..");
const outputPath = resolve(projectRoot, "dist/client/index.html");

const response = await server.fetch(new Request("http://localhost/"), {}, {});

if (!response.ok) {
  throw new Error(`Unable to render file page: ${response.status} ${response.statusText}`);
}

let html = await response.text();

html = html.replaceAll('"/./assets/', '"./assets/');
html = html.replaceAll("'/./assets/", "'./assets/");

html = html.replace(
  "</head>",
  '<script>if (location.protocol === "file:" && !location.hash) history.replaceState(history.state, "", location.pathname + "#/");</script></head>',
);

await mkdir(resolve(projectRoot, "dist/client"), { recursive: true });
await writeFile(outputPath, html);

console.log(`Created ${outputPath}`);
