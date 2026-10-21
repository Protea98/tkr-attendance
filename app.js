/* TKR Attendance — installable app for TKR Operations (Tharisa Mine).
   Data is shared through Firebase (project tkr-operations-app). Marks made with no signal stay on the device and are sent when the signal is back. */
import {initializeApp,deleteApp,getAuth,signInWithEmailAndPassword,signOut,onAuthStateChanged,createUserWithEmailAndPassword,sendPasswordResetEmail,
  initializeFirestore,persistentLocalCache,persistentMultipleTabManager,collection,doc,setDoc,getDoc,getDocs,onSnapshot,arrayUnion,arrayRemove} from "./lib/firebase.js";
const firebaseConfig={apiKey:"AIzaSyALzOBLObrONGVD1bS0Tz02aNKhQ40TRoI",authDomain:"tkr-operations-app.firebaseapp.com",projectId:"tkr-operations-app",
  storageBucket:"tkr-operations-app.firebasestorage.app",messagingSenderId:"158080247079",appId:"1:158080247079:web:7cb7786d2b7f9ee172b502"};
// Must match the Firestore rules (firestore-rules.txt).
const ADMINS=["muneer@tkroperations.com","amogelang@tkroperations.com","amogelangmabilu56@gmail.com"];
const fbApp=initializeApp(firebaseConfig);const auth=getAuth(fbApp);
let fs;try{fs=initializeFirestore(fbApp,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})})}catch(e){fs=initializeFirestore(fbApp,{})}
let email="",roles={capturers:[],viewers:[]};
const isAdmin=()=>ADMINS.includes(email);
const canWrite=()=>isAdmin()||roles.capturers.includes(email);
const canView=()=>canWrite()||roles.viewers.includes(email);
// Store paths used by the register, kept apart from the other TKR apps in the same Firebase project.
const PATHS=[["config/employees","config/attEmployees"],["config/settings","config/attSettings"],["cycles","attRota"],["months","attMonths"]];
const P=path=>{for(const [a,b] of PATHS)if(path===a||path.startsWith(a+"/"))return b+path.slice(a.length);return path};
const wDoc=d=>({id:d.id,exists:d.exists(),data:()=>d.data()});
const wQ=q=>({docs:q.docs.map(d=>({id:d.id,exists:true,data:()=>d.data()})),size:q.size,empty:q.empty});
const fdb={doc(path){const r=doc(fs,P(path));return{get:()=>getDoc(r).then(wDoc),set:d=>setDoc(r,d),update:d=>setDoc(r,d,{merge:true}),onSnapshot:(n,e)=>onSnapshot(r,s=>n(wDoc(s)),e)}},
  collection(path){const r=collection(fs,P(path));return{get:()=>getDocs(r).then(wQ),onSnapshot:(n,e)=>onSnapshot(r,s=>n(wQ(s)),e)}}};
let startApp=()=>{},rerender=()=>{};
(function(){
const SHEETS=["Rompad","Support Fleet","Drilling","Shared Services","Interns"];
const SHEET_ID={"Rompad":"rompad","Support Fleet":"support-fleet","Drilling":"drilling","Shared Services":"shared-services","Interns":"interns"};
// Attendance rules set by Muneer
const KIND={P:"present",MEDICAL:"present","SITE OFFICE":"present","HEAD OFFICE":"present",TRAINING:"present","SOOSAN TRAINING":"present","PIT LICENCE":"present",LATE:"present",INDUCTION:"present",
  AWOP:"absent",
  "ANNUAL LEAVE":"leave",SICK:"leave","MATERNITY LEAVE":"leave","STUDY LEAVE":"leave","FAMILY RESPONSIBILITY":"leave","FAMILY EMERGENCY":"leave",
  OFF:"off",RESIGNED:"out",ABSCONDED:"out",SUSPENDED:"out"};
const CODE_ORDER=["P","LATE","MEDICAL","SITE OFFICE","HEAD OFFICE","TRAINING","SOOSAN TRAINING","PIT LICENCE","INDUCTION","AWOP","SICK","ANNUAL LEAVE","FAMILY RESPONSIBILITY","FAMILY EMERGENCY","STUDY LEAVE","MATERNITY LEAVE","OFF","SUSPENDED","RESIGNED","ABSCONDED"];
const isTime=v=>/^\d{2}:\d{2}$/.test(v||"");
const kindOf=v=>!v?"blank":isTime(v)?"present":(KIND[v]||"present");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad=n=>String(n).padStart(2,"0");
const iso=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const parse=s=>{const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)};
const addDays=(s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return iso(d)};
const daysBetween=(a,b)=>Math.round((parse(b)-parse(a))/864e5);
const MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],DOW=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const nice=s=>{const d=parse(s);return DOW[d.getDay()]+" "+d.getDate()+" "+MON[d.getMonth()]};
const short=s=>{const d=parse(s);return d.getDate()+" "+MON[d.getMonth()]};
// Cycles: the ones Muneer sets himself (config/settings.cycles) win; other dates use the standard 14th–13th, trimmed so they never overlap a set cycle
let CUSTOM=[];const _cy={};
function stdCycle(s){const d=parse(s);let y=d.getFullYear(),m=d.getMonth();if(d.getDate()<14){m--;if(m<0){m=11;y--}}return [iso(new Date(y,m,14)),iso(new Date(y,m+1,13))]}
function cycleOf(s){if(_cy[s])return _cy[s];const k=CUSTOM.find(c=>c.start<=s&&s<=c.end);let start,end;
  if(k){start=k.start;end=k.end}else{[start,end]=stdCycle(s);CUSTOM.forEach(c=>{if(c.end<s&&c.end>=start)start=addDays(c.end,1);if(c.start>s&&c.start<=end)end=addDays(c.start,-1)})}
  const dates=[];for(let x=start;x<=end;x=addDays(x,1))dates.push(x);return _cy[s]={start,end,dates,custom:!!k}}
function setCustom(list){CUSTOM=(list||[]).slice().sort((a,b)=>a.start<b.start?-1:1);for(const k in _cy)delete _cy[k]}
const pct=(p,a)=>p+a?Math.round(1000*p/(p+a))/10:null;
const fmtPct=v=>v==null?"–":v.toFixed(1)+"%";

const S={flg:{kind:"all",type:"cycle",from:null,to:null,key:""},mm:{},mExists:{},rota:{},gmeta:{},exp:{type:"daily",from:null,to:null,key:""},view:"mark",date:iso(new Date()),sheet:"All",q:"",emps:null,empVer:null,cycles:{},marks:{},markExists:{},db:null,canWrite:true,sortLow:false,unsubs:[]};
try{const v=localStorage.getItem("tkr-att-view");if(v)S.view=v;const sh=localStorage.getItem("tkr-att-sheet");if(sh)S.sheet=sh}catch(e){}
const $=id=>document.getElementById(id);
const main=$("main");

function toast(t){const el=document.createElement("div");el.className="toast";el.textContent=t;document.body.appendChild(el);setTimeout(()=>el.remove(),2600)}

// ---------- data ----------
// Marks are stored per calendar month (months/YYYY-MM/sheets/<sheet>), so any cycle the user sets finds its days.
const monthOf=d=>d.slice(0,7);
function monthsIn(from,to){const out=[];let m=monthOf(from);const last=monthOf(to);while(m<=last){out.push(m);let [y,mm]=m.split("-").map(Number);mm++;if(mm>12){mm=1;y++}m=y+"-"+pad(mm)}return out}
const live={};
function applyMonth(m,snap){const o={};snap.docs.forEach(d=>{S.mExists[m+"/"+d.id]=true;o[d.id]={marks:d.data().marks||{},ot:d.data().ot||{}}});S.mm[m]=o}
function watchCycle(){const c=cycleOf(S.date);monthsIn(c.start,c.end).forEach(m=>{if(live[m])return;
  live[m]=S.db.collection("months/"+m+"/sheets").onSnapshot(snap=>{applyMonth(m,snap);render()},err)})}
async function loadRange(from,to){await Promise.all(monthsIn(from,to).filter(m=>!live[m]).map(async m=>{const snap=await S.db.collection("months/"+m+"/sheets").get();applyMonth(m,snap)}))}
function err(e){main.innerHTML='<div class="empty"><b>The register could not load</b>'+esc(e&&e.message||"Reload the page to try again.")+'</div>'}
function denied(e){return e&&(e.code==="invalid_argument"||e.code==="permission-denied")}
function writeSheet(sheet,patch,field){ // patch: {empId:{date:val}} for dates in S.date's month; field: "marks" or "ot"
  field=field||"marks";const id=SHEET_ID[sheet],m=monthOf(S.date);
  const mo=S.mm[m]=S.mm[m]||{};const sd=mo[id]=mo[id]||{marks:{},ot:{}};const store=sd[field];for(const k in patch){store[k]=Object.assign({},store[k]||{},patch[k])}
  S.db.doc("months/"+m+"/sheets/"+id).update({sheet,month:m,[field]:patch,updatedBy:email,updatedAt:Date.now()})
    .catch(e=>{if(denied(e)){S.canWrite=false;toast("You can view this register but not mark it. Ask admin for capture access.")}else toast("Not saved: "+(e&&e.message||"try again"));render()});
  render();
}
const cell=(e,d,f)=>((((S.mm[monthOf(d)]||{})[SHEET_ID[e.sheet]]||{})[f]||{})[e.id]||{})[d];
const rawMark=(e,d)=>cell(e,d,"marks")||"";
const markOf=(e,d)=>{const v=rawMark(e,d);if(!v&&e.leftDate&&d>e.leftDate)return e.leftReason||"RESIGNED";return v};
const otOf=(e,d)=>Number(cell(e,d,"ot"))||0;
const fmtH=h=>String(Math.round(h*10)/10);
function setOt(e,h){if(!S.canWrite){toast("You can view this register but not mark it.");return}writeSheet(e.sheet,{[e.id]:{[S.date]:h}},"ot")}
function setMark(e,val){if(!S.canWrite){toast("You can view this register but not mark it.");return}writeSheet(e.sheet,{[e.id]:{[S.date]:val}})}

// Shift rotas: every cycles/<id> doc holds group rotas by date; they are merged into one lookup.
function applyRotas(){S.rota={};S.gmeta={};Object.keys(S.cycles).sort().forEach(id=>{const g=(S.cycles[id]||{}).groups||{};
  for(const gid in g){S.gmeta[gid]={sheet:g[gid].sheet,section:g[gid].section,shift:g[gid].shift};S.rota[gid]=Object.assign(S.rota[gid]||{},g[gid].rota||{})}})}
function rotaFor(gid,d){return (S.rota[gid]||{})[d]||""}
function rotaGap(){const gs=Object.keys(S.rota);if(!gs.length)return 0;return cycleOf(S.date).dates.filter(d=>!gs.some(g=>S.rota[g][d])).length}
function projectRota(dates){const groups={};for(const gid in S.rota){const r=S.rota[gid];const known=Object.keys(r).filter(d=>r[d]).sort();if(known.length<4)continue;
  const base=known[0];const seq=rangeDates(base,known[known.length-1]).map(d=>r[d]||"");let per=0;
  for(let p=2;p<=seq.length/2;p++){let ok=true;for(let i=0;i+p<seq.length;i++)if(seq[i]&&seq[i+p]&&seq[i]!==seq[i+p]){ok=false;break}if(ok){per=p;break}}
  if(!per)continue;const rota={};dates.forEach(d=>{if(r[d])return;const off=((daysBetween(base,d)%per)+per)%per;let v="";for(let i=off;i<seq.length&&!v;i+=per)v=seq[i];if(v)rota[d]=v});
  if(Object.keys(rota).length)groups[gid]=Object.assign({},S.gmeta[gid],{rota})}return groups}
async function startCycle(){const c=cycleOf(S.date);const groups=projectRota(c.dates);if(!Object.keys(groups).length){toast("There is no shift pattern to carry forward");return}
  const id="r-"+c.start;const ref=S.db.doc("cycles/"+id);
  try{if(S.cycles[id])await ref.update({groups});else await ref.set({start:c.start,end:c.end,groups});toast("Shift rotas set for "+short(c.start)+" – "+short(c.end))}catch(e){toast("Not saved: "+(e.message||"try again"))}}

// Cycle dates panel
function openCyclePanel(){const c=cycleOf(S.date);
  const list=CUSTOM.length?'<ul>'+CUSTOM.map(k=>'<li>'+nice(k.start)+' '+yr(k.start)+' to '+nice(k.end)+' '+yr(k.end)+'</li>').join("")+'</ul>':'<p class="note" style="margin:0">None yet. All cycles run from the 14th to the 13th.</p>';
  $("sheetHost").innerHTML='<div class="scrim" id="scrim"><div class="panel" role="dialog" aria-modal="true" aria-labelledby="ct"><h2 id="ct">Cycle dates</h2><div class="sub">Set the start and end of the cycle that includes '+nice(S.date)+' '+yr(S.date)+'.</div>'+
   '<div class="clock"><label class="lbl" for="cy-from" style="margin:0">Start</label><input type="date" id="cy-from" value="'+c.start+'"><label class="lbl" for="cy-to" style="margin:0">End</label><input type="date" id="cy-to" value="'+c.end+'"></div>'+
   '<p class="note">Dates outside the cycles you set follow the standard 14th to 13th.</p>'+
   '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px"><button class="btn gold" id="cySave">Save cycle</button>'+(c.custom?'<button class="btn" id="cyReset">Use 14th to 13th</button>':"")+'<button class="btn" id="closeP">Cancel</button></div>'+
   '<div class="lbl">Cycles you have set</div>'+list+'</div></div>';
  const close=()=>{$("sheetHost").innerHTML=""};$("closeP").onclick=close;$("scrim").onclick=ev=>{if(ev.target.id==="scrim")close()};
  const others=CUSTOM.filter(k=>!(c.custom&&k.start===c.start&&k.end===c.end));
  const save=list=>{if(!S.canWrite){toast("You can view this register but not change it.");return}
    S.db.doc("config/settings").set({cycles:list}).then(()=>{setCustom(list);watchCycle();render();toast("Cycle saved")},e=>toast("Not saved: "+(e.message||"try again")));close()};
  $("cySave").onclick=()=>{const a=$("cy-from").value,b=$("cy-to").value;if(!a||!b){toast("Choose a start and an end date");return}
    if(b<a){toast("The end date must be after the start date");return}if(daysBetween(a,b)>92){toast("A cycle can be at most 93 days");return}
    const clash=others.find(k=>k.start<=b&&a<=k.end);if(clash){toast("These dates overlap the cycle "+short(clash.start)+" – "+short(clash.end)+". Change that cycle first.");return}
    save(others.concat([{start:a,end:b}]))};
  if(c.custom)$("cyReset").onclick=()=>save(others);
}

// ---------- helpers ----------
function activeEmps(){return (S.emps||[]).filter(e=>e.active!==false)}
function inPeriod(from){return (S.emps||[]).filter(e=>e.active!==false||(e.leftDate&&e.leftDate>=from))}
function filtered(from){const q=S.q.trim().toLowerCase();return (from?inPeriod(from):activeEmps()).filter(e=>(S.sheet==="All"||e.sheet===S.sheet)&&(!q||(e.name+" "+e.number+" "+e.title).toLowerCase().includes(q)))}
function groupLabel(e){const parts=[];if(e.section&&e.section!==e.sheet)parts.push(e.section);if(e.shift)parts.push(e.shift);return parts.join(" · ")||e.sheet}
function bySheetGroup(list){const out=[];let cur=null,g=null;
  SHEETS.forEach(sh=>{const es=list.filter(e=>e.sheet===sh).sort((a,b)=>a.order-b.order);if(!es.length)return;cur={sheet:sh,groups:[]};out.push(cur);g=null;
    es.forEach(e=>{if(!g||g.id!==e.group){g={id:e.group,label:groupLabel(e),emps:[]};cur.groups.push(g)}g.emps.push(e)})});return out}
function pill(v){const k=kindOf(v);return '<span class="pill s-'+k+(isTime(v)?" time":"")+'">'+(v?esc(v):"Mark")+'</span>'}
function tally(es,dates){const t={present:0,absent:0,leave:0,off:0,out:0,blank:0,ot:0,codes:{}};
  es.forEach(e=>dates.forEach(d=>{const v=markOf(e,d);const k=kindOf(v);t[k]++;t.ot+=otOf(e,d);const code=isTime(v)?"CLOCKED IN":v;if(v)t.codes[code]=(t.codes[code]||0)+1}));return t}
function chipsBar(extra){return '<div class="bar" role="group" aria-label="Sheet">'+["All"].concat(SHEETS).map(s=>'<button class="chip" data-sheet="'+esc(s)+'" aria-pressed="'+(S.sheet===s)+'">'+esc(s)+'</button>').join("")+(extra||"")+'</div>'}

// ---------- views ----------
function render(){
  const c=cycleOf(S.date);$("date").value=S.date;$("cycleLbl").innerHTML="Cycle "+short(c.start)+" – "+short(c.end)+" "+parse(c.end).getFullYear()+" · <b>Change</b>";
  document.querySelectorAll("#tabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.v===S.view));
  if(!S.db)return;
  if(S.emps===null){main.innerHTML='<div class="empty"><b>Opening the register</b>Loading employees and this cycle\'s marks.</div>';return}
  if(S.view==="users"&&!isAdmin())S.view="mark";
  if(!activeEmps().length&&S.view!=="people"&&S.view!=="users"){main.innerHTML='<div class="empty"><b>No employees yet</b>Add the first employee under Employees.</div>';return}
  ({mark:viewMark,daily:viewDaily,cycle:viewCycle,export:viewExport,flags:viewFlags,people:viewPeople,users:viewUsers}[S.view]||viewMark)();
}

function cycleBanner(){const gap=rotaGap();if(!gap)return"";const c=cycleOf(S.date);
  return '<div class="list" style="margin-bottom:14px"><h3>Shift rotas</h3><p class="note" style="margin:0 0 8px">'+gap+' day'+(gap===1?"":"s")+' in '+short(c.start)+' – '+short(c.end)+' have no shift rota yet. Carry the shift pattern forward to fill them.</p><button class="btn gold" id="startCycle">Carry shift pattern forward</button></div>'}

function viewMark(){
  const list=filtered();const groups=bySheetGroup(list);const t=tally(list,[S.date]);const cd=rangeDates(cycleOf(S.date).start,S.date);
  let h=cycleBanner()+chipsBar('<input class="search" id="q" type="search" placeholder="Search name, number or job" value="'+esc(S.q)+'">');
  h+='<div class="summary">'+stat("Marked",(list.length-t.blank)+" / "+list.length)+stat("Present",t.present)+stat("AWOP",t.absent)+stat("Leave",t.leave)+stat("Off",t.off)+stat("Overtime",fmtH(t.ot)+" h")+stat("Attendance",fmtPct(pct(t.present,t.absent+t.leave)),"pct")+'</div>';
  if(!list.length)h+='<div class="empty"><b>No match</b>Nobody on this sheet matches the search.</div>';
  groups.forEach(s=>{h+='<h2 class="sheet-h">'+esc(s.sheet)+' <small>'+nice(S.date)+'</small></h2>';
    s.groups.forEach(g=>{const r=rotaFor(g.id,S.date);
      h+='<section class="group"><div class="ghead"><span class="gname">'+esc(g.label)+'</span>'+(r?'<span class="rota '+esc(r)+'">'+esc(r)+'</span>':"")+
      '<button class="btn sm" data-fill="'+esc(g.id)+'" data-val="P">Unmarked → P</button><button class="btn sm" data-fill="'+esc(g.id)+'" data-val="OFF">Unmarked → OFF</button></div>';
      g.emps.forEach(e=>{h+='<button class="row" data-emp="'+esc(e.id)+'"><span class="who"><span class="n">'+esc(e.name)+'</span><br><span class="t">'+esc([e.number,e.title].filter(Boolean).join(" · "))+'</span></span>'+flagBadges(e,cd)+(otOf(e,S.date)?'<span class="otb">+'+fmtH(otOf(e,S.date))+'h OT</span>':'')+pill(markOf(e,S.date))+'</button>'});
      h+='</section>'})});
  main.innerHTML=h;
}
function stat(k,v,cls){return '<div class="stat '+(cls||"")+'"><div class="k">'+k+'</div><div class="v">'+v+'</div></div>'}

function dailyData(){const es=inPeriod(S.date);const rows=SHEETS.map(sh=>{const list=es.filter(e=>e.sheet===sh);return {sheet:sh,n:list.length,t:tally(list,[S.date])}}).filter(r=>r.n);
  const all=tally(es,[S.date]);const pick=k=>es.filter(e=>kindOf(markOf(e,S.date))===k);return {rows,all,n:es.length,awop:pick("absent"),leave:pick("leave"),blank:pick("blank"),ot:es.filter(e=>otOf(e,S.date)>0)}}
function viewDaily(){const D=dailyData();
  let h=cycleBanner()+'<div class="bar"><button class="btn gold" id="copyDaily">Copy report for WhatsApp</button><button class="btn" id="xlsDaily">Download Excel</button></div>';
  h+='<div class="summary">'+stat("Employees",D.n)+stat("Present",D.all.present)+stat("AWOP",D.all.absent)+stat("Leave",D.all.leave)+stat("Off",D.all.off)+stat("Not marked",D.all.blank)+stat("Overtime",fmtH(D.all.ot)+" h")+stat("Attendance",fmtPct(pct(D.all.present,D.all.absent+D.all.leave)),"pct")+'</div>';
  h+='<h2 class="sheet-h">Daily report <small>'+nice(S.date)+'</small></h2><div class="tbl-wrap"><table><thead><tr><th>Sheet</th><th>Employees</th><th>Present</th><th>AWOP</th><th>Leave</th><th>Off</th><th>Resigned, absconded, suspended</th><th>Not marked</th><th>Overtime hrs</th><th>Attendance</th></tr></thead><tbody>';
  D.rows.forEach(r=>{h+=trow(r.sheet,r.n,r.t)});h+=trow("Total",D.n,D.all,"tot")+'</tbody></table></div>';
  const li=(arr,f)=>arr.length?'<ul>'+arr.map(e=>'<li>'+esc(e.name)+' <span class="note">'+esc(e.sheet)+(f?" · "+esc(f(e)):"")+'</span></li>').join("")+'</ul>':'<p class="none">None</p>';
  h+='<div class="lists"><div class="list"><h3>AWOP ('+D.awop.length+')</h3>'+li(D.awop)+'</div><div class="list"><h3>On leave ('+D.leave.length+')</h3>'+li(D.leave,e=>markOf(e,S.date))+'</div><div class="list"><h3>Not marked ('+D.blank.length+')</h3>'+li(D.blank)+'</div><div class="list"><h3>Overtime ('+fmtH(D.all.ot)+' h)</h3>'+li(D.ot,e=>fmtH(otOf(e,S.date))+' h')+'</div></div>';
  main.innerHTML=h;
}
function trow(name,n,t,cls){const p=pct(t.present,t.absent+t.leave);return '<tr class="'+(cls||"")+'"><td>'+esc(name)+'</td><td>'+n+'</td><td>'+t.present+'</td><td>'+t.absent+'</td><td>'+t.leave+'</td><td>'+t.off+'</td><td>'+t.out+'</td><td>'+t.blank+'</td><td>'+fmtH(t.ot)+'</td><td class="pc">'+fmtPct(p)+'</td></tr>'}
function dailyText(){const D=dailyData();let s="*TKR Operations – Daily Attendance*\n"+nice(S.date)+" "+parse(S.date).getFullYear()+"\n\n";
  D.rows.forEach(r=>{s+="*"+r.sheet+"*: Present "+r.t.present+", AWOP "+r.t.absent+", Leave "+r.t.leave+", Off "+r.t.off+(r.t.blank?", Not marked "+r.t.blank:"")+" – "+fmtPct(pct(r.t.present,r.t.absent+r.t.leave))+"\n"});
  s+="\n*Total*: "+D.all.present+" present, "+D.all.absent+" AWOP, "+D.all.leave+" on leave, "+D.all.off+" off – attendance "+fmtPct(pct(D.all.present,D.all.absent+D.all.leave))+"\n";
  if(D.awop.length)s+="\n*AWOP*\n"+D.awop.map(e=>"- "+e.name+" ("+e.sheet+")").join("\n")+"\n";
  if(D.ot.length)s+="\n*Overtime* ("+fmtH(D.all.ot)+" h)\n"+D.ot.map(e=>"- "+e.name+" ("+e.sheet+"): "+fmtH(otOf(e,S.date))+" h").join("\n")+"\n";
  if(D.leave.length)s+="\n*On leave*\n"+D.leave.map(e=>"- "+e.name+" ("+e.sheet+"): "+markOf(e,S.date)).join("\n")+"\n";
  return s}

const LEAVE_COLS=["ANNUAL LEAVE","SICK","FAMILY RESPONSIBILITY","FAMILY EMERGENCY","STUDY LEAVE","MATERNITY LEAVE"];
function cycleRows(){const c=cycleOf(S.date);const upto=c.dates.filter(d=>d<=S.date);
  return filtered(c.start).sort((a,b)=>SHEETS.indexOf(a.sheet)-SHEETS.indexOf(b.sheet)||a.order-b.order).map(e=>{const t=tally([e],upto);return {e,t,p:pct(t.present,t.absent+t.leave)}})}
function viewCycle(){const c=cycleOf(S.date);const upto=c.dates.filter(d=>d<=S.date);let rows=cycleRows();
  if(S.sortLow)rows=rows.slice().sort((a,b)=>(a.p??101)-(b.p??101));
  const all=tally(rows.map(r=>r.e),upto);
  let h=cycleBanner()+chipsBar('<input class="search" id="q" type="search" placeholder="Search name, number or job" value="'+esc(S.q)+'">');
  h+='<div class="bar"><button class="btn" id="sortLow" aria-pressed="'+S.sortLow+'">'+(S.sortLow?"Show in timesheet order":"Lowest attendance first")+'</button><button class="btn gold" id="xlsCycle">Download Excel timesheet</button></div>';
  h+='<div class="summary">'+stat("Days counted",upto.length+" of "+c.dates.length)+stat("Present days",all.present)+stat("Exception days",all.absent+all.leave)+stat("Cycle attendance",fmtPct(pct(all.present,all.absent+all.leave)),"pct")+'</div>';
  h+='<p class="note">'+short(c.start)+' to '+short(upto[upto.length-1]||c.start)+'. Attendance = present days ÷ (present days + exception days). Exceptions are AWOP, sick and all leave. Medical counts as present. Off days are not counted.</p>';
  h+='<div class="tbl-wrap"><table><thead><tr><th>Employee</th><th>Present</th><th>AWOP</th>'+LEAVE_COLS.map(k=>'<th>'+esc(k.replace(" LEAVE","").replace("FAMILY ","FAM. "))+'</th>').join("")+'<th>Off</th><th>Not marked</th><th>Overtime hrs</th><th>Attendance</th></tr></thead><tbody>';
  let last="";rows.forEach(r=>{if(!S.sortLow&&r.e.sheet!==last){last=r.e.sheet;h+='<tr class="tot"><td colspan="'+(LEAVE_COLS.length+7)+'">'+esc(last)+'</td></tr>'}
    const t=r.t;h+='<tr><td>'+esc(r.e.name)+'<br><span class="note">'+esc(r.e.sheet+" · "+groupLabel(r.e))+'</span></td><td>'+t.present+'</td><td>'+t.absent+'</td>'+LEAVE_COLS.map(k=>'<td>'+(t.codes[k]||"")+'</td>').join("")+'<td>'+t.off+'</td><td>'+t.blank+'</td><td>'+(t.ot?fmtH(t.ot):'')+'</td><td class="'+(r.p!=null&&r.p<90?"lowpc":"pc")+'">'+fmtPct(r.p)+'</td></tr>'});
  h+='</tbody></table></div>';main.innerHTML=h;
}

let editing=null;
function viewPeople(){const list=filtered().sort((a,b)=>SHEETS.indexOf(a.sheet)-SHEETS.indexOf(b.sheet)||a.order-b.order);const e=editing||{};
  const groups=[...new Map((S.emps||[]).map(x=>[x.group,x])).values()];
  let h='<form class="form" id="empForm"><label>Sheet<select id="f-sheet" required>'+SHEETS.map(s=>'<option'+(e.sheet===s?" selected":"")+'>'+esc(s)+'</option>').join("")+'</select></label>'+
   '<label>Shift group<select id="f-group">'+groups.map(g=>'<option value="'+esc(g.group)+'" data-sheet="'+esc(g.sheet)+'"'+(e.group===g.group?" selected":"")+'>'+esc(g.sheet+" · "+groupLabel(g))+'</option>').join("")+'</select></label>'+
   '<label>Name (Surname, First names)<input id="f-name" required value="'+esc(e.name||"")+'"></label><label>Employee number<input id="f-number" value="'+esc(e.number||"")+'"></label>'+
   '<label>Department<input id="f-dept" value="'+esc(e.dept||"")+'"></label><label>Job title<input id="f-title" value="'+esc(e.title||"")+'"></label>'+
   '<div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap"><button class="btn gold" type="submit">'+(editing?"Save changes":"Add employee")+'</button>'+(editing?'<button class="btn" type="button" id="cancelEdit">Cancel</button>':"")+'</div></form>';
  h+=chipsBar('<input class="search" id="q" type="search" placeholder="Search name, number or job" value="'+esc(S.q)+'">');
  h+='<div class="tbl-wrap"><table><thead><tr><th>Employee</th><th>Number</th><th>Group</th><th>Job title</th><th></th></tr></thead><tbody>'+
   list.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc(x.number)+'</td><td>'+esc(x.sheet+" · "+groupLabel(x))+'</td><td>'+esc(x.title)+'</td><td><button class="btn sm" data-edit="'+esc(x.id)+'">Edit</button> <button class="btn sm" data-remove="'+esc(x.id)+'">Remove</button></td></tr>').join("")+'</tbody></table></div>';
  h+='<p class="note">Removing takes the person off the register after their last working day. Their days up to then stay in the reports and Excel downloads.</p>';
  const c=cycleOf(S.date);const flagged=activeEmps().map(x=>{const d=c.dates.find(d=>["RESIGNED","ABSCONDED"].includes(rawMark(x,d)));return d?{x,d,code:rawMark(x,d)}:null}).filter(Boolean);
  if(flagged.length)h='<div class="list" style="margin-bottom:14px"><h3>Marked resigned or absconded this cycle ('+flagged.length+')</h3><p class="note" style="margin:0 0 8px">These people are still on the register. Remove them to take them off the marking list.</p><ul>'+
    flagged.map(f=>'<li>'+esc(f.x.name)+' <span class="note">'+esc(f.x.sheet)+' · '+esc(f.code)+' from '+short(f.d)+'</span> <button class="btn sm" data-remove="'+esc(f.x.id)+'" data-reason="'+esc(f.code)+'" data-last="'+addDays(f.d,-1)+'">Remove</button></li>').join("")+'</ul></div>'+h;
  const gone=(S.emps||[]).filter(x=>x.active===false);
  if(gone.length)h+='<h2 class="sheet-h">Removed employees <small>'+gone.length+'</small></h2><div class="tbl-wrap"><table><thead><tr><th>Employee</th><th>Sheet</th><th>Reason</th><th>Last working day</th><th></th></tr></thead><tbody>'+
    gone.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc(x.sheet)+'</td><td>'+esc(x.leftReason||"")+'</td><td>'+(x.leftDate?nice(x.leftDate)+" "+yr(x.leftDate):"")+'</td><td><button class="btn sm" data-restore="'+esc(x.id)+'">Put back</button></td></tr>').join("")+'</tbody></table></div>';
  main.innerHTML=h;
}
async function saveEmps(list){if(!S.canWrite){toast("You can view this register but not change it.");return}
  try{await S.db.doc("config/employees").set({list});S.emps=list;render()}catch(e){if(denied(e)){S.canWrite=false;toast("You can view this register but not change it.")}else toast("Not saved: "+(e.message||"try again"))}}

// ---------- mark panel ----------
function openPanel(e){const v=markOf(e,S.date);const now=new Date();const tm=isTime(v)?v:pad(now.getHours())+":"+pad(now.getMinutes());
  $("sheetHost").innerHTML='<div class="scrim" id="scrim"><div class="panel" role="dialog" aria-modal="true" aria-labelledby="pt"><h2 id="pt">'+esc(e.name)+'</h2><div class="sub">'+esc([e.number,e.title,groupLabel(e)].filter(Boolean).join(" · "))+' — '+nice(S.date)+'</div>'+
   '<div class="lbl">Clock-in time</div><div class="clock"><input type="time" id="tm" value="'+tm+'"><button class="btn gold" id="saveTime">Clock in</button></div>'+
   '<div class="lbl">Overtime hours</div><div class="clock"><input type="number" id="ot" min="0" max="24" step="0.5" inputmode="decimal" placeholder="0" value="'+(otOf(e,S.date)||"")+'"><button class="btn gold" id="saveOt">Save overtime</button></div>'+
   '<div class="lbl">Or mark as</div><div class="codes">'+CODE_ORDER.map(c=>'<button class="k-'+KIND[c]+(v===c?" cur":"")+'" data-code="'+esc(c)+'">'+esc(c)+'</button>').join("")+'</div>'+
   '<div style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap"><button class="btn" id="clr"'+(v?"":" disabled")+'>Clear mark</button><button class="btn" id="closeP">Close</button></div></div></div>';
  const close=()=>{$("sheetHost").innerHTML=""};
  $("scrim").onclick=ev=>{if(ev.target.id==="scrim")close()};$("closeP").onclick=close;
  $("saveTime").onclick=()=>{const t=$("tm").value;if(!isTime(t)){toast("Enter a time like 06:15");return}setMark(e,t);close()};
  $("clr").onclick=()=>{setMark(e,"");close()};
  $("saveOt").onclick=()=>{const raw=$("ot").value.trim();const h=raw===""?0:parseFloat(raw);if(isNaN(h)||h<0||h>24){toast("Enter overtime hours between 0 and 24");return}setOt(e,h?h:"");toast(h?fmtH(h)+" h overtime saved for "+e.name:"Overtime cleared for "+e.name);close()};
  $("sheetHost").querySelectorAll("[data-code]").forEach(b=>b.onclick=()=>{setMark(e,b.dataset.code);close()});
  $("tm").focus();
}
function openRemove(x,reason,last){let why=reason||"RESIGNED";
  $("sheetHost").innerHTML='<div class="scrim" id="scrim"><div class="panel" role="dialog" aria-modal="true" aria-labelledby="rt"><h2 id="rt">Remove '+esc(x.name)+'</h2><div class="sub">'+esc([x.number,x.title,x.sheet].filter(Boolean).join(" · "))+'</div>'+
   '<div class="lbl">Reason</div><div class="codes"><button data-why="RESIGNED">Resigned</button><button data-why="ABSCONDED">Absconded</button></div>'+
   '<div class="lbl">Last working day</div><div class="clock"><input type="date" id="lastDay" value="'+(last||S.date)+'"></div>'+
   '<p class="note">From the day after, the person is off the register and their days show as '+'<span id="whyTxt"></span>.</p>'+
   '<div style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap"><button class="btn gold" id="doRemove">Remove from register</button><button class="btn" id="closeP">Cancel</button></div></div></div>';
  const sync=()=>{$("sheetHost").querySelectorAll("[data-why]").forEach(b=>b.classList.toggle("cur",b.dataset.why===why));$("whyTxt").textContent=why};sync();
  $("sheetHost").querySelectorAll("[data-why]").forEach(b=>b.onclick=()=>{why=b.dataset.why;sync()});
  const close=()=>{$("sheetHost").innerHTML=""};$("closeP").onclick=close;$("scrim").onclick=ev=>{if(ev.target.id==="scrim")close()};
  $("doRemove").onclick=()=>{const d=$("lastDay").value;if(!d){toast("Choose the last working day");return}
    saveEmps(S.emps.map(y=>y.id===x.id?Object.assign({},y,{active:false,leftReason:why,leftDate:d}):y)).then(()=>toast(x.name+" removed ("+why.toLowerCase()+")"));close()}}
document.addEventListener("keydown",ev=>{if(ev.key==="Escape")$("sheetHost").innerHTML=""});

// ---------- flags ----------
const FLAG_AT=3;const FLAG_CODES=[["AWOP","AWOP"],["FAMILY RESPONSIBILITY","Family responsibility"]];
const CHECK_CODES=[["AWOP","AWOP"],["SICK","Sick"],["FAMILY RESPONSIBILITY","Family responsibility"]];
const isFlagged=f=>FLAG_CODES.some(([c])=>f[c].length>=FLAG_AT);
function flagCounts(e,dates){const out={};CHECK_CODES.forEach(([c])=>{out[c]=dates.filter(d=>markOf(e,d)===c)});return out}
function flagBadges(e,dates){const f=flagCounts(e,dates);return FLAG_CODES.filter(([c])=>f[c].length>=FLAG_AT).map(([c,l])=>'<span class="flag" title="'+f[c].length+' '+esc(l)+' days this cycle">'+f[c].length+'× '+(c==="AWOP"?"AWOP":"FAM. RESP.")+'</span>').join("")}
const FLAG_KINDS=[["all","All types"],["AWOP","AWOP"],["SICK","Sick"],["FAMILY RESPONSIBILITY","Family responsibility"],["3plus","3 or more only"]];
function byKind(rows,kind){if(kind==="all")return rows;if(kind==="3plus")return rows.filter(r=>CHECK_CODES.some(([c])=>r.f[c].length>=FLAG_AT));return rows.filter(r=>r.f[kind].length)}
const kindCols=kind=>CHECK_CODES.filter(([c])=>kind==="all"||kind==="3plus"||kind===c);
function flagText(f){return FLAG_CODES.filter(([c])=>f[c].length>=FLAG_AT).map(([c])=>f[c].length+'× '+(c==='AWOP'?'AWOP':'FAM. RESP.'))}
function flagged(from,to){const dates=rangeDates(from,to);return inPeriod(from).sort((a,b)=>SHEETS.indexOf(a.sheet)-SHEETS.indexOf(b.sheet)||a.order-b.order)
  .map(e=>({e,f:flagCounts(e,dates)})).filter(r=>CHECK_CODES.some(([c])=>r.f[c].length)).sort((a,b)=>isFlagged(b.f)-isFlagged(a.f))}
function viewFlags(){const F=S.flg;if(!F.from){[F.from,F.to]=F.type==="custom"?[S.date,S.date]:preset(F.type,S.date)}
  const key=F.from+"|"+F.to;if(F.key!==key){F.key=key;F.loading=true;loadRange(F.from,F.to).then(()=>{F.loading=false;if(S.view==="flags")render()},e=>{F.loading=false;toast("Could not load those dates: "+(e.message||"try again"))})}
  let h='<div class="bar" role="group" aria-label="Check period">'+PRESETS.map(([k,l])=>'<button class="chip" data-flg="'+k+'" aria-pressed="'+(F.type===k)+'">'+l+'</button>').join("")+'</div>';
  h+='<div class="form"><label>From<input type="date" id="flg-from" value="'+F.from+'"></label><label>To<input type="date" id="flg-to" value="'+F.to+'"></label>'+
    '<div style="display:flex;align-items:end"><button class="btn gold" id="xlsFlags"'+(F.loading?" disabled":"")+'>Download Excel</button></div></div>';
  h+='<div class="bar" role="group" aria-label="Flag type"><span class="lbl" style="margin:0">Flag type</span>'+FLAG_KINDS.map(([k,l])=>'<button class="chip" data-kind="'+esc(k)+'" aria-pressed="'+(F.kind===k)+'">'+l+'</button>').join("")+'</div>';
  h+='<h2 class="sheet-h">AWOP, sick and flags <small>'+periodText(F.from,F.to)+'</small></h2>';
  if(F.loading){main.innerHTML=h+'<div class="empty"><b>Loading these dates</b>Fetching marks for the period.</div>';return}
  const allRows=flagged(F.from,F.to);const rows=allRows;const shown=byKind(allRows,F.kind);const cols=kindCols(F.kind);
  h+='<div class="summary">'+stat("Flagged: "+FLAG_AT+"+ AWOP",rows.filter(r=>r.f.AWOP.length>=FLAG_AT).length)+stat("Flagged: "+FLAG_AT+"+ family resp.",rows.filter(r=>r.f["FAMILY RESPONSIBILITY"].length>=FLAG_AT).length)+
    stat("Employees with AWOP",rows.filter(r=>r.f.AWOP.length).length)+stat("AWOP days",rows.reduce((a,r)=>a+r.f.AWOP.length,0))+stat("Employees sick",rows.filter(r=>r.f.SICK.length).length)+stat("Sick days",rows.reduce((a,r)=>a+r.f.SICK.length,0))+stat("Employees with family resp.",rows.filter(r=>r.f["FAMILY RESPONSIBILITY"].length).length)+stat("Family resp. days",rows.reduce((a,r)=>a+r.f["FAMILY RESPONSIBILITY"].length,0))+'</div>';
  h+='<p class="note">Lists every AWOP, sick and family responsibility day in the chosen period. Counts of '+FLAG_AT+' or more show in red. An employee is flagged at '+FLAG_AT+' or more AWOP days, or '+FLAG_AT+' or more family responsibility days, and flagged employees are listed first.</p>';
  if(!shown.length){main.innerHTML=h+'<div class="empty"><b>Nothing to report</b>'+(F.kind==="all"?"No AWOP, sick or family responsibility days in this period.":F.kind==="3plus"?"No employee has "+FLAG_AT+" or more AWOP, sick or family responsibility days in this period.":"No "+esc(FLAG_KINDS.find(k=>k[0]===F.kind)[1].toLowerCase())+" days in this period.")+'</div>';return}
  h+='<div class="tbl-wrap"><table><thead><tr><th>Employee</th><th style="text-align:left">Flag</th>'+cols.map(([c,l])=>'<th>'+(c==="FAMILY RESPONSIBILITY"?"Family resp.":l)+'</th><th style="text-align:left">Dates</th>').join("")+'</tr></thead><tbody>'+
   shown.map(r=>'<tr><td>'+esc(r.e.name)+'<br><span class="note">'+esc([r.e.number,r.e.sheet,groupLabel(r.e)].filter(Boolean).join(" · "))+'</span></td><td style="text-align:left">'+flagText(r.f).map(t=>'<span class="flag">'+esc(t)+'</span>').join(" ")+'</td>'+
     cols.map(([c])=>{const n=r.f[c].length;const hot=n>=FLAG_AT;return '<td class="'+(hot?"lowpc":"")+'">'+n+'</td><td style="text-align:left;white-space:normal;min-width:110px">'+r.f[c].map(short).join(", ")+'</td>'}).join("")+'</tr>').join("")+'</tbody></table></div>';
  main.innerHTML=h}
async function xlsFlags(from,to){try{await loadRange(from,to)}catch(e){toast("Could not load those dates: "+(e.message||"try again"));return}
  const kind=S.flg.kind;const rows=byKind(flagged(from,to),kind);const cols=kindCols(kind);const kl=FLAG_KINDS.find(k=>k[0]===kind)[1];
  const aoa=[["TKR Operations – Attendance Flags"],["Period",periodText(from,to)],["Flag type",kl],["Counts of "+FLAG_AT+" or more are marked in the Flag column. Flagged at "+FLAG_AT+" or more AWOP days, or "+FLAG_AT+" or more family responsibility days."],[],
    ["Employee","Number","Sheet","Group","Job Title","Flag"].concat(...cols.map(([c,l])=>[l+" days",l+" dates"]))];
  rows.forEach(r=>aoa.push([r.e.name,r.e.number,r.e.sheet,groupLabel(r.e),r.e.title,flagText(r.f).concat(r.f.SICK.length>=FLAG_AT?[r.f.SICK.length+"\u00d7 SICK"]:[]).join(", ")].concat(...cols.map(([c])=>[r.f[c].length,r.f[c].map(short).join(", ")]))));
  if(!rows.length)aoa.push(["Nothing to report for this flag type in this period."]);
  const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet(aoa);ws["!cols"]=[{wch:30},{wch:11},{wch:16},{wch:22},{wch:24},{wch:22},{wch:10},{wch:30},{wch:10},{wch:30},{wch:12},{wch:30}];
  XLSX.utils.book_append_sheet(wb,ws,"Flags");saveFile("TKR Attendance Flags "+(kind==="all"?"":kl+" ")+(from===to?from:from+" to "+to)+".xlsx",wb)}

// ---------- excel ----------
function saveFile(name,wb){try{XLSX.writeFile(wb,name)}catch(e){toast("Download failed: "+(e.message||"try again"))}}
const yr=d=>parse(d).getFullYear();
function rangeDates(from,to){const out=[];for(let x=from;x<=to&&out.length<400;x=addDays(x,1))out.push(x);return out}
const PRESETS=[["daily","Daily"],["weekly","Weekly"],["cycle","Cycle"],["month","Calendar month"],["custom","Custom dates"]];
function preset(type,anchor){const d=parse(anchor);
  if(type==="daily")return [anchor,anchor];
  if(type==="weekly"){const back=(d.getDay()+6)%7;const mon=addDays(anchor,-back);return [mon,addDays(mon,6)]}
  if(type==="cycle"){const c=cycleOf(anchor);return [c.start,c.end]}
  if(type==="month")return [iso(new Date(d.getFullYear(),d.getMonth(),1)),iso(new Date(d.getFullYear(),d.getMonth()+1,0))];
  return [S.exp.from||anchor,S.exp.to||anchor]}
const EXC=["AWOP","SICK","ANNUAL LEAVE","FAMILY RESPONSIBILITY","FAMILY EMERGENCY","STUDY LEAVE","MATERNITY LEAVE"];
function periodText(f,t){const n=rangeDates(f,t).length;return (f===t?nice(f)+" "+yr(f):nice(f)+" "+yr(f)+" to "+nice(t)+" "+yr(t))+" · "+n+(n===1?" day":" days")}
function viewExport(){const E=S.exp;if(!E.from){[E.from,E.to]=preset(E.type,S.date)}
  const key=E.from+"|"+E.to;if(E.key!==key){E.key=key;E.loading=true;loadRange(E.from,E.to).then(()=>{E.loading=false;if(S.view==="export")render()},e=>{E.loading=false;toast("Could not load those dates: "+(e.message||"try again"))})}
  const dates=rangeDates(E.from,E.to);const es=inPeriod(E.from);
  let h='<div class="bar" role="group" aria-label="Report period">'+PRESETS.map(([k,l])=>'<button class="chip" data-exp="'+k+'" aria-pressed="'+(E.type===k)+'">'+l+'</button>').join("")+'</div>';
  h+='<div class="form"><label>From<input type="date" id="exp-from" value="'+E.from+'"></label><label>To<input type="date" id="exp-to" value="'+E.to+'"></label>'+
    '<div style="display:flex;align-items:end"><button class="btn gold" id="xlsRange"'+(E.loading?" disabled":"")+'>Download Excel</button></div></div>';
  h+='<h2 class="sheet-h">Attendance report <small>'+periodText(E.from,E.to)+'</small></h2>';
  if(E.loading){main.innerHTML=h+'<div class="empty"><b>Loading these dates</b>Fetching marks for the period.</div>';return}
  const all=tally(es,dates);
  h+='<div class="summary">'+stat("Employees",es.length)+stat("Present days",all.present)+stat("AWOP days",all.absent)+stat("Leave & sick days",all.leave)+stat("Off days",all.off)+stat("Not marked",all.blank)+stat("Overtime",fmtH(all.ot)+" h")+stat("Attendance",fmtPct(pct(all.present,all.absent+all.leave)),"pct")+'</div>';
  h+='<div class="tbl-wrap"><table><thead><tr><th>Sheet</th><th>Employees</th><th>Present</th><th>AWOP</th><th>Leave</th><th>Off</th><th>Resigned, absconded, suspended</th><th>Not marked</th><th>Overtime hrs</th><th>Attendance</th></tr></thead><tbody>';
  SHEETS.forEach(sh=>{const l=es.filter(e=>e.sheet===sh);if(l.length)h+=trow(sh,l.length,tally(l,dates))});
  h+=trow("Total",es.length,all,"tot")+'</tbody></table></div>';
  h+='<p class="note">The Excel file has a Summary tab and one tab per sheet, with each person\'s mark for every day in the period and their totals.</p>';
  main.innerHTML=h}
async function xlsRange(from,to){try{await loadRange(from,to)}catch(e){toast("Could not load those dates: "+(e.message||"try again"));return}
  const dates=rangeDates(from,to);const wb=XLSX.utils.book_new();const es=inPeriod(from);
  const sumHead=["Sheet","Employees","Present"].concat(EXC,["Off","Resigned, absconded, suspended","Not marked","Overtime hours","Attendance %"]);
  const line=(name,n,t)=>{const p=pct(t.present,t.absent+t.leave);return [name,n,t.present].concat(EXC.map(k=>t.codes[k]||0),[t.off,t.out,t.blank,Math.round(t.ot*10)/10,p==null?"":p/100])};
  const sum=[["TKR Operations – Attendance Report"],["Period",periodText(from,to)],[],sumHead];
  SHEETS.forEach(sh=>{const l=es.filter(e=>e.sheet===sh);if(l.length)sum.push(line(sh,l.length,tally(l,dates)))});
  sum.push(line("Total",es.length,tally(es,dates)));
  sum.push([],["Attendance % = present days ÷ (present days + exception days). Exceptions are AWOP, sick and all leave. Medical counts as present. Off days are not counted."]);
  const ws0=XLSX.utils.aoa_to_sheet(sum);ws0["!cols"]=[{wch:20},{wch:10},{wch:9}].concat(EXC.map(()=>({wch:12})),[{wch:8},{wch:12},{wch:11},{wch:14},{wch:13}]);
  for(let r=4;r<sum.length;r++){const ref=XLSX.utils.encode_cell({r,c:sumHead.length-1});if(ws0[ref]&&typeof ws0[ref].v==="number")ws0[ref].z="0.0%"}
  XLSX.utils.book_append_sheet(wb,ws0,"Summary");
  bySheetGroup(es).forEach(s=>{const head=["Employee","Number","Department","Job Title"].concat(dates.map(short),["Present"],EXC,["Off","Not marked","Overtime hours","Attendance %"]);const aoa=[[s.sheet+" – "+periodText(from,to)],head];
    s.groups.forEach(g=>{aoa.push([g.label,"","",""].concat(dates.map(d=>rotaFor(g.id,d))));
      g.emps.forEach(e=>{const t=tally([e],dates);const p=pct(t.present,t.absent+t.leave);aoa.push([e.name,e.number,e.dept,e.title].concat(dates.map(d=>markOf(e,d)),[t.present],EXC.map(k=>t.codes[k]||0),[t.off,t.blank,Math.round(t.ot*10)/10,p==null?"":p/100]))})});
    const ws=XLSX.utils.aoa_to_sheet(aoa);ws["!cols"]=[{wch:30},{wch:11},{wch:16},{wch:24}].concat(dates.map(()=>({wch:7})));
    const pc=head.length-1;for(let r=2;r<aoa.length;r++){const ref=XLSX.utils.encode_cell({r,c:pc});if(ws[ref]&&typeof ws[ref].v==="number")ws[ref].z="0.0%"}
    XLSX.utils.book_append_sheet(wb,ws,s.sheet.slice(0,31))});
  const otRows=[];bySheetGroup(es).forEach(s=>s.groups.forEach(g=>g.emps.forEach(e=>dates.forEach(d=>{const h=otOf(e,d);if(h)otRows.push([e.name,e.number,s.sheet,g.label,nice(d)+" "+yr(d),h])}))));
  if(otRows.length){const tot=otRows.reduce((a,r)=>a+r[5],0);const ws=XLSX.utils.aoa_to_sheet([["Overtime – "+periodText(from,to)],["Employee","Number","Sheet","Group","Date","Hours"]].concat(otRows,[["Total","","","","",Math.round(tot*10)/10]]));
    ws["!cols"]=[{wch:30},{wch:11},{wch:16},{wch:22},{wch:16},{wch:8}];XLSX.utils.book_append_sheet(wb,ws,"Overtime")}
  saveFile("TKR Attendance "+(from===to?from:from+" to "+to)+".xlsx",wb)}

// ---------- users (admins) ----------
function viewUsers(){const row=(em,role)=>'<tr><td>'+esc(em)+'</td><td>'+(role==="capturers"?"Marks attendance":"Views reports")+'</td><td><button class="btn sm" data-rmuser="'+esc(em)+'" data-role="'+role+'">Remove</button></td></tr>';
  const n=roles.capturers.length+roles.viewers.length;
  main.innerHTML='<form class="form" id="addUser"><label>Email<input id="uEmail" type="email" required></label><label>Password<input id="uPass" type="text" minlength="6" placeholder="Leave empty if they already have one"></label>'+
   '<label>Access<select id="uRole"><option value="capturers">Mark attendance</option><option value="viewers">View reports only</option></select></label><div style="display:flex;align-items:end"><button class="btn gold" type="submit">Add user</button></div></form>'+
   '<p class="note">Admins ('+ADMINS.map(esc).join(", ")+') always have full access. People who mark attendance can also add and remove employees and set cycles.</p><p class="note" id="uMsg" role="status"></p>'+
   '<h2 class="sheet-h">Who has access <small>'+n+'</small></h2>'+(n?'<div class="tbl-wrap"><table><thead><tr><th>Email</th><th style="text-align:left">Access</th><th></th></tr></thead><tbody>'+roles.capturers.map(e=>row(e,"capturers")).join("")+roles.viewers.map(e=>row(e,"viewers")).join("")+'</tbody></table></div>':'<p class="note">Only the admins have access so far.</p>')+
   '<h2 class="sheet-h">Data file</h2><p class="note">Load a TKR Attendance data file to put its employees, shift rotas, cycles and marks into the register. Marks in the file replace the same days in the register.</p>'+
   '<div class="bar"><button class="btn" id="loadData">Load data file</button><button class="btn" id="saveData">Download data file</button><input type="file" id="dataIn" accept=".json,application/json" hidden></div>';
  $("addUser").onsubmit=async ev=>{ev.preventDefault();const em=$("uEmail").value.trim().toLowerCase(),pw=$("uPass").value,role=$("uRole").value,other=role==="capturers"?"viewers":"capturers";const msg=$("uMsg");
    if(pw&&pw.length<6){msg.textContent="The password must be at least 6 characters.";return}msg.textContent="Adding…";let note="";
    if(pw){const tmp=initializeApp(firebaseConfig,"add-"+Date.now());
      try{await createUserWithEmailAndPassword(getAuth(tmp),em,pw);note=" Their sign-in is made."}catch(err){if(err&&err.code==="auth/email-already-in-use")note=" They already had a sign-in, so their old password stays.";else{msg.textContent="The sign-in couldn't be made. Check the email and try again.";deleteApp(tmp).catch(()=>{});return}}
      deleteApp(tmp).catch(()=>{})}
    try{await setDoc(doc(fs,"config","attendance"),{[role]:arrayUnion(em),[other]:arrayRemove(em)},{merge:true});toast(em+" can now sign in."+note)}catch(err){msg.textContent="Not saved: "+(err.message||"try again")}};
  $("loadData").onclick=()=>$("dataIn").click();
  $("dataIn").onchange=ev=>{const f=ev.target.files[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{try{loadBackup(JSON.parse(rd.result))}catch(e){toast("That file is not a TKR Attendance data file")}};rd.readAsText(f);ev.target.value=""};
  $("saveData").onclick=saveBackup;
}
async function loadBackup(b){if(!b||!b.employees||!b.months){toast("That file is not a TKR Attendance data file");return}
  const msg=$("uMsg");msg.textContent="Loading the data file…";
  try{await S.db.doc("config/employees").set({list:b.employees});
    if(b.settings)await S.db.doc("config/settings").set(b.settings);
    for(const id in (b.rota||{}))await S.db.doc("cycles/"+id).set(b.rota[id]);
    for(const m in b.months)for(const sh in b.months[m])await S.db.doc("months/"+m+"/sheets/"+sh).update(b.months[m][sh]);
    msg.textContent="Data file loaded: "+b.employees.length+" employees, "+Object.keys(b.months).length+" months of marks.";toast("Data file loaded")}
  catch(e){msg.textContent="Loading stopped: "+(e.message||"try again")}}
async function saveBackup(){const b={employees:S.emps||[],settings:{cycles:CUSTOM},rota:S.cycles,months:{}};
  const ms=new Set();Object.keys(S.rota).forEach(g=>Object.keys(S.rota[g]).forEach(d=>ms.add(monthOf(d))));Object.keys(S.mm).forEach(m=>ms.add(m));
  for(const m of ms){if(!S.mm[m]){const snap=await S.db.collection("months/"+m+"/sheets").get();applyMonth(m,snap)}b.months[m]={};for(const sh in S.mm[m]||{})b.months[m][sh]={sheet:sh,month:m,marks:S.mm[m][sh].marks,ot:S.mm[m][sh].ot}}
  const blob=new Blob([JSON.stringify(b)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="TKR Attendance data "+iso(new Date())+".json";document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}
main.addEventListener("click",ev=>{const t=ev.target.closest("[data-rmuser]");if(!t)return;
  if(t.dataset.armed){setDoc(doc(fs,"config","attendance"),{[t.dataset.role]:arrayRemove(t.dataset.rmuser)},{merge:true}).then(()=>toast("Access removed"),e=>toast("Not saved: "+(e.message||"try again")))}
  else{t.dataset.armed="1";t.textContent="Tap again to remove";t.classList.add("gold")}});

// ---------- events ----------
$("tabs").onclick=ev=>{const b=ev.target.closest("button");if(!b)return;S.view=b.dataset.v;try{localStorage.setItem("tkr-att-view",S.view)}catch(e){}render()};
$("date").onchange=ev=>{if(ev.target.value){S.date=ev.target.value;if(S.db)watchCycle();render()}};
$("cycleLbl").onclick=()=>{if(S.db)openCyclePanel()};
$("prev").onclick=()=>{S.date=addDays(S.date,-1);if(S.db)watchCycle();render()};
$("next").onclick=()=>{S.date=addDays(S.date,1);if(S.db)watchCycle();render()};
main.addEventListener("input",ev=>{if(ev.target.id==="q"){S.q=ev.target.value;const pos=ev.target.selectionStart;render();const q=$("q");if(q){q.focus();q.setSelectionRange(pos,pos)}}});
main.addEventListener("submit",ev=>{if(ev.target.id!=="empForm")return;ev.preventDefault();
  const f={sheet:$("f-sheet").value,group:$("f-group").value,name:$("f-name").value.trim(),number:$("f-number").value.trim(),dept:$("f-dept").value.trim(),title:$("f-title").value.trim()};
  if(!f.name){toast("Enter the employee's name");return}
  const g=(S.emps||[]).find(x=>x.group===f.group);if(!g||g.sheet!==f.sheet){f.section=f.sheet;f.shift="";f.group=f.sheet+"|"+f.sheet+"|"}else{f.section=g.section;f.shift=g.shift}
  let list=(S.emps||[]).slice();
  if(editing){list=list.map(x=>x.id===editing.id?Object.assign({},x,f):x)}
  else{const id=(f.number||f.name).replace(/[^A-Za-z0-9]+/g,"-").replace(/^-|-$/g,"")+"-"+Date.now().toString(36);
    const sameGroup=list.filter(x=>x.group===f.group);const order=sameGroup.length?Math.max(...sameGroup.map(x=>x.order))+0.01:list.length;
    list.push(Object.assign({id,order,active:true},f))}
  const wasEdit=!!editing;editing=null;saveEmps(list).then(()=>toast(wasEdit?"Changes saved":f.name+" added"))});
main.addEventListener("change",ev=>{if((ev.target.id==="flg-from"||ev.target.id==="flg-to")&&ev.target.value){const F=S.flg;F.type="custom";F[ev.target.id==="flg-from"?"from":"to"]=ev.target.value;if(F.to<F.from)[F.from,F.to]=[F.to,F.from];if(rangeDates(F.from,F.to).length>=400){F.to=addDays(F.from,365);toast("A check covers at most one year")}render();return}
  if((ev.target.id==="exp-from"||ev.target.id==="exp-to")&&ev.target.value){const E=S.exp;E.type="custom";E[ev.target.id==="exp-from"?"from":"to"]=ev.target.value;if(E.to<E.from)[E.from,E.to]=[E.to,E.from];if(rangeDates(E.from,E.to).length>=400){E.to=addDays(E.from,365);toast("A report covers at most one year")}render();return}
  if(ev.target.id==="f-sheet"){const sh=ev.target.value;const sel=$("f-group");const opt=[...sel.options].find(o=>o.dataset.sheet===sh);if(opt)sel.value=opt.value}});
main.addEventListener("click",ev=>{const t=ev.target.closest("button");if(!t)return;
  if(t.dataset.sheet){S.sheet=t.dataset.sheet;try{localStorage.setItem("tkr-att-sheet",S.sheet)}catch(e){}render();return}
  if(t.dataset.emp){const e=activeEmps().find(x=>x.id===t.dataset.emp);if(e)openPanel(e);return}
  if(t.dataset.fill){if(!S.canWrite){toast("You can view this register but not mark it.");return}
    const es=filtered().filter(e=>e.group===t.dataset.fill&&!markOf(e,S.date));if(!es.length){toast("Everyone in this group is already marked");return}
    const by={};es.forEach(e=>{(by[e.sheet]=by[e.sheet]||{})[e.id]={[S.date]:t.dataset.val}});for(const sh in by)writeSheet(sh,by[sh]);toast(es.length+" marked "+t.dataset.val);return}
  if(t.dataset.edit){editing=(S.emps||[]).find(x=>x.id===t.dataset.edit);render();window.scrollTo({top:0});return}
  if(t.dataset.remove){const x=(S.emps||[]).find(y=>y.id===t.dataset.remove);if(x)openRemove(x,t.dataset.reason,t.dataset.last);return}
  if(t.dataset.restore){const x=(S.emps||[]).find(y=>y.id===t.dataset.restore);const {leftDate,leftReason,...rest}=x;saveEmps(S.emps.map(y=>y.id===x.id?Object.assign(rest,{active:true}):y)).then(()=>toast(x.name+" is back on the register"));return}
  if(t.id==="cancelEdit"){editing=null;render();return}
  if(t.id==="startCycle"){startCycle();return}
  if(t.id==="sortLow"){S.sortLow=!S.sortLow;render();return}
  if(t.id==="xlsCycle"){const c=cycleOf(S.date);xlsRange(c.start,c.end);return}
  if(t.id==="xlsDaily"){xlsRange(S.date,S.date);return}
  if(t.dataset.exp){S.exp.type=t.dataset.exp;if(t.dataset.exp!=="custom")[S.exp.from,S.exp.to]=preset(t.dataset.exp,S.exp.from||S.date);render();return}
  if(t.id==="xlsRange"){xlsRange(S.exp.from,S.exp.to);return}
  if(t.dataset.flg){const F=S.flg;F.type=t.dataset.flg;if(F.type!=="custom")[F.from,F.to]=preset(F.type,F.from||S.date);render();return}
  if(t.dataset.kind){S.flg.kind=t.dataset.kind;render();return}
  if(t.id==="xlsFlags"){xlsFlags(S.flg.from,S.flg.to);return}
  if(t.id==="copyDaily"){const txt=dailyText();navigator.clipboard.writeText(txt).then(()=>toast("Report copied. Paste it into WhatsApp."),()=>{$("sheetHost").innerHTML='<div class="scrim" id="scrim"><div class="panel"><h2>Daily report</h2><div class="sub">Select all and copy.</div><textarea id="txt" style="width:100%;height:300px;background:var(--surface-2);color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:8px;font:13px var(--mono)">'+esc(txt)+'</textarea><button class="btn" id="closeP">Close</button></div></div>';$("closeP").onclick=()=>$("sheetHost").innerHTML="";$("txt").select()});return}
});

// ---------- boot ----------
render();
startApp=function(db){if(S.db)return;S.db=db;S.canWrite=canWrite();
  db.doc("config/employees").onSnapshot(d=>{S.emps=d.exists?(d.data().list||[]):[];render()},err);
  db.collection("cycles").onSnapshot(snap=>{S.cycles={};snap.docs.forEach(d=>{S.cycles[d.id]=d.data()});applyRotas();render()},err);
  db.doc("config/settings").onSnapshot(d=>{setCustom(d.exists?d.data().cycles:[]);watchCycle();render()},err);
  watchCycle();render()};
rerender=()=>{S.canWrite=canWrite();render()};
})();

// ---------- sign-in ----------
const q=id=>document.getElementById(id);
function showSignin(on){q("signin").hidden=!on;q("main").hidden=on;q("appBar").hidden=on;q("tabs").hidden=on;q("outBtn").hidden=on}
let rolesUnsub=null;
onAuthStateChanged(auth,u=>{if(rolesUnsub){rolesUnsub();rolesUnsub=null}
  if(!u){email="";showSignin(true);return}
  email=(u.email||"").toLowerCase();showSignin(false);q("usersTab").hidden=!isAdmin();
  q("main").innerHTML='<div class="empty"><b>Opening the register</b>Checking your access.</div>';
  rolesUnsub=onSnapshot(doc(fs,"config","attendance"),d=>{const v=d.exists()?d.data():{};roles={capturers:(v.capturers||[]).map(x=>x.toLowerCase()),viewers:(v.viewers||[]).map(x=>x.toLowerCase())};
    if(!canView()){q("appBar").hidden=true;q("tabs").hidden=true;q("main").innerHTML='<div class="empty"><b>No access yet</b>'+email.replace(/[<>&]/g,"")+' is signed in but does not have access to TKR Attendance. Ask admin.</div>';return}
    q("appBar").hidden=false;q("tabs").hidden=false;startApp(fdb);rerender()},
    e=>{q("main").innerHTML='<div class="empty"><b>The register could not load</b>'+String(e&&e.message||"Check your signal and open the app again.").replace(/[<>&]/g,"")+'</div>'})});
q("signForm").onsubmit=async e=>{e.preventDefault();const m=q("sMsg");m.textContent="Signing in…";q("sBtn").disabled=true;
  try{await signInWithEmailAndPassword(auth,q("sEmail").value.trim(),q("sPass").value);q("sPass").value="";m.textContent=""}
  catch(err){m.textContent=err&&err.code==="auth/network-request-failed"?"No signal. Sign in once with signal; after that the app works offline.":"The email or password is wrong."}
  q("sBtn").disabled=false};
q("forgot").onclick=async()=>{const em=q("sEmail").value.trim();const m=q("sMsg");if(!em.includes("@")){m.textContent="Type your email first, then tap Forgot password.";return}
  try{await sendPasswordResetEmail(auth,em);m.textContent="A password reset email was sent to "+em+"."}catch(e){m.textContent="The reset email couldn't be sent. Ask admin."}};
q("outBtn").onclick=()=>signOut(auth).then(()=>location.reload());
let installEvt=null;
addEventListener("beforeinstallprompt",e=>{e.preventDefault();installEvt=e;q("installBtn").hidden=false});
q("installBtn").onclick=async()=>{if(!installEvt)return;installEvt.prompt();await installEvt.userChoice;installEvt=null;q("installBtn").hidden=true};
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js",{updateViaCache:"none"}).then(r=>r.update()).catch(()=>{});
