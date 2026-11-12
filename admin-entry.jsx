// Private fleet dashboard at /admin. Privy handles sign-in; the API decides who is
// an admin, so nothing sensitive ships in this bundle.
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";

const APP_ID = PRIVY_APP_ID;
const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

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
const fmt = (n) => Math.round(n).toLocaleString("en-US");

// Numbers roll up to their value instead of popping in.
function Count({ to }) {
  const [v, setV] = useState(calm ? to : 0);
  const from = useRef(0);
  useEffect(() => {
    if (calm) { setV(to); return; }
    const start = performance.now();
    const a = from.current;
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / 900);
      const eased = 1 - Math.pow(1 - p, 4);
      setV(a + (to - a) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{fmt(v)}</>;
}

function Spark({ points, label }) {
  if (points.length < 2) return null;
  const w = 320, h = 72, max = Math.max(1, ...points);
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, h - 4 - (p / max) * (h - 10)]);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path className="area" d={`${line} L${w} ${h} L0 ${h} Z`} />
      <path className="line" d={line} pathLength="1" />
    </svg>
  );
}

function Ring({ part, whole }) {
  const r = 34, c = 2 * Math.PI * r, share = whole ? part / whole : 0;
  return (
    <svg className="ring" viewBox="0 0 84 84" aria-hidden="true">
      <circle cx="42" cy="42" r={r} className="track" />
      <circle cx="42" cy="42" r={r} className="fill" strokeDasharray={c} style={{ "--gap": c * (1 - share), "--full": c }} />
    </svg>
  );
}

function BarList({ items, max, dark }) {
  const top = max || Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className={"bars" + (dark ? " on-dark" : "")}>
      {items.map((it, i) => (
        <li key={it.name} style={{ "--i": i }}>
          <span className="name">{it.name}</span>
          <span className="val">{fmt(it.value)}</span>
          <span className="rail"><span className={"bar " + (it.tone || "")} style={{ "--w": `${Math.max(2, (it.value / top) * 100)}%` }} /></span>
        </li>
      ))}
      {!items.length && <li className="mute">Nothing yet.</li>}
    </ul>
  );
}

function Card({ className = "", i = 0, label, children }) {
  return (
    <section className={"card " + className} style={{ "--i": i }}>
      {label && <h2 className="label">{label}</h2>}
      {children}
    </section>
  );
}

function Shell({ children }) {
  return <div className="center card solo">{children}</div>;
}

function Dashboard() {
  const { ready, authenticated, login, logout, getAccessToken, user } = usePrivy();
  const [days, setDays] = useState(30);
  const [state, setState] = useState({ status: "idle" });
  const [sort, setSort] = useState(["engaged", -1]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    let live = true;
    setState((s) => (s.status === "ok" ? { ...s, refreshing: true } : { status: "loading" }));
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

  const sites = useMemo(() => (state.status === "ok" ? state.data.sites.map((s) => ({
    ...s,
    source: s.sources[0] ? `${s.sources[0].name} (${s.sources[0].visitors})` : "",
    page: s.pages[0] ? `${s.pages[0].name} (${s.pages[0].visitors})` : ""
  })) : []), [state]);

  const rows = useMemo(() => {
    const [key, dir] = sort;
    return [...sites].sort((a, b) => {
      const x = a[key] ?? (typeof b[key] === "string" ? "" : -1);
      const y = b[key] ?? (typeof a[key] === "string" ? "" : -1);
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * dir || b.visitors - a.visitors;
    });
  }, [sites, sort]);

  if (!ready) return <p className="mute center">Loading…</p>;
  if (!authenticated) {
    return (
      <Shell>
        <h1>Fleet admin</h1>
        <p className="mute">Private. Sign in to continue.</p>
        <button className="primary" onClick={login}>Sign in</button>
      </Shell>
    );
  }
  if (state.status === "error") {
    return (
      <Shell>
        <h1>{state.code === 403 ? "Not an admin" : "Could not load"}</h1>
        {state.code === 403 ? (
          <p>This account is not on the admin list. Its id is <code>{state.body.did || user?.id}</code></p>
        ) : (
          <p className="mute">{state.body.error || "Network error."}</p>
        )}
        <button onClick={logout}>Sign out</button>
      </Shell>
    );
  }
  if (state.status !== "ok") return <p className="mute center">Loading traffic…</p>;

  const d = state.data;
  const sum = (k) => sites.reduce((t, r) => t + (r[k] || 0), 0);
  const engaged = sum("engaged"), search = sum("search"), all = sum("visitors");
  const withTraffic = sites.filter((r) => r.visitors > 0).length;
  const by = (k, n) => [...sites].filter((r) => r[k] > 0).sort((a, b) => b[k] - a[k]).slice(0, n);
  const sources = Object.entries(sites.flatMap((s) => s.sources).reduce((m, s) => ({ ...m, [s.name]: (m[s.name] || 0) + s.visitors }), {}))
    .sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value }));
  // Sites real people reach that are not ready to receive them. Sites with no score are
  // archived or unknown, so they are left out.
  const attention = by("engaged", 40).map((s) => {
    const why = !s.cta && s.score != null ? "no call to action" : s.conversion != null && s.conversion < 60 ? `conversion ${s.conversion}`
      : s.seo != null && s.seo < 70 ? `SEO ${s.seo}` : null;
    return why && { ...s, why };
  }).filter(Boolean).slice(0, 5);
  const share = all ? Math.round((engaged / all) * 100) : 0;

  return (
    <div className={"tray" + (state.refreshing ? " refreshing" : "")} key={d.generatedAt}>
      <header className="top">
        <div>
          <h1>Fleet admin</h1>
          <span className="mute"><i className="pulse" />Live from PostHog · {new Date(d.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <div className="seg" role="group" aria-label="Date range">
          {[7, 30, 90].map((n) => (
            <button key={n} className={n === days ? "on" : ""} aria-pressed={n === days} onClick={() => setDays(n)}>{n}d</button>
          ))}
          <button className="out" onClick={logout}>Sign out</button>
        </div>
      </header>

      <div className="bento">
        <Card className="dark hero" i={0} label="Engaged visitors">
          <p className="big"><Count to={engaged} /></p>
          <p className="sub">people who read two or more pages or came from another site, last {d.days} days</p>
          <Spark points={d.daily.map((x) => x.visitors)} label="Daily visitors across all sites" />
          <p className="foot"><span>Daily visitors, all sites</span><span>{d.daily.length ? d.daily[d.daily.length - 1].date.slice(5) : ""}</span></p>
        </Card>

        <Card className="tint search" i={1} label="From search">
          <p className="big"><Count to={search} /></p>
          <p className="sub">arrived from Google, Bing, DuckDuckGo and similar</p>
          <BarList items={by("search", 4).map((s) => ({ name: s.host, value: s.search, tone: "accent" }))} />
        </Card>

        <Card className="ringcard" i={2} label="Sites with traffic">
          <div className="ringwrap">
            <Ring part={withTraffic} whole={sites.length} />
            <p className="big small"><Count to={withTraffic} /><span className="of"> / {sites.length}</span></p>
          </div>
          <p className="sub">{sites.length - withTraffic} sites sent nothing in this window</p>
        </Card>

        <Card className="topsites" i={3} label="Most engaged sites">
          <BarList items={by("engaged", 7).map((s) => ({ name: s.host, value: s.engaged }))} />
        </Card>

        <Card className="sources" i={4} label="Where they come from">
          <BarList items={sources} />
        </Card>

        <Card className="noise" i={5} label="All visitors">
          <p className="big small"><Count to={all} /></p>
          <div className="split" aria-hidden="true"><span style={{ "--w": `${share}%` }} /></div>
          <p className="sub"><b>{share}%</b> look like real people. The rest hit one page from nowhere and left, mostly bots.</p>
        </Card>

        <Card className="dark attention" i={6} label="Getting visitors, not ready for them">
          <ul className="flags">
            {attention.map((s, i) => (
              <li key={s.host} style={{ "--i": i }}>
                <a href={`https://${s.host}`} target="_blank" rel="noreferrer">{s.host}</a>
                <span className="chip">{s.why}</span>
                <span className="val">{s.engaged}</span>
              </li>
            ))}
            {!attention.length && <li className="mute">Every site with visitors has a call to action and passing scores.</li>}
          </ul>
        </Card>

        <Card className="scores" i={7} label="Lightmark score, busiest sites">
          <BarList max={100} items={by("engaged", 7).filter((s) => s.score != null).map((s) => ({ name: s.host, value: s.score, tone: tone(s.score) }))} />
          <p className="sub">Snapshot from {d.scoresAt || "an earlier scan"}, not live.</p>
        </Card>

        <Card className="tablecard" i={8} label="Every site">
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
        </Card>
      </div>
    </div>
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
