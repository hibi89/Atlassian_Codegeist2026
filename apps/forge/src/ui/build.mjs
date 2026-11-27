import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "dist");
await mkdir(out, { recursive: true });
await build({ entryPoints: [path.join(here, "main.tsx")], outfile: path.join(out, "app.js"), bundle: true, minify: true, platform: "browser", target: "es2022", jsx: "automatic", legalComments: "linked", define: { "process.env.NODE_ENV": '"production"' } });
await copyFile(path.join(here, "index.html"), path.join(out, "index.html"));

const projectOut=path.join(here,"project-dist");
await mkdir(projectOut,{recursive:true});
await build({entryPoints:[path.join(here,"project.tsx")],outfile:path.join(projectOut,"app.js"),bundle:true,minify:true,platform:"browser",target:"es2022",jsx:"automatic",legalComments:"linked",define:{"process.env.NODE_ENV":'"production"'}});
await copyFile(path.join(here,"index.html"),path.join(projectOut,"index.html"));
