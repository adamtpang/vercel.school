import { copyFile, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

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

const publicToken = process.env.POSTHOG_PUBLIC_TOKEN || '';
if (publicToken && !/^phc_[A-Za-z0-9_-]+$/.test(publicToken)) {
  throw new Error('POSTHOG_PUBLIC_TOKEN must be a public project token, never a read credential.');
}
await build({
  entryPoints: ['analytics-entry.mjs'],
  bundle: true,
  minify: true,
  format: 'iife',
  outfile: 'public/analytics.js',
  define: { POSTHOG_PUBLIC_TOKEN: JSON.stringify(publicToken) }
});
console.log(publicToken ? 'PostHog bundle configured; verify project cookieless mode before deploying.' : 'PostHog disabled: POSTHOG_PUBLIC_TOKEN is not configured.');

console.log(`Built public output with ${publicFiles.length} intentional files.`);
