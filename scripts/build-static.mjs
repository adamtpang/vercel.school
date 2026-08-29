import { copyFile, mkdir, rm } from "node:fs/promises";

await import("./verify-site.mjs");

const publicFiles = [
  "index.html",
  "about.html",
  "contact.html",
  "privacy.html",
  "info.css",
  "site.js",
  "llms.txt",
  "robots.txt",
  "sitemap.xml"
];

await rm("public", { recursive: true, force: true });
await mkdir("public", { recursive: true });
await Promise.all(publicFiles.map((file) => copyFile(file, `public/${file}`)));

console.log(`Built public output with ${publicFiles.length} intentional files.`);
