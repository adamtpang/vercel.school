import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pages = ["index.html", "about.html", "contact.html", "privacy.html"];
const htmlByPage = new Map(
  await Promise.all(pages.map(async (page) => [page, await readFile(page, "utf8")]))
);

for (const [page, html] of htmlByPage) {
  const headings = [...html.matchAll(/<h([1-6])\b/gi)].map((match) => Number(match[1]));
  assert.equal(headings.filter((level) => level === 1).length, 1, `${page} must have exactly one H1`);
  for (let index = 1; index < headings.length; index += 1) {
    assert.ok(headings[index] - headings[index - 1] <= 1, `${page} skips a heading level`);
  }
  assert.match(html, /<html\s+lang="en"/i, `${page} must declare its language`);
  assert.match(html, /<link\s+rel="canonical"\s+href="https:\/\/vercel\.school\//i, `${page} needs a canonical URL`);
}

const home = htmlByPage.get("index.html");
for (const path of ["/about", "/contact", "/privacy"]) {
  assert.ok(home.includes(`href="${path}"`), `home must link ${path}`);
}

assert.match(home, /<label\s+for="subEmail">Email address<\/label>/i, "email input needs a visible label");
assert.match(home, /<input[^>]+id="subEmail"[^>]+name="email"/i, "email input needs a stable name");
assert.doesNotMatch(home, /<script>(?![\s\S]*application\/ld\+json)/i, "executable inline scripts are not allowed");

const productUrls = [
  "https://beware.dog",
  "https://moneymeta.fun",
  "https://sprite.email",
  "https://skill.supply",
  "https://darktalent.tech",
  "https://deathmoney.fyi",
  "https://youchop.app",
  "https://sellsniper.com",
  "https://anchormarianas.com",
  "https://summon.guide",
  "https://everybot.fun"
];
for (const url of productUrls) assert.ok(home.includes(`href="${url}"`), `missing product link ${url}`);

const vercel = JSON.parse(await readFile("vercel.json", "utf8"));
const configuredHeaders = Object.fromEntries(vercel.headers[0].headers.map(({ key, value }) => [key.toLowerCase(), value]));
assert.match(configuredHeaders["content-security-policy"], /default-src 'self'/, "CSP must be configured");
assert.equal(configuredHeaders["x-content-type-options"], "nosniff", "nosniff must be configured");

const sitemap = await readFile("sitemap.xml", "utf8");
for (const path of ["", "about", "contact", "privacy"]) {
  assert.ok(sitemap.includes(`<loc>https://vercel.school/${path}</loc>`), `sitemap missing /${path}`);
}

console.log(`Verified ${pages.length} pages, ${productUrls.length} product links, accessibility invariants, trust links, sitemap entries, and security headers.`);
