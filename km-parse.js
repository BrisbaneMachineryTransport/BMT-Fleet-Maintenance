/* Reads daily km reports (MyTrucking exports, CSV, or pasted tables).
   Shared by the web app and the automatic sync script (scripts/sync-km.mjs). */
(function (root) {
  "use strict";
  const MON = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const pad = n => String(n).padStart(2, "0");

  // Australian date order: 16/11/2026 is 16 November.
  function parseAnyDate(v) {
    if (v == null) return null;
    const s = String(v).trim(); let m, y, mo, d;
    if ((m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = s.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
    else if ((m = s.match(/(\d{1,2})[ \-]([A-Za-z]{3,})[ \-,]*(\d{2,4})/))) { d = +m[1]; mo = MON.indexOf(m[2].slice(0, 3).toLowerCase()) + 1; y = +m[3]; }
    else return null;
    if (y < 100) y += 2000;
    if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y > 2000 && y < 2100)) return null;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  const norm = v => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  function splitLine(line, delim) {
    const out = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === delim) { out.push(cur.trim()); cur = ""; }
      else cur += c;
    }
    out.push(cur.trim()); return out;
  }

  // trucks: [{id, name, rego, fleetNo}]
  function matchTruck(trucks, v) {
    const n = norm(v); if (!n) return null;
    const keys = t => [t.fleetNo, t.rego, t.name];
    for (const t of trucks) if (keys(t).some(x => x && norm(x) === n)) return t;
    for (const t of trucks) if (keys(t).some(x => { const c = norm(x); return c.length >= 3 && (n.includes(c) || c.includes(n)); })) return t;
    return null;
  }

  // Returns {entries:[{truckId,date,km}], unmatched:{name:count}, rows, bad, colsText}
  // Rows for the same truck and day are added together (e.g. several jobs in one day).
  function parseImport(text, trucks, forceTruckId) {
    const lines = String(text || "").split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return { entries: [], unmatched: {}, rows: 0, bad: 0, colsText: "none" };
    const f = lines[0], delim = f.includes("\t") ? "\t" : (f.split(";").length > f.split(",").length ? ";" : ",");
    const rows = lines.map(l => splitLine(l, delim));
    const isNum = v => /^\s*-?[\d,]+(\.\d+)?\s*(km|kms)?\s*$/i.test(v || "");
    let header = null;
    if (!rows[0].some(v => parseAnyDate(v))) header = rows.shift().map(h => h.toLowerCase());
    const nc = Math.max(0, ...rows.map(r => r.length));
    const frac = (fn, i) => rows.length ? rows.filter(r => fn(r[i])).length / rows.length : 0;
    let dc = -1, kc = -1, tc = -1;
    if (header) header.forEach((h, i) => {
      if (dc < 0 && /date|day/.test(h)) dc = i;
      else if (kc < 0 && /(^|[^a-z])kms?([^a-z]|$)|kilomet|distance|travel/.test(h)) kc = i;
      else if (tc < 0 && /truck|vehicle|rego|fleet|unit|asset|plate/.test(h)) tc = i;
    });
    const cand = [...Array(nc).keys()];
    if (dc < 0) { let b = -1, bs = 0; for (const i of cand) { const s = frac(v => !!parseAnyDate(v), i); if (s > bs) { bs = s; b = i; } } dc = b; }
    if (kc < 0) { let b = -1, bs = 0; for (const i of cand.slice().reverse()) { if (i === dc) continue; const s = frac(isNum, i); if (s > bs) { bs = s; b = i; } } kc = b; }
    if (tc < 0 && !forceTruckId) { let b = -1, bs = -1; for (const i of cand) { if (i === dc || i === kc) continue; const s = frac(v => !!matchTruck(trucks, v), i) + (frac(isNum, i) < .5 ? 0.01 : 0); if (s > bs) { bs = s; b = i; } } tc = b; }
    const agg = {}, unmatched = {}; let bad = 0;
    for (const r of rows) {
      const d = parseAnyDate(r[dc]); const raw = String(r[kc] ?? "").trim(); const km = Number(raw.replace(/[^\d.\-]/g, ""));
      if (!d || raw === "" || !isFinite(km) || km < 0) { bad++; continue; }
      const t = forceTruckId ? trucks.find(x => x.id === forceTruckId) : matchTruck(trucks, r[tc]);
      if (!t) { const nm = (r[tc] || "(blank)").trim(); unmatched[nm] = (unmatched[nm] || 0) + 1; continue; }
      const k = t.id + "|" + d; agg[k] = (agg[k] || 0) + km;
    }
    const nameOf = i => header && header[i] ? `"${header[i]}"` : `column ${i + 1}`;
    return {
      entries: Object.entries(agg).map(([k, km]) => { const [truckId, date] = k.split("|"); return { truckId, date, km: Math.round(km * 10) / 10 }; }),
      unmatched, rows: rows.length, bad,
      colsText: `date = ${nameOf(dc)}, km = ${nameOf(kc)}, truck = ${forceTruckId ? "chosen truck" : nameOf(tc)}`
    };
  }

  const api = { parseAnyDate, splitLine, matchTruck, parseImport, norm };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.KmParse = api;
})(typeof window !== "undefined" ? window : globalThis);
