import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";

const at = relative => new URL(relative, import.meta.url);
const read = name => readFile(at(name), "utf8");
const [template, styles, client, editions, inventory, worker, scanData, collectorModule, summaryHelper, localizer] = await Promise.all([
  read("site.html"), read("site.css"), read("headline-feed.js"), read("editions.json"),
  read("sources.txt"), read("worker.mjs"), read("archive-source-results.json"), read("archive-collector.mjs"), read("article-summary.mjs"), read("archive-localize.py")
]);
const collector = collectorModule.replace('import { shortSourceSummary } from "./article-summary.mjs";',() => summaryHelper.replace(/^export /gm,""));
const html = template
  .replace("/* STYLES */", () => styles)
  .replace("/* EDITIONS */", () => JSON.stringify(JSON.parse(editions)).replaceAll("<","\\u003c"))
  .replace("/* CLIENT */", () => client);
await Promise.all(["dist/server/","dist/.openai/"].map(dir => mkdir(at(dir), {recursive:true})));
await Promise.all([
  writeFile(at("dist/index.html"), html),
  writeFile(at("dist/server/index.js"), "const html = "+JSON.stringify(html)+";\nconst inventory = "+JSON.stringify(inventory)+";\nconst scanData = "+JSON.stringify(scanData)+";\nconst collector = "+JSON.stringify(collector)+";\nconst localizer = "+JSON.stringify(localizer)+";\n"+worker),
  copyFile(at(".openai/hosting.json"),at("dist/.openai/hosting.json"))
]);
if (process.argv.includes("--offline")) await writeFile(at("../../outputs/teknoloji-bulteni.html"),html);
