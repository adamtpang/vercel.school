// Private fleet dashboard at /admin. Privy handles sign-in; the API decides who is
// an admin, so nothing sensitive ships in this bundle.
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";

const APP_ID = PRIVY_APP_ID;

const COLS = [
  ["host", "Site", "l"],
  ["engaged", "Engaged"],
  ["search", "From search"],
  ["visitors", "All visitors"],
  ["pageviews", "Views"],
  ["visitors7d", "Last 7d"],
  ["score", "Lightmark"],
  ["seo", "SEO"],
  ["conversion", "Conversion"],
  ["cta", "Call to action", "l"],
  ["source", "Top source", "l"],
  ["page", "Top page", "l"]
];

const tone = (n) => (n == null ? "mute" : n >= 85 ? "good" : n >= 60 ? "warn" : "bad");
const num = (n) => (n == null ? "–" : n);

function Dashboard() {
  const { ready, authenticated, login, logout, getAccessToken, user } = usePrivy();
  const [days, setDays] = useState(30);
  const [state, setState] = useState({ status: "idle" });
  const [sort, setSort] = useState(["engaged", -1]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    let live = true;
    setState({ status: "loading" });
    (async () => {
      try {
        const token = await getAccessToken();
        const r = await fetch(`/api/admin/fleet?days=${days}`, { headers: { Authorization: `Bearer ${token}` } });
        const body = await r.json().catch(() => ({}));
        if (live) setState(r.ok ? { status: "ok", data: body } : { status: "error", code: r.status, body });
      } catch {
        if (live) setState({ status: "error", code: 0, body: {} });
      }
    })();
    return () => { live = false; };
  }, [ready, authenticated, days]);

  const rows = useMemo(() => {
    if (state.status !== "ok") return [];
    const list = state.data.sites.map((s) => ({
      ...s,
      source: s.sources[0] ? `${s.sources[0].name} (${s.sources[0].visitors})` : "",
      page: s.pages[0] ? `${s.pages[0].name} (${s.pages[0].visitors})` : ""
    }));
    const [key, dir] = sort;
    return list.sort((a, b) => {
      const x = a[key] ?? (typeof b[key] === "string" ? "" : -1);
      const y = b[key] ?? (typeof a[key] === "string" ? "" : -1);
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * dir || b.visitors - a.visitors;
    });
  }, [state, sort]);

  if (!ready) return <p className="mute center">Loading…</p>;
  if (!authenticated) {
    return (
      <div className="center">
        <h1>Fleet admin</h1>
        <p className="mute">Private. Sign in to continue.</p>
        <button className="primary" onClick={login}>Sign in</button>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="center">
        <h1>{state.code === 403 ? "Not an admin" : "Could not load"}</h1>
        {state.code === 403 ? (
          <p>This account is not on the admin list. Its id is <code>{state.body.did || user?.id}</code></p>
        ) : (
          <p className="mute">{state.body.error || "Network error."}</p>
        )}
        <button onClick={logout}>Sign out</button>
      </div>
    );
  }
  if (state.status !== "ok") return <p className="mute center">Loading traffic…</p>;

  const d = state.data;
  const sum = (k) => rows.reduce((t, r) => t + (r[k] || 0), 0);
  return (
    <>
      <header>
        <div>
          <h1>Fleet admin</h1>
          <span className="mute">Live from PostHog · {new Date(d.generatedAt).toLocaleString()}</span>
        </div>
        <div>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Date range">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>{" "}
          <button onClick={logout}>Sign out</button>
        </div>
      </header>
      <div className="tiles">
        <div className="tile"><b>{sum("engaged")}</b><span className="mute">Engaged visitors</span></div>
        <div className="tile"><b>{sum("search")}</b><span className="mute">From search</span></div>
        <div className="tile"><b>{sum("visitors")}</b><span className="mute">All visitors, bots included</span></div>
        <div className="tile"><b>{rows.filter((r) => r.visitors > 0).length} / {rows.length}</b><span className="mute">Sites with traffic</span></div>
      </div>
      <div className="wrap">
        <table>
          <thead>
            <tr>
              {COLS.map(([key, label, cls]) => (
                <th key={key} className={cls} onClick={() => setSort(([k, dir]) => [key, k === key ? -dir : key === "host" ? 1 : -1])}>
                  {label}{sort[0] === key ? (sort[1] < 0 ? " ↓" : " ↑") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.host}>
                <td><a href={`https://${r.host}`} target="_blank" rel="noreferrer">{r.host}</a></td>
                <td><b>{r.engaged}</b></td>
                <td>{r.search}</td>
                <td className="mute">{r.visitors}</td>
                <td className="mute">{r.pageviews}</td>
                <td>{r.visitors7d}</td>
                <td className={tone(r.score)}>{num(r.score)}</td>
                <td className={tone(r.seo)}>{num(r.seo)}</td>
                <td className={tone(r.conversion)}>{num(r.conversion)}</td>
                <td className={"l " + (r.cta ? "" : "mute")}>{r.cta || (r.score == null ? "–" : "none found")}</td>
                <td className="l">{r.source}</td>
                <td className="l">{r.page}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mute note">
        Engaged means the visitor viewed two or more pages or arrived from another site. It is a rough filter for
        real people. Lightmark scores are a snapshot from {d.scoresAt || "an earlier scan"}, not live.
      </p>
    </>
  );
}

const root = createRoot(document.getElementById("root"));
if (!APP_ID) {
  root.render(<p className="mute center">Admin sign-in is not configured yet.</p>);
} else {
  root.render(
    <PrivyProvider appId={APP_ID} config={{ loginMethods: ["google", "email"], appearance: { showWalletLoginFirst: false } }}>
      <Dashboard />
    </PrivyProvider>
  );
}
