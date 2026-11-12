// Admin-only fleet traffic data. Signed-in Privy users on the allowlist get live
// PostHog numbers for every site; everyone else gets 401 or 403.
//
// Env (all server-side, set on Vercel):
//   PRIVY_APP_ID            the Privy app this site logs in with (public value)
//   ADMIN_PRIVY_DIDS        comma-separated Privy user ids allowed in (did:privy:...)
//   POSTHOG_API_KEY         PostHog personal key with query read scope
//   POSTHOG_PROJECT_ID      optional, defaults to the shared fleet project
//   FLEET_SCORES_JSON       optional {at, sites:{host:{score,seo,ai,conversion,cta}}}
//   PRIVY_VERIFICATION_KEY  optional PEM public key; without it the app's JWKS is used
// Per-site scores (Lightmark, call to action) arrive as JSON in FLEET_SCORES_JSON so the
// fleet inventory never sits in this public repo.
let scores = { at: null, sites: {} };
try { scores = JSON.parse(process.env.FLEET_SCORES_JSON || "") || scores; } catch {}

const SEARCH = "google|bing|duckduckgo|yahoo|brave|ecosia|yandex|baidu|startpage|infospace";
const HOST = "replaceRegexpOne(replaceRegexpOne(lower(toString(properties.$host)), '[.]$', ''), '^www[.]', '')";
const REF = "lower(coalesce(toString(properties.$referring_domain), ''))";

let jwks;
async function verify(token) {
  const jose = await import("jose");
  const appId = process.env.PRIVY_APP_ID;
  const pem = process.env.PRIVY_VERIFICATION_KEY;
  let key;
  if (pem) key = await jose.importSPKI(pem.replace(/\\n/g, "\n"), "ES256");
  else key = jwks ||= jose.createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`));
  const { payload } = await jose.jwtVerify(token, key, { issuer: "privy.io", audience: appId });
  return payload.sub;
}

async function hogql(query) {
  const pid = process.env.POSTHOG_PROJECT_ID || "353195";
  const r = await fetch(`https://us.posthog.com/api/projects/${pid}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.POSTHOG_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } })
  });
  const j = await r.json();
  if (!j.results) throw new Error("posthog query failed");
  return j.results;
}

const skip = (h) => !h || /localhost|127\.0\.0\.1|vercel\.app$|^\d+\.\d+\.\d+\.\d+/.test(h);

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  if (!process.env.PRIVY_APP_ID || !process.env.POSTHOG_API_KEY) {
    res.status(503).json({ error: "admin dashboard is not configured" });
    return;
  }
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  let did;
  try {
    did = await verify(token);
  } catch {
    res.status(401).json({ error: "sign in required" });
    return;
  }
  const allowed = (process.env.ADMIN_PRIVY_DIDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!allowed.includes(did)) {
    res.status(403).json({ error: "not an admin", did });
    return;
  }

  const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 30));
  const where = `event = '$pageview' AND timestamp > now() - INTERVAL ${days} DAY`;
  try {
    const [sites, refs, pages] = await Promise.all([
      // One row per visitor per site first, then roll up. "Engaged" means the visitor
      // viewed two or more pages or arrived from another site: a rough human filter.
      hogql(`SELECT h, count() AS visitors, countIf(pv >= 2 OR ext = 1) AS engaged, countIf(srch = 1) AS search,
               sum(pv) AS pageviews, countIf(last_seen > now() - INTERVAL 7 DAY) AS visitors7d, max(last_seen) AS last
             FROM (SELECT ${HOST} AS h, distinct_id, count() AS pv, max(timestamp) AS last_seen,
                     max(if(match(${REF}, '${SEARCH}'), 1, 0)) AS srch,
                     max(if(${REF} NOT IN ('', '$direct') AND position(${REF}, ${HOST}) = 0, 1, 0)) AS ext
                   FROM events WHERE ${where} GROUP BY h, distinct_id)
             GROUP BY h ORDER BY visitors DESC LIMIT 500`),
      hogql(`SELECT ${HOST} AS h, ${REF} AS r, count(DISTINCT distinct_id) AS v FROM events
             WHERE ${where} AND ${REF} NOT IN ('', '$direct') AND position(${REF}, ${HOST}) = 0
             GROUP BY h, r ORDER BY v DESC LIMIT 2000`),
      hogql(`SELECT ${HOST} AS h, toString(properties.$pathname) AS p, count(DISTINCT distinct_id) AS v FROM events
             WHERE ${where} GROUP BY h, p ORDER BY v DESC LIMIT 5000`)
    ]);
    const top = (rows, host, n) => rows.filter((r) => r[0] === host).slice(0, n).map((r) => ({ name: r[1], visitors: r[2] }));
    const seen = new Set();
    const out = [];
    for (const [host, visitors, engaged, search, pageviews, visitors7d, last] of sites) {
      if (skip(host)) continue;
      seen.add(host);
      out.push({ host, visitors, engaged, search, pageviews, visitors7d, last, tracked: true,
        sources: top(refs, host, 3), pages: top(pages, host, 3), ...(scores.sites[host] || {}) });
    }
    // Sites we know about that sent nothing in the window.
    for (const [host, s] of Object.entries(scores.sites)) {
      if (!seen.has(host)) out.push({ host, visitors: 0, engaged: 0, search: 0, pageviews: 0, visitors7d: 0, last: null,
        tracked: false, sources: [], pages: [], ...s });
    }
    res.status(200).json({ days, generatedAt: new Date().toISOString(), scoresAt: scores.at, sites: out });
  } catch {
    res.status(502).json({ error: "could not load analytics" });
  }
};
