// Emails new defects reported by drivers. Run every 15 minutes by GitHub Actions
// (.github/workflows/defect-alerts.yml). Nothing to install: uses Node's built-in fetch.
//
// GitHub repository secrets (Settings > Secrets and variables > Actions):
//   SUPABASE_URL          https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY  Supabase service_role key (secret; never put it in config.js)
//   RESEND_API_KEY        from resend.com (free plan)
//   ALERT_EMAIL           where to send alerts (on Resend's free test sender this must be the email you signed up to Resend with)
//   ALERT_FROM            optional, e.g. "BMT Fleet <alerts@yourdomain.com.au>" once your domain is verified in Resend

const env = k => (process.env[k] || "").trim();
const URL_ = (() => { try { return new URL(env("SUPABASE_URL")).origin; } catch { return env("SUPABASE_URL"); } })();
const KEY = env("SUPABASE_SERVICE_KEY"), RESEND = env("RESEND_API_KEY"), TO = env("ALERT_EMAIL");
const FROM = env("ALERT_FROM") || "BMT Fleet <onboarding@resend.dev>";
const SITE = env("SITE_URL");

const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "RESEND_API_KEY", "ALERT_EMAIL"].filter(k => !env(k));
if (missing.length) { console.log(`::notice::Defect alerts skipped: secrets not set yet: ${missing.join(", ")}`); process.exit(0); }

async function rest(path, opts = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { ...opts, headers: {
    apikey: KEY, ...(KEY.startsWith("eyJ") ? { Authorization: `Bearer ${KEY}` } : {}), "Content-Type": "application/json", ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`Database error ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json().catch(() => null);
}
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const defects = await rest("defects?select=id,item,note,reported_by,reported_at,trucks(name,rego)&status=eq.open&notified_at=is.null&order=reported_at");
if (!defects.length) { console.log("No new defects."); process.exit(0); }

const rows = defects.map(d => `<tr><td style="padding:6px 10px;border-bottom:1px solid #ddd"><b>${esc(d.trucks?.rego || "")}</b> ${esc(d.trucks?.name || "")}</td>
  <td style="padding:6px 10px;border-bottom:1px solid #ddd"><b>${esc(d.item)}</b><br>${esc(d.note || "")}</td>
  <td style="padding:6px 10px;border-bottom:1px solid #ddd">${esc(d.reported_by || "")}<br>${esc(new Date(d.reported_at).toLocaleString("en-AU", { timeZone: "Australia/Brisbane" }))}</td></tr>`).join("");
const trucks = [...new Set(defects.map(d => d.trucks?.rego || d.trucks?.name || "vehicle"))];
const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
  <h2 style="margin:0 0 8px">${defects.length} new defect${defects.length > 1 ? "s" : ""} reported</h2>
  <p style="margin:0 0 12px">From drivers' Monday checks.</p>
  <table style="border-collapse:collapse">${rows}</table>
  ${SITE ? `<p style="margin-top:16px"><a href="${esc(SITE)}#checks">Open BMT Fleet Maintenance</a> to mark them fixed.</p>` : ""}</div>`;

const res = await fetch("https://api.resend.com/emails", { method: "POST",
  headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
  body: JSON.stringify({ from: FROM, to: TO.split(/[,;]\s*/), subject: `Defect reported: ${trucks.join(", ")}`, html }) });
if (!res.ok) throw new Error(`Email failed ${res.status}: ${await res.text()}`);

await rest(`defects?id=in.(${defects.map(d => d.id).join(",")})`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ notified_at: new Date().toISOString() }) });
console.log(`Emailed ${defects.length} defect(s) to ${TO}.`);
