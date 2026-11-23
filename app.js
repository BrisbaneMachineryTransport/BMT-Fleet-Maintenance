/* BMT Fleet Maintenance — screens, forms and calculations. Data goes through window.Store (js/store.js). */
"use strict";

/* ---------- constants ---------- */
const DEFAULT_SCHEDULE = [
  { name: "Service (oil & filters)", intervalKm: 15000, intervalMonths: 6 },
  { name: "Brake inspection", intervalKm: 30000, intervalMonths: 12 },
  { name: "Wheel alignment & tyre rotation", intervalKm: 40000, intervalMonths: 12 },
];
const TRAILER_SCHEDULE = [
  { name: "Trailer brakes & air lines", intervalKm: 30000, intervalMonths: 6 },
  { name: "Trailer wheel bearings", intervalKm: 50000, intervalMonths: 12 },
];
const COMPLIANCE_SUGGEST = ["Registration", "Certificate of Inspection (COI)", "Insurance", "Safety certificate / roadworthy", "Winch inspection", "Chains & straps inspection", "Ramps inspection", "Fire extinguisher", "First aid kit"];
const TRUCK_TYPES = ["Rigid tilt tray", "Prime mover", "Drop deck trailer", "Low loader / float trailer", "Tag trailer", "Tilt trailer", "Light vehicle (4WD / ute)", "Other"];
const isTrailerType = t => /trailer/i.test(t || "");
const isLightType = t => /light vehicle|ute|4wd/i.test(t || "");
const LIGHT_SCHEDULE = [
  { name: "Service (oil & filters)", intervalKm: 10000, intervalMonths: 6 },
  { name: "Tyre rotation & alignment", intervalKm: 20000, intervalMonths: 12 },
];
const LAYOUTS = {
  "lv": { label: "Car / 4WD / ute · 4 wheels", axles: [{ n: "Front", d: 0 }, { n: "Rear", d: 0 }] },
  "lvd": { label: "Ute · dual rear wheels (6 wheels)", axles: [{ n: "Front", d: 0 }, { n: "Rear", d: 1 }] },
  "4x2s": { label: "Truck · 2 axle, single rear wheels (4)", axles: [{ n: "Steer", d: 0 }, { n: "Rear", d: 0 }] },
  "4x2d": { label: "Truck · 2 axle, dual rear wheels (6)", axles: [{ n: "Steer", d: 0 }, { n: "Drive", d: 1 }] },
  "6x4": { label: "Truck · tandem drive / bogie, 6x4 (10)", axles: [{ n: "Steer", d: 0 }, { n: "Drive 1", d: 1 }, { n: "Drive 2", d: 1 }] },
  "6x2": { label: "Truck · drive + tag axle, 6x2 (10)", axles: [{ n: "Steer", d: 0 }, { n: "Drive", d: 1 }, { n: "Tag", d: 1 }] },
  "8x4": { label: "Truck · twin steer + tandem drive, 8x4 (12)", axles: [{ n: "Steer 1", d: 0 }, { n: "Steer 2", d: 0 }, { n: "Drive 1", d: 1 }, { n: "Drive 2", d: 1 }] },
  "tr1": { label: "Trailer · single axle, duals (4)", axles: [{ n: "Axle 1", d: 1 }] },
  "tr2": { label: "Trailer · tandem axle, duals (8)", axles: [{ n: "Axle 1", d: 1 }, { n: "Axle 2", d: 1 }] },
  "tr2s": { label: "Trailer · tandem axle, super singles (4)", axles: [{ n: "Axle 1", d: 0 }, { n: "Axle 2", d: 0 }] },
  "tr3": { label: "Trailer · tri-axle, duals (12)", axles: [{ n: "Axle 1", d: 1 }, { n: "Axle 2", d: 1 }, { n: "Axle 3", d: 1 }] },
  "tr3s": { label: "Trailer · tri-axle, super singles (6)", axles: [{ n: "Axle 1", d: 0 }, { n: "Axle 2", d: 0 }, { n: "Axle 3", d: 0 }] },
  "tr4": { label: "Trailer · quad axle, duals (16)", axles: [{ n: "Axle 1", d: 1 }, { n: "Axle 2", d: 1 }, { n: "Axle 3", d: 1 }, { n: "Axle 4", d: 1 }] },
  "ll2": { label: "Low loader · 2 axle lines, 8 tyres per row (16)", axles: [{ n: "Row 1", d: 2 }, { n: "Row 2", d: 2 }] },
  "ll3": { label: "Low loader · 3 axle lines, 8 tyres per row (24)", axles: [{ n: "Row 1", d: 2 }, { n: "Row 2", d: 2 }, { n: "Row 3", d: 2 }] },
  "ll4": { label: "Low loader · 4 axle lines, 8 tyres per row (32)", axles: [{ n: "Row 1", d: 2 }, { n: "Row 2", d: 2 }, { n: "Row 3", d: 2 }, { n: "Row 4", d: 2 }] },
};
const DEFAULT_PRESTART = [
  "Tyres & wheel nuts", "Lights & indicators", "Brakes & air system (no leaks)", "Engine oil & coolant levels",
  "No fluid leaks under vehicle", "Mirrors, windscreen & wipers", "Horn & reversing alarm", "Seatbelts",
  "Tilt tray / deck hydraulics", "Winch & winch cable", "Ramps & deck pins", "Chains, straps & load restraints",
  "Trailer coupling, lights & tyres (if towing)", "Fire extinguisher"];
const prestartItems = () => (Array.isArray(S.settings.prestartItems) && S.settings.prestartItems.length) ? S.settings.prestartItems : DEFAULT_PRESTART;
const needsCheck = t => !isTrailerType(t.type) && !isLightType(t.type);
function weekStart(iso) { const dow = new Date(toUTC(iso)).getUTCDay(); return addDays(iso, -((dow + 6) % 7)); }
const SIDE = { L: "left", R: "right", LO: "left outer", LI: "left inner", RI: "right inner", RO: "right outer",
  L1: "left 1 (outside)", L2: "left 2", L3: "left 3", L4: "left 4 (inside)", R4: "right 4 (inside)", R3: "right 3", R2: "right 2", R1: "right 1 (outside)" };
const SIDES = d => d === 2 ? [["L1", "L2", "L3", "L4"], ["R4", "R3", "R2", "R1"]] : d ? [["LO", "LI"], ["RI", "RO"]] : [["L"], ["R"]];
const spareKeys = t => { const n = has(t.spares) ? Number(t.spares) : 1; return Array.from({ length: Math.max(0, Math.min(4, n)) }, (_, i) => i ? `Spare ${i + 1}` : "Spare"); };
const WRITE_ACTS = new Set(["fix-defect", "del-check", "starter", "add-truck", "edit-truck", "del-truck", "odo", "add-sched", "edit-sched", "done-sched", "log-service", "edit-service", "add-comp", "edit-comp", "renew-comp", "ty-tread", "ty-move", "ty-remove", "ty-edit", "ty-fit", "sample", "clear-sample", "km-import", "km-save"]);

/* ---------- state ---------- */
const S = { drv: null, phase: "loading", authView: "login", authMsg: "", kmDate: null, kmDraft: {}, importText: "", importTruck: "", importPreview: null, members: null };

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const newId = () => Store.newId();
function today() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function toUTC(iso) { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); }
function addDays(iso, n) { const t = new Date(toUTC(iso) + n * 864e5); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; }
function addMonths(iso, n) { const [y, m, d] = iso.split("-").map(Number); const tm = new Date(Date.UTC(y, m - 1 + n, 1)); const last = new Date(Date.UTC(tm.getUTCFullYear(), tm.getUTCMonth() + 1, 0)).getUTCDate(); return `${tm.getUTCFullYear()}-${pad(tm.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`; }
function daysBetween(a, b) { return Math.round((toUTC(b) - toUTC(a)) / 864e5); }
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso) { if (!iso) return "—"; const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number); return `${d} ${MON[m - 1]} ${y}`; }
function fmtShort(iso) { const [, m, d] = iso.split("-").map(Number); return `${d} ${MON[m - 1]}`; }
const fmtKm = n => (n == null || n === "" || isNaN(n)) ? "—" : Math.round(Number(n)).toLocaleString("en-AU");
const money = n => (n == null || n === "") ? "" : "$" + Number(n).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const has = v => v != null && v !== "";
const truckById = id => S.trucks.find(t => t.id === id);
const plate = t => `<span class="plate">${esc(t && t.rego || "—")}</span>`;
const LVL_TXT = { over: "Overdue", soon: "Due soon", ok: "OK", unknown: "Not set" };
const pill = l => `<span class="pill ${l}">${LVL_TXT[l]}</span>`;
const RANK = { over: 0, soon: 1, unknown: 2, ok: 3 };
function worst(levels) { let w = "ok"; for (const l of levels) if (RANK[l] < RANK[w]) w = l; return w; }
function metaLine(t, extra) { return esc([[t.year, t.make, t.model].filter(Boolean).join(" "), t.type, ...(extra || [])].filter(Boolean).join(" · ")); }
function byName(a, b) { return String(a.name || "").localeCompare(String(b.name || ""), undefined, { numeric: true }); }
function clean(o) { const r = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined) r[k] = v; return r; }
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 3600); }

/* ---------- writes (local first, then database) ---------- */
async function guarded(fn) { try { return await fn(); } catch (e) { schedule(); refresh(); throw e; } }
const put = (col, id, data) => guarded(() => Store.put(col, id, data)).finally(schedule);
const patch = (col, id, data) => guarded(() => Store.patch(col, id, data)).finally(schedule);
const del = (col, id) => guarded(() => Store.del(col, id)).finally(schedule);
async function refresh() { if (S.phase !== "ready") return; try { await Store.load(); schedule(); } catch (e) { console.warn(e); } }

/* ---------- calculations ---------- */
function metrics() {
  const M = {}, td = today(), win = Number(S.settings.avgWindow) || 30, from = addDays(td, -win), from7 = addDays(td, -7);
  for (const t of S.trucks) {
    const own = S.km[t.id] || {}, tower = t.towedBy && S.km[t.towedBy];
    const days = tower ? { ...tower, ...own } : own; let odo = Number(t.baseOdo) || 0, w = 0, w7 = 0, last = null;
    for (const [d, k0] of Object.entries(days)) {
      const k = Number(k0) || 0;
      if (d > (t.baseOdoDate || "")) odo += k;
      if (d > from && d <= td) w += k;
      if (d > from7 && d <= td) w7 += k;
      if (!last || d > last) last = d;
    }
    M[t.id] = { odo: Math.round(odo), avg: w / win, wk: w7, lastKm: last, days, noOdo: !has(t.baseOdo) && !isTrailerType(t.type) };
  }
  return M;
}
function intervalText(s) { const a = []; if (Number(s.intervalKm) > 0) a.push(`every ${fmtKm(s.intervalKm)} km`); if (Number(s.intervalMonths) > 0) a.push(`${s.intervalMonths} months`); return a.join(" or ") || "No interval set"; }
function schedStatus(s, m) {
  const st = S.settings, td = today();
  const hasKm = Number(s.intervalKm) > 0 && has(s.lastKm) && !m.noOdo;
  const hasDate = Number(s.intervalMonths) > 0 && !!s.lastDate;
  if (!hasKm && !hasDate) return { level: "unknown", text: "Record when this was last done", sub: intervalText(s), sortDays: 1e6 };
  let remKm = null, dueKm = null, remDays = null, dueDate = null, projDays = null;
  if (hasKm) { dueKm = Number(s.lastKm) + Number(s.intervalKm); remKm = dueKm - m.odo; if (m.avg > 0) projDays = remKm / m.avg; }
  if (hasDate) { dueDate = addMonths(s.lastDate, Number(s.intervalMonths)); remDays = daysBetween(td, dueDate); }
  const over = (remKm != null && remKm < 0) || (remDays != null && remDays < 0);
  const soon = (remKm != null && remKm <= Number(st.soonKm)) || (remDays != null && remDays <= Number(st.soonDays)) || (projDays != null && projDays <= Number(st.soonDays) / 2);
  const parts = [], subs = [];
  if (remKm != null) parts.push(remKm >= 0 ? `${fmtKm(remKm)} km to go` : `${fmtKm(-remKm)} km over`);
  if (remDays != null && (remKm == null || remDays <= 60)) parts.push(remDays >= 0 ? `${remDays} days left` : `${-remDays} days over`);
  if (dueKm != null) subs.push(`Due ${fmtKm(dueKm)} km`);
  if (dueDate) subs.push(`${dueKm != null ? "or " : "Due "}${fmtDate(dueDate)}`);
  if (projDays != null && remKm >= 0) subs.push(`~${Math.max(0, Math.round(projDays))} days at ${Math.round(m.avg)} km/day`);
  const sortDays = Math.min(projDays ?? (remKm != null && remKm < 0 ? -1 : 1e5), remDays ?? 1e5);
  return { level: over ? "over" : soon ? "soon" : "ok", text: parts.join(" · "), sub: subs.join(" · "), sortDays };
}
function compStatus(c) {
  if (!c.expiry) return { level: "unknown", text: "No expiry date", sub: "", sortDays: 1e6 };
  const rd = daysBetween(today(), c.expiry), warn = has(c.remindDays) ? Number(c.remindDays) : Number(S.settings.soonDays);
  return { level: rd < 0 ? "over" : rd <= warn ? "soon" : "ok", text: rd < 0 ? `Expired ${-rd} days ago` : rd === 0 ? "Expires today" : `${rd} days left`, sub: `Expires ${fmtDate(c.expiry)}`, sortDays: rd };
}
function tyreStatus(ty) {
  const tr = has(ty.tread) ? Number(ty.tread) : null;
  if (tr == null) return { level: "ok", text: "No tread reading", sub: "", sortDays: 1e5 };
  if (tr <= 1.5) return { level: "over", text: `${tr} mm tread: replace`, sub: `At or below 1.5 mm minimum · checked ${fmtDate(ty.treadDate)}`, sortDays: -1 };
  if (tr <= Number(S.settings.lowTread)) return { level: "soon", text: `${tr} mm tread left`, sub: `Plan replacement · checked ${fmtDate(ty.treadDate)}`, sortDays: 5 };
  return { level: "ok", text: `${tr} mm tread`, sub: `Checked ${fmtDate(ty.treadDate)}`, sortDays: 1e5 };
}
function allItems(M) {
  const items = [];
  for (const t of S.trucks) {
    const m = M[t.id];
    for (const s of S.schedules) if (s.truckId === t.id) items.push({ kind: "sched", t, s, ...schedStatus(s, m) });
    for (const c of S.compliance) if (c.truckId === t.id) items.push({ kind: "comp", t, c, ...compStatus(c) });
    for (const ty of S.tyres) if (ty.truckId === t.id && ty.status === "fitted") items.push({ kind: "tyre", t, ty, ...tyreStatus(ty) });
    for (const d of S.defects || []) if (d.truckId === t.id && d.status === "open") items.push({ kind: "defect", t, d, level: "over", text: d.note || "Reported at prestart", sub: `Reported ${fmtDate(String(d.reportedAt).slice(0, 10))}${d.reportedBy ? " by " + d.reportedBy : ""}`, sortDays: -2 });
    if ((S.checks || []).length && needsCheck(t) && !S.checks.some(c => c.truckId === t.id && c.checkDate >= weekStart(today())))
      items.push({ kind: "check", t, level: "soon", text: "No Monday check this week", sub: `Week starting ${fmtDate(weekStart(today()))}`, sortDays: 3 });
    if (!has(t.baseOdo) && !isTrailerType(t.type)) items.push({ kind: "odo", t, level: "unknown", text: "Enter today's odometer reading", sub: "Needed to work out km-based servicing", sortDays: 1e6 });
  }
  items.sort((a, b) => RANK[a.level] - RANK[b.level] || a.sortDays - b.sortDays);
  return items;
}
function truckLevel(t, items) { return worst(items.filter(i => i.t.id === t.id && i.level !== "unknown").map(i => i.level)); }
function positions(t) { const L = LAYOUTS[t.layout] || LAYOUTS["4x2d"], out = []; for (const a of L.axles) for (const s of SIDES(a.d).flat()) out.push({ key: a.n + "|" + s, label: a.n + " " + SIDE[s] }); for (const k of spareKeys(t)) out.push({ key: k, label: k }); return out; }
function posLabel(k) { if (/^Spare/.test(k)) return k; const [a, s] = String(k).split("|"); return a + " " + (SIDE[s] || s || ""); }

/* ---------- rendering ---------- */
let rq = 0;
function schedule() { if (rq) return; rq = requestAnimationFrame(() => { rq = 0; render(); }); }
function route() { return (location.hash || "").slice(1) || "dashboard"; }
function renderChrome() {
  const ready = S.phase === "ready";
  const driver = Store.role === "driver";
  $("#nav").hidden = !ready || driver; $("#log-btn").hidden = !ready || Store.role === "viewer" || driver;
  if (Store.company && Store.company.name) $("#company-name").textContent = Store.company.name;
  let chip = $("#userchip");
  if (!chip) { chip = document.createElement("span"); chip.id = "userchip"; chip.className = "userchip"; $(".top .in").appendChild(chip); }
  chip.innerHTML = Store.mode === "demo" ? `<span class="demo-flag" title="Data is kept in this browser only">Demo mode</span>`
    : (Store.user && ready ? `<span>${esc(Store.user.email)}</span><button data-act="sign-out">Sign out</button>` : "");
  document.body.classList.toggle("readonly", Store.role === "viewer");
}
function render() {
  renderChrome();
  const app = $("#app");
  if (S.phase === "error") { app.innerHTML = `<div class="banner warn">${esc(S.error)}</div>`; return; }
  if (S.phase === "loading") { app.innerHTML = `<div class="banner">Loading…</div>`; return; }
  if (S.phase === "auth") { app.innerHTML = viewAuth(); return; }
  if (S.phase === "company") { app.innerHTML = viewCreateCompany(); return; }
  const r = route();
  document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("on", a.dataset.v === r || (r.startsWith("t-") && a.dataset.v === "trucks")));
  const M = metrics(); let html = "";
  if (Store.mode === "demo") html += `<div class="banner warn"><b>Demo mode.</b> Everything you enter stays in this browser only. Connect the database (see the setup guide, README.md) to share it with your team.</div>`;
  if (Store.role === "viewer") html += `<div class="banner">You have view-only access. Ask the owner if you need to make changes.</div>`;
  if (r === "driver" && Store.role !== "driver") html += `<div class="banner">This is what drivers see on their phones. <a href="#checks">Back to checks</a></div>`;
  try {
    if (Store.role === "driver" || r === "driver") html = (Store.role === "driver" ? "" : html) + viewDriver();
    else if (r === "checks") html += viewChecks();
    else if (r === "trucks") html += viewTrucks(M);
    else if (r === "km") html += viewKm(M);
    else if (r === "settings") html += viewSettings();
    else if (r.startsWith("t-")) html += viewTruck(r.slice(2), M);
    else html += viewDashboard(M);
  } catch (e) { console.error(e); html += `<div class="banner warn">Something went wrong drawing this page: ${esc(e.message)}</div>`; }
  app.innerHTML = html;
  for (const [id, v] of Object.entries(S.kmDraft)) { const el = document.getElementById("km-" + id); if (el) el.value = v; }
  document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("on", a.dataset.v === r || (r.startsWith("t-") && a.dataset.v === "trucks") || (r === "driver" && a.dataset.v === "checks")));
  if (r === "settings" && S.members === null) loadMembers();
}

/* ---------- auth screens ---------- */
function viewAuth() {
  const v = S.authView, m = S.authMsg ? `<p class="banner ${S.authMsgOk ? "" : "warn"}" style="margin:0">${esc(S.authMsg)}</p>` : "";
  if (v === "check-email") return `<div class="auth"><div class="card"><h2>Check your email</h2><p style="margin:0">We've sent a link to confirm your login. Open it on this device, and you'll come straight back here signed in.</p><div class="links"><button data-act="auth-view" data-v="login">Back to sign in</button></div></div></div>`;
  if (v === "set-password") return `<div class="auth"><form class="card" id="auth-form" data-kind="set-password"><h2>Choose a new password</h2>${m}
    <div class="fld"><label for="a-pw">New password</label><input id="a-pw" type="password" autocomplete="new-password" minlength="8" required></div>
    <button class="btn primary" type="submit">Save password</button></form></div>`;
  const titles = { login: "Sign in", signup: "Create a login", forgot: "Reset your password" };
  return `<div class="auth"><form class="card" id="auth-form" data-kind="${v}"><h2>${titles[v]}</h2>${m}
    <div class="fld"><label for="a-email">${v === "login" ? "Username or email" : "Email"}</label><input id="a-email" type="${v === "login" ? "text" : "email"}" autocomplete="${v === "login" ? "username" : "email"}" autocapitalize="none" spellcheck="false" required></div>
    ${v !== "forgot" ? `<div class="fld"><label for="a-pw">Password</label><input id="a-pw" type="password" autocomplete="${v === "signup" ? "new-password" : "current-password"}" minlength="${v === "signup" ? 8 : 1}" required>${v === "signup" ? "<small>At least 8 characters.</small>" : ""}</div>` : ""}
    <button class="btn primary" type="submit">${v === "login" ? "Sign in" : v === "signup" ? "Create login" : "Email me a reset link"}</button>
    <div class="links">${v === "login" ? `<button type="button" data-act="auth-view" data-v="forgot">Forgot password?</button><button type="button" data-act="auth-view" data-v="signup">Create a login</button>` : `<button type="button" data-act="auth-view" data-v="login">Back to sign in</button>`}</div>
    ${v === "signup" ? `<p class="note" style="margin:0">Staff: create your login, then ask the owner to add you under Settings › People.</p>` : ""}
    ${v === "login" ? `<p class="note" style="margin:0">Drivers: use the username and password your manager gave you.</p>` : ""}
  </form></div>`;
}
function viewCreateCompany() {
  return `<div class="auth"><form class="card" id="company-form"><h2>Set up your company</h2>
    <p style="margin:0">You're signed in as <b>${esc(Store.user.email)}</b>, but you're not part of a company yet.</p>
    <p class="note" style="margin:0">If you work for a company that already uses this system, don't create a new one. Ask the owner to add <b>${esc(Store.user.email)}</b> under Settings › People, then refresh this page.</p>
    <div class="fld"><label for="c-name">Company name</label><input id="c-name" value="${esc((window.BMT_CONFIG || {}).companyName || "")}" required></div>
    <button class="btn primary" type="submit">Create company</button>
    <div class="links"><button type="button" data-act="refresh-company">I've been added, check again</button><button type="button" data-act="sign-out">Sign out</button></div></form></div>`;
}

/* ---------- main views ---------- */
function emptyFleet() {
  return `<div class="card" style="text-align:center;padding:36px 16px">
    <h2>Add your trucks and trailers to get started</h2>
    <p class="muted" style="max-width:58ch;margin:8px auto 18px">Each vehicle needs its rego, its odometer reading today and when it was last serviced. After that, daily km from MyTrucking keep the odometer estimate up to date and the dashboard shows what's coming due.</p>
    <div class="chips" style="justify-content:center">${starter().length ? `<button class="btn primary" data-act="starter">Add ${esc((Store.company && Store.company.name) || "our")} vehicles (${starter().length})</button>` : ""}<button class="btn ${starter().length ? "" : "primary"}" data-act="add-truck">+ Add a vehicle</button><button class="btn" data-act="sample">Load a sample fleet to try it</button></div>
    ${starter().length ? `<p class="muted" style="margin:14px auto 0;max-width:60ch;font-size:14px">Adds ${starter().map(v => esc(v.rego || v.name)).join(", ")} with their tyre layouts, standard service intervals, and registration and COI items ready for dates.</p>` : ""}
  </div>`;
}
function itemLabel(i) { return i.kind === "sched" ? i.s.name : i.kind === "comp" ? i.c.name : i.kind === "odo" ? "Odometer" : i.kind === "defect" ? "Defect · " + i.d.item : i.kind === "check" ? "Driver check" : "Tyre · " + posLabel(i.ty.pos); }
function itemAction(i) {
  if (i.kind === "sched") return i.level === "unknown" ? `<button class="btn sm" data-act="edit-sched" data-id="${i.s.id}">Set last done</button>` : `<button class="btn sm" data-act="done-sched" data-id="${i.s.id}">Mark done</button>`;
  if (i.kind === "comp") return i.level === "unknown" ? `<button class="btn sm" data-act="edit-comp" data-id="${i.c.id}">Set date</button>` : `<button class="btn sm" data-act="renew-comp" data-id="${i.c.id}">Renewed</button>`;
  if (i.kind === "odo") return `<button class="btn sm" data-act="odo" data-id="${i.t.id}">Set odometer</button>`;
  if (i.kind === "defect") return `<button class="btn sm" data-act="fix-defect" data-id="${i.d.id}">Mark fixed</button>`;
  if (i.kind === "check") return `<a class="btn sm" href="#checks">View checks</a>`;
  return `<button class="btn sm" data-act="tyre" data-truck="${i.t.id}" data-pos="${esc(i.ty.pos)}">Open tyre</button>`;
}
function itemRow(i) {
  return `<div class="row lvl-${i.level}"><span class="stripe"></span>${plate(i.t)}
    <div class="rmain"><a href="#t-${i.t.id}">${esc(itemLabel(i))}</a><small>${esc(i.t.name || "")}</small></div>
    <div class="rdetail"><span>${esc(i.text)}</span><small>${esc(i.sub || "")}</small></div>
    ${i.kind === "defect" ? '<span class="pill over">Defect</span>' : pill(i.level)}${itemAction(i)}</div>`;
}
function viewDashboard(M) {
  if (!S.trucks.length) return emptyFleet();
  const items = allItems(M);
  const over = items.filter(i => i.level === "over"), soon = items.filter(i => i.level === "soon");
  const unk = items.filter(i => i.level === "unknown"), later = items.filter(i => i.level === "ok" && i.kind !== "tyre").slice(0, 8);
  const wk = S.trucks.reduce((a, t) => a + (M[t.id].wk || 0), 0);
  const lastKm = S.trucks.map(t => M[t.id].lastKm).filter(Boolean).sort().pop();
  const kmStale = S.trucks.some(t => !isTrailerType(t.type)) && (!lastKm || daysBetween(lastKm, today()) > 8);
  let h = `<div class="stats">
    <div class="stat over"><b>${over.length}</b><span>Overdue</span></div>
    <div class="stat soon"><b>${soon.length}</b><span>Due soon</span></div>
    <div class="stat acc"><b>${S.trucks.length}</b><span>Vehicles</span></div>
    <div class="stat"><b>${fmtKm(wk)}</b><span>Fleet km, last 7 days</span></div></div>`;
  if (kmStale) h += `<div class="banner warn">Daily km ${lastKm ? `were last recorded for ${fmtDate(lastKm)}` : "haven't been entered yet"}, so odometer estimates and due dates may be behind. <a href="#km">Import km from MyTrucking</a></div>`;
  h += `<section class="card"><header><h3>Needs attention</h3><span class="muted">Overdue first, then what will come due soonest</span></header>
    <div class="list">${[...over, ...soon].map(itemRow).join("") || '<div class="empty">Nothing overdue or due soon.</div>'}</div></section>`;
  h += `<section class="card"><header><h3>Coming up later</h3></header><div class="list">${later.map(itemRow).join("") || '<div class="empty">No other scheduled items.</div>'}</div></section>`;
  if (unk.length) h += `<section class="card"><header><h3>Missing a starting point</h3><span class="muted">Record when each was last done so it can be tracked</span></header><div class="list">${unk.map(itemRow).join("")}</div></section>`;
  h += `<section class="card"><header><h3>Fleet</h3><span class="sp"></span><button class="btn sm" data-act="add-truck">+ Add vehicle</button></header><div class="tbl"><table>
    <thead><tr><th>Rego</th><th>Vehicle</th><th class="r">Est. odometer</th><th class="r">Avg km/day</th><th>Next service</th><th>Registration</th><th>COI</th><th>Status</th></tr></thead><tbody>
    ${S.trucks.slice().sort(byName).map(t => {
      const ti = items.filter(i => i.t.id === t.id);
      const svc = ti.filter(i => i.kind === "sched" && i.level !== "unknown").sort((a, b) => a.sortDays - b.sortDays)[0];
      const rego = ti.find(i => i.kind === "comp" && /rego|registration/i.test(i.c.name));
      const coi = ti.find(i => i.kind === "comp" && /\bcoi\b|certificate of inspection/i.test(i.c.name));
      const dateCell = x => x && x.c.expiry ? `${fmtDate(x.c.expiry)}<br><small class="muted">${esc(x.text)}</small>` : '<span class="muted">Not set</span>';
      return `<tr class="clk" data-href="#t-${t.id}"><td>${plate(t)}</td><td><b>${esc(t.name)}</b><br><small class="muted">${esc([t.make, t.model].filter(Boolean).join(" "))}</small></td>
      <td class="r">${M[t.id].noOdo ? '<span class="muted">Not set</span>' : fmtKm(M[t.id].odo)}</td><td class="r">${M[t.id].avg ? Math.round(M[t.id].avg) : "—"}</td>
      <td>${svc ? `${esc(svc.s.name)}<br><small class="muted">${esc(svc.text)}</small>` : '<span class="muted">—</span>'}</td>
      <td>${dateCell(rego)}</td><td>${isLightType(t.type) && !coi ? '<span class="muted">n/a</span>' : dateCell(coi)}</td>
      <td>${pill(truckLevel(t, items))}</td></tr>`;
    }).join("")}
    </tbody></table></div></section>`;
  return h;
}
function viewTrucks(M) {
  if (!S.trucks.length) return emptyFleet();
  const items = allItems(M);
  return `<div class="thead"><h2>Fleet</h2><span class="sp"></span><button class="btn primary" data-act="add-truck">+ Add vehicle</button></div>
  <div class="trucks">${S.trucks.slice().sort(byName).map(t => {
    const l = truckLevel(t, items), ti = items.filter(i => i.t.id === t.id);
    const nOver = ti.filter(i => i.level === "over").length, nSoon = ti.filter(i => i.level === "soon").length;
    return `<a class="tcard ${l}" href="#t-${t.id}"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center">${plate(t)}${pill(l)}</div>
      <div><div class="nm">${esc(t.name)}</div><div class="muted">${metaLine(t)}</div></div>
      <dl><dt>Odometer</dt><dd>${M[t.id].noOdo ? "Not set yet" : fmtKm(M[t.id].odo) + " km (est.)"}</dd><dt>Last 7 days</dt><dd>${fmtKm(M[t.id].wk)} km</dd>
      <dt>Attention</dt><dd>${nOver || nSoon ? `${nOver} overdue, ${nSoon} due soon` : "All clear"}</dd></dl></a>`;
  }).join("")}</div>`;
}
function viewTruck(id, M) {
  const t = truckById(id);
  if (!t) return `<div class="banner">This vehicle no longer exists. <a href="#trucks">Back to the fleet</a></div>`;
  const m = M[t.id];
  const sch = S.schedules.filter(s => s.truckId === id).sort((a, b) => String(a.name).localeCompare(b.name));
  const comp = S.compliance.filter(c => c.truckId === id).sort((a, b) => String(a.expiry || "9").localeCompare(String(b.expiry || "9")));
  const svc = S.services.filter(s => s.truckId === id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const tyres = S.tyres.filter(x => x.truckId === id);
  const td = today(), days = []; for (let i = 29; i >= 0; i--) { const d = addDays(td, -i); days.push([d, Number(m.days[d]) || 0]); }
  const mx = Math.max(1, ...days.map(d => d[1]));
  return `<div><a href="#trucks" class="muted">← All vehicles</a></div>
  <section class="card"><div class="thead"><span class="plate big">${esc(t.rego || "—")}</span>
    <div class="meta"><h2>${esc(t.name)}</h2><span class="muted">${metaLine(t, [t.fleetNo && "MyTrucking name: " + t.fleetNo, t.vin && "VIN " + t.vin])}</span></div>
    <span class="sp"></span><button class="btn" data-act="odo" data-id="${t.id}">Update odometer</button><button class="btn" data-act="edit-truck" data-id="${t.id}">Edit vehicle</button></div>
    <div class="kpis" style="margin-top:14px">
      <div><b>${has(t.baseOdo) || isTrailerType(t.type) ? fmtKm(m.odo) : "—"}</b><span>${isTrailerType(t.type) ? "Est. km travelled" : "Est. odometer (km)"}</span></div>
      <div><b>${m.avg ? Math.round(m.avg) : "—"}</b><span>Avg km/day, last ${esc(S.settings.avgWindow)} days</span></div>
      <div><b>${fmtKm(m.wk)}</b><span>km last 7 days</span></div>
      <div><b>${has(t.baseOdo) && t.baseOdoDate ? fmtShort(t.baseOdoDate) : "—"}</b><span>${has(t.baseOdo) ? `Last actual reading: ${fmtKm(t.baseOdo)} km` : "No odometer reading yet"}</span></div>
    </div>${t.towedBy && truckById(t.towedBy) ? `<p class="muted" style="margin:12px 0 0">Km come from <a href="#t-${t.towedBy}">${esc(truckById(t.towedBy).name)}</a>, the prime mover that usually tows it.</p>` : ""}
    ${isTrailerType(t.type) && !t.towedBy ? `<p class="muted" style="margin:12px 0 0">Set "Usually towed by" (Edit vehicle) so this trailer's km-based servicing counts down with its prime mover's km.</p>` : ""}
    ${t.notes ? `<p class="muted" style="margin:12px 0 0">${esc(t.notes)}</p>` : ""}</section>
  <div class="split"><div class="col">
    <section class="card"><header><h3>Maintenance schedule</h3><span class="sp"></span><button class="btn sm" data-act="add-sched" data-truck="${id}">+ Add item</button></header>
      <div class="tbl"><table><thead><tr><th>Item</th><th>Interval</th><th>Last done</th><th>Next due</th><th>Status</th><th></th></tr></thead><tbody>
      ${sch.map(s => { const st = schedStatus(s, m); return `<tr><td><b>${esc(s.name)}</b></td><td>${esc(intervalText(s))}</td>
        <td>${s.lastDate ? fmtDate(s.lastDate) : "—"}${has(s.lastKm) ? `<br><small class="muted">${fmtKm(s.lastKm)} km</small>` : ""}</td>
        <td>${esc(st.sub || "—")}<br><small class="muted">${esc(st.text)}</small></td><td>${pill(st.level)}</td>
        <td><div class="acts"><button class="btn sm" data-act="done-sched" data-id="${s.id}">Mark done</button><button class="btn sm link" data-act="edit-sched" data-id="${s.id}">Edit</button></div></td></tr>`; }).join("") || '<tr><td colspan="6" class="muted">No schedule items yet.</td></tr>'}
      </tbody></table></div></section>
    <section class="card"><header><h3>Registration & compliance</h3><span class="sp"></span><button class="btn sm" data-act="add-comp" data-truck="${id}">+ Add</button></header>
      <div class="tbl"><table><thead><tr><th>Item</th><th>Expires</th><th>Reference</th><th>Status</th><th></th></tr></thead><tbody>
      ${comp.map(c => { const st = compStatus(c); return `<tr><td><b>${esc(c.name)}</b>${c.notes ? `<br><small class="muted">${esc(c.notes)}</small>` : ""}</td><td>${fmtDate(c.expiry)}<br><small class="muted">${esc(st.text)}</small></td><td>${esc(c.ref || "")}</td><td>${pill(st.level)}</td>
        <td><div class="acts"><button class="btn sm" data-act="renew-comp" data-id="${c.id}">Renewed</button><button class="btn sm link" data-act="edit-comp" data-id="${c.id}">Edit</button></div></td></tr>`; }).join("") || '<tr><td colspan="5" class="muted">Add rego, insurance and inspection expiry dates here.</td></tr>'}
      </tbody></table></div></section>
    <section class="card"><header><h3>Service history</h3><span class="sp"></span><button class="btn sm" data-act="log-service" data-truck="${id}">+ Log service</button></header>
      <div class="tbl"><table><thead><tr><th>Date</th><th class="r">Odometer</th><th>Work done</th><th>Workshop</th><th class="r">Cost</th><th></th></tr></thead><tbody>
      ${svc.map(s => `<tr><td>${fmtDate(s.date)}</td><td class="r">${fmtKm(s.odo)}</td><td><b>${esc(s.title || "Service")}</b>${(s.tasks || []).length ? `<br><small class="muted">${esc(s.tasks.join(", "))}</small>` : ""}${s.notes ? `<br><small class="muted">${esc(s.notes)}</small>` : ""}</td><td>${esc(s.workshop || "")}${s.invoice ? `<br><small class="muted">Inv ${esc(s.invoice)}</small>` : ""}</td><td class="r">${money(s.cost)}</td><td><div class="acts"><button class="btn sm link" data-act="edit-service" data-id="${s.id}">Edit</button></div></td></tr>`).join("") || '<tr><td colspan="6" class="muted">No services logged yet.</td></tr>'}
      </tbody></table></div>
      ${svc.length ? `<p class="muted" style="margin:10px 0 0;font-size:13px">Total spend recorded: <b>${money(svc.reduce((a, s) => a + (Number(s.cost) || 0), 0))}</b></p>` : ""}</section>
    ${truckChecksHtml(t)}
  </div><div class="col">
    <section class="card"><header><h3>Tyres</h3><span class="muted">${esc((LAYOUTS[t.layout] || LAYOUTS["4x2d"]).label)}</span></header>
      ${tyreDiagram(t)}
      <div class="legend"><span><i style="background:var(--ok)"></i>OK</span><span><i style="background:var(--soon)"></i>≤ ${esc(S.settings.lowTread)} mm</span><span><i style="background:var(--over)"></i>≤ 1.5 mm</span><span><i style="border:1px dashed var(--muted)"></i>No tyre recorded</span></div>
      <p class="muted" style="font-size:13px;text-align:center;margin:8px 0 0">Numbers show tread depth in mm. Click a tyre to fit, check, rotate or remove it.</p></section>
    <section class="card"><header><h3>Tyre history</h3></header><div class="tbl"><table><thead><tr><th>Position</th><th>Tyre</th><th>Fitted</th><th class="r">km on tyre</th></tr></thead><tbody>
      ${tyres.slice().sort((a, b) => (a.status === b.status ? 0 : a.status === "fitted" ? -1 : 1) || String(b.fittedDate).localeCompare(String(a.fittedDate))).map(x => {
        const kmOn = x.status === "fitted" ? (has(x.fittedOdo) ? m.odo - Number(x.fittedOdo) : null) : (has(x.removedOdo) && has(x.fittedOdo) ? Number(x.removedOdo) - Number(x.fittedOdo) : null);
        return `<tr class="clk" data-act="tyre" data-truck="${id}" data-pos="${esc(x.pos)}" data-tid="${x.id}"><td>${esc(posLabel(x.pos))}${x.status === "removed" ? `<br><small class="muted">Removed ${fmtDate(x.removedDate)}${x.removedReason ? " · " + esc(x.removedReason) : ""}</small>` : ""}</td><td>${esc([x.brand, x.model].filter(Boolean).join(" "))}<br><small class="muted">${esc(x.size || "")}</small></td><td>${fmtDate(x.fittedDate)}</td><td class="r">${fmtKm(kmOn)}</td></tr>`;
      }).join("") || '<tr><td colspan="4" class="muted">No tyres recorded.</td></tr>'}
      </tbody></table></div></section>
    <section class="card"><header><h3>Daily km, last 30 days</h3><span class="sp"></span><a href="#km" class="btn sm">Add km</a></header>
      <div class="bars">${days.map(([d, k]) => `<div class="${k ? "" : "zero"}" style="height:${Math.max(2, k / mx * 100)}%" title="${fmtShort(d)}: ${fmtKm(k)} km"></div>`).join("")}</div>
      <div class="barsx"><span>${fmtShort(days[0][0])}</span><span>Peak ${fmtKm(mx)} km</span><span>Today</span></div></section>
    <div style="text-align:right"><button class="btn danger sm" data-act="del-truck" data-id="${id}">Delete this vehicle</button></div>
  </div></div>`;
}
function truckChecksHtml(t) {
  const cs = (S.checks || []).filter(c => c.truckId === t.id).sort((a, b) => String(b.checkDate).localeCompare(a.checkDate)).slice(0, 8);
  const ds = (S.defects || []).filter(d => d.truckId === t.id && d.status === "open");
  if (!cs.length && !ds.length) return "";
  return `<section class="card"><header><h3>Driver checks</h3><span class="sp"></span><a class="btn sm" href="#checks">All checks</a></header>
    ${ds.length ? `<div class="list" style="margin-bottom:12px">${ds.map(d => `<div class="row lvl-over"><span class="stripe"></span>${plate(t)}<div class="rmain"><b>${esc(d.item)}</b><small>Open defect</small></div><div class="rdetail"><span>${esc(d.note || "")}</span><small>${fmtDate(String(d.reportedAt).slice(0, 10))}</small></div><span class="pill over">Defect</span><button class="btn sm" data-act="fix-defect" data-id="${d.id}">Mark fixed</button></div>`).join("")}</div>` : ""}
    <div class="tbl"><table><thead><tr><th>Date</th><th>Driver</th><th class="r">Odometer</th><th>Result</th></tr></thead><tbody>
    ${cs.map(c => `<tr class="clk" data-act="view-check" data-id="${c.id}"><td>${fmtDate(c.checkDate)}</td><td>${esc(c.driverEmail || "")}</td><td class="r">${c.odo != null ? fmtKm(c.odo) : ""}</td><td>${c.faultCount ? `<span class="pill over">${c.faultCount} fault${c.faultCount > 1 ? "s" : ""}</span>` : '<span class="pill ok">All OK</span>'}</td></tr>`).join("")}
    </tbody></table></div></section>`;
}
function tyreDiagram(t) {
  const L = LAYOUTS[t.layout] || LAYOUTS["4x2d"];
  const byPos = {}; for (const x of S.tyres) if (x.truckId === t.id && x.status === "fitted") byPos[x.pos] = x;
  const cell = k => { const ty = byPos[k], st = ty ? tyreStatus(ty).level : "empty";
    return `<button class="tyre ${st}" data-act="tyre" data-truck="${t.id}" data-pos="${esc(k)}" aria-label="${esc(posLabel(k))}${ty ? "" : " (no tyre recorded)"}" title="${esc(posLabel(k))}${ty ? ": " + esc([ty.brand, ty.size].filter(Boolean).join(" ")) + (has(ty.tread) ? ", " + ty.tread + " mm" : "") : ": empty"}">${ty && has(ty.tread) ? esc(ty.tread) : ""}</button>`; };
  const wide = L.axles.some(a => a.d === 2);
  const sp = spareKeys(t);
  return `<div class="chassis${wide ? " wide" : ""}"><div class="cab">${isTrailerType(t.type) || /^(tr|ll)/.test(t.layout) ? "HITCH" : "FRONT"}</div>${L.axles.map(a => { const sd = SIDES(a.d);
    return `<div class="axle"><div class="wheels">${sd[0].map(s => cell(a.n + "|" + s)).join("")}</div><div class="axlebar"><span>${esc(a.n)}</span></div><div class="wheels">${sd[1].map(s => cell(a.n + "|" + s)).join("")}</div></div>`; }).join("")}
    ${sp.length ? `<div class="spare">${sp.map(cell).join("")}<span>${sp.length > 1 ? sp.length + " spares" : "Spare"}</span></div>` : ""}</div>`;
}


/* ---------- driver Monday check (phone screen) ---------- */
function drvState() {
  if (!S.drv) {
    let last = ""; try { last = localStorage.getItem("bmt-driver-truck") || ""; } catch (e) {}
    S.drv = { truckId: S.trucks.some(t => t.id === last) ? last : "", odo: "", answers: {}, notes: "", done: null, odoWarned: false };
  }
  return S.drv;
}
function viewDriver() {
  const st = drvState(), td = today(), wk = weekStart(td);
  const vehicles = S.trucks.filter(t => !isTrailerType(t.type)).sort(byName);
  const mine = (S.checks || []).filter(c => Store.role !== "driver" || true).sort((a, b) => String(b.createdAt || b.checkDate).localeCompare(String(a.createdAt || a.checkDate)));
  if (st.done) {
    return `<div class="drv"><section class="card drv-done"><div class="tick" aria-hidden="true">✓</div><h2>Check sent</h2>
      <p>${esc(st.done.truck)} · ${fmtDate(st.done.date)}${st.done.odo != null ? ` · ${fmtKm(st.done.odo)} km` : ""}</p>
      ${st.done.faults ? `<p class="banner warn" style="margin:0">${st.done.faults} fault${st.done.faults > 1 ? "s" : ""} reported. The office has been told.</p>` : `<p class="muted" style="margin:0">No faults reported. Thanks!</p>`}
      <button class="btn primary big" data-act="drv-new">Done</button></section></div>`;
  }
  const t = truckById(st.truckId);
  const doneThisWeek = t && (S.checks || []).filter(c => c.truckId === t.id && c.checkDate >= wk).sort((a, b) => String(b.checkDate).localeCompare(a.checkDate))[0];
  const items = prestartItems();
  const answered = items.filter(i => st.answers[i] && st.answers[i].status).length;
  const odoNum = st.odo === "" ? null : Number(st.odo);
  const lowOdo = t && has(t.baseOdo) && odoNum != null && odoNum < Number(t.baseOdo);
  return `<div class="drv">
    <div class="drv-head"><h2>Monday check</h2><span class="muted">Week of ${fmtDate(wk)}</span></div>
    <section class="card"><div class="fld"><label for="drv-truck">Vehicle</label>
      <select id="drv-truck" class="big"><option value="">Choose your vehicle…</option>${vehicles.map(v => `<option value="${v.id}"${v.id === st.truckId ? " selected" : ""}>${esc(v.rego || "No rego")} · ${esc(v.name)}</option>`).join("")}</select></div>
      ${doneThisWeek ? `<p class="banner" style="margin:10px 0 0">Already checked this week on ${fmtDate(doneThisWeek.checkDate)}${doneThisWeek.driverEmail ? " by " + esc(doneThisWeek.driverEmail) : ""}. Only send another if something has changed.</p>` : ""}
    </section>
    ${t ? `<section class="card"><div class="fld"><label for="drv-odo">Odometer reading (km)</label>
      <input id="drv-odo" class="big" type="number" inputmode="numeric" min="0" step="1" placeholder="Read it off the dash" value="${esc(st.odo)}">
      ${has(t.baseOdo) ? `<small>Last recorded reading: ${fmtKm(t.baseOdo)} km${t.baseOdoDate ? " (" + fmtDate(t.baseOdoDate) + ")" : ""}</small>` : ""}
      ${lowOdo ? `<small class="err">That's lower than the last reading. Check the number, or tap Send again if it's right.</small>` : ""}</div></section>
    <section class="card"><header><h3>Prestart</h3><span class="muted">${answered} of ${items.length} done</span><span class="sp"></span><button class="btn sm" data-act="drv-allok">Mark the rest OK</button></header>
      <div class="drv-items">${items.map((it, i) => { const a = st.answers[it] || {}; return `<div class="drv-item ${a.status || ""}">
        <div class="drv-name">${esc(it)}</div>
        <div class="seg" role="group" aria-label="${esc(it)}">
          <button type="button" class="${a.status === "ok" ? "on" : ""}" data-act="drv-ans" data-i="${i}" data-s="ok">OK</button>
          <button type="button" class="fault ${a.status === "fault" ? "on" : ""}" data-act="drv-ans" data-i="${i}" data-s="fault">Fault</button>
          <button type="button" class="${a.status === "na" ? "on" : ""}" data-act="drv-ans" data-i="${i}" data-s="na">N/A</button></div>
        ${a.status === "fault" ? `<textarea class="drv-note" data-i="${i}" rows="2" placeholder="What's wrong? (required)">${esc(a.note || "")}</textarea>` : ""}
      </div>`; }).join("")}</div></section>
    <section class="card"><div class="fld"><label for="drv-notes">Anything else? (optional)</label><textarea id="drv-notes" rows="2" style="font-family:var(--body);font-size:16px">${esc(st.notes)}</textarea></div>
      <p class="err" id="drv-err"></p>
      <button class="btn primary big" data-act="drv-send">Send check</button></section>` : `<p class="muted" style="text-align:center">Choose your vehicle to start.</p>`}
    ${Store.role === "driver" ? `<div class="chips" style="justify-content:center"><button class="btn sm" data-act="change-pw">Change my password</button><button class="btn sm" data-act="sign-out">Sign out</button></div>` : ""}
    ${mine.length ? `<section class="card"><header><h3>Recent checks</h3></header><div class="tbl"><table><tbody>${mine.slice(0, 5).map(c => { const v = truckById(c.truckId); return `<tr><td>${fmtDate(c.checkDate)}</td><td>${esc(v ? (v.rego || v.name) : "")}</td><td class="r">${c.odo != null ? fmtKm(c.odo) + " km" : ""}</td><td>${c.faultCount ? `<span class="pill over">${c.faultCount} fault${c.faultCount > 1 ? "s" : ""}</span>` : '<span class="pill ok">OK</span>'}</td></tr>`; }).join("")}</tbody></table></div></section>` : ""}
  </div>`;
}
async function sendCheck(btn) {
  const st = drvState(), items = prestartItems(), err = $("#drv-err");
  const t = truckById(st.truckId); if (!t) { err.textContent = "Choose your vehicle."; return; }
  const odo = st.odo === "" ? null : Number(st.odo);
  if (odo == null && !isTrailerType(t.type)) { err.textContent = "Enter the odometer reading."; return; }
  if (odo != null && (!isFinite(odo) || odo < 0)) { err.textContent = "The odometer reading needs to be a number."; return; }
  const missing = items.filter(i => !(st.answers[i] && st.answers[i].status));
  if (missing.length) { err.textContent = `Answer every item (${missing.length} left), or tap "Mark the rest OK".`; return; }
  const noNote = items.find(i => st.answers[i].status === "fault" && !String(st.answers[i].note || "").trim());
  if (noNote) { err.textContent = `Add a note for "${noNote}" so the workshop knows what's wrong.`; return; }
  if (has(t.baseOdo) && odo != null && odo < Number(t.baseOdo) && !st.odoWarned) { st.odoWarned = true; render(); return; }
  btn.disabled = true; err.textContent = "";
  const payload = { truckId: t.id, date: today(), odo, notes: st.notes.trim(), items: items.map(i => clean({ item: i, status: st.answers[i].status, note: st.answers[i].status === "fault" ? st.answers[i].note.trim() : undefined })) };
  try {
    await Store.submitCheck(payload);
    try { localStorage.setItem("bmt-driver-truck", t.id); } catch (e) {}
    st.done = { truck: `${t.rego || ""} ${t.name}`.trim(), date: payload.date, odo, faults: payload.items.filter(i => i.status === "fault").length };
    render(); window.scrollTo(0, 0);
  } catch (e) { err.textContent = e.message; btn.disabled = false; }
}

/* ---------- office: checks & defects ---------- */
function viewChecks() {
  const wk = weekStart(today()), checks = (S.checks || []).slice().sort((a, b) => String(b.checkDate).localeCompare(a.checkDate) || String(b.createdAt).localeCompare(String(a.createdAt)));
  const open = (S.defects || []).filter(d => d.status === "open").sort((a, b) => String(a.reportedAt).localeCompare(String(b.reportedAt)));
  const fixed = (S.defects || []).filter(d => d.status === "fixed").sort((a, b) => String(b.fixedAt).localeCompare(String(a.fixedAt))).slice(0, 10);
  const vehicles = S.trucks.filter(needsCheck).sort(byName);
  const doneCount = vehicles.filter(v => checks.some(c => c.truckId === v.id && c.checkDate >= wk)).length;
  return `<div class="thead"><h2>Driver checks</h2><span class="sp"></span><a class="btn" href="#driver">Open the driver screen</a></div>
  <div class="stats">
    <div class="stat ${doneCount < vehicles.length ? "soon" : "acc"}"><b>${doneCount}/${vehicles.length}</b><span>Trucks checked this week</span></div>
    <div class="stat ${open.length ? "over" : "acc"}"><b>${open.length}</b><span>Open defects</span></div>
    <div class="stat"><b>${checks.filter(c => c.checkDate >= addDays(today(), -30)).length}</b><span>Checks, last 30 days</span></div>
    <div class="stat"><b>${fmtDate(wk).replace(/ \d{4}$/, "")}</b><span>Week starting</span></div></div>
  <section class="card"><header><h3>Open defects</h3><span class="muted">Reported by drivers, oldest first</span></header>
    <div class="list">${open.map(d => { const t = truckById(d.truckId); return t ? `<div class="row lvl-over"><span class="stripe"></span>${plate(t)}
      <div class="rmain"><a href="#t-${t.id}">${esc(d.item)}</a><small>${esc(t.name)}</small></div>
      <div class="rdetail"><span>${esc(d.note || "")}</span><small>${fmtDate(String(d.reportedAt).slice(0, 10))}${d.reportedBy ? " · " + esc(d.reportedBy) : ""}</small></div>
      <span class="pill over">Defect</span><button class="btn sm" data-act="fix-defect" data-id="${d.id}">Mark fixed</button></div>` : ""; }).join("") || '<div class="empty">No open defects.</div>'}</div></section>
  <section class="card"><header><h3>This week</h3><span class="muted">Trucks and prime movers. Light vehicles and trailers are optional.</span></header><div class="tbl"><table>
    <thead><tr><th>Rego</th><th>Vehicle</th><th>Checked</th><th>Driver</th><th class="r">Odometer</th><th>Result</th></tr></thead><tbody>
    ${vehicles.map(v => { const c = checks.find(x => x.truckId === v.id && x.checkDate >= wk); return `<tr${c ? ` class="clk" data-act="view-check" data-id="${c.id}"` : ""}><td>${plate(v)}</td><td>${esc(v.name)}</td>
      <td>${c ? fmtDate(c.checkDate) : '<span class="pill soon">Not done</span>'}</td><td>${c ? esc(c.driverEmail || "") : ""}</td><td class="r">${c && c.odo != null ? fmtKm(c.odo) : ""}</td>
      <td>${c ? (c.faultCount ? `<span class="pill over">${c.faultCount} fault${c.faultCount > 1 ? "s" : ""}</span>` : '<span class="pill ok">All OK</span>') : ""}</td></tr>`; }).join("") || '<tr><td colspan="6" class="muted">No trucks yet.</td></tr>'}
    </tbody></table></div></section>
  <section class="card"><header><h3>Recent checks</h3></header><div class="tbl"><table>
    <thead><tr><th>Date</th><th>Vehicle</th><th>Driver</th><th class="r">Odometer</th><th>Result</th></tr></thead><tbody>
    ${checks.slice(0, 40).map(c => { const v = truckById(c.truckId); return `<tr class="clk" data-act="view-check" data-id="${c.id}"><td>${fmtDate(c.checkDate)}</td><td>${esc(v ? `${v.rego || ""} ${v.name}` : "")}</td><td>${esc(c.driverEmail || "")}</td><td class="r">${c.odo != null ? fmtKm(c.odo) : ""}</td><td>${c.faultCount ? `<span class="pill over">${c.faultCount} fault${c.faultCount > 1 ? "s" : ""}</span>` : '<span class="pill ok">All OK</span>'}</td></tr>`; }).join("") || '<tr><td colspan="5" class="muted">No checks yet. Add drivers under Settings › People and send them the site address.</td></tr>'}
    </tbody></table></div></section>
  ${fixed.length ? `<section class="card"><header><h3>Recently fixed</h3></header><div class="tbl"><table><thead><tr><th>Vehicle</th><th>Defect</th><th>Fixed</th><th>Note</th></tr></thead><tbody>
    ${fixed.map(d => { const t = truckById(d.truckId); return `<tr><td>${esc(t ? t.rego || t.name : "")}</td><td>${esc(d.item)}<br><small class="muted">${esc(d.note || "")}</small></td><td>${fmtDate(String(d.fixedAt).slice(0, 10))}<br><small class="muted">${esc(d.fixedBy || "")}</small></td><td>${esc(d.fixNote || "")}</td></tr>`; }).join("")}
  </tbody></table></div></section>` : ""}`;
}
function checkModal(c) {
  const v = truckById(c.truckId);
  showModal(`<h2>Check · ${esc(v ? `${v.rego || ""} ${v.name}` : "")}</h2>
    <dl class="kv"><dt>Date</dt><dd>${fmtDate(c.checkDate)}</dd><dt>Driver</dt><dd>${esc(c.driverEmail || "—")}</dd><dt>Odometer</dt><dd>${c.odo != null ? fmtKm(c.odo) + " km" : "—"}</dd>${c.notes ? `<dt>Notes</dt><dd>${esc(c.notes)}</dd>` : ""}</dl>
    <div class="tbl"><table><tbody>${(c.items || []).map(i => `<tr><td>${esc(i.item)}${i.note ? `<br><small class="muted">${esc(i.note)}</small>` : ""}</td><td class="r">${i.status === "fault" ? '<span class="pill over">Fault</span>' : i.status === "na" ? '<span class="pill unknown">N/A</span>' : '<span class="pill ok">OK</span>'}</td></tr>`).join("")}</tbody></table></div>
    <div class="actions">${Store.role === "owner" || Store.role === "staff" ? `<button class="btn danger" data-act="del-check" data-id="${c.id}">Delete check</button>` : ""}<span class="sp"></span><button class="btn ghost" data-act="close">Close</button></div>`);
}
function fixForm(d) {
  const t = truckById(d.truckId);
  openForm({ title: `Fixed · ${d.item}`, intro: `${esc(t ? `${t.rego || ""} ${t.name}` : "")}: ${esc(d.note || "")}`,
    fields: [{ id: "note", label: "What was done (optional)", type: "textarea", placeholder: "e.g. Replaced LH indicator globe" }],
    submit: "Mark fixed", onSubmit: async v => { await guarded(() => Store.fixDefect(d.id, v.note)); toast("Defect marked fixed"); schedule(); } });
}

/* ---------- km page ---------- */
function viewKm(M) {
  if (!S.trucks.length) return emptyFleet();
  if (!S.kmDate) S.kmDate = today();
  const td = today(), cols = []; for (let i = 13; i >= 0; i--) cols.push(addDays(td, -i));
  const pv = S.importPreview;
  return `<div class="thead"><h2>Daily km</h2></div>
  <section class="card"><header><h3>Import from MyTrucking</h3></header>
    <ol class="steps"><li>In MyTrucking, export the daily km report for the period (a week or more is fine).</li><li>Choose the exported CSV file, or copy the table and paste it below. Columns needed: date, truck, km.</li><li>Check the preview, then import. Re-importing a day replaces that day's km, so overlapping weeks are safe.</li></ol>
    <div class="grid" style="margin-top:12px">
      <div class="fld"><label for="imp-text">Pasted report</label><textarea id="imp-text" rows="7" placeholder="Date, Truck, Km&#10;16/11/2026, Tilt Tray 1, 243&#10;16/11/2026, PM1, 188">${esc(S.importText)}</textarea></div>
      <div class="fld half"><label for="imp-file">Or choose a CSV file</label><input type="file" id="imp-file" accept=".csv,.txt,.tsv"></div>
      <div class="fld half"><label for="imp-truck">Which vehicle</label><select id="imp-truck"><option value="">Work it out from the truck column</option>${S.trucks.slice().sort(byName).map(t => `<option value="${t.id}"${S.importTruck === t.id ? " selected" : ""}>All rows are ${esc(t.name)} (${esc(t.rego || "")})</option>`).join("")}</select></div>
    </div>
    <div class="chips" style="margin-top:12px"><button class="btn" data-act="km-preview">Preview import</button>${pv && pv.entries.length ? `<button class="btn primary" data-act="km-import">Import ${pv.entries.length} day${pv.entries.length === 1 ? "" : "s"} of km</button>` : ""}</div>
    ${pv ? previewHtml(pv) : ""}
  </section>
  <section class="card"><header><h3>Enter km by hand</h3><span class="sp"></span><label for="km-date" class="muted">Date</label><input type="date" id="km-date" value="${S.kmDate}" style="width:auto"></header>
    <div class="tbl kmgrid"><table><thead><tr><th>Rego</th><th>Vehicle</th><th class="r">km for ${fmtDate(S.kmDate)}</th></tr></thead><tbody>
    ${S.trucks.slice().sort(byName).map(t => { const cur = M[t.id].days[S.kmDate]; return `<tr><td>${plate(t)}</td><td>${esc(t.name)}</td><td class="r"><input type="number" min="0" step="1" inputmode="numeric" id="km-${t.id}" data-km="${t.id}" value="${cur ?? ""}" aria-label="km for ${esc(t.name)}"></td></tr>`; }).join("")}
    </tbody></table></div>
    <div class="chips" style="margin-top:12px"><button class="btn primary" data-act="km-save">Save km</button></div></section>
  <section class="card"><header><h3>Last 14 days</h3></header><div class="tbl"><table><thead><tr><th>Vehicle</th>${cols.map(d => `<th class="r">${fmtShort(d)}</th>`).join("")}<th class="r">Total</th></tr></thead><tbody>
    ${S.trucks.slice().sort(byName).map(t => { const d = M[t.id].days; let tot = 0; return `<tr><td>${esc(t.name)}</td>${cols.map(c => { const v = d[c]; if (v) tot += Number(v); return `<td class="r">${v != null ? fmtKm(v) : '<span class="muted">·</span>'}</td>`; }).join("")}<td class="r"><b>${fmtKm(tot)}</b></td></tr>`; }).join("")}
  </tbody></table></div></section>`;
}
function previewHtml(pv) {
  const un = Object.entries(pv.unmatched);
  const byT = {}; for (const e of pv.entries) { const b = (byT[e.truckId] ||= { n: 0, km: 0, from: e.date, to: e.date }); b.n++; b.km += e.km; if (e.date < b.from) b.from = e.date; if (e.date > b.to) b.to = e.date; }
  return `<div style="margin-top:14px">
    <p class="muted" style="margin:0 0 8px">Read ${pv.rows} rows using columns: ${esc(pv.colsText)}.${pv.bad ? ` ${pv.bad} rows skipped (no readable date or km).` : ""}</p>
    ${un.length ? `<div class="banner warn" style="margin-bottom:10px">Couldn't match these names: ${un.map(([n, c]) => `<b>${esc(n)}</b> (${c} rows)`).join(", ")}. Put the exact name into the vehicle's "Name in MyTrucking" field (Edit vehicle), then preview again.</div>` : ""}
    <div class="tbl"><table><thead><tr><th>Vehicle</th><th>Dates</th><th class="r">Days</th><th class="r">Total km</th></tr></thead><tbody>
    ${Object.entries(byT).map(([id, b]) => { const t = truckById(id); return `<tr><td>${esc(t ? t.name : id)}</td><td>${fmtDate(b.from)} – ${fmtDate(b.to)}</td><td class="r">${b.n}</td><td class="r">${fmtKm(b.km)}</td></tr>`; }).join("") || '<tr><td colspan="4" class="muted">No rows could be imported.</td></tr>'}
    </tbody></table></div></div>`;
}
async function writeKm(entries) { await guarded(() => Store.writeKm(entries)); schedule(); }

/* ---------- settings ---------- */
function viewSettings() {
  const s = S.settings, hasSample = S.trucks.some(x => x.sample), owner = Store.role === "owner";
  return `<div class="thead"><h2>Settings</h2></div>
  ${Store.mode === "live" ? `<section class="card"><header><h3>People</h3><span class="muted">Who can see and update ${esc(Store.company.name)}</span></header>
    ${S.members === null ? '<p class="muted" style="margin:0">Loading…</p>' : `<div class="tbl"><table><thead><tr><th>Login</th><th>Access</th><th></th></tr></thead><tbody>
      ${S.members.map(m => `<tr><td>${esc(Store.displayLogin(m.email) || m.userId)}</td><td>${{ owner: "Owner", staff: "Staff (can edit)", viewer: "View only", driver: "Driver (Monday checks)" }[m.role] || esc(m.role)}</td><td><div class="acts">${owner ? `<button class="btn sm link" data-act="pw-member" data-id="${m.userId}" data-email="${esc(Store.displayLogin(m.email))}">Set password</button>` : ""}${owner && m.userId !== Store.user.id ? `<button class="btn sm link" data-act="rm-member" data-id="${m.userId}" data-email="${esc(Store.displayLogin(m.email))}">Remove</button>` : ""}</div></td></tr>`).join("")}
    </tbody></table></div>`}
    ${owner ? `<div class="chips" style="margin-top:14px"><button class="btn primary" data-act="add-login">+ Add person with username & password</button><button class="btn" data-act="add-by-email">Add someone who has their own login</button></div>
      <p class="muted" style="margin:8px 0 0;font-size:13px">Username logins suit drivers: you choose the username and password and give them to the driver. No email needed.</p>` : ""}
    ${owner ? `<p class="muted" style="margin:14px 0 0;font-size:13px">Company ID, for setting up automatic km sync: <code>${esc(Store.company.id)}</code></p>` : ""}
  </section>` : ""}
  <section class="card"><header><h3>Reminder thresholds</h3></header>
    <form id="settings-form" class="grid">
      <div class="fld half"><label for="s-soonKm">Flag as "due soon" within (km)</label><input id="s-soonKm" type="number" min="0" value="${esc(s.soonKm)}"></div>
      <div class="fld half"><label for="s-soonDays">Flag as "due soon" within (days)</label><input id="s-soonDays" type="number" min="0" value="${esc(s.soonDays)}"><small>Also the default warning period for rego and other expiries.</small></div>
      <div class="fld half"><label for="s-lowTread">Low tread warning at (mm)</label><input id="s-lowTread" type="number" min="1.5" step="0.5" value="${esc(s.lowTread)}"></div>
      <div class="fld half"><label for="s-avgWindow">Average km/day over the last (days)</label><input id="s-avgWindow" type="number" min="7" max="120" value="${esc(s.avgWindow)}"><small>Used to predict when km-based items fall due.</small></div>
      <div class="fld"><div><button class="btn primary" type="submit">Save settings</button></div></div>
    </form></section>
  <section class="card"><header><h3>Prestart checklist</h3><span class="muted">What drivers tick off each Monday</span></header>
    <form id="prestart-form" class="grid"><div class="fld"><label for="ps-items">One item per line</label><textarea id="ps-items" rows="10" style="font-family:var(--body);font-size:15px">${esc(prestartItems().join("\n"))}</textarea>
      <small>Changes apply to new checks. Past checks keep the items they were done with.</small></div>
      <div class="fld"><div class="chips"><button class="btn primary" type="submit">Save checklist</button><a class="btn" href="#driver">Preview the driver screen</a></div></div></form></section>
  <section class="card"><header><h3>How odometer estimates work</h3></header>
    <p style="margin:0;max-width:72ch">MyTrucking records how far each truck travels each day, not its odometer. Each vehicle keeps one actual odometer reading with its date, and the estimate is that reading plus every day's km recorded after it. When you log a service with an odometer reading, or use "Update odometer", the estimate resets to that real reading, which corrects any drift from missed days.</p></section>
  <section class="card"><header><h3>Export</h3></header><p class="muted" style="margin:0 0 10px">Download everything as a file, for your records or to open in Excel.</p>
    <div class="chips"><button class="btn" data-act="export-csv">Download due list (CSV)</button><button class="btn" data-act="export-json">Download full backup (JSON)</button></div></section>
  ${Store.mode === "live" ? `<section class="card"><header><h3>Your login</h3></header><div class="chips"><button class="btn" data-act="change-pw">Change password</button><button class="btn" data-act="sign-out">Sign out</button></div></section>` : ""}
  ${hasSample ? `<section class="card"><header><h3>Sample data</h3></header><p class="muted" style="margin:0 0 10px">Removes the sample vehicles and everything recorded against them. Your own vehicles are untouched.</p><button class="btn danger" data-act="clear-sample">Remove sample fleet</button></section>` : ""}`;
}
async function loadMembers() {
  S.members = [];
  try { S.members = await Store.listMembers(); } catch (e) { toast(e.message); }
  schedule();
}

/* ---------- modal & forms ---------- */
function showModal(html) { $("#sheet").innerHTML = html; $("#modal").hidden = false; const f = $("#sheet").querySelector("input:not([type=checkbox]):not([type=hidden]),select,textarea"); if (f) setTimeout(() => f.focus(), 30); }
function closeModal() { $("#modal").hidden = true; $("#sheet").innerHTML = ""; }
function fieldHtml(f) {
  const v = f.value ?? "", id = "f_" + f.id; let input;
  if (f.type === "select") input = `<select id="${id}">${f.options.map(o => `<option value="${esc(o.v)}"${String(o.v) === String(v) ? " selected" : ""}>${esc(o.t)}</option>`).join("")}</select>`;
  else if (f.type === "textarea") input = `<textarea id="${id}" rows="3" style="font-family:var(--body);font-size:15px">${esc(v)}</textarea>`;
  else if (f.type === "checks") input = `<div class="checks">${f.options.map((o, i) => `<label><input type="checkbox" id="${id}_${i}" name="${id}" value="${esc(o.v)}"${o.on ? " checked" : ""}> ${esc(o.t)}</label>`).join("") || '<span class="muted">No schedule items on this vehicle yet.</span>'}</div>`;
  else input = `<input id="${id}" type="${f.type || "text"}" value="${esc(v)}"${f.step ? ` step="${f.step}"` : ""}${f.min != null ? ` min="${f.min}"` : ""}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ""}${f.list ? ` list="${id}_l"` : ""}${f.type === "password" ? ' autocomplete="new-password"' : ""}>${f.list ? `<datalist id="${id}_l">${f.list.map(x => `<option value="${esc(x)}">`).join("")}</datalist>` : ""}`;
  return `<div class="fld ${f.half ? "half" : ""}">${f.type === "checks" ? `<label>${esc(f.label)}</label>` : `<label for="${id}">${esc(f.label)}${f.req ? " *" : ""}</label>`}${input}${f.hint ? `<small>${esc(f.hint)}</small>` : ""}</div>`;
}
function readForm(fields) {
  const o = {};
  for (const f of fields) {
    if (f.type === "checks") { o[f.id] = [...document.querySelectorAll(`input[name="f_${f.id}"]:checked`)].map(i => i.value); continue; }
    const el = document.getElementById("f_" + f.id); if (!el) continue; let v = el.value.trim();
    if (f.type === "number") v = v === "" ? null : Number(v);
    o[f.id] = v;
  }
  return o;
}
function openForm(o) {
  showModal(`<h2>${esc(o.title)}</h2>${o.intro ? `<p class="muted" style="margin:0">${o.intro}</p>` : ""}
  <form id="mform" novalidate><div class="grid">${o.fields.map(fieldHtml).join("")}</div>
  <p class="err" id="merr"></p>
  <div class="actions">${o.danger ? `<button type="button" class="btn danger" id="mdanger">${esc(o.danger.label)}</button>` : ""}<span class="sp"></span><button type="button" class="btn ghost" data-act="close">Cancel</button><button class="btn primary" type="submit">${esc(o.submit || "Save")}</button></div></form>`);
  const form = $("#mform"), err = $("#merr");
  form.addEventListener("submit", async e => {
    e.preventDefault(); const v = readForm(o.fields);
    const miss = o.fields.find(f => f.req && (v[f.id] == null || v[f.id] === ""));
    if (miss) { err.textContent = `${miss.label} is required.`; return; }
    const bad = o.fields.find(f => f.type === "number" && v[f.id] != null && !isFinite(v[f.id]));
    if (bad) { err.textContent = `${bad.label} must be a number.`; return; }
    const btn = form.querySelector("[type=submit]"); btn.disabled = true; err.textContent = "";
    try { const r = await o.onSubmit(v); if (r !== "keep") closeModal(); }
    catch (x) { err.textContent = x.message || String(x); btn.disabled = false; }
  });
  if (o.danger) $("#mdanger").addEventListener("click", () => openConfirm(o.danger.title || o.danger.label, o.danger.text, o.danger.label, o.danger.run));
}
function openConfirm(title, text, label, run) {
  showModal(`<h2>${esc(title)}</h2><p style="margin:0">${text}</p><p class="err" id="merr"></p><div class="actions"><span class="sp"></span><button class="btn ghost" data-act="close">Cancel</button><button class="btn danger" id="mok">${esc(label)}</button></div>`);
  $("#mok").addEventListener("click", async () => { $("#mok").disabled = true; try { await run(); closeModal(); } catch (x) { $("#merr").textContent = x.message; $("#mok").disabled = false; } });
}

/* ---------- vehicle forms ---------- */
function truckForm(t) {
  const isNew = !t; t = t || { layout: "4x2d" };
  const fields = [
    { id: "name", label: "Vehicle name", value: t.name, req: true, half: true, placeholder: "e.g. Tilt Tray 3" },
    { id: "rego", label: "Rego", value: t.rego, half: true, placeholder: "e.g. 123 AB4" },
    { id: "fleetNo", label: "Name in MyTrucking", value: t.fleetNo, half: true, hint: "Exactly as it appears in MyTrucking reports, if different. Used to match imported km." },
    { id: "type", label: "Type", type: "select", value: t.type || TRUCK_TYPES[0], half: true, options: TRUCK_TYPES.map(x => ({ v: x, t: x })) },
    { id: "make", label: "Make", value: t.make, half: true }, { id: "model", label: "Model", value: t.model, half: true },
    { id: "year", label: "Year", type: "number", value: t.year, half: true }, { id: "vin", label: "VIN", value: t.vin, half: true },
    { id: "layout", label: "Axle & wheel layout (for the tyre diagram)", type: "select", value: t.layout, half: true, options: Object.entries(LAYOUTS).map(([k, l]) => ({ v: k, t: l.label })) },
    { id: "spares", label: "Spare tyres carried", type: "select", value: has(t.spares) ? t.spares : 1, half: true, options: [0, 1, 2, 3, 4].map(n => ({ v: n, t: String(n) })) },
    { id: "towedBy", label: "Usually towed by (trailers only)", type: "select", value: t.towedBy || "", hint: "A trailer uses this vehicle's daily km for its servicing countdown.", options: [{ v: "", t: "Not a trailer / not set" }, ...S.trucks.filter(x => x.id !== t.id && !isTrailerType(x.type) && !isLightType(x.type)).sort(byName).map(x => ({ v: x.id, t: `${x.name} (${x.rego || "no rego"})` }))] },
  ];
  if (isNew) fields.push(
    { id: "baseOdo", label: "Odometer reading (km)", type: "number", half: true, min: 0, hint: "Leave blank for trailers without a hubodometer." },
    { id: "baseOdoDate", label: "Reading taken on", type: "date", value: today(), req: true, half: true, hint: "Reading at the end of this day. Daily km after this date are added on top." },
    { id: "lastSvcKm", label: "Last service at (km)", type: "number", half: true, hint: "Optional. Starts the service countdown." },
    { id: "lastSvcDate", label: "Last service date", type: "date", half: true },
    { id: "regoExpiry", label: "Rego expiry", type: "date", half: true, hint: "Adds a registration reminder." },
    { id: "coiExpiry", label: "COI expiry", type: "date", half: true, hint: "Certificate of Inspection, for heavy vehicles and trailers." },
  );
  fields.push({ id: "notes", label: "Notes", type: "textarea", value: t.notes });
  openForm({
    title: isNew ? "Add vehicle" : "Edit " + t.name, fields, submit: isNew ? "Add vehicle" : "Save",
    intro: isNew ? "Standard service intervals are added automatically. You can change them on the vehicle's page." : "",
    danger: isNew ? null : { label: "Delete vehicle", text: `Delete <b>${esc(t.name)}</b> and all of its services, tyres, compliance dates and km? This can't be undone.`, run: () => deleteTruck(t.id) },
    onSubmit: async v => {
      const base = { name: v.name, rego: (v.rego || "").toUpperCase(), fleetNo: v.fleetNo, type: v.type, make: v.make, model: v.model, year: v.year, vin: v.vin, layout: v.layout, spares: Number(v.spares), towedBy: v.towedBy || null, notes: v.notes };
      if (!isNew) { await patch("trucks", t.id, base); toast("Vehicle saved"); return; }
      const id = newId();
      await put("trucks", id, clean({ ...base, baseOdo: v.baseOdo ?? (isTrailerType(v.type) ? 0 : null), baseOdoDate: v.baseOdoDate }));
      await addDefaults(id, v.type, v);
      toast("Vehicle added"); location.hash = "t-" + id;
    }
  });
}
async function addDefaults(id, type, v) {
      v = v || {};
      const tmpl = isTrailerType(type) ? TRAILER_SCHEDULE : isLightType(type) ? LIGHT_SCHEDULE : DEFAULT_SCHEDULE;
      for (const d of tmpl) {
        const isSvc = /^service/i.test(d.name);
        await put("schedules", newId(), { truckId: id, ...d, lastKm: isSvc && v.lastSvcKm != null ? v.lastSvcKm : null, lastDate: isSvc && v.lastSvcDate ? v.lastSvcDate : null });
      }
      await put("compliance", newId(), { truckId: id, name: "Registration", expiry: v.regoExpiry || null, renewMonths: 12, remindDays: 30, history: [] });
      if (!isLightType(type) || v.coiExpiry) await put("compliance", newId(), { truckId: id, name: "Certificate of Inspection (COI)", expiry: v.coiExpiry || null, renewMonths: 12, remindDays: 30, history: [] });
}
async function deleteTruck(id) { await guarded(() => Store.deleteTruck(id)); location.hash = "trucks"; toast("Vehicle deleted"); schedule(); }
function odoForm(t) {
  const M = metrics();
  openForm({
    title: "Update odometer · " + t.name, intro: has(t.baseOdo) ? `Current estimate is <b>${fmtKm(M[t.id].odo)} km</b>. Enter an actual reading to correct it.` : "Enter the reading on the dash. Daily km recorded after this date are added on top.",
    fields: [{ id: "odo", label: "Odometer reading (km)", type: "number", req: true, half: true, value: has(t.baseOdo) ? M[t.id].odo : "" }, { id: "date", label: "Reading taken on", type: "date", req: true, half: true, value: today(), hint: "End of this day." }],
    onSubmit: async v => { await patch("trucks", t.id, { baseOdo: v.odo, baseOdoDate: v.date }); toast("Odometer updated"); }
  });
}

/* ---------- schedule ---------- */
function schedForm(truckId, s) {
  const isNew = !s; s = s || {};
  openForm({
    title: isNew ? "Add maintenance item" : "Edit " + s.name, fields: [
      { id: "name", label: "Item", value: s.name, req: true, list: ["Service (oil & filters)", "Major service", "Brake inspection", "Wheel alignment & tyre rotation", "Transmission oil", "Diff oil", "Coolant change", "Air filter", "Grease chassis & fifth wheel", "Hydraulic oil & filters (tilt / ramps)", "Winch cable inspection", "Trailer wheel bearings", "Trailer brakes & air lines", "Air conditioning service"] },
      { id: "intervalKm", label: "Every (km)", type: "number", value: s.intervalKm, half: true, min: 0 },
      { id: "intervalMonths", label: "Or every (months)", type: "number", value: s.intervalMonths, half: true, min: 0, hint: "Whichever comes first. Leave one blank to use only the other." },
      { id: "lastKm", label: "Last done at (km)", type: "number", value: s.lastKm, half: true },
      { id: "lastDate", label: "Last done on", type: "date", value: s.lastDate, half: true },
      { id: "notes", label: "Notes", type: "textarea", value: s.notes },
    ], danger: isNew ? null : { label: "Delete item", text: `Remove <b>${esc(s.name)}</b> from this vehicle's schedule? Past service records stay.`, run: async () => { await del("schedules", s.id); toast("Item removed"); } },
    onSubmit: async v => {
      if (!(v.intervalKm > 0) && !(v.intervalMonths > 0)) throw new Error("Set a km interval, a months interval, or both.");
      const data = { truckId, name: v.name, intervalKm: v.intervalKm, intervalMonths: v.intervalMonths, lastKm: v.lastKm, lastDate: v.lastDate || null, notes: v.notes };
      if (isNew) await put("schedules", newId(), data); else await patch("schedules", s.id, data); toast("Saved");
    }
  });
}
function doneForm(s) {
  const t = truckById(s.truckId), M = metrics();
  openForm({
    title: `${s.name} done · ${t ? t.name : ""}`, intro: "Resets the countdown and adds an entry to the service history.", fields: [
      { id: "date", label: "Date done", type: "date", value: today(), req: true, half: true },
      { id: "odo", label: "Odometer (km)", type: "number", value: M[s.truckId] ? M[s.truckId].odo : "", half: true, hint: "Prefilled with the estimate. Use the real reading if you have it." },
      { id: "workshop", label: "Workshop / who did it", half: true }, { id: "cost", label: "Cost ($)", type: "number", half: true, step: "0.01" },
      { id: "invoice", label: "Invoice / job no.", half: true }, { id: "notes", label: "Notes", type: "textarea" },
    ], onSubmit: async v => { await recordService(s.truckId, { date: v.date, odo: v.odo, title: s.name, tasks: [s.id], workshop: v.workshop, cost: v.cost, invoice: v.invoice, notes: v.notes }); toast(s.name + " recorded"); }
  });
}
async function recordService(truckId, r, existingId) {
  const sch = S.schedules.filter(x => x.truckId === truckId);
  const taskNames = (r.tasks || []).map(id => { const s = sch.find(x => x.id === id); return s ? s.name : id; });
  await put("services", existingId || newId(), clean({ truckId, date: r.date, odo: r.odo, title: r.title, tasks: taskNames, taskIds: r.tasks || [], workshop: r.workshop, cost: r.cost, invoice: r.invoice, notes: r.notes }));
  for (const id of r.tasks || []) {
    const s = sch.find(x => x.id === id); if (!s) continue;
    if (!s.lastDate || r.date >= s.lastDate) { const u = { lastDate: r.date }; if (r.odo != null) u.lastKm = r.odo; await patch("schedules", s.id, u); }
  }
  const t = truckById(truckId);
  if (t && r.odo != null && (!t.baseOdoDate || r.date >= t.baseOdoDate)) await patch("trucks", truckId, { baseOdo: r.odo, baseOdoDate: r.date });
}
function serviceForm(truckId, svc) {
  if (!truckId) {
    if (!S.trucks.length) { toast("Add a vehicle first"); return; }
    openForm({ title: "Log service", fields: [{ id: "truck", label: "Vehicle", type: "select", options: S.trucks.slice().sort(byName).map(t => ({ v: t.id, t: `${t.name} (${t.rego || ""})` })) }], submit: "Next", onSubmit: async v => { serviceForm(v.truck); return "keep"; } });
    return;
  }
  const t = truckById(truckId), M = metrics(), isNew = !svc; svc = svc || {};
  const st = S.schedules.filter(x => x.truckId === truckId).map(s => ({ s, st: schedStatus(s, M[truckId]) }));
  openForm({
    title: (isNew ? "Log service · " : "Edit service · ") + t.name, fields: [
      { id: "date", label: "Date", type: "date", value: svc.date || today(), req: true, half: true },
      { id: "odo", label: "Odometer (km)", type: "number", value: svc.odo ?? M[truckId].odo, half: true, hint: isNew ? "Prefilled with the estimate. A real reading also corrects the estimate." : "" },
      { id: "title", label: "Description", value: svc.title, req: true, placeholder: "e.g. 15,000 km service, front brake pads", list: ["Scheduled service", "Major service", "Brake repair", "Tyre replacement", "Breakdown repair", "Hydraulics repair", "Electrical repair", "Safety inspection"] },
      { id: "tasks", label: "Schedule items this covers (resets their countdown)", type: "checks", options: st.map(({ s, st }) => ({ v: s.id, t: `${s.name}  (${LVL_TXT[st.level]})`, on: (svc.taskIds || []).includes(s.id) })) },
      { id: "workshop", label: "Workshop / mechanic", value: svc.workshop, half: true }, { id: "cost", label: "Cost ($)", type: "number", step: "0.01", value: svc.cost, half: true },
      { id: "invoice", label: "Invoice / job no.", value: svc.invoice, half: true }, { id: "notes", label: "Notes", type: "textarea", value: svc.notes },
    ], danger: isNew ? null : { label: "Delete record", text: "Delete this service record? Schedule countdowns are not changed.", run: async () => { await del("services", svc.id); toast("Record deleted"); } },
    onSubmit: async v => { await recordService(truckId, v, svc.id); toast("Service saved"); }
  });
}

/* ---------- compliance ---------- */
function compForm(truckId, c) {
  const isNew = !c; c = c || { renewMonths: 12, remindDays: S.settings.soonDays };
  openForm({
    title: isNew ? "Add expiry date" : "Edit " + c.name, fields: [
      { id: "name", label: "Item", value: c.name, req: true, list: COMPLIANCE_SUGGEST, placeholder: "e.g. Registration" },
      { id: "expiry", label: "Expires on", type: "date", value: c.expiry, req: true, half: true },
      { id: "renewMonths", label: "Renews every (months)", type: "number", value: c.renewMonths, half: true, min: 0 },
      { id: "remindDays", label: "Warn this many days before", type: "number", value: c.remindDays, half: true, min: 0 },
      { id: "ref", label: "Policy / certificate no.", value: c.ref, half: true },
      { id: "notes", label: "Notes", type: "textarea", value: c.notes },
    ], danger: isNew ? null : { label: "Delete", text: `Delete <b>${esc(c.name)}</b>?`, run: async () => { await del("compliance", c.id); toast("Deleted"); } },
    onSubmit: async v => {
      const data = { truckId, name: v.name, expiry: v.expiry, renewMonths: v.renewMonths, remindDays: v.remindDays, ref: v.ref, notes: v.notes };
      if (isNew) await put("compliance", newId(), { ...data, history: [] }); else await patch("compliance", c.id, data); toast("Saved");
    }
  });
}
function renewForm(c) {
  const t = truckById(c.truckId), next = c.expiry ? addMonths(c.expiry, Number(c.renewMonths) || 12) : addMonths(today(), 12);
  openForm({
    title: `${c.name} renewed · ${t ? t.name : ""}`, fields: [
      { id: "expiry", label: "New expiry date", type: "date", value: next, req: true, half: true },
      { id: "cost", label: "Cost ($)", type: "number", step: "0.01", half: true },
      { id: "ref", label: "Policy / certificate no.", value: c.ref, half: true },
    ], submit: "Save renewal", onSubmit: async v => {
      const history = [...(c.history || []), clean({ renewed: today(), prevExpiry: c.expiry || null, cost: v.cost ?? undefined })].slice(-20);
      await patch("compliance", c.id, { expiry: v.expiry, ref: v.ref, history }); toast(c.name + " renewed to " + fmtDate(v.expiry));
    }
  });
}

/* ---------- tyres ---------- */
function tyreModal(truckId, pos, tyreId) {
  const t = truckById(truckId); if (!t) return; const M = metrics();
  const ty = tyreId ? S.tyres.find(x => x.id === tyreId) : S.tyres.find(x => x.truckId === truckId && x.pos === pos && x.status === "fitted");
  const past = S.tyres.filter(x => x.truckId === truckId && x.pos === pos && x.status === "removed").sort((a, b) => String(b.removedDate).localeCompare(String(a.removedDate)));
  if (!ty) { if (Store.role === "viewer") { toast("No tyre recorded in this position."); return; } return fitForm(t, pos); }
  const st = tyreStatus(ty);
  const kmOn = ty.status === "fitted" ? (has(ty.fittedOdo) ? M[truckId].odo - Number(ty.fittedOdo) : null) : (has(ty.removedOdo) && has(ty.fittedOdo) ? Number(ty.removedOdo) - Number(ty.fittedOdo) : null);
  showModal(`<h2>${esc(posLabel(ty.pos))} · ${esc(t.name)}</h2>
    <div>${ty.status === "fitted" ? pill(st.level) : '<span class="pill unknown">Removed</span>'}</div>
    <dl class="kv"><dt>Tyre</dt><dd>${esc([ty.brand, ty.model].filter(Boolean).join(" ") || "—")} ${ty.condition ? `(${esc(ty.condition)})` : ""}</dd>
      <dt>Size</dt><dd>${esc(ty.size || "—")}</dd><dt>Serial / DOT</dt><dd>${esc(ty.serial || "—")}</dd>
      <dt>Fitted</dt><dd>${fmtDate(ty.fittedDate)} at ${fmtKm(ty.fittedOdo)} km</dd>
      <dt>km on this tyre</dt><dd>${fmtKm(kmOn)}${ty.status === "fitted" ? " (est.)" : ""}</dd>
      <dt>Tread</dt><dd>${has(ty.tread) ? esc(ty.tread) + " mm" : "—"}${ty.treadDate ? " · checked " + fmtDate(ty.treadDate) : ""}</dd>
      ${ty.status === "removed" ? `<dt>Removed</dt><dd>${fmtDate(ty.removedDate)} at ${fmtKm(ty.removedOdo)} km · ${esc(ty.removedReason || "")}</dd>` : ""}
      ${ty.cost ? `<dt>Cost</dt><dd>${money(ty.cost)}${ty.supplier ? " · " + esc(ty.supplier) : ""}</dd>` : ""}
      ${ty.notes ? `<dt>Notes</dt><dd>${esc(ty.notes)}</dd>` : ""}
      ${(ty.checks || []).length > 1 ? `<dt>Tread checks</dt><dd>${ty.checks.slice(-6).map(c => `${fmtShort(c.date)}: ${c.mm} mm`).join(" · ")}</dd>` : ""}</dl>
    ${past.length && ty.status === "fitted" ? `<p class="muted" style="margin:0;font-size:13px">Previously in this position: ${past.slice(0, 3).map(p => `${esc(p.brand || "tyre")} (${fmtDate(p.fittedDate)} – ${fmtDate(p.removedDate)})`).join(", ")}</p>` : ""}
    <div class="actions">${ty.status === "fitted" ? `<button class="btn primary" data-act="ty-tread" data-id="${ty.id}">Record tread check</button><button class="btn" data-act="ty-move" data-id="${ty.id}">Move / rotate</button><button class="btn" data-act="ty-remove" data-id="${ty.id}">Remove / replace</button>` : ""}<button class="btn link" data-act="ty-edit" data-id="${ty.id}">Edit details</button><span class="sp"></span><button class="btn ghost" data-act="close">Close</button></div>`);
}
function fitForm(t, pos, ty) {
  const M = metrics(), isNew = !ty; ty = ty || {};
  const prev = S.tyres.filter(x => x.truckId === t.id).sort((a, b) => String(b.fittedDate).localeCompare(String(a.fittedDate)))[0] || {};
  openForm({
    title: (isNew ? "Fit tyre · " : "Edit tyre · ") + posLabel(pos) + " · " + t.name, fields: [
      { id: "brand", label: "Brand", value: ty.brand, half: true, list: ["Bridgestone", "Michelin", "Goodyear", "Continental", "Dunlop", "Yokohama", "Toyo", "Hankook", "Kumho", "Triangle", "Double Coin", "Westlake", "Retread"] },
      { id: "model", label: "Model / pattern", value: ty.model, half: true },
      { id: "size", label: "Size", value: ty.size ?? prev.size, half: true, placeholder: "e.g. 225/70R19.5 or 11R22.5" },
      { id: "serial", label: "Serial / DOT code", value: ty.serial, half: true },
      { id: "condition", label: "Condition when fitted", type: "select", value: ty.condition || "New", half: true, options: ["New", "Retread", "Used"].map(x => ({ v: x, t: x })) },
      { id: "tread", label: "Tread depth (mm)", type: "number", step: "0.5", value: ty.tread, half: true },
      { id: "fittedDate", label: "Fitted on", type: "date", value: ty.fittedDate || today(), req: true, half: true },
      { id: "fittedOdo", label: "Odometer when fitted (km)", type: "number", value: ty.fittedOdo ?? M[t.id].odo, half: true },
      { id: "cost", label: "Cost ($)", type: "number", step: "0.01", value: ty.cost, half: true },
      { id: "supplier", label: "Supplier", value: ty.supplier, half: true },
      { id: "notes", label: "Notes", type: "textarea", value: ty.notes },
    ], submit: isNew ? "Fit tyre" : "Save",
    danger: isNew ? null : { label: "Delete record", text: 'Delete this tyre record entirely? Use "Remove / replace" instead if the tyre was taken off, so its history is kept.', run: async () => { await del("tyres", ty.id); toast("Tyre record deleted"); } },
    onSubmit: async v => {
      const data = { truckId: t.id, pos, brand: v.brand, model: v.model, size: v.size, serial: v.serial, condition: v.condition, tread: v.tread, fittedDate: v.fittedDate, fittedOdo: v.fittedOdo, cost: v.cost, supplier: v.supplier, notes: v.notes };
      if (isNew) { await put("tyres", newId(), { ...data, status: "fitted", treadDate: v.tread != null ? v.fittedDate : null, checks: v.tread != null ? [{ date: v.fittedDate, mm: v.tread }] : [] }); toast("Tyre fitted"); }
      else { await patch("tyres", ty.id, data); toast("Tyre saved"); }
    }
  });
}
function treadForm(ty) {
  openForm({
    title: "Tread check · " + posLabel(ty.pos), fields: [
      { id: "mm", label: "Tread depth (mm)", type: "number", step: "0.5", req: true, half: true, value: ty.tread },
      { id: "date", label: "Checked on", type: "date", value: today(), req: true, half: true },
      { id: "pressure", label: "Pressure (psi), optional", type: "number", half: true },
    ], submit: "Save check", onSubmit: async v => {
      const checks = [...(ty.checks || []), clean({ date: v.date, mm: v.mm, psi: v.pressure ?? undefined })].slice(-30);
      await patch("tyres", ty.id, { tread: v.mm, treadDate: v.date, checks }); toast("Tread recorded");
    }
  });
}
function moveForm(ty) {
  const t = truckById(ty.truckId), byPos = {}; for (const x of S.tyres) if (x.truckId === t.id && x.status === "fitted") byPos[x.pos] = x;
  openForm({
    title: "Move tyre from " + posLabel(ty.pos), intro: "If the new position already has a tyre, the two are swapped.", fields: [
      { id: "to", label: "Move to", type: "select", options: positions(t).filter(p => p.key !== ty.pos).map(p => ({ v: p.key, t: p.label + (byPos[p.key] ? `  (swap with ${byPos[p.key].brand || "tyre"})` : "  (empty)") })) },
    ], submit: "Move", onSubmit: async v => {
      const other = byPos[v.to], from = ty.pos;
      await patch("tyres", ty.id, { pos: v.to }); if (other) await patch("tyres", other.id, { pos: from });
      toast(other ? "Tyres swapped" : "Tyre moved");
    }
  });
}
function removeForm(ty) {
  const M = metrics(), t = truckById(ty.truckId);
  openForm({
    title: "Remove tyre · " + posLabel(ty.pos), fields: [
      { id: "date", label: "Removed on", type: "date", value: today(), req: true, half: true },
      { id: "odo", label: "Odometer (km)", type: "number", value: M[ty.truckId].odo, half: true },
      { id: "reason", label: "Reason", type: "select", half: true, options: ["Worn out", "Puncture / damage", "Sent for retread", "Moved to another vehicle", "Kept as spare", "Other"].map(x => ({ v: x, t: x })) },
      { id: "tread", label: "Final tread (mm)", type: "number", step: "0.5", value: ty.tread, half: true },
      { id: "notes", label: "Notes", type: "textarea" },
      { id: "fitnew", label: "Next step", type: "select", options: [{ v: "1", t: "Fit the replacement tyre now" }, { v: "", t: "Leave the position empty" }] },
    ], submit: "Remove tyre", onSubmit: async v => {
      await patch("tyres", ty.id, { status: "removed", removedDate: v.date, removedOdo: v.odo, removedReason: v.reason, tread: v.tread, notes: [ty.notes, v.notes].filter(Boolean).join(" · ") });
      toast("Tyre removed"); if (v.fitnew) { fitForm(t, ty.pos); return "keep"; }
    }
  });
}

/* ---------- starter fleet (from config.js) ---------- */
function starter() { const f = (window.BMT_CONFIG || {}).starterFleet; return Array.isArray(f) ? f : []; }
async function loadStarter() {
  toast("Adding vehicles…");
  const ids = {};
  try {
    for (const v of starter()) {
      const id = newId(); ids[v.key || v.rego || v.name] = id;
      await put("trucks", id, clean({ name: v.name, rego: v.rego || null, fleetNo: v.fleetNo || v.rego || null, type: v.type, make: v.make, model: v.model, year: v.year, layout: v.layout, spares: v.spares ?? 1,
        baseOdo: isTrailerType(v.type) ? 0 : null, baseOdoDate: today(), notes: v.notes }));
      await addDefaults(id, v.type, {});
    }
    for (const v of starter()) if (v.towedBy && ids[v.towedBy]) await patch("trucks", ids[v.key || v.rego || v.name], { towedBy: ids[v.towedBy] });
    toast("Vehicles added. Next: fill in odometers and dates."); location.hash = "dashboard";
  } catch (e) { toast(e.message); }
  schedule();
}

/* ---------- sample fleet ---------- */
async function loadSample() {
  toast("Adding sample fleet…");
  const td = today(); const rnd = (a, b) => Math.round(a + Math.random() * (b - a));
  const defs = [
    { name: "SAMPLE Tilt Tray 1", rego: "SMP 101", fleetNo: "TT1", type: "Rigid tilt tray", make: "Isuzu", model: "FVR 165-300", year: 2019, layout: "4x2d", odo: 284350, avg: 240, svcGap: 14100, regoIn: 12, size: "245/70R19.5", lowTyre: "Drive|LO" },
    { name: "SAMPLE Tilt Tray 2", rego: "SMP 202", fleetNo: "TT2", type: "Rigid tilt tray", make: "Hino", model: "500 FG 1628", year: 2017, layout: "4x2d", odo: 412800, avg: 180, svcGap: 15600, regoIn: 140, size: "225/70R19.5" },
    { name: "SAMPLE Prime Mover 1", rego: "SMP 303", fleetNo: "PM1", type: "Prime mover", make: "Kenworth", model: "T610", year: 2021, layout: "6x4", odo: 198400, avg: 120, svcGap: 6000, regoIn: 64, size: "295/80R22.5", chainsIn: 25 },
  ];
  try {
    for (const d of defs) {
      const id = newId(); const days = [];
      for (let i = 29; i >= 0; i--) { const day = addDays(td, -i); const dow = new Date(toUTC(day)).getUTCDay(); days.push({ truckId: id, date: day, km: dow === 0 ? 0 : rnd(d.avg * 0.55, d.avg * 1.45), source: "sample" }); }
      const sum = days.reduce((a, b) => a + b.km, 0);
      await put("trucks", id, { name: d.name, rego: d.rego, fleetNo: d.fleetNo, type: d.type, make: d.make, model: d.model, year: d.year, layout: d.layout, baseOdo: d.odo - sum, baseOdoDate: addDays(td, -30), sample: true, notes: "Sample vehicle to show how the system works. Remove it from Settings." });
      await Store.writeKm(days);
      const svcDate = addDays(td, -Math.round(d.svcGap / d.avg * 1.2));
      await put("schedules", newId(), { truckId: id, name: "Service (oil & filters)", intervalKm: 15000, intervalMonths: 6, lastKm: d.odo - d.svcGap, lastDate: svcDate, sample: true });
      await put("schedules", newId(), { truckId: id, name: "Brake inspection", intervalKm: 30000, intervalMonths: 12, lastKm: d.odo - 12000, lastDate: addMonths(td, -5), sample: true });
      await put("schedules", newId(), { truckId: id, name: "Wheel alignment & tyre rotation", intervalKm: 40000, intervalMonths: 12, lastKm: d.odo - 20000, lastDate: addDays(addMonths(td, -12), d.fleetNo === "TT2" ? 18 : 150), sample: true });
      if (d.layout === "6x4") await put("schedules", newId(), { truckId: id, name: "Grease chassis & fifth wheel", intervalKm: null, intervalMonths: 3, lastKm: null, lastDate: addMonths(td, -1), sample: true });
      await put("services", newId(), { truckId: id, date: svcDate, odo: d.odo - d.svcGap, title: "Scheduled service", tasks: ["Service (oil & filters)"], taskIds: [], workshop: "Sample Diesel Repairs", cost: d.layout === "6x4" ? 1850 : 980, sample: true });
      await put("compliance", newId(), { truckId: id, name: "Registration", expiry: addDays(td, d.regoIn), renewMonths: 12, remindDays: 30, history: [], sample: true });
      await put("compliance", newId(), { truckId: id, name: "Insurance", expiry: addDays(td, 200), renewMonths: 12, remindDays: 30, ref: "POL-SAMPLE", history: [], sample: true });
      if (d.chainsIn) await put("compliance", newId(), { truckId: id, name: "Chains & straps inspection", expiry: addDays(td, d.chainsIn), renewMonths: 12, remindDays: 30, history: [], sample: true });
      for (const p of positions({ layout: d.layout, spares: 1 })) {
        if (/^Spare/.test(p.key)) continue;
        const tr = p.key === d.lowTyre ? 3.5 : rnd(7, 14), fd = addDays(td, -rnd(60, 400));
        await put("tyres", newId(), { truckId: id, pos: p.key, brand: ["Bridgestone", "Michelin", "Goodyear"][rnd(0, 2)], size: d.size, condition: "New", tread: tr, treadDate: addDays(td, -rnd(3, 20)), checks: [], fittedDate: fd, fittedOdo: d.odo - Math.round(daysBetween(fd, td) * d.avg), status: "fitted", sample: true });
      }
    }
    toast("Sample fleet added"); location.hash = "dashboard";
  } catch (e) { toast(e.message); }
  schedule();
}
async function clearSample() { for (const t of S.trucks.filter(x => x.sample)) await guarded(() => Store.deleteTruck(t.id)); toast("Sample fleet removed"); schedule(); }

/* ---------- exports ---------- */
function download(name, text, type) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function exportCsv() {
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Status", "Rego", "Vehicle", "Item", "Detail", "Due"]];
  for (const i of allItems(metrics())) rows.push([LVL_TXT[i.level], i.t.rego, i.t.name, itemLabel(i), i.text, i.sub]);
  download(`bmt-due-list-${today()}.csv`, rows.map(r => r.map(q).join(",")).join("\r\n"), "text/csv");
}
function exportJson() {
  const d = { exported: new Date().toISOString(), company: Store.company && Store.company.name, settings: S.settings, km: S.km };
  for (const c of ["trucks", "schedules", "services", "tyres", "compliance"]) d[c] = S[c];
  download(`bmt-fleet-backup-${today()}.json`, JSON.stringify(d, null, 1), "application/json");
}

/* ---------- events ---------- */
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-act],[data-href]"); if (!el) return;
  if (el.dataset.href && !el.dataset.act) { if (e.target.closest("button,a")) return; location.hash = el.dataset.href.slice(1); return; }
  const a = el.dataset.act, id = el.dataset.id;
  if (Store.role === "viewer" && WRITE_ACTS.has(a)) { toast("You have view-only access."); return; }
  const find = c => S[c].find(x => x.id === id);
  try {
    switch (a) {
      case "close": closeModal(); break;
      case "auth-view": S.authView = el.dataset.v; S.authMsg = ""; render(); break;
      case "sign-out": await (Store.signOut ? Store.signOut() : null); S.phase = "auth"; S.authView = "login"; S.authMsg = ""; S.members = null; location.hash = ""; render(); break;
      case "refresh-company": { const r = await Store.pickCompany(); if (r === "ready") { S.phase = "ready"; render(); } else toast("You haven't been added to a company yet."); break; }
      case "add-truck": truckForm(); break;
      case "edit-truck": truckForm(truckById(id)); break;
      case "del-truck": { const t = truckById(id); openConfirm("Delete " + t.name, `Delete <b>${esc(t.name)}</b> and all of its services, tyres, compliance dates and km? This can't be undone.`, "Delete vehicle", () => deleteTruck(id)); break; }
      case "odo": odoForm(truckById(id)); break;
      case "add-sched": schedForm(el.dataset.truck); break;
      case "edit-sched": { const s = find("schedules"); schedForm(s.truckId, s); break; }
      case "done-sched": doneForm(find("schedules")); break;
      case "log-service": serviceForm(el.dataset.truck || (route().startsWith("t-") ? route().slice(2) : null)); break;
      case "edit-service": { const s = find("services"); serviceForm(s.truckId, s); break; }
      case "add-comp": compForm(el.dataset.truck); break;
      case "edit-comp": { const c = find("compliance"); compForm(c.truckId, c); break; }
      case "renew-comp": renewForm(find("compliance")); break;
      case "tyre": tyreModal(el.dataset.truck, el.dataset.pos, el.dataset.tid); break;
      case "ty-tread": treadForm(find("tyres")); break;
      case "ty-move": moveForm(find("tyres")); break;
      case "ty-remove": removeForm(find("tyres")); break;
      case "ty-edit": { const ty = find("tyres"); fitForm(truckById(ty.truckId), ty.pos, ty); break; }
      case "sample": await loadSample(); break;
      case "starter": await loadStarter(); break;
      case "clear-sample": openConfirm("Remove sample fleet", "Remove the sample vehicles and everything recorded against them?", "Remove samples", clearSample); break;
      case "km-preview":
        S.importText = $("#imp-text").value; S.importTruck = $("#imp-truck").value;
        S.importPreview = KmParse.parseImport(S.importText, S.trucks, S.importTruck); render(); break;
      case "km-import": {
        const pv = S.importPreview; if (!pv) break; el.disabled = true;
        try { await writeKm(pv.entries.map(x => ({ ...x, source: "import" }))); toast(`Imported ${pv.entries.length} days of km`); S.importPreview = null; S.importText = ""; render(); }
        catch (x) { toast(x.message); el.disabled = false; } break;
      }
      case "km-save": {
        const entries = [], M = metrics();
        document.querySelectorAll("[data-km]").forEach(inp => {
          const v = inp.value.trim(), cur = M[inp.dataset.km].days[S.kmDate];
          if (v === "") { if (cur != null) entries.push({ truckId: inp.dataset.km, date: S.kmDate, km: null }); return; }
          const n = Number(v); if (isFinite(n) && n >= 0 && n !== Number(cur)) entries.push({ truckId: inp.dataset.km, date: S.kmDate, km: n });
        });
        if (!entries.length) { toast("No changes to save"); break; }
        el.disabled = true;
        try { await writeKm(entries); S.kmDraft = {}; toast(`Saved km for ${entries.length} vehicle${entries.length === 1 ? "" : "s"}`); } catch (x) { toast(x.message); }
        el.disabled = false; break;
      }
      case "drv-ans": {
        const st = drvState(), it = prestartItems()[Number(el.dataset.i)], cur = st.answers[it] || {};
        st.answers[it] = { ...cur, status: el.dataset.s }; render(); break;
      }
      case "drv-allok": { const st = drvState(); for (const it of prestartItems()) if (!(st.answers[it] && st.answers[it].status)) st.answers[it] = { status: "ok" }; render(); break; }
      case "drv-send": await sendCheck(el); break;
      case "drv-new": { const keep = S.drv && S.drv.truckId; S.drv = null; drvState().truckId = keep || ""; render(); break; }
      case "fix-defect": fixForm(S.defects.find(d => d.id === id)); break;
      case "view-check": checkModal(S.checks.find(c => c.id === id)); break;
      case "del-check": openConfirm("Delete check", "Delete this check and any defects it reported? This can't be undone.", "Delete", async () => { await guarded(() => Store.deleteCheck(id)); toast("Check deleted"); schedule(); }); break;
      case "export-csv": exportCsv(); break;
      case "export-json": exportJson(); break;
      case "change-pw": openForm({ title: "Change password", fields: [{ id: "pw", label: "New password", type: "password", req: true, hint: "At least 8 characters." }], onSubmit: async v => { if (v.pw.length < 8) throw new Error("Use at least 8 characters."); await Store.updatePassword(v.pw); toast("Password changed"); } }); break;
      case "add-login": openForm({ title: "Add person", intro: "Choose a username and password, then give them to the person. They sign in with these on the site or their phone.", fields: [
          { id: "username", label: "Username", req: true, half: true, placeholder: "e.g. jsmith", hint: "Letters, numbers, dots or dashes. No spaces." },
          { id: "pw", label: "Password", req: true, half: true, hint: "At least 8 characters." },
          { id: "role", label: "Access", type: "select", value: "driver", options: [{ v: "driver", t: "Driver (Monday checks only)" }, { v: "staff", t: "Staff (can edit)" }, { v: "viewer", t: "View only" }, { v: "owner", t: "Owner" }] }],
          submit: "Create login", onSubmit: async v => { if (v.pw.length < 8) throw new Error("The password needs at least 8 characters."); await Store.createLogin(v.username, v.pw, v.role); toast(`Login created for ${v.username.toLowerCase()}`); await loadMembers(); } }); break;
      case "add-by-email": openForm({ title: "Add someone with their own login", intro: "For people who created their own login with their email (\"Create a login\" on the sign-in screen).", fields: [
          { id: "email", label: "Their email", type: "email", req: true },
          { id: "role", label: "Access", type: "select", value: "staff", options: [{ v: "staff", t: "Staff (can edit)" }, { v: "viewer", t: "View only" }, { v: "driver", t: "Driver (Monday checks only)" }, { v: "owner", t: "Owner" }] }],
          submit: "Add person", onSubmit: async v => { await Store.addMember(v.email, v.role); toast("Person added"); await loadMembers(); } }); break;
      case "pw-member": openForm({ title: `New password for ${el.dataset.email}`, intro: "They'll use this next time they sign in. Let them know the new password.", fields: [{ id: "pw", label: "New password", req: true, hint: "At least 8 characters." }],
          submit: "Set password", onSubmit: async v => { if (v.pw.length < 8) throw new Error("The password needs at least 8 characters."); await Store.setMemberPassword(id, v.pw); toast("Password changed"); } }); break;
      case "rm-member": openConfirm("Remove person", `Remove <b>${esc(el.dataset.email)}</b>? They'll no longer see ${esc(Store.company.name)}.`, "Remove", async () => { await Store.removeMember(id); toast("Removed"); await loadMembers(); }); break;
    }
  } catch (x) { toast(x.message || String(x)); }
});
document.addEventListener("input", e => {
  if (S.drv) {
    if (e.target.id === "drv-odo") { S.drv.odo = e.target.value; S.drv.odoWarned = false; }
    if (e.target.id === "drv-notes") S.drv.notes = e.target.value;
    if (e.target.classList.contains("drv-note")) { const it = prestartItems()[Number(e.target.dataset.i)]; S.drv.answers[it] = { ...(S.drv.answers[it] || {}), note: e.target.value }; }
  }
  if (e.target.dataset && e.target.dataset.km) S.kmDraft[e.target.dataset.km] = e.target.value;
  if (e.target.id === "imp-text") S.importText = e.target.value;
});
document.addEventListener("change", async e => {
  if (e.target.id === "drv-truck") { drvState().truckId = e.target.value; S.drv.odoWarned = false; render(); }
  if (e.target.id === "km-date") { S.kmDate = e.target.value || today(); S.kmDraft = {}; render(); }
  if (e.target.id === "imp-truck") S.importTruck = e.target.value;
  if (e.target.id === "imp-file" && e.target.files[0]) { const txt = await e.target.files[0].text(); S.importText = txt; S.importTruck = $("#imp-truck").value; S.importPreview = KmParse.parseImport(txt, S.trucks, S.importTruck); render(); }
});
document.addEventListener("submit", async e => {
  const f = e.target; if (!["settings-form", "auth-form", "company-form", "member-form", "prestart-form"].includes(f.id)) return;
  e.preventDefault();
  const btn = f.querySelector("[type=submit]"); if (btn) btn.disabled = true;
  try {
    if (f.id === "settings-form") {
      if (Store.role === "viewer") throw new Error("You have view-only access.");
      const g = k => Number($("#s-" + k).value);
      await Store.saveSettings({ ...S.settings, soonKm: g("soonKm"), soonDays: g("soonDays"), lowTread: g("lowTread"), avgWindow: Math.min(120, Math.max(7, g("avgWindow") || 30)) });
      toast("Settings saved"); schedule();
    } else if (f.id === "prestart-form") {
      if (Store.role !== "owner" && Store.role !== "staff") throw new Error("Only the owner or staff can change the checklist.");
      const list = $("#ps-items").value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
      if (!list.length) throw new Error("Add at least one item.");
      await Store.saveSettings({ ...S.settings, prestartItems: list }); toast("Checklist saved"); schedule();
    } else if (f.id === "member-form") {
      await Store.addMember($("#m-email").value.trim(), $("#m-role").value); toast("Person added"); await loadMembers();
    } else if (f.id === "company-form") {
      const r = await Store.createCompany($("#c-name").value.trim()); if (r === "ready") { S.phase = "ready"; location.hash = "dashboard"; render(); }
    } else if (f.id === "auth-form") {
      const kind = f.dataset.kind, email = ($("#a-email") || {}).value, pw = ($("#a-pw") || {}).value;
      S.authMsg = ""; S.authMsgOk = false;
      if (kind === "login") { await enter(await Store.signIn(email.trim(), pw)); }
      else if (kind === "signup") { const r = await Store.signUp(email.trim(), pw); if (r === "check-email") { S.authView = "check-email"; render(); } else await enter(r); }
      else if (kind === "forgot") { await Store.resetPassword(email.trim()); S.authMsg = "If that email has a login, a reset link is on its way."; S.authMsgOk = true; S.authView = "login"; render(); }
      else if (kind === "set-password") { await Store.updatePassword(pw); toast("Password saved"); await enter(await Store.pickCompany()); }
    }
  } catch (x) {
    if (f.id === "auth-form") { S.authMsg = /invalid login/i.test(x.message) ? "That email and password don't match." : x.message; render(); }
    else toast(x.message || String(x));
  } finally { if (btn && document.body.contains(btn)) btn.disabled = false; }
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#modal").hidden) closeModal(); });
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });
const busyDriver = () => S.drv && !S.drv.done && (Store.role === "driver" || route() === "driver") && (S.drv.odo || Object.keys(S.drv.answers).length);
window.addEventListener("focus", () => { if (Store.mode === "live" && !busyDriver()) refresh(); });
setInterval(() => { if (Store.mode === "live" && document.visibilityState === "visible" && $("#modal").hidden && !busyDriver()) refresh(); }, 120000);

/* ---------- boot ---------- */
async function enter(state) {
  if (state === "ready") { S.phase = "ready"; S.members = null; }
  else if (state === "company") S.phase = "company";
  else if (state === "check-email") { S.phase = "auth"; S.authView = "check-email"; }
  else if (state === "set-password") { S.phase = "auth"; S.authView = "set-password"; }
  else { S.phase = "auth"; }
  render();
}
async function boot() {
  if (Store.configProblem) { S.phase = "error"; S.error = Store.configProblem; render(); return; }
  Store.onRecovery = () => { S.phase = "auth"; S.authView = "set-password"; S.authMsg = ""; render(); };
  Store.onSignedOut = () => { if (S.phase === "ready") { S.phase = "auth"; S.authView = "login"; render(); } };
  try { await enter(await Store.init(S)); }
  catch (e) { S.phase = "error"; S.error = "Couldn't start: " + (e.message || e); render(); }
}
boot();
