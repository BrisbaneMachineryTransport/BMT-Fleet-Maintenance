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

  function resetData(S) { for (const c of COLS) S[c] = []; S.km = {}; S.settings = { ...DEFAULT_SETTINGS }; }
  function localPut(S, col, id, data) { const arr = S[col], i = arr.findIndex(x => x.id === id), doc = { ...clone(data), id }; if (i >= 0) arr[i] = doc; else arr.push(doc); }
  function localPatch(S, col, id, data) { const x = S[col].find(x => x.id === id); if (!x) throw new Error("That record no longer exists. Refresh the page."); Object.assign(x, clone(data)); }
  function localKm(S, entries) { for (const e of entries) { const m = (S.km[e.truckId] ||= {}); if (e.km == null) delete m[e.date]; else m[e.date] = e.km; } }
  function localDeleteTruck(S, id) { S.trucks = S.trucks.filter(t => t.id !== id); for (const c of COLS.slice(1)) S[c] = S[c].filter(x => x.truckId !== id); delete S.km[id]; }

  /* ---------------- demo store ---------------- */
  function DemoStore() {
    const KEY = "bmt-fleet-demo-v1"; let S;
    const save = () => { try { const d = { settings: S.settings, km: S.km }; for (const c of COLS) d[c] = S[c]; localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { console.warn(e); } };
    return {
      mode: "demo", DEFAULT_SETTINGS, newId: uuid,
      async init(state) {
        S = state; resetData(S);
        try { const d = JSON.parse(localStorage.getItem(KEY) || "null"); if (d) { for (const c of COLS) S[c] = d[c] || []; S.km = d.km || {}; S.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) }; } } catch (e) {}
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
      async listMembers() { return [{ email: "demo mode", role: "owner", userId: "demo" }]; }
    };
  }

  /* ---------------- live store (Supabase) ---------------- */
  function LiveStore(cfg) {
    // Note a password-reset link before the client reads (and clears) the address bar.
    const cameForRecovery = /type=recovery/.test(location.hash + location.search);
    const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
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
      mode: "live", DEFAULT_SETTINGS, newId: uuid, sb, user: null, company: null, role: null, companies: [],
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
        const [trucks, schedules, services, tyres, compliance] = await Promise.all(
          COLS.map(c => fetchAll(c, q => q.order("id"))));
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
      async signIn(email, password) { const r = await sb.auth.signInWithPassword({ email, password }); chk(r); store.user = r.data.user; return await store.pickCompany(); },
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
      async removeMember(userId) { chk(await sb.rpc("remove_member", { cid, member_user: userId })); }
    };
    return store;
  }

  const cfg = window.BMT_CONFIG || {};
  const live = cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase;
  window.Store = live ? LiveStore(cfg) : DemoStore();
  window.Store.configProblem = (cfg.supabaseUrl && cfg.supabaseAnonKey && !window.supabase) ? "The database library didn't load. Check the internet connection and refresh." : null;
})();
