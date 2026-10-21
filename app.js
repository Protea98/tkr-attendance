/* TKR Attendance — the TKR timesheet (14th to 13th) as a shared app, through Firebase.
   Admins import the timesheet Excel and add users. Capturers mark attendance. Viewers see the reports.
   Changes made with no signal are kept on the device and sent when the signal comes back. */
import {
  initializeApp, deleteApp, getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail,
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, setDoc, onSnapshot, query, where, arrayUnion, arrayRemove,
} from "./lib/firebase.js";

const firebaseConfig = {
  apiKey: "AIzaSyALzOBLObrONGVD1bS0Tz02aNKhQ40TRoI",
  authDomain: "tkr-operations-app.firebaseapp.com",
  projectId: "tkr-operations-app",
  storageBucket: "tkr-operations-app.firebasestorage.app",
  messagingSenderId: "158080247079",
  appId: "1:158080247079:web:7cb7786d2b7f9ee172b502",
};
// Must match the Firestore rules (firestore-rules.txt).
const ADMINS = ["muneer@tkroperations.com", "amogelang@tkroperations.com"];

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
let db;
try { db = initializeFirestore(fbApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
catch { db = initializeFirestore(fbApp, {}); }

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 3000); }
function fail(e) { console.warn(e); toast(e?.code === "permission-denied" ? "You are not allowed to do that. Ask admin." : "That change didn't save. Try again."); }

const CODES = ["P", "OFF", "LATE", "SITE OFFICE", "HEAD OFFICE", "TRAINING", "INDUCTION", "ANNUAL LEAVE", "STUDY LEAVE", "FAMILY RESPONSIBILITY", "FAMILY EMERGENCY", "MATERNITY LEAVE", "SICK", "MEDICAL", "AWOP", "SUSPENDED", "RESIGNED"];
const CAT_LABEL = { work: "At work", training: "Training", leave: "Leave", sick: "Sick", awop: "AWOP", suspended: "Suspended", other: "Other", off: "Off", resigned: "Resigned", none: "Not captured" };
const DEPT_ORDER = ["Rompad", "Drilling", "Support Fleet", "Shared Services", "Interns"];
const SHEETNAME = { "rompad": "Rompad", "support fleet": "Support Fleet", "shares services": "Shared Services", "shared services": "Shared Services", "drilling": "Drilling", "intern": "Interns", "interns": "Interns" };

function cat(v) {
  if (v == null || v === "") return "none";
  const V = String(v).toUpperCase().trim();
  if (/^\d{1,2}:\d{2}/.test(V)) return "work";
  if (["P", "P-DAY", "P-NIGHT", "LATE", "PRESENT"].includes(V) || V.startsWith("SITE OFFICE") || V.startsWith("HEAD OFFICE")) return "work";
  if (V.includes("TRAINING") || V.includes("INDUCTION") || V.includes("LICENCE")) return "training";
  if (V === "OFF") return "off";
  if (V.includes("SICK") || V === "MEDICAL") return "sick";
  if (V === "AWOP") return "awop";
  if (V.includes("LEAVE") || V.includes("RESPONSIB") || V.includes("EMERGENCY")) return "leave";
  if (V === "SUSPENDED") return "suspended";
  if (V === "RESIGNED") return "resigned";
  return "other";
}
const SCHED = ["work", "training", "leave", "sick", "awop", "suspended", "other"];
function tally(vals) {
  const t = { work: 0, training: 0, leave: 0, sick: 0, awop: 0, suspended: 0, other: 0, off: 0, resigned: 0, none: 0 };
  vals.forEach(v => t[cat(v)]++);
  t.sched = SCHED.reduce((a, k) => a + t[k], 0); t.att = t.work + t.training; t.pct = t.sched ? t.att / t.sched * 100 : null; return t;
}
const fmtPct = p => p == null ? "–" : (Math.round(p * 10) / 10).toFixed(1) + "%";
const pad = n => String(n).padStart(2, "0");
const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parseISO = s => { const [a, b, c] = s.split("-").map(Number); return new Date(a, b - 1, c); };
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const longDate = s => { const d = parseISO(s); return DOW[d.getDay()] + " " + d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear(); };
const SHORT = { "ANNUAL LEAVE": "AL", "STUDY LEAVE": "SL", "MATERNITY LEAVE": "ML", "FAMILY RESPONSIBILITY": "FR", "FAMILY REPONSIBILITY": "FR", "FAMILY EMERGENCY": "FE", "SITE OFFICE": "SO", "SITE OFFICE MEETING": "SO", "HEAD OFFICE": "HO", "TRAINING": "TR", "SOOSAN TRAINING": "TR", "INDUCTION": "IND", "MEDICAL": "MED", "SICK": "S", "SUSPENDED": "SUS", "RESIGNED": "RES", "PIT LICENCE": "PL", "LATE": "L" };
const shortVal = v => { if (!v) return ""; const V = String(v).toUpperCase(); return SHORT[V] || (/^\d{1,2}:\d{2}/.test(V) ? V.slice(0, 5) : V.length > 4 ? V.slice(0, 4) : V); };

/* ---------- state ---------- */
let user = null, email = "", roles = { capturers: [], viewers: [] }, rolesLoaded = false;
const S = { cycles: {}, cycleId: null, marks: {}, view: lsGet("tkr-view") || "report", date: null, dept: lsGet("tkr-dept") || "Rompad", sheetDept: lsGet("tkr-dept") || "Rompad", q: "", sort: "pct", ready: false };
const isAdmin = () => ADMINS.includes(email);
const canWrite = () => isAdmin() || roles.capturers.includes(email);
const canView = () => canWrite() || roles.viewers.includes(email);
let unsub = [], unsubMarks = null, started = false;

const cycle = () => S.cycles[S.cycleId];
function dates(c) { const out = []; const d = parseISO(c.start); const e = parseISO(c.end); while (d <= e) { out.push(iso(d)); d.setDate(d.getDate() + 1); } return out; }
const val = (date, pid) => (S.marks[date] || {})[pid] ?? null;
function depts(c) { const s = new Set(c.people.map(p => p.sheet)); return DEPT_ORDER.filter(d => s.has(d)).concat([...s].filter(d => !DEPT_ORDER.includes(d))); }
function defaultDate(c) { const ds = dates(c); const t = iso(new Date()); if (ds.includes(t)) return t; let last = ds[0]; ds.forEach(d => { if (Object.values(S.marks[d] || {}).some(v => v && cat(v) !== "off" && cat(v) !== "resigned")) last = d; }); return last; }
const active = (p, date) => cat(val(date, p.id)) !== "resigned";
const markId = (cid, date) => cid + "_" + date;

/* ---------- auth ---------- */
onAuthStateChanged(auth, u => {
  unsub.forEach(f => f()); unsub = []; if (unsubMarks) { unsubMarks(); unsubMarks = null; }
  user = u && !u.isAnonymous ? u : null; email = (user?.email || "").toLowerCase();
  S.cycles = {}; S.cycleId = null; S.marks = {}; S.ready = false; rolesLoaded = false; started = false;
  if (!user) { if (u?.isAnonymous) signOut(auth).catch(() => {}); showSignin(); return; }
  $("#signin").hidden = true; $("#main").hidden = false;
  unsub.push(onSnapshot(doc(db, "config", "attendance"), s => {
    const d = s.exists() ? s.data() : {};
    roles = { capturers: (d.capturers || []).map(x => String(x).toLowerCase()), viewers: (d.viewers || []).map(x => String(x).toLowerCase()) };
    rolesLoaded = true; S.current = d.current;
    if (!started && canView()) startData();
    if (d.current && S.cycles[d.current] && S.cycleId !== d.current && S.ready) switchCycle(d.current);
    render();
  }, err => { rolesLoaded = true; console.warn(err); render(); }));
  render();
});
function showSignin() { $("#signin").hidden = false; $("#main").hidden = true; $("#cycBar").hidden = true; $("#tabs").hidden = true; }
$("#signForm").onsubmit = async e => {
  e.preventDefault(); $("#sMsg").textContent = "Signing in…"; $("#sBtn").disabled = true;
  try { await signInWithEmailAndPassword(auth, $("#sEmail").value.trim(), $("#sPass").value); $("#sPass").value = ""; $("#sMsg").textContent = ""; }
  catch (err) { $("#sMsg").textContent = err?.code === "auth/network-request-failed" ? "No signal. Sign in once with signal; after that the app works offline." : "The email or password is wrong."; }
  $("#sBtn").disabled = false;
};
$("#forgot").onclick = async () => {
  const em = $("#sEmail").value.trim(); if (!em.includes("@")) { $("#sMsg").textContent = "Type your email first, then tap Forgot password."; return; }
  try { await sendPasswordResetEmail(auth, em); $("#sMsg").textContent = "A password reset email was sent to " + em + "."; } catch { $("#sMsg").textContent = "The reset email couldn't be sent. Ask admin."; }
};
$("#outBtn").onclick = () => signOut(auth);

function startData() {
  started = true;
  unsub.push(onSnapshot(collection(db, "attCycles"), snap => {
    const cs = {}; snap.docs.forEach(d => { const v = d.data(); if (v && v.people) cs[d.id] = v; }); S.cycles = cs; S.ready = true;
    if (!S.cycleId || !cs[S.cycleId]) { const ids = Object.keys(cs).sort(); const want = S.current && cs[S.current] ? S.current : ids[ids.length - 1]; if (want) switchCycle(want); else render(); } else render();
  }, err => { S.ready = true; fail(err); render(); }));
}
function switchCycle(id) {
  S.cycleId = id; S.marks = {}; S.date = null; if (unsubMarks) unsubMarks();
  unsubMarks = onSnapshot(query(collection(db, "attMarks"), where("cycle", "==", id)), snap => {
    const m = {}; snap.docs.forEach(d => { const v = d.data(); m[v.date] = v.entries || {}; }); S.marks = m; render();
  }, fail);
  render();
}

/* ---------- writes ---------- */
function writeMarks(date, entries) {
  if (!canWrite()) { toast("You can only view the register. Ask admin."); return; }
  S.marks[date] = Object.assign({}, S.marks[date] || {}, entries); render();
  setDoc(doc(db, "attMarks", markId(S.cycleId, date)), { cycle: S.cycleId, date, entries, updatedBy: email, updatedAt: Date.now() }, { merge: true }).catch(fail);
}

/* ---------- views ---------- */
function render() {
  document.querySelectorAll("#tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.v === S.view));
  if (!user) return;
  const m = $("#main");
  if (!rolesLoaded) { m.innerHTML = '<div class="empty"><b>Loading</b>Opening the attendance register.</div>'; return; }
  if (!canView()) { $("#cycBar").hidden = false; $("#tabs").hidden = true; ["#cycleSel", "#importBtn", "#exportBtn"].forEach(s => $(s).hidden = true); m.innerHTML = `<div class="empty"><b>No access yet</b>${esc(email)} is signed in but doesn't have access to Attendance. Ask admin.</div>`; return; }
  $("#cycBar").hidden = false; $("#tabs").hidden = false; $("#usersTab").hidden = !isAdmin(); $("#cycleSel").hidden = false; $("#exportBtn").hidden = false; $("#importBtn").hidden = !isAdmin();
  renderCycleSel();
  if (S.view === "users" && isAdmin()) { viewUsers(m); return; }
  if (S.view === "users") S.view = "report";
  const c = cycle();
  if (!S.ready) { m.innerHTML = '<div class="empty"><b>Loading timesheet</b>Opening the attendance register.</div>'; return; }
  if (!c) { m.innerHTML = `<div class="empty"><b>No timesheet loaded yet</b>${isAdmin() ? "Tap <strong>Import timesheet</strong> above and choose the TKR timesheet Excel file for the current cycle." : "Ask admin to import the timesheet for this cycle."}</div>`; return; }
  if (!S.date || !dates(c).includes(S.date)) S.date = defaultDate(c);
  ({ report: viewReport, capture: viewCapture, sheet: viewSheet, people: viewPeople }[S.view] || viewReport)(m, c);
}
function renderCycleSel() {
  const ids = Object.keys(S.cycles).sort().reverse();
  $("#cycleSel").innerHTML = ids.length ? ids.map(id => `<option value="${esc(id)}"${id === S.cycleId ? " selected" : ""}>${esc(S.cycles[id].label)}</option>`).join("") : "<option>No cycle loaded</option>";
}
function dateSel(c, id) { return `<label>Date <select id="${id}">${dates(c).map(d => `<option value="${d}"${d === S.date ? " selected" : ""}>${longDate(d)}</option>`).join("")}</select></label>`; }
function bindDate(id) { $("#" + id).onchange = e => { S.date = e.target.value; render(); }; }
function groupShift(c, p, date) { const g = c.groups && c.groups[p.group]; return g && g.shifts ? g.shifts[date] || "" : ""; }

function reportText(c, d) {
  const ppl = c.people.filter(p => active(p, d)); const t = tally(ppl.map(p => val(d, p.id)));
  const lines = ["*TKR Operations – Daily Attendance*", longDate(d), "", `Attendance: ${fmtPct(t.pct)}`, `Scheduled: ${t.sched} | At work: ${t.work} | Training: ${t.training}`, `Leave: ${t.leave} | Sick: ${t.sick} | AWOP: ${t.awop} | Off: ${t.off}`, ""];
  depts(c).forEach(dep => { const tt = tally(ppl.filter(p => p.sheet === dep).map(p => val(d, p.id))); if (tt.sched) lines.push(`${dep}: ${tt.att}/${tt.sched} (${fmtPct(tt.pct)})`); });
  const absent = ppl.filter(p => ["leave", "sick", "awop", "suspended", "other"].includes(cat(val(d, p.id))));
  if (absent.length) { lines.push("", "*Absent*"); absent.forEach(p => lines.push(`• ${p.name} (${p.sheet}) – ${val(d, p.id)}`)); }
  if (t.none) lines.push("", `Not captured: ${t.none}`);
  return lines.join("\n");
}
function viewReport(m, c) {
  const d = S.date; const ppl = c.people.filter(p => active(p, d));
  const t = tally(ppl.map(p => val(d, p.id)));
  const byDept = depts(c).map(dep => ({ dep, t: tally(ppl.filter(p => p.sheet === dep).map(p => val(d, p.id))) }));
  const absent = ppl.filter(p => ["leave", "sick", "awop", "suspended", "other"].includes(cat(val(d, p.id))));
  const training = ppl.filter(p => cat(val(d, p.id)) === "training");
  const missing = ppl.filter(p => cat(val(d, p.id)) === "none");
  const trend = dates(c).map(x => ({ d: x, t: tally(c.people.filter(p => active(p, x)).map(p => val(x, p.id))) }));
  m.innerHTML = `
  <div class="bar"><h2>${longDate(d)}</h2>${dateSel(c, "rd")}<button class="btn gold" id="copy" type="button">Copy report</button><a class="btn" id="wa" target="_blank" rel="noopener">Send on WhatsApp</a></div>
  ${missing.length && t.sched ? `<div class="notice">${missing.length} employee${missing.length > 1 ? "s are" : " is"} not captured for this date. Open <strong>Capture</strong> to complete the register.</div>` : ""}
  <div class="kpis">
    <div class="kpi main"><div class="v">${fmtPct(t.pct)}</div><div class="l">Attendance</div></div>
    <div class="kpi"><div class="v">${t.sched}</div><div class="l">Scheduled</div></div>
    <div class="kpi"><div class="v" style="color:var(--work)">${t.work}</div><div class="l">At work</div></div>
    <div class="kpi"><div class="v" style="color:var(--train)">${t.training}</div><div class="l">Training</div></div>
    <div class="kpi"><div class="v" style="color:var(--leave)">${t.leave}</div><div class="l">Leave</div></div>
    <div class="kpi"><div class="v" style="color:var(--sick)">${t.sick}</div><div class="l">Sick</div></div>
    <div class="kpi"><div class="v" style="color:var(--awop)">${t.awop + t.suspended + t.other}</div><div class="l">AWOP / other</div></div>
    <div class="kpi"><div class="v" style="color:var(--off)">${t.off}</div><div class="l">Off</div></div>
    <div class="kpi"><div class="v muted">${t.none}</div><div class="l">Not captured</div></div>
  </div>
  <div class="grid2">
    <div class="panel"><h3>By department <small>at work ÷ scheduled</small></h3><div class="scroll"><table>
      <thead><tr><th>Department</th><th class="n">Sched.</th><th class="n">At work</th><th class="n">Leave</th><th class="n">Sick</th><th class="n">AWOP</th><th class="n">Off</th><th class="n">Attendance</th><th></th></tr></thead>
      <tbody>${byDept.map(({ dep, t }) => `<tr><td>${esc(dep)}</td><td class="n">${t.sched}</td><td class="n">${t.att}</td><td class="n">${t.leave}</td><td class="n">${t.sick}</td><td class="n">${t.awop + t.suspended + t.other}</td><td class="n">${t.off}</td><td class="n pct">${fmtPct(t.pct)}</td><td><div class="meter"><i style="width:${t.pct || 0}%"></i></div></td></tr>`).join("")}</tbody>
    </table></div></div>
    <div class="panel"><h3>Absent <small>${absent.length}</small></h3><div class="list">
      ${absent.length ? absent.map(p => `<div class="li"><div class="who"><b>${esc(p.name)}</b><span>${esc(p.sheet)} · ${esc(p.title)}</span></div><span class="chip c-${cat(val(d, p.id))}">${esc(val(d, p.id))}</span></div>`).join("") : '<div class="muted small">Nobody is booked absent for this date.</div>'}
      ${training.length ? `<div class="li"><div class="who"><b>On training</b><span>${training.map(p => esc(p.name)).join("; ")}</span></div></div>` : ""}
    </div></div>
  </div>
  <div class="panel trend" style="margin-top:20px"><h3>Attendance this cycle <small>${esc(c.label)}</small></h3>${trendSvg(trend, d)}</div>
  ${missing.length ? `<div class="panel" style="margin-top:20px"><h3>Not captured <small>${missing.length}</small></h3><div class="small muted">${missing.map(p => esc(p.name) + " (" + esc(p.sheet) + ")").join(" · ")}</div></div>` : ""}`;
  bindDate("rd");
  const txt = reportText(c, d);
  $("#wa").href = "https://wa.me/?text=" + encodeURIComponent(txt);
  $("#copy").onclick = () => copyText(txt);
}
function trendSvg(tr, sel) {
  const W = 900, H = 200, L = 36, B = 26, T = 10, n = tr.length, bw = (W - L - 6) / n;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily attendance percentage">`;
  [0, 50, 100].forEach(v => { const y = T + (H - T - B) * (1 - v / 100); s += `<line x1="${L}" x2="${W}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${L - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v}%</text>`; });
  tr.forEach((x, i) => {
    const dd = parseISO(x.d); const xx = L + i * bw;
    if (x.t.pct != null) { const h = (H - T - B) * x.t.pct / 100; s += `<rect x="${xx + 2}" y="${T + (H - T - B) - h}" width="${bw - 4}" height="${h}" rx="2" fill="${x.d === sel ? "var(--gold)" : "var(--off)"}" opacity="${x.d === sel ? 1 : .55}"><title>${longDate(x.d)}: ${fmtPct(x.t.pct)}</title></rect>`; }
    if (i % 2 === 0 || x.d === sel) s += `<text x="${xx + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="10" fill="${x.d === sel ? "var(--gold)" : "var(--muted)"}">${dd.getDate()}</text>`;
  });
  return s + "</svg>";
}
async function copyText(txt) {
  try { await navigator.clipboard.writeText(txt); toast("Report copied. Paste it into WhatsApp or email."); }
  catch {
    const p = document.createElement("div"); p.className = "pop";
    p.innerHTML = `<div class="card"><h4>Daily report</h4><p class="small muted">Select the text and copy it.</p><textarea class="wa" readonly></textarea><div style="margin-top:10px;text-align:right"><button class="btn" type="button">Close</button></div></div>`;
    document.body.appendChild(p); const ta = p.querySelector("textarea"); ta.value = txt; ta.select();
    p.querySelector("button").onclick = () => p.remove(); p.onclick = e => { if (e.target === p) p.remove(); };
  }
}

function viewCapture(m, c) {
  const d = S.date; const ds = depts(c); if (!ds.includes(S.dept)) S.dept = ds[0];
  const ppl = c.people.filter(p => p.sheet === S.dept && active(p, d));
  const groups = []; const gi = {};
  ppl.forEach(p => { const k = p.group || "_"; if (!(k in gi)) { gi[k] = groups.length; groups.push({ k, label: (c.groups && c.groups[k] && c.groups[k].label) || "Employees", ppl: [] }); } groups[gi[k]].ppl.push(p); });
  const t = tally(ppl.map(p => val(d, p.id))); const w = canWrite();
  m.innerHTML = `
  <div class="bar"><h2>Capture</h2>${dateSel(c, "cd")}
    <label>Department <select id="cdep">${ds.map(x => `<option${x === S.dept ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label></div>
  ${w ? "" : '<div class="notice">You can view the register but not change it. Ask admin for capture access.</div>'}
  <p class="small muted" style="margin:-6px 0 14px">${esc(S.dept)} · ${longDate(d)} · ${t.att} at work of ${t.sched} scheduled · ${t.none} not captured</p>
  ${groups.map((g, gix) => {
    const sh = g.ppl.length ? groupShift(c, g.ppl[0], d) : ""; const open = g.ppl.filter(p => !val(d, p.id)).length;
    return `<section class="grp"><div class="grp-h"><b>${esc(g.label)}</b>${sh ? `<span class="shift ${sh}">${sh}</span>` : ""}<span class="small muted">${g.ppl.length} people</span>${open && w ? `<button class="btn" type="button" data-bulk="${gix}">Mark ${open} open as P</button>` : ""}</div>
    ${g.ppl.map(p => {
      const v = val(d, p.id); const V = v ? String(v).toUpperCase() : ""; const other = v && V !== "P" && V !== "OFF";
      return `<div class="cap"><div class="who"><b>${esc(p.name)}</b><span>${esc(p.title)}${p.number ? " · " + esc(p.number) : ""}</span></div>
      <div class="acts">${other ? `<span class="chip c-${cat(v)}">${esc(v)}</span>` : ""}
        <button class="q${V === "P" ? " on-P" : ""}" type="button" data-pid="${esc(p.id)}" data-v="P"${w ? "" : " disabled"}>P</button>
        <button class="q${V === "OFF" ? " on-OFF" : ""}" type="button" data-pid="${esc(p.id)}" data-v="OFF"${w ? "" : " disabled"}>OFF</button>
        <button class="q" type="button" data-more="${esc(p.id)}"${w ? "" : " disabled"}>More</button>
      </div></div>`;
    }).join("")}</section>`;
  }).join("")}`;
  bindDate("cd");
  $("#cdep").onchange = e => { S.dept = e.target.value; lsSet("tkr-dept", S.dept); render(); };
  m.querySelectorAll("[data-v]").forEach(b => b.onclick = () => { const cur = val(d, b.dataset.pid); writeMarks(d, { [b.dataset.pid]: String(cur || "").toUpperCase() === b.dataset.v ? null : b.dataset.v }); });
  m.querySelectorAll("[data-more]").forEach(b => b.onclick = () => picker(d, c.people.find(p => p.id === b.dataset.more)));
  m.querySelectorAll("[data-bulk]").forEach(b => b.onclick = () => { const g = groups[+b.dataset.bulk]; const e = {}; g.ppl.forEach(p => { if (!val(d, p.id)) e[p.id] = "P"; }); writeMarks(d, e); });
}
function picker(date, p) {
  if (!canWrite()) { toast("You can only view the register. Ask admin."); return; }
  const cur = val(date, p.id); const pop = document.createElement("div"); pop.className = "pop";
  pop.innerHTML = `<div class="card" role="dialog" aria-label="Set attendance"><h4>${esc(p.name)}</h4><div class="small muted">${esc(p.title)} · ${longDate(date)}${cur ? ` · now <span class="chip c-${cat(cur)}">${esc(cur)}</span>` : ""}</div>
  <div class="opts">${CODES.map(k => `<button type="button" data-k="${esc(k)}"><span class="chip c-${cat(k)}">${esc(k)}</span></button>`).join("")}</div>
  <div class="form-row"><label class="small muted">Clock-in time <input type="time" id="tin"></label><button class="btn" type="button" id="tset">Set time</button></div>
  <div class="form-row" style="margin-top:10px"><button class="btn" type="button" id="clr">Clear</button><button class="btn" type="button" id="cls">Close</button></div></div>`;
  document.body.appendChild(pop);
  const done = v => { writeMarks(date, { [p.id]: v }); pop.remove(); };
  pop.querySelectorAll("[data-k]").forEach(b => b.onclick = () => done(b.dataset.k));
  pop.querySelector("#tset").onclick = () => { const v = pop.querySelector("#tin").value; if (v) done(v); };
  pop.querySelector("#clr").onclick = () => done(null);
  pop.querySelector("#cls").onclick = () => pop.remove();
  pop.onclick = e => { if (e.target === pop) pop.remove(); };
}

function viewSheet(m, c) {
  const ds = dates(c); const dps = depts(c); if (!dps.includes(S.sheetDept)) S.sheetDept = dps[0];
  const ppl = c.people.filter(p => p.sheet === S.sheetDept); const today = iso(new Date());
  let rows = "", lastG = null;
  ppl.forEach(p => {
    if (p.group !== lastG) { lastG = p.group; const g = c.groups && c.groups[p.group]; rows += `<tr class="gr"><td class="nm">${esc(g ? g.label : "")}</td>${ds.map(d => { const sh = g && g.shifts ? g.shifts[d] || "" : ""; return `<td style="font:600 9px var(--mono);color:${sh === "NIGHT" ? "var(--leave)" : "var(--gold)"}">${sh ? sh[0] : ""}</td>`; }).join("")}<td colspan="6"></td></tr>`; }
    const vs = ds.map(d => val(d, p.id)); const t = tally(vs);
    rows += `<tr><td class="nm" title="${esc(p.name)}">${esc(p.name)}<small>${esc(p.title)}</small></td>${ds.map((d, i) => { const v = vs[i]; return `<td class="cell c-${cat(v)}${d === today ? " today" : ""}" data-d="${d}" data-p="${esc(p.id)}" title="${esc(p.name)} · ${longDate(d)}${v ? " · " + esc(v) : ""}">${esc(shortVal(v))}</td>`; }).join("")}
      <td class="sum">${t.att}</td><td class="sum">${t.leave}</td><td class="sum">${t.sick}</td><td class="sum">${t.awop}</td><td class="sum">${t.off}</td><td class="sum pct">${fmtPct(t.pct)}</td></tr>`;
  });
  m.innerHTML = `<div class="bar"><h2>Timesheet</h2><label>Department <select id="sdep">${dps.map(x => `<option${x === S.sheetDept ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label></div>
  <div class="legend">${["work", "training", "leave", "sick", "awop", "off", "resigned", "none"].map(k => `<span class="chip c-${k}">${CAT_LABEL[k]}</span>`).join("")}<span class="small muted">AL annual · SL study · ML maternity · FR family resp. · S sick · TR training · SO site office · times are clock-in</span></div>
  <div class="panel scroll" style="padding:0"><table class="ts"><thead><tr><th class="nm">${esc(S.sheetDept)}</th>${ds.map(d => { const x = parseISO(d); const we = x.getDay() === 0 || x.getDay() === 6; return `<th class="${we ? "we" : ""}">${DOW[x.getDay()].slice(0, 2)}<br>${x.getDate()}</th>`; }).join("")}<th>Work</th><th>Leave</th><th>Sick</th><th>AWOP</th><th>Off</th><th>Att.</th></tr></thead><tbody>${rows}</tbody></table></div>
  ${canWrite() ? '<p class="small muted">Tap a cell to change it.</p>' : ""}`;
  $("#sdep").onchange = e => { S.sheetDept = e.target.value; lsSet("tkr-dept", S.sheetDept); render(); };
  if (canWrite()) m.querySelectorAll("td.cell").forEach(td => td.onclick = () => picker(td.dataset.d, c.people.find(p => p.id === td.dataset.p)));
}

function viewPeople(m, c) {
  const ds = dates(c); const today = iso(new Date()); const upto = ds.filter(d => d <= today);
  let list = c.people.map(p => { const vs = upto.map(d => val(d, p.id)); return { p, t: tally(vs), resigned: vs.some(v => cat(v) === "resigned") }; });
  const q = S.q.toLowerCase(); if (q) list = list.filter(x => (x.p.name + " " + x.p.number + " " + x.p.title + " " + x.p.sheet).toLowerCase().includes(q));
  const sorters = { pct: (a, b) => (a.t.pct ?? 101) - (b.t.pct ?? 101), name: (a, b) => a.p.name.localeCompare(b.p.name), dept: (a, b) => a.p.sheet.localeCompare(b.p.sheet) || a.p.name.localeCompare(b.p.name), awop: (a, b) => b.t.awop - a.t.awop };
  list.sort(sorters[S.sort] || sorters.pct);
  m.innerHTML = `<div class="bar"><h2>Employees</h2><input type="search" id="pq" placeholder="Search name, number, job" value="${esc(S.q)}" aria-label="Search employees">
    <label>Sort <select id="psort">${[["pct", "Lowest attendance"], ["awop", "Most AWOP"], ["name", "Name"], ["dept", "Department"]].map(([k, l]) => `<option value="${k}"${k === S.sort ? " selected" : ""}>${l}</option>`).join("")}</select></label></div>
  <p class="small muted" style="margin:-6px 0 12px">Cycle to date: ${upto.length ? longDate(upto[0]) + " – " + longDate(upto[upto.length - 1]) : "not started"}. Attendance = days at work or on training ÷ scheduled days (off days excluded).</p>
  <div class="panel scroll" style="padding:0 0 4px"><table><thead><tr><th>Employee</th><th>Number</th><th>Department</th><th>Job title</th><th class="n">At work</th><th class="n">Training</th><th class="n">Leave</th><th class="n">Sick</th><th class="n">AWOP</th><th class="n">Off</th><th class="n">Attendance</th><th></th></tr></thead>
  <tbody>${list.map(({ p, t, resigned }) => `<tr><td>${esc(p.name)}${resigned ? ' <span class="chip c-resigned">Resigned</span>' : ""}</td><td class="muted" style="font-family:var(--mono);font-size:12px">${esc(p.number)}</td><td>${esc(p.sheet)}</td><td>${esc(p.title)}</td><td class="n">${t.work}</td><td class="n">${t.training}</td><td class="n">${t.leave}</td><td class="n">${t.sick}</td><td class="n"${t.awop ? ' style="color:var(--awop);font-weight:600"' : ""}>${t.awop}</td><td class="n">${t.off}</td><td class="n pct">${fmtPct(t.pct)}</td><td><div class="meter"><i style="width:${t.pct || 0}%"></i></div></td></tr>`).join("")}</tbody></table></div>`;
  const pq = $("#pq"); pq.oninput = () => { S.q = pq.value; const pos = pq.selectionStart; render(); const n = $("#pq"); n.focus(); n.setSelectionRange(pos, pos); };
  $("#psort").onchange = e => { S.sort = e.target.value; render(); };
}

/* ---------- users (admins) ---------- */
function viewUsers(m) {
  const row = (em, role) => `<div class="li"><div class="who"><b>${esc(em)}</b><span>${role === "capturers" ? "Captures attendance" : "Views reports"}</span></div><button class="btn" type="button" data-rm="${esc(em)}" data-role="${role}">Remove</button></div>`;
  m.innerHTML = `<div class="bar"><h2>Users</h2></div>
  <div class="grid2">
    <form class="panel" id="addUser"><h3>Add a user</h3>
      <p class="small muted">Capturers mark attendance and see all reports. Viewers see the reports only. Admins (${ADMINS.map(esc).join(", ")}) always have full access.</p>
      <div class="form-row">
        <label class="small muted">Email <input id="uEmail" type="email" required></label>
        <label class="small muted">Password <input id="uPass" type="text" minlength="6" placeholder="Leave empty if they already have one"></label>
        <label class="small muted">Access <select id="uRole"><option value="capturers">Capture attendance</option><option value="viewers">View reports</option></select></label>
      </div>
      <div style="margin-top:10px"><button class="btn gold" type="submit">Add user</button></div>
      <p class="small" id="uMsg" role="status"></p>
    </form>
    <div class="panel"><h3>Who has access <small>${roles.capturers.length + roles.viewers.length}</small></h3><div class="list">
      ${roles.capturers.map(e => row(e, "capturers")).join("")}${roles.viewers.map(e => row(e, "viewers")).join("")}
      ${roles.capturers.length + roles.viewers.length ? "" : '<div class="muted small">Only the admins have access so far.</div>'}
    </div></div>
  </div>`;
  $("#addUser").onsubmit = async e => {
    e.preventDefault();
    const em = $("#uEmail").value.trim().toLowerCase(), pw = $("#uPass").value, role = $("#uRole").value, other = role === "capturers" ? "viewers" : "capturers";
    if (pw && pw.length < 6) { $("#uMsg").textContent = "The password must be at least 6 characters."; return; }
    $("#uMsg").textContent = "Adding…"; let note = "";
    if (pw) {
      // A second Firebase connection makes the user's sign-in without signing the admin out.
      const tmp = initializeApp(firebaseConfig, "add-" + Date.now());
      try { await createUserWithEmailAndPassword(getAuth(tmp), em, pw); note = " Their sign-in is made."; }
      catch (err) { if (err?.code === "auth/email-already-in-use") note = " They already had a sign-in, so their old password stays."; else { $("#uMsg").textContent = "The sign-in couldn't be made. Check the email and try again."; deleteApp(tmp).catch(() => {}); return; } }
      deleteApp(tmp).catch(() => {});
    }
    try { await setDoc(doc(db, "config", "attendance"), { [role]: arrayUnion(em), [other]: arrayRemove(em) }, { merge: true }); $("#uMsg").textContent = `${em} can now sign in.${note}`; $("#uEmail").value = ""; $("#uPass").value = ""; }
    catch (err) { fail(err); $("#uMsg").textContent = ""; }
  };
  m.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => {
    if (b.dataset.confirm) { setDoc(doc(db, "config", "attendance"), { [b.dataset.role]: arrayRemove(b.dataset.rm) }, { merge: true }).then(() => toast("Access removed")).catch(fail); return; }
    b.dataset.confirm = 1; b.textContent = "Tap again to remove"; b.classList.add("gold");
  });
}

/* ---------- import (admins) ---------- */
function cellText(v) {
  if (v == null) return null;
  if (v instanceof Date) { if (v.getFullYear() < 1950) return pad(v.getHours()) + ":" + pad(v.getMinutes()); return null; }
  if (typeof v === "number" && v > 0 && v < 1) { const mins = Math.round(v * 1440); return pad(Math.floor(mins / 60)) + ":" + pad(mins % 60); }
  const s = String(v).trim(); return s && !s.startsWith("=") ? s : null;
}
function parseWorkbook(buf) {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  let start = null; const people = [], groups = {}, marks = {};
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true });
    let hdr = -1; for (let r = 0; r < Math.min(rows.length, 10); r++) { if (String((rows[r] || [])[1] || "").trim().toLowerCase() === "employee") { hdr = r; break; } }
    if (hdr < 0) continue;
    if (!start) { const d = rows[hdr][5]; if (d instanceof Date) start = new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
    if (!start) continue;
    const ds = []; for (let i = 0; i < 31; i++) { const x = new Date(start); x.setDate(x.getDate() + i); ds.push(iso(x)); }
    const dept = SHEETNAME[name.trim().toLowerCase()] || name.trim(); let gid = null;
    for (let r = hdr + 1; r < Math.min(rows.length, 300); r++) {
      const row = rows[r] || []; let nm = row[1]; if (nm == null || !String(nm).trim()) continue; nm = String(nm).trim().replace(/\s+/g, " ");
      const num = cellText(row[2]), unit = cellText(row[3]), title = cellText(row[4]);
      const days = {}; for (let i = 0; i < 31; i++) { const v = cellText(row[5 + i]); if (v) days[ds[i]] = v; }
      if (!num && !unit && !title) {
        gid = dept + ":" + (r + 1); const sh = {};
        Object.entries(days).forEach(([k, v]) => { const V = v.toUpperCase(); if (V === "DAY" || V === "NIGHT") sh[k] = V; });
        groups[gid] = { sheet: dept, label: nm === nm.toUpperCase() ? nm.toLowerCase().replace(/\b\w/g, s => s.toUpperCase()) : nm, shifts: sh }; continue;
      }
      if (nm.toUpperCase() === "VACANT") continue;
      people.push({ sheet: dept, group: gid, name: nm, number: num || "", unit: unit || "", title: title || "", _days: days });
    }
  }
  if (!start || !people.length) throw new Error('This file does not look like a TKR timesheet (no "Employee" header with dates found).');
  const seen = {};
  people.forEach(p => {
    let base = p.number && p.number.length > 5 ? p.number : "n-" + p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    base = base.replace(/[^A-Za-z0-9_-]/g, "-"); seen[base] = (seen[base] || 0) + 1; p.id = seen[base] === 1 ? base : base + "-" + seen[base];
    Object.entries(p._days).forEach(([d, v]) => { (marks[d] = marks[d] || {})[p.id] = v; }); delete p._days;
  });
  const end = new Date(start); end.setDate(end.getDate() + 30);
  const mn = d => d.toLocaleString("en-GB", { month: "long" });
  const label = `${start.getDate()} ${mn(start)} ${start.getFullYear()} – ${end.getDate()} ${mn(end)} ${end.getFullYear()}`;
  return { cycle: { id: "c" + iso(start), start: iso(start), end: iso(end), label, groups, people }, marks };
}
$("#importBtn").onclick = () => { $("#fileIn").value = ""; $("#fileIn").click(); };
$("#fileIn").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  let parsed; try { parsed = parseWorkbook(new Uint8Array(await f.arrayBuffer())); } catch (err) { toast(err.message || "Could not read that file"); return; }
  const exists = !!S.cycles[parsed.cycle.id]; const nd = Object.keys(parsed.marks).length;
  const pop = document.createElement("div"); pop.className = "pop";
  pop.innerHTML = `<div class="card"><h4>Import ${esc(parsed.cycle.label)}</h4><p class="small">${parsed.cycle.people.length} employees across ${new Set(parsed.cycle.people.map(p => p.sheet)).size} departments, ${nd} days with entries.</p>
  ${exists ? '<div class="notice small">This cycle is already in the register. Importing replaces the employee list and every captured entry for this cycle with what is in the file.</div>' : ""}
  <div class="form-row"><button class="btn" type="button" id="ic">Cancel</button><button class="btn gold" type="button" id="io">${exists ? "Replace cycle" : "Import"}</button></div></div>`;
  document.body.appendChild(pop); pop.querySelector("#ic").onclick = () => pop.remove();
  pop.querySelector("#io").onclick = async () => {
    const b = pop.querySelector("#io"); b.disabled = true; b.textContent = "Importing…";
    try {
      const c = parsed.cycle; await setDoc(doc(db, "attCycles", c.id), c);
      await Promise.all(dates(c).map(d => setDoc(doc(db, "attMarks", markId(c.id, d)), { cycle: c.id, date: d, entries: parsed.marks[d] || {}, updatedBy: email, updatedAt: Date.now() })));
      await setDoc(doc(db, "config", "attendance"), { current: c.id }, { merge: true });
      pop.remove(); toast("Timesheet imported"); switchCycle(c.id);
    } catch (err) { b.disabled = false; b.textContent = "Try again"; fail(err); }
  };
};

/* ---------- export ---------- */
$("#exportBtn").onclick = () => {
  const c = cycle(); if (!c) { toast("No timesheet loaded"); return; }
  const ds = dates(c); const wb = XLSX.utils.book_new();
  for (const dep of depts(c)) {
    const aoa = [[dep], ["Employee", "Number", "Description", "Job Title", ...ds.map(d => parseISO(d)), "At work", "Training", "Leave", "Sick", "AWOP", "Off days", "Attendance %"], ["", "", "", "", ...ds.map(d => DOW[parseISO(d).getDay()])]];
    let lastG = null;
    c.people.filter(p => p.sheet === dep).forEach(p => {
      if (p.group !== lastG) { lastG = p.group; const g = c.groups && c.groups[p.group]; aoa.push([g ? g.label.toUpperCase() : "", "", "", "", ...ds.map(d => g && g.shifts ? g.shifts[d] || "" : "")]); }
      const vs = ds.map(d => val(d, p.id)); const t = tally(vs);
      aoa.push([p.name, p.number, p.unit || dep, p.title, ...vs.map(v => v || ""), t.work, t.training, t.leave, t.sick, t.awop, t.off, t.pct == null ? "" : Math.round(t.pct * 10) / 10]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    for (let i = 0; i < ds.length; i++) { const ref = XLSX.utils.encode_cell({ r: 1, c: 4 + i }); if (ws[ref]) ws[ref].z = "dd-mmm"; }
    ws["!cols"] = [{ wch: 30 }, { wch: 11 }, { wch: 16 }, { wch: 24 }, ...ds.map(() => ({ wch: 8 })), ...Array(7).fill({ wch: 10 })];
    XLSX.utils.book_append_sheet(wb, ws, dep.slice(0, 31));
  }
  XLSX.writeFile(wb, `TKR TIMESHEET ${c.label.replace("–", "-")}.xlsx`);
};

/* ---------- shell ---------- */
document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => { S.view = b.dataset.v; lsSet("tkr-view", S.view); render(); window.scrollTo(0, 0); });
$("#cycleSel").onchange = e => { if (S.cycles[e.target.value]) switchCycle(e.target.value); };
let installEvt = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; $("#installBtn").hidden = false; });
$("#installBtn").onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $("#installBtn").hidden = true; };
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(r => r.update()).catch(() => {});
