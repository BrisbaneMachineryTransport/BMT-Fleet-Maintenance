/* Data layer. Two interchangeable stores:
   - LiveStore: Supabase (shared database, logins) — used when config.js has the Supabase keys.
   - DemoStore: this browser only — used when config.js is empty, so the site works before setup.
   Both keep the working copy in the app's state object S and mirror changes to storage. */
(function () {
  "use strict";
  const COLS = ["trucks", "schedules", "services", "tyres", "compliance"];
  const DEFAULT_SETTINGS = { soonKm: 1500, soonDays: 30, lowTread: 4, avgWindow: 30 };
  const camel = s => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  const snake = s => s.replace(/[A-Z]/g, c => "_" + c.toLowerCase());
  const fromDb = r => { const o = {}; for (const [k, v] of Object.entries(r)) o[camel(k)] = v; return o; };
  const toDb = o => { const r = {}; for (const [k, v] of Object.entries(o)) { if (v === undefined) continue; r[snake(k)] = v === "" ? null : v; } return r; };
  const clone = o => JSON.parse(JSON.stringify(o));
  const uuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); });
  const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  function resetData(S) { for (const c of COLS) S[c] = []; S.km = {}; S.checks = []; S.defects = []; S.settings = { ...DEFAULT_SETTINGS }; }
  // Same rules as submit_check in the database, for demo mode.
  function localCheck(S, p, who) {
    const id = uuid(), faults = (p.items || []).filter(i => i.status === "fault");
    S.checks.push({ id, truckId: p.truckId, driverEmail: who, checkDate: p.date, odo: p.odo, items: clone(p.items || []), faultCount: faults.length, notes: p.notes, createdAt: new Date().toISOString() });
    for (const f of faults) S.defects.push({ id: uuid(), truckId: p.truckId, checkId: id, item: f.item, note: f.note, status: "open", reportedBy: who, reportedAt: new Date().toISOString() });
    if (p.odo != null) { const t = S.trucks.find(x => x.id === p.truckId), prev = isoDay(new Date(new Date(p.date + "T00:00:00").getTime() - 864e5));
      if (t && (!t.baseOdoDate || t.baseOdoDate <= prev)) { t.baseOdo = p.odo; t.baseOdoDate = prev; } }
    return id;
  }
  function localPut(S, col, id, data) { const arr = S[col], i = arr.findIndex(x => x.id === id), doc = { ...clone(data), id }; if (i >= 0) arr[i] = doc; else arr.push(doc); }
  function localPatch(S, col, id, data) { const x = S[col].find(x => x.id === id); if (!x) throw new Error("That record no longer exists. Refresh the page."); Object.assign(x, clone(data)); }
  function localKm(S, entries) { for (const e of entries) { const m = (S.km[e.truckId] ||= {}); if (e.km == null) delete m[e.date]; else m[e.date] = e.km; } }
  function localDeleteTruck(S, id) { S.trucks = S.trucks.filter(t => t.id !== id); for (const c of [...COLS.slice(1), "checks", "defects"]) S[c] = S[c].filter(x => x.truckId !== id); delete S.km[id]; }

  // Usernames are stored as placeholder emails, because Supabase logins are emails.
  const USERNAME_DOMAIN = ((window.BMT_CONFIG || {}).usernameDomain || "drivers.bmt-fleet.local").toLowerCase();
  const loginEmail = v => { v = String(v || "").trim().toLowerCase(); return v.includes("@") ? v : `${v}@${USERNAME_DOMAIN}`; };
  const displayLogin = e => { e = String(e || ""); return e.endsWith("@" + USERNAME_DOMAIN) ? e.slice(0, -USERNAME_DOMAIN.length - 1) : e; };

  /* ---------------- demo store ---------------- */
  function DemoStore() {
    const KEY = "bmt-fleet-demo-v1"; let S;
    const save = () => { try { const d = { settings: S.settings, km: S.km, checks: S.checks, defects: S.defects }; for (const c of COLS) d[c] = S[c]; localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { console.warn(e); } };
    return {
      mode: "demo", DEFAULT_SETTINGS, newId: uuid, displayLogin,
      async init(state) {
        S = state; resetData(S);
        try { const d = JSON.parse(localStorage.getItem(KEY) || "null"); if (d) { for (const c of COLS) S[c] = d[c] || []; S.km = d.km || {}; S.checks = d.checks || []; S.defects = d.defects || []; S.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) }; } } catch (e) {}
        this.user = { email: "demo" }; this.company = { name: (window.BMT_CONFIG || {}).companyName || "Demo" }; this.role = "owner";
        return "ready";
      },
      async load() {},
      async put(col, id, data) { localPut(S, col, id, data); save(); },
      async patch(col, id, data) { localPatch(S, col, id, data); save(); },
      async del(col, id) { S[col] = S[col].filter(x => x.id !== id); save(); },
      async deleteTruck(id) { localDeleteTruck(S, id); save(); },
      async writeKm(entries) { localKm(S, entries); save(); },
      async saveSettings(s) { S.settings = { ...DEFAULT_SETTINGS, ...s }; save(); },
      async listMembers() { return [{ email: "demo mode", role: "owner", userId: "demo" }]; },
      async submitCheck(p) { const id = localCheck(S, p, "demo driver"); save(); return id; },
      async fixDefect(id, note) { const d = S.defects.find(x => x.id === id); if (d) Object.assign(d, { status: "fixed", fixedAt: new Date().toISOString(), fixedBy: "demo", fixNote: note }); save(); },
      async deleteCheck(id) { S.checks = S.checks.filter(c => c.id !== id); S.defects = S.defects.filter(d => d.checkId !== id); save(); }
    };
  }

  /* ---------------- live store (Supabase) ---------------- */
  function LiveStore(cfg) {
    // Note a password-reset link before the client reads (and clears) the address bar.
    const cameForRecovery = /type=recovery/.test(location.hash + location.search);
    // Use only the address part (https://xxxx.supabase.co), even if extra was pasted after it.
    let base = String(cfg.supabaseUrl).trim(); try { base = new URL(base).origin; } catch (e) {}
    const sb = window.supabase.createClient(base, String(cfg.supabaseAnonKey).trim(), { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    let S, cid = null;
    const msg = e => {
      const m = (e && (e.message || e.error_description)) || String(e);
      if (/row-level security|permission denied/i.test(m)) return "You don't have permission to change this. Ask the owner for staff access.";
      if (/Failed to fetch|NetworkError|network/i.test(m)) return "Can't reach the database. Check the internet connection and try again.";
      if (/JWT|expired/i.test(m)) return "Your login has expired. Sign in again.";
      return m;
    };
    const chk = ({ error, data }) => { if (error) throw new Error(msg(error)); return data; };
    async function fetchAll(table, build) {
      const out = []; const step = 1000;
      for (let from = 0; ; from += step) {
        const rows = chk(await build(sb.from(table).select("*").eq("company_id", cid)).range(from, from + step - 1));
        out.push(...rows); if (rows.length < step) break;
      }
      return out;
    }
    const store = {
      mode: "live", DEFAULT_SETTINGS, newId: uuid, sb, displayLogin, user: null, company: null, role: null, companies: [],
      onRecovery: null, onSignedOut: null,
      async init(state) {
        S = state; resetData(S);
        sb.auth.onAuthStateChange((ev) => {
          if (ev === "PASSWORD_RECOVERY" && store.onRecovery) store.onRecovery();
          if (ev === "SIGNED_OUT" && store.onSignedOut) store.onSignedOut();
        });
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return "login";
        store.user = session.user;
        if (cameForRecovery) return "set-password";
        return await store.pickCompany();
      },
      async pickCompany(wanted) {
        const rows = chk(await sb.from("company_members").select("company_id, role, companies(id, name, settings)").eq("user_id", store.user.id));
        store.companies = rows.filter(r => r.companies).map(r => ({ id: r.companies.id, name: r.companies.name, settings: r.companies.settings, role: r.role }));
        if (!store.companies.length) return "company";
        let c = store.companies.find(x => x.id === (wanted || localStorage.getItem("bmt-company"))) || store.companies[0];
        cid = c.id; store.company = c; store.role = c.role;
        try { localStorage.setItem("bmt-company", cid); } catch (e) {}
        await store.load();
        return "ready";
      },
      async load() {
        if (!cid) return;
        const since90 = isoDay(new Date(Date.now() - 100 * 864e5));
        if (store.role === "driver") {   // drivers only see vehicles and their own checks
          const [trucks, checks] = await Promise.all([fetchAll("trucks", q => q.order("id")), fetchAll("checks", q => q.gte("check_date", since90).order("check_date"))]);
          S.trucks = trucks.map(fromDb); S.checks = checks.map(fromDb);
          const co = chk(await sb.from("companies").select("name, settings").eq("id", cid).single());
          store.company.name = co.name; S.settings = { ...DEFAULT_SETTINGS, ...(co.settings || {}) };
          return;
        }
        const [trucks, schedules, services, tyres, compliance] = await Promise.all(
          COLS.map(c => fetchAll(c, q => q.order("id"))));
        const [checks, openDefects, recentDefects] = await Promise.all([
          fetchAll("checks", q => q.gte("check_date", since90).order("check_date")),
          fetchAll("defects", q => q.eq("status", "open").order("reported_at")),
          fetchAll("defects", q => q.eq("status", "fixed").gte("reported_at", since90).order("reported_at"))]);
        S.checks = checks.map(fromDb); S.defects = [...openDefects, ...recentDefects].map(fromDb);
        const today = new Date(), back = new Date(today.getTime() - 120 * 864e5);
        let since = isoDay(back);
        for (const t of trucks) if (t.base_odo_date && t.base_odo_date < since) since = t.base_odo_date;
        const km = await fetchAll("km_daily", q => q.gte("day", since).order("truck_id").order("day"));
        S.trucks = trucks.map(fromDb); S.schedules = schedules.map(fromDb); S.services = services.map(fromDb);
        S.tyres = tyres.map(fromDb); S.compliance = compliance.map(fromDb);
        S.km = {}; for (const r of km) (S.km[r.truck_id] ||= {})[r.day] = Number(r.km);
        const co = chk(await sb.from("companies").select("name, settings").eq("id", cid).single());
        store.company.name = co.name;
        S.settings = { ...DEFAULT_SETTINGS, ...(co.settings || {}) };
      },
      async put(col, id, data) {
        localPut(S, col, id, data);
        const row = toDb({ ...data, id, companyId: cid }); delete row.created_at;
        chk(await sb.from(col).upsert(row));
      },
      async patch(col, id, data) {
        localPatch(S, col, id, data);
        chk(await sb.from(col).update(toDb(data)).eq("id", id).eq("company_id", cid));
      },
      async del(col, id) {
        S[col] = S[col].filter(x => x.id !== id);
        chk(await sb.from(col).delete().eq("id", id).eq("company_id", cid));
      },
      async deleteTruck(id) {   // related records are removed by the database (on delete cascade)
        localDeleteTruck(S, id);
        chk(await sb.from("trucks").delete().eq("id", id).eq("company_id", cid));
      },
      async writeKm(entries) {
        localKm(S, entries);
        const up = entries.filter(e => e.km != null).map(e => ({ company_id: cid, truck_id: e.truckId, day: e.date, km: e.km, source: e.source || "manual", updated_at: new Date().toISOString() }));
        for (let i = 0; i < up.length; i += 500) chk(await sb.from("km_daily").upsert(up.slice(i, i + 500)));
        for (const e of entries.filter(e => e.km == null)) chk(await sb.from("km_daily").delete().eq("truck_id", e.truckId).eq("day", e.date));
      },
      async saveSettings(s) {
        S.settings = { ...DEFAULT_SETTINGS, ...s };
        chk(await sb.from("companies").update({ settings: S.settings }).eq("id", cid));
      },
      async renameCompany(name) { chk(await sb.from("companies").update({ name }).eq("id", cid)); store.company.name = name; },
      /* auth */
      async signIn(email, password) { const r = await sb.auth.signInWithPassword({ email: loginEmail(email), password }); chk(r); store.user = r.data.user; return await store.pickCompany(); },
      async signUp(email, password) {
        const r = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } }); chk(r);
        if (!r.data.session) return "check-email";
        store.user = r.data.user; return await store.pickCompany();
      },
      async resetPassword(email) { chk(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })); },
      async updatePassword(password) { chk(await sb.auth.updateUser({ password })); },
      async signOut() { await sb.auth.signOut(); },
      async createCompany(name) { const id = chk(await sb.rpc("create_company", { company_name: name })); return await store.pickCompany(id); },
      async listMembers() { return chk(await sb.from("company_members").select("user_id, role, email").eq("company_id", cid)).map(fromDb); },
      async addMember(email, role) { chk(await sb.rpc("add_member", { cid, member_email: email, member_role: role })); },
      async createLogin(username, password, role) {
        const u = String(username || "").trim().toLowerCase();
        if (!/^[a-z0-9._-]{2,40}$/.test(u)) throw new Error("Usernames can use letters, numbers, dots, dashes and underscores (no spaces).");
        chk(await sb.rpc("create_login", { cid, login_email: loginEmail(u), login_password: password, member_role: role }));
      },
      async setMemberPassword(userId, password) { chk(await sb.rpc("set_member_password", { cid, member_user: userId, new_password: password })); },
      async removeMember(userId) { chk(await sb.rpc("remove_member", { cid, member_user: userId })); },
      async submitCheck(p) {
        const id = chk(await sb.rpc("submit_check", { cid, truck: p.truckId, on_date: p.date, odo_reading: p.odo, check_items: p.items, check_notes: p.notes || null }));
        await store.load(); return id;
      },
      async fixDefect(id, note) {
        const upd = { status: "fixed", fixed_at: new Date().toISOString(), fixed_by: store.user.email, fix_note: note || null };
        chk(await sb.from("defects").update(upd).eq("id", id).eq("company_id", cid));
        const d = S.defects.find(x => x.id === id); if (d) Object.assign(d, fromDb(upd));
      },
      async deleteCheck(id) { chk(await sb.from("checks").delete().eq("id", id).eq("company_id", cid)); S.checks = S.checks.filter(c => c.id !== id); S.defects = S.defects.filter(d => d.checkId !== id); }
    };
    return store;
  }

  const cfg = window.BMT_CONFIG || {};
  const live = cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase;
  window.Store = live ? LiveStore(cfg) : DemoStore();
  window.Store.configProblem = (cfg.supabaseUrl && cfg.supabaseAnonKey && !window.supabase) ? "The database library didn't load. Check the internet connection and refresh." : null;
})();
