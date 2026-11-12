import { copyFile, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

await import("./verify-site.mjs");

const publicFiles = [
  "index.html",
  "about.html",
  "contact.html",
  "privacy.html",
  "admin.html",
  "info.css",
  "favicon.ico",
  "favicon.svg",
  "apple-touch-icon.png",
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
// Private admin dashboard (/admin). The Privy app id is a public value; who counts as an
// admin is decided by the API, never by this bundle.
const optionalWalletPackages = ["@solana-program/system"];
const privyAppId = process.env.PRIVY_APP_ID || "";
if (privyAppId && !/^[a-z0-9]{10,40}$/.test(privyAppId)) throw new Error("PRIVY_APP_ID does not look like a Privy app id.");
await build({
  entryPoints: ["admin-entry.jsx"],
  bundle: true,
  minify: true,
  format: "iife",
  jsx: "automatic",
  outfile: "public/admin.js",
  define: { PRIVY_APP_ID: JSON.stringify(privyAppId), "process.env.NODE_ENV": JSON.stringify("production"), global: "globalThis" },
  // Privy imports optional Solana packages for wallet funding. Login never reaches them.
  alias: Object.fromEntries(optionalWalletPackages.map((name) => [name, "./scripts/empty-module.cjs"])),
  logLevel: "error"
});
console.log(privyAppId ? "Admin dashboard bundle configured." : "Admin sign-in disabled: PRIVY_APP_ID is not configured.");

console.log(publicToken ? 'PostHog bundle configured; verify project cookieless mode before deploying.' : 'PostHog disabled: POSTHOG_PUBLIC_TOKEN is not configured.');

console.log(`Built public output with ${publicFiles.length} intentional files.`);
