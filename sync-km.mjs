// Automatic daily km sync, run by GitHub Actions (added later, once a km feed is available).
// Fetches a daily km report and loads it into the database. Nothing to install: uses Node's built-in fetch.
//
// Settings come from GitHub repository secrets (Settings > Secrets and variables > Actions):
//   SUPABASE_URL          https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY  the "service_role" key (secret, never put it in config.js)
//   COMPANY_ID            your company's id (shown in the app under Settings once live)
//   KM_SOURCE_URL         where to download the daily km report (CSV, or JSON [{date, truck, km}])
//   KM_SOURCE_TOKEN       optional: access token for that address
//
// KM_SOURCE_URL is the part still to confirm. MyTrucking's API, or your GPS provider's (EROAD,
// Teletrac Navman, V-DAQ...), must offer daily km per vehicle. Once they give you the address and a
// token, put them in the secrets above. If their format needs adapting, change fetchSource() below.

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parseImport } = require("./km-parse.js");

const env = k => (process.env[k] || "").trim();
const SUPABASE_URL = (() => { try { return new URL(env("SUPABASE_URL")).origin; } catch { return env("SUPABASE_URL"); } })(), KEY = env("SUPABASE_SERVICE_KEY"), COMPANY = env("COMPANY_ID");
const SOURCE = env("KM_SOURCE_URL"), TOKEN = env("KM_SOURCE_TOKEN");

const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "COMPANY_ID", "KM_SOURCE_URL"].filter(k => !env(k));
if (missing.length) {
  console.log(`::notice::km sync skipped: these repository secrets aren't set yet: ${missing.join(", ")}. See README.md, "Automatic km".`);
  process.exit(0);
}

async function fetchSource() {
  const res = await fetch(SOURCE, { headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {} });
  if (!res.ok) throw new Error(`Report download failed: ${res.status} ${res.statusText}`);
  const text = await res.text();
  // JSON arrays are turned into CSV so the same reader handles both.
  if (/^\s*[\[{]/.test(text)) {
    let rows = JSON.parse(text); if (!Array.isArray(rows)) rows = rows.data || rows.items || rows.results || [];
    const pick = (o, re) => { const k = Object.keys(o).find(k => re.test(k)); return k ? o[k] : ""; };
    return ["date,truck,km", ...rows.map(r => [pick(r, /date|day/i), pick(r, /truck|vehicle|rego|fleet|unit|asset/i), pick(r, /km|distance/i)]
      .map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  }
  return text;
}

async function rest(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    // Classic keys (eyJ...) go in both headers; newer "sb_secret_" keys only in apikey.
    ...opts, headers: { apikey: KEY, ...(KEY.startsWith("eyJ") ? { Authorization: `Bearer ${KEY}` } : {}), "Content-Type": "application/json", ...(opts.headers || {}) }
  });
  if (!res.ok) throw new Error(`Database error ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json().catch(() => null);
}

const trucks = (await rest(`trucks?select=id,name,rego,fleet_no&company_id=eq.${encodeURIComponent(COMPANY)}`))
  .map(t => ({ id: t.id, name: t.name, rego: t.rego, fleetNo: t.fleet_no }));
if (!trucks.length) { console.log("::warning::No vehicles found for COMPANY_ID. Check the id."); process.exit(0); }

const report = await fetchSource();
const result = parseImport(report, trucks, "");
console.log(`Read ${result.rows} rows (${result.colsText}); ${result.entries.length} vehicle-days to load; ${result.bad} unreadable.`);
const unmatched = Object.entries(result.unmatched);
if (unmatched.length) console.log(`::warning::Unmatched vehicle names: ${unmatched.map(([n, c]) => `${n} (${c})`).join(", ")}. Set "Name in MyTrucking" on those vehicles.`);

const rows = result.entries.map(e => ({ company_id: COMPANY, truck_id: e.truckId, day: e.date, km: e.km, source: "sync", updated_at: new Date().toISOString() }));
for (let i = 0; i < rows.length; i += 500) {
  await rest("km_daily?on_conflict=truck_id,day", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows.slice(i, i + 500)) });
}
console.log(`Loaded ${rows.length} vehicle-days of km.`);
