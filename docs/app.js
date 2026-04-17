(function(){
'use strict';
// === config ===
const FB='https://poskds-4ba60-default-rtdb.asia-southeast1.firebasedatabase.app',FW=FB+'/workschedule';
const READONLY=new URLSearchParams(location.search).get('readonly')==='1';
const DSH=3,TLM=1440,DOW_KR=['일','월','화','수','목','금','토'],DOW_EN=['sun','mon','tue','wed','thu','fri','sat'];
const RC={'주방':'#E67E22','차배달':'#4ECDC4','오토바이':'#FFD700'},RL={'주방':'주방','차배달':'차','오토바이':'바이크'};
const CK='#2ECC71',CD='#9090A8',CO='#E74C3C',CB='#1A1A30';
const DE={emp1:{name:'이원규',phone:'',role:'',hourlyRate:9860},emp2:{name:'권연옥',phone:'',role:'',hourlyRate:9860},emp3:{name:'리',phone:'',role:'',hourlyRate:9860},emp4:{name:'히오',phone:'',role:'',hourlyRate:9860},emp9:{name:'사아야',phone:'',role:'',hourlyRate:9860}};
const HOL={'2026-01-01':'신정','2026-01-28':'설날연휴','2026-01-29':'설날','2026-01-30':'설날연휴','2026-03-01':'삼일절','2026-05-05':'어린이날','2026-05-06':'대체공휴일','2026-05-24':'석가탄신일','2026-06-06':'현충일','2026-08-15':'광복절','2026-09-24':'추석연휴','2026-09-25':'추석','2026-09-26':'추석연휴','2026-10-03':'개천절','2026-10-09':'한글날','2026-12-25':'성탄절','2027-01-01':'신정','2027-02-07':'설날연휴','2027-02-08':'설날','2027-02-09':'설날연휴','2027-03-01':'삼일절','2027-05-05':'어린이날','2027-05-13':'석가탄신일','2027-06-06':'현충일','2027-08-15':'광복절','2027-08-16':'대체공휴일','2027-10-03':'개천절','2027-10-04':'추석연휴','2027-10-05':'추석','2027-10-06':'추석연휴','2027-10-09':'한글날','2027-12-25':'성탄절'};
const COLORS=['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#F0A500','#6C5CE7','#A8E6CF','#FF8A5C','#EA80FC','#00BCD4'];
// === store ===
const S={tab:'timebar',date:new Date(),emp:{},sc:{},wsc:{},fix:{},dof:{},cf:{},sst:{},att:{},sseE:null,sseS:null,gen:0,loaded:false,sec:{}};
const $=id=>document.getElementById(id);
// === util ===
function pad(n){return n<10?'0'+n:''+n;}
function dk(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function toast(m){const t=$('toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2000);}
function openM(e){e.classList.add('active');}
function closeM(e){e.classList.remove('active');}
function sameD(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
function getMon(d){const t=new Date(d),w=t.getDay();t.setDate(t.getDate()+(w===0?-6:1-w));t.setHours(0,0,0,0);return t;}
function isH(d){return !!(HOL[typeof d==='string'?d:dk(d)]);}
function hNm(d){return HOL[typeof d==='string'?d:dk(d)]||null;}
function isWE(d){const o=typeof d==='string'?new Date(d.replace(/-/g,'/')):d;const w=o.getDay();return w===0||w===6;}
function fEmp(n){for(const i in S.emp)if(S.emp[i].name===n)return i;return null;}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function isOff(e,d){return S.dof[e]&&S.dof[e][d];}
function gSt(d,e){return S.sst[d+'_'+e]||'auto';}
function tm12(t){const[h,m]=t.split(':').map(Number);let r=h;if(r<12)r+=24;return(r-12)*60+m;}
function tmDS(t){const[h,m]=t.split(':').map(Number);let r=h;if(r<DSH)r+=24;return(r-DSH)*60+m;}
function cH(s,e){let a=tm12(s),b=tm12(e);if(b<=a)b+=1440;return Math.round((b-a)/60*10)/10;}
function tPct(t){return Math.max(0,Math.min(100,tmDS(t)/TLM*100));}
function pTM(t){if(!t)return null;const p=t.split(':');return parseInt(p[0])*60+parseInt(p[1]||0);}
// === api ===
async function fbG(u){try{const r=await fetch(u+'.json');if(!r.ok)throw r.status;return await r.json();}catch(e){console.error('fbG',u,e);return null;}}
async function fbP(u,d){if(READONLY){toast('읽기 전용');return false;}try{const r=await fetch(u+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});if(!r.ok)throw r.status;return true;}catch(e){console.error('fbP',e);toast('저장 실패');return false;}}
// === getFixedScheduleForDate ===
function gFix(empName,dateObj){
  const d=typeof dateObj==='string'?new Date(dateObj.replace(/-/g,'/')):dateObj,dow=d.getDay(),fs=S.fix[empName];
  if(!fs||!fs.start)return null;
  const ds=DOW_EN[dow],ov=fs.dayTimes&&fs.dayTimes[ds];
  const start=ov&&ov.start?ov.start:fs.start,end=ov&&ov.end?ov.end:fs.end,role=ov&&ov.role?ov.role:(fs.role||'');
  if(fs.type==='fixed'){if(fs.off&&Array.isArray(fs.off)&&fs.off.includes(dow))return null;return{start,end,role,type:'fixed'};}
  if(fs.type==='weekly'){if(!fs.days||!Array.isArray(fs.days))return null;return fs.days.includes(ds)?{start,end,role,type:'fixed'}:null;}
  return null;
}
function gFixC(n){return gFix(n,S.date);}
// === SSE ===
function connectSSE(){
  S.gen++;const g=S.gen;if(S.sseE){try{S.sseE.close();}catch(e){}}
  try{S.sseE=new EventSource(FW+'/employees.json');
    S.sseE.addEventListener('put',function(e){if(g!==S.gen){S.sseE.close();return;}try{const d=JSON.parse(e.data);if(d.path==='/'){S.emp=d.data||{};}else{const k=d.path.replace(/^\//,'');if(d.data===null)delete S.emp[k];else S.emp[k]=d.data;}renderAll();}catch(x){}});
    S.sseE.addEventListener('patch',function(e){if(g!==S.gen){S.sseE.close();return;}try{const d=JSON.parse(e.data),k=d.path.replace(/^\//,'');if(k&&d.data)S.emp[k]=Object.assign(S.emp[k]||{},d.data);else if(!k&&d.data)Object.assign(S.emp,d.data);renderAll();}catch(x){}});
    S.sseE.onerror=function(){if(g!==S.gen)return;try{S.sseE.close();}catch(e){} S.sseE=null;setTimeout(()=>{if(g===S.gen)connectSSE();},3000);};
  }catch(e){}
  conSS(g);
}
function conSS(g){
  if(S.sseS){try{S.sseS.close();}catch(e){}} const d=dk(S.date),exDk=d;
  try{S.sseS=new EventSource(FW+'/schedules/'+d+'.json');
    S.sseS.addEventListener('put',function(e){if(g!==S.gen){S.sseS.close();return;}if(dk(S.date)!==exDk){S.sseS.close();return;}try{const p=JSON.parse(e.data);if(p.path==='/'){S.sc=p.data||{};}else{const k=p.path.replace(/^\//,'').split('/')[0];if(p.data===null)delete S.sc[k];else if(p.path.split('/').filter(Boolean).length===1)S.sc[k]=p.data;else{if(!S.sc[k])S.sc[k]={};const s=p.path.replace(/^\//,'').split('/')[1];if(p.data===null)delete S.sc[k][s];else S.sc[k][s]=p.data;}}renderAll();}catch(x){}});
    S.sseS.addEventListener('patch',function(e){if(g!==S.gen){S.sseS.close();return;}if(dk(S.date)!==exDk){S.sseS.close();return;}try{const p=JSON.parse(e.data),pts=p.path.replace(/^\//,'').split('/').filter(Boolean);if(!pts.length&&p.data)Object.keys(p.data).forEach(k=>{S.sc[k]=Object.assign(S.sc[k]||{},p.data[k]);});else if(pts.length===1&&p.data)S.sc[pts[0]]=Object.assign(S.sc[pts[0]]||{},p.data);renderAll();}catch(x){}});
    S.sseS.onerror=function(){if(g!==S.gen)return;try{S.sseS.close();}catch(e){} S.sseS=null;setTimeout(()=>{if(g===S.gen)conSS(g);},3000);};
  }catch(e){}
}
// === data loading ===
async function loadData(){
  const d=dk(S.date);$('loader').style.display='flex';$('tabContent').style.display='none';
  try{const[eD,sD,fD,dD,cD,tD,aD]=await Promise.all([fbG(FW+'/employees'),fbG(FW+'/schedules/'+d),fbG(FW+'/fixed_schedules'),fbG(FW+'/dayoffs'),fbG(FW+'/confirmed'),fbG(FW+'/shift_status/'+d),fbG(FB+'/packhelper/storebot_attendance/'+d)]);
    if(eD&&Object.keys(eD).length){S.emp=eD;}else{S.emp=JSON.parse(JSON.stringify(DE));fbP(FW+'/employees',S.emp);}
    if(sD){S.sc=sD;}else S.sc={};
    if(fD)S.fix=fD;if(dD)S.dof=dD;if(cD)S.cf=cD;
    if(tD)Object.keys(tD).forEach(e=>{if(tD[e])S.sst[d+'_'+e]=tD[e];else delete S.sst[d+'_'+e];});
    S.att=aD||{};
  }catch(e){console.error('loadData',e);}
  S.loaded=true;genDO();autoFix(d);$('loader').style.display='none';$('tabContent').style.display='';renderAll();loadWk();
}
async function loadWk(){
  const m=getMon(S.date),ks=[],sp=[],tp=[];
  for(let i=0;i<7;i++){const d=new Date(m);d.setDate(d.getDate()+i);const k=dk(d);ks.push(k);sp.push(fbG(FW+'/schedules/'+k));tp.push(fbG(FW+'/shift_status/'+k));}
  const[sR,tR]=await Promise.all([Promise.all(sp),Promise.all(tp)]);S.wsc={};
  ks.forEach((k,i)=>{S.wsc[k]=sR[i]||{};const f=tR[i];if(f)Object.keys(f).forEach(e=>{if(f[e])S.sst[k+'_'+e]=f[e];else delete S.sst[k+'_'+e];});});
  renderWeek();renderDS();
}
// === autoApplyFixed / genAutoDayoffs ===
function autoFix(d){
  const pts=d.split('-'),dO=new Date(+pts[0],+pts[1]-1,+pts[2]),fIds=[];
  for(const n in S.fix){const fx=gFix(n,dO);if(!fx||!fx.start)continue;const e=fEmp(n);if(!e||isOff(e,d))continue;
    if(!S.sc[e]){S.sc[e]={start:fx.start,end:fx.end,role:fx.role};fbP(FW+'/schedules/'+d+'/'+e,S.sc[e]);}
    if(S.sst[d+'_'+e]!=='confirmed'){S.sst[d+'_'+e]='confirmed';fbP(FW+'/shift_status/'+d+'/'+e,'confirmed');}fIds.push(e);}
  const wI=Object.keys(S.sc).filter(i=>S.sc[i]&&S.sc[i].start&&!isOff(i,d));
  if(wI.length&&wI.every(i=>fIds.includes(i))&&!S.cf[d]){S.cf[d]=true;fbP(FW+'/confirmed/'+d,true);}
}
function genDO(){
  let ch=false;const now=new Date();
  for(let i=0;i<56;i++){const d=new Date(now);d.setDate(d.getDate()+i);const k=dk(d),dw=d.getDay(),ds=DOW_EN[dw];
    for(const n in S.fix){const f=S.fix[n];if(!f)continue;const e=fEmp(n);if(!e)continue;if(!S.dof[e])S.dof[e]={};if(S.dof[e][k]!==undefined)continue;
      let off=false;if(f.type==='weekly'){if(!f.days||!f.days.includes(ds))off=true;}else if(f.type==='fixed'){if(f.off&&Array.isArray(f.off)&&f.off.includes(dw))off=true;}
      if(off){S.dof[e][k]=true;ch=true;}}}
  if(ch)fbP(FW+'/dayoffs',S.dof);
}
// === categorize ===
function catE(d){
  const ek=Object.keys(S.emp),woC={},whM={},mn=getMon(S.date);
  for(let i=0;i<7;i++){const x=new Date(mn);x.setDate(x.getDate()+i);const wk=dk(x),ws=wk===d?S.sc:(S.wsc[wk]||{});
    ek.forEach(id=>{if(isOff(id,wk))woC[id]=(woC[id]||0)+1;const s=ws[id];if(s&&s.start&&s.end)whM[id]=(whM[id]||0)+cH(s.start,s.end);});}
  const w=[],off=[],mt=[];let tH=0,cc=0,uc=0;
  ek.forEach(id=>{const emp=S.emp[id];if(isOff(id,d)){off.push({id,emp});return;}const sh=S.sc[id];
    if(sh&&sh.start){const st=gSt(d,id),h=cH(sh.start,sh.end);tH+=h;st==='confirmed'?cc++:uc++;w.push({id,emp,shift:sh,status:st,hours:h});}else mt.push({id,emp});});
  w.sort((a,b)=>tmDS(a.shift.start)-tmDS(b.shift.start));
  return{ek,w,off,mt,tH,cc,uc,woC,whM};
}
function gRange(w){
  if(!w||!w.length)return{gs:DSH,gh:12};let mn=48,mx=0;
  w.forEach(x=>{let sH=parseInt(x.shift.start),eH=parseInt(x.shift.end),eM=parseInt(x.shift.end.split(':')[1]||0);if(eM>0)eH++;if(sH<DSH)sH+=24;if(eH<DSH)eH+=24;if(eH<=sH)eH+=24;if(sH<mn)mn=sH;if(eH>mx)mx=eH;});
  if(S.att)Object.values(S.att).forEach(a=>{if(a.actual_start){let h=parseInt(a.actual_start);if(h<DSH)h+=24;if(h<mn)mn=h;}if(a.actual_end){let h=parseInt(a.actual_end),m=parseInt(a.actual_end.split(':')[1]||0);if(m>0)h++;if(h<DSH)h+=24;if(h>mx)mx=h;}});
  let gh=mx+1-(mn-1);if(gh<6)gh=6;return{gs:mn-1,gh};
}
// === attendance ===
const ASC={owner:'#2ECC71',staff:'#3498DB','staff+pair':'#4FC3F7',manual:'#E67E22',fallback:'#E67E22','fallback+pair':'#E67E22',gemini:'#9090A8','gemini+pair':'#4FC3F7',bulk:'#9090A8'};
const ASL={owner:'사장',staff:'본인','staff+pair':'동시출근','gemini+pair':'AI+동시',gemini:'AI',manual:'수동',fallback:'자동','fallback+pair':'자동+동시',bulk:'일괄'};
function srcB(s){if(!s)return'';const c=ASC[s]||'#707088',l=ASL[s]||esc(s);return'<span style="font-size:.5rem;color:'+c+';font-weight:600;padding:1px 3px;border:1px solid '+c+'44;border-radius:3px;">'+l+'</span>';}
function attRow(eid,sh){
  const at=S.att[eid],sc=S.sc[eid],aS=(at&&at.actual_start)||(sc&&sc.actual_start)||null,aE=(at&&at.actual_end)||(sc&&sc.actual_end)||null;
  if(!aS&&!aE)return'<div style="padding:1px 0 0 42px;font-size:.55rem;color:#707088;">실제 <span style="color:#E74C3C;font-weight:600;">미기록</span></div>';
  function cD(a,b){if(!a||!b)return null;let d=pTM(b)-pTM(a);if(d>720)d-=1440;else if(d<-720)d+=1440;return d;}
  function dB(d){if(d===null)return'';return' <span style="color:'+(d<0?'#2ECC71':d>0?'#E74C3C':'#9090A8')+';font-weight:700;">('+(d<0?d+'분':d>0?'+'+d+'분':'정시')+')</span>';}
  let h='<div style="padding:1px 0 0 42px;font-size:.55rem;color:#9090A8;">';
  if(aS){const d=(sc&&sc.diff_start!==undefined)?sc.diff_start:cD(sh?sh.start:null,aS);h+='<span style="color:#2ECC71;">✓'+aS+'</span>'+dB(d);}
  if(aE){const d=(sc&&sc.diff_end!==undefined)?sc.diff_end:cD(sh?sh.end:null,aE);if(aS)h+=' ';h+='<span style="color:#3498DB;">→'+aE+'</span>'+dB(d);}
  if(at){const ss=new Set();if(at.actual_start_source)ss.add(at.actual_start_source);if(at.actual_end_source)ss.add(at.actual_end_source);ss.forEach(s=>{h+=' '+srcB(s);});}
  return h+'</div>';
}
// === render core ===
let rQ=false,rA=false;
function renderAll(f){if(f===true){doR();return;}if(rQ){rA=true;return;}rQ=true;const r=()=>{rQ=false;doR();if(rA){rA=false;renderAll();}};requestAnimationFrame?requestAnimationFrame(r):setTimeout(r,16);}
function doR(){try{updD();}catch(e){}try{rBrief();}catch(e){}try{rTab();}catch(e){}try{renderDS();}catch(e){}if($('weekBody').classList.contains('open'))try{renderWeek();}catch(e){}}
function updD(){$('dateDisp').textContent=(S.date.getMonth()+1)+'/'+S.date.getDate()+' '+DOW_KR[S.date.getDay()];}
// === common builders ===
function progBar(cc,uc,mt,w,off,tH){
  const tot=w+mt,pC=tot?Math.round(cc/tot*100):0;
  let h='<div style="margin-bottom:6px;"><div style="display:flex;height:5px;border-radius:3px;overflow:hidden;background:'+CB+';">';
  if(pC)h+='<div style="width:'+pC+'%;background:'+CK+';"></div>';
  h+='<div style="flex:1;background:#2E2E52;"></div></div><div style="display:flex;gap:8px;margin-top:3px;font-size:.6rem;">';
  h+='<span style="color:'+CK+';font-weight:700;">확정'+cc+'</span>';
  if(uc)h+='<span style="color:'+CD+';font-weight:700;">미확정'+uc+'</span>';
  if(mt)h+='<span style="color:#707088;">미입력'+mt+'</span>';
  h+='<span style="color:#707088;margin-left:auto;">'+w+'명 '+tH.toFixed(1).replace('.0','')+'h</span>';
  if(off)h+='<span style="color:'+CO+';">휴'+off+'</span>';
  return h;
}
function stBtn(id,isCf,sz){const s=sz||'.65';return isCf?'<span data-action="status" data-sid="'+id+'" data-st="auto" style="min-width:32px;text-align:center;font-size:'+s+'rem;padding:'+(.65/parseFloat(s)*4|0)+'px 6px;border-radius:5px;cursor:pointer;background:'+CK+';color:#fff;font-weight:700;margin-left:3px;">확</span>':'<span data-action="status" data-sid="'+id+'" data-st="confirmed" style="min-width:32px;text-align:center;font-size:'+s+'rem;padding:'+(.65/parseFloat(s)*4|0)+'px 6px;border-radius:5px;cursor:pointer;background:'+CD+'33;color:'+CD+';font-weight:700;margin-left:3px;border:1px solid '+CD+';">미</span>';}
function emptyRow(e,isT,nP){let h='<div data-empid="'+e.id+'" style="display:flex;align-items:center;gap:4px;padding:2px 6px;cursor:pointer;"><div style="min-width:58px;font-size:.85rem;font-weight:700;color:#707088;">'+esc(e.emp.name)+'</div><div style="flex:1;position:relative;height:32px;background:#1A1A30;border-radius:4px;overflow:hidden;">';
  if(isT)h+='<div style="position:absolute;left:'+nP+'%;top:0;bottom:0;width:1px;background:#FFD70066;z-index:2;"></div>';
  return h+'<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.65rem;color:#707088;">미입력</div></div><span data-action="confirmOff" data-oid="'+e.id+'" style="font-size:.65rem;padding:4px 7px;border-radius:5px;background:#E74C3C33;color:#E74C3C;cursor:pointer;font-weight:700;">휴확</span></div>';}
function offRow(o,woC){const oO=woC[o.id]||0;return'<div data-empid="'+o.id+'" style="display:flex;align-items:center;gap:4px;padding:2px 6px;opacity:.4;cursor:pointer;"><div style="min-width:58px;font-size:.85rem;font-weight:700;color:#E74C3C;">'+esc(o.emp.name)+(oO?'<span style="font-size:.6rem;">('+oO+')</span>':'')+'</div><div style="flex:1;position:relative;height:32px;background:#1A1A30;border-radius:4px;overflow:hidden;"><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.65rem;color:#E74C3C;font-weight:600;">휴무</div></div><span data-action="toggleOff" data-oid="'+o.id+'" style="font-size:.65rem;padding:4px 7px;border-radius:5px;background:#333;color:#9090A8;cursor:pointer;font-weight:700;">해제</span></div>';}
function sectWrap(items,fn){if(!items.length)return'';let h='<div style="margin-top:5px;padding-top:5px;border-top:1px solid #2E2E5240;">';items.forEach(i=>{h+=fn(i);});return h+'</div>';}
// === briefing ===
function rBrief(){
  const p=$('briefing');if(!p)return;const d=dk(S.date),ek=Object.keys(S.emp);
  let wC=0,tH=0,tCo=0,fC=0,vC=0,eC=0;const oN=[];
  ek.forEach(id=>{if(isOff(id,d)){oN.push(S.emp[id]?.name||id);return;}const s=S.sc[id];if(s&&s.start){wC++;const h=cH(s.start,s.end);tH+=h;tCo+=h*(S.emp[id]?.hourlyRate||0);const fx=gFixC(S.emp[id]?.name);fx&&fx.type==='fixed'&&s.start===fx.start&&s.end===fx.end?fC++:vC++;}else eC++;});
  let h='<div style="display:flex;gap:6px;margin-bottom:6px;">';
  const bx=(v,c,l)=>'<div style="flex:1;background:#242444;border-radius:8px;padding:6px 8px;text-align:center;"><div style="font-size:'+(l==='인건비'?'.85':'1.1')+'rem;font-weight:800;color:'+c+';">'+v+'</div><div style="font-size:.55rem;color:#9090A8;">'+l+'</div></div>';
  h+=bx(wC+'<span style="font-size:.6rem;color:#707088;">/'+ek.length+'</span>','#FFF','출근');
  h+=bx(tH.toFixed(1).replace('.0','')+'<span style="font-size:.6rem;color:#707088;">h</span>','#FFD700','총시간');
  h+=bx(tCo>0?(tCo/10000).toFixed(1)+'만':'-','#E0E0EC','인건비');
  h+=bx(oN.length,'#E74C3C','휴무')+'</div>';
  h+='<div style="display:flex;flex-wrap:wrap;gap:6px;font-size:.65rem;">';
  if(isH(S.date))h+='<span style="color:#E74C3C;font-weight:700;border:1px solid #E74C3C;border-radius:3px;padding:0 3px;">'+(hNm(S.date)||'공휴일')+'</span>';
  h+='<span style="color:'+CK+';">고정'+fC+'</span>';if(vC)h+='<span style="color:#E67E22;">수동'+vC+'</span>';if(eC)h+='<span style="color:#E74C3C;font-weight:700;">미입력'+eC+'</span>';if(oN.length)h+='<span style="color:#E74C3C;">휴:'+oN.map(esc).join(',')+'</span>';
  p.innerHTML=h+'</div>';
}
// === timebar ===
function rTimebar(){
  const con=$('tbCon');if(!con)return;const d=dk(S.date),{w,off,mt,tH,cc,uc,woC}=catE(d);
  const _g=gRange(w),bS=_g.gs,bH=_g.gh;
  function tP(t){let[h,m]=t.split(':').map(Number);if(h<DSH)h+=24;return Math.max(0,Math.min(100,((h-bS)+m/60)/bH*100));}
  const now=new Date(),nP=tP(pad(now.getHours())+':'+pad(now.getMinutes())),isT=dk(new Date())===d;
  let h='<div style="padding:5px 6px 0;">'+progBar(cc,uc,mt.length,w.length,off.length,tH);
  if(uc)h+='<span data-action="confirmAll" style="color:'+CK+';cursor:pointer;font-weight:700;margin-left:4px;font-size:.7rem;padding:2px 8px;background:'+CK+'33;border-radius:4px;">전체확정</span>';
  else if(w.length)h+='<span style="color:'+CK+';font-weight:700;margin-left:4px;font-size:.65rem;">확정됨</span>';
  h+='</div></div>';
  // time header
  h+='<div style="display:flex;align-items:center;margin-bottom:2px;"><div style="min-width:58px;"></div><div style="flex:1;position:relative;height:16px;">';
  const ls=bH<=8?1:bH<=14?2:3;
  for(let i=bS;i<=bS+bH;i+=ls){const rh=i>=24?i-24:i;h+='<span style="position:absolute;left:'+((i-bS)/bH*100)+'%;font-size:.55rem;color:#707088;transform:translateX(-50%);">'+rh+'</span>';}
  h+='</div><div style="min-width:36px;"></div></div>';
  // workers
  w.forEach(x=>{
    const roles=x.shift.role?x.shift.role.split(',').filter(Boolean):[],pr=roles[0]||'주방',rc=RC[pr]||'#9090A8';
    const isCf=x.status==='confirmed',wO=woC[x.id]||0,at=S.att[x.id],hasA=at&&at.actual_start;
    const L=tP(x.shift.start);let R=tP(x.shift.end),W=R-L;if(W<=0)W+=100;W=Math.min(W,100-L);const isN=W<30;
    h+='<div data-empid="'+x.id+'" style="opacity:'+(isCf?'1':'.6')+';"><div style="display:flex;align-items:center;padding:2px 6px;cursor:pointer;">';
    h+='<div style="min-width:58px;font-size:.85rem;font-weight:700;color:'+(isCf?rc:rc+'bb')+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(x.emp.name)+(wO?'<span style="font-size:.6rem;color:'+CO+';">('+wO+')</span>':'')+'</div>';
    h+='<div style="flex:1;position:relative;height:32px;background:#1A1A30;border-radius:4px;overflow:hidden;">';
    if(isT)h+='<div style="position:absolute;left:'+nP+'%;top:0;bottom:0;width:1px;background:#FFD70066;z-index:3;"></div>';
    h+='<div style="position:absolute;left:'+L+'%;width:'+W+'%;top:1px;bottom:1px;background:'+(hasA?rc+'18':isCf?rc+'40':rc+'18')+';border-left:3px solid '+(hasA?rc+'55':isCf?rc:rc+'88')+';border-radius:3px;'+(hasA?'border:1.5px dashed '+rc+'55;':isCf?'':'border:1px dashed '+rc+'66;')+'z-index:1;"></div>';
    if(hasA){const aL=tP(at.actual_start),aR=at.actual_end?tP(at.actual_end):aL,aW=Math.max(aR-aL,1),sc=ASC[at.actual_start_source||at.actual_end_source||'']||'#888';
      h+='<div style="position:absolute;left:'+aL+'%;width:'+aW+'%;top:5px;bottom:5px;background:'+sc+'40;border-left:3px solid '+sc+';border-radius:2px;z-index:2;"></div>';
      const sM=pTM(x.shift.start),aM=pTM(at.actual_start);if(sM!==null&&aM!==null){let df=aM-sM;if(df>720)df-=1440;if(df<-720)df+=1440;const ab=Math.abs(df);if(ab>=10)h+='<span style="position:absolute;right:2px;top:50%;transform:translateY(-50%);font-size:.45rem;color:'+(ab>=180?'#FF4444':ab>=60?'#E67E22':'#888')+';font-weight:700;z-index:3;">'+(df>0?ab+'분늦음':ab+'분일찍')+'</span>';}}
    const tL=isN?L+W+1:L,tW=isN?100-L-W-1:W;
    h+='<div style="position:absolute;left:'+tL+'%;width:'+tW+'%;top:1px;bottom:1px;display:flex;align-items:center;padding:0 4px;gap:3px;overflow:hidden;">';
    const sS=x.shift.start.split(':')[0].replace(/^0/,''),eS=x.shift.end.split(':')[0].replace(/^0/,'');
    h+='<span style="font-size:.65rem;color:#E0E0EC;font-weight:600;white-space:nowrap;">'+(isN?sS+'-'+eS:x.shift.start.replace(/^0/,'')+'-'+x.shift.end.replace(/^0/,''))+'</span>';
    if(!isN&&roles.length)h+='<span style="font-size:.55rem;white-space:nowrap;">'+roles.map(r=>'<span style="color:'+(RC[r]||'#fff')+';">'+(RL[r]||r)+'</span>').join(' ')+'</span>';
    h+='<span style="font-size:.55rem;color:#9090A8;">('+x.hours+'h)</span></div></div>'+stBtn(x.id,isCf)+'</div>'+attRow(x.id,x.shift)+'</div>';
  });
  h+=sectWrap(mt,e=>emptyRow(e,isT,nP));
  h+=sectWrap(off,o=>offRow(o,woC));
  con.innerHTML=h+'</div>';
}
// === list view ===
function rList(){
  const con=$('lsCon');if(!con)return;const d=dk(S.date),m=S.date.getMonth()+1,dd=S.date.getDate(),dow=DOW_KR[S.date.getDay()];
  const cf=!!S.cf[d],{w,off,mt,tH,cc,uc,woC,whM}=catE(d);
  const allCf=w.length>0&&uc===0,anyCf=cf||allCf,_g=gRange(w),GS=_g.gs,GR=_g.gh;
  let h='<div style="padding:6px 8px;'+(allCf?'border:2px solid '+CK+';border-radius:12px;':'')+'">';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;padding-bottom:5px;'+(anyCf?'border-bottom:2px solid '+CK+';':'border-bottom:1px solid #2E2E52;')+'">';
  h+='<span style="font-size:1rem;font-weight:800;color:'+(anyCf?CK:'#FFF')+';">'+m+'/'+dd+' '+dow+(anyCf?' <span style="font-size:.6rem;color:'+CK+';">확정</span>':'')+'</span>';
  if(uc)h+='<span data-action="confirmAll" style="font-size:.75rem;padding:5px 12px;border-radius:6px;background:'+CK+'44;color:'+CK+';cursor:pointer;font-weight:700;border:1px solid '+CK+'66;">전체확정</span>';
  else if(w.length)h+='<span style="font-size:.7rem;padding:4px 10px;border-radius:6px;background:'+CK+'22;color:'+CK+';font-weight:700;">확정됨</span>';
  h+='</div>'+progBar(cc,uc,mt.length,w.length,off.length,tH)+'</div></div>';
  w.forEach(x=>{
    const roles=x.shift.role?x.shift.role.split(',').filter(Boolean):[];
    let sH=parseInt(x.shift.start),sM=parseInt(x.shift.start.split(':')[1]||0),eH=parseInt(x.shift.end),eM=parseInt(x.shift.end.split(':')[1]||0);
    if(sH<DSH)sH+=24;if(eH<DSH)eH+=24;if(eH<=sH)eH+=24;
    const sP=Math.max(0,((sH+sM/60)-GS)/GR*100),wP=Math.max(1,Math.min(100,((eH+eM/60)-GS)/GR*100)-sP);
    const isCf=x.status==='confirmed',sc=isCf?CK:CD,_lRC=RC[roles[0]||'주방']||sc,wO=woC[x.id]||0,wH=whM[x.id]||0;
    h+='<div style="margin-bottom:2px;padding:4px 6px;background:'+(isCf?CK+'10':CD+'08')+';border-left:3px solid '+_lRC+';border-radius:6px;cursor:pointer;" data-empid="'+x.id+'">';
    h+='<div style="display:flex;align-items:center;gap:4px;">';
    const wHL=wH>0?'<span style="font-size:.5rem;color:'+(wH>40?'#E74C3C':'#9090A8')+';font-weight:600;">[주'+Math.round(wH)+'h]</span>':'';
    h+='<span style="font-size:.8rem;font-weight:800;color:'+_lRC+';min-width:38px;">'+esc(x.emp.name)+(wO?'<span style="font-size:.55rem;color:'+CO+';font-weight:600;">('+wO+')</span>':'')+wHL+'</span>';
    h+='<div style="position:relative;flex:1;height:18px;background:#1A1A30;border-radius:3px;overflow:hidden;"><div style="position:absolute;left:'+sP+'%;width:'+wP+'%;top:1px;bottom:1px;background:'+sc+'40;border-radius:2px;border-left:2px solid '+sc+';"></div>';
    h+='<span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:.55rem;color:#E0E0EC;font-weight:600;white-space:nowrap;text-shadow:0 0 3px #000;">'+x.shift.start.replace(/^0/,'')+'-'+x.shift.end.replace(/^0/,'')+' ('+x.hours+'h)</span></div>';
    h+=stBtn(x.id,isCf,'.55')+'</div>'+attRow(x.id,x.shift)+'</div>';
  });
  if(mt.length){h+='<div style="margin-top:4px;padding-top:4px;border-top:1px solid #2E2E5240;"><div style="font-size:.6rem;color:'+CD+';font-weight:700;margin-bottom:3px;padding-left:4px;border-left:2px solid '+CD+';">미입력 ('+mt.length+'명)</div>';
    mt.forEach(e=>{h+='<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;margin-bottom:2px;background:#1A1A30;border-radius:6px;border-left:3px solid #707088;cursor:pointer;" data-empid="'+e.id+'"><span style="font-size:.85rem;font-weight:800;color:#707088;min-width:44px;">'+esc(e.emp.name)+'</span><span style="font-size:.7rem;color:#707088;">미입력</span><span style="margin-left:auto;"><span data-action="confirmOff" data-oid="'+e.id+'" style="font-size:.55rem;padding:2px 6px;border-radius:3px;background:#E74C3C33;color:#E74C3C;cursor:pointer;font-weight:700;">휴확</span></span></div>';});h+='</div>';}
  if(off.length){h+='<div style="margin-top:4px;padding-top:4px;border-top:1px solid #2E2E5240;"><div style="font-size:.6rem;color:#E74C3C;font-weight:700;margin-bottom:3px;padding-left:4px;border-left:2px solid #E74C3C;">휴무 ('+off.length+'명)</div>';
    off.forEach(o=>{const oO=woC[o.id]||0;h+='<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;margin-bottom:2px;background:#E74C3C08;border-radius:6px;border-left:3px solid #E74C3C;cursor:pointer;" data-empid="'+o.id+'"><span style="font-size:.8rem;font-weight:800;color:#E74C3C;">'+esc(o.emp.name)+(oO?'<span style="font-size:.55rem;color:'+CO+';font-weight:600;">('+oO+')</span>':'')+'</span><span style="font-size:.65rem;color:#E74C3C;">휴무</span><span data-action="toggleOff" data-oid="'+o.id+'" style="margin-left:auto;font-size:.55rem;padding:2px 6px;border-radius:3px;background:#333;color:#9090A8;cursor:pointer;font-weight:700;">해제</span></div>';});h+='</div>';}
  con.innerHTML=h+'</div>';
}
// === week / datestrip ===
function renderWeek(){
  if(!S.loaded)return;const mn=getMon(S.date),ek=Object.keys(S.emp);$('weekGrid').innerHTML='';
  const dO={};ek.forEach(id=>{dO[id]=0;});
  for(let i=0;i<7;i++){const d=new Date(mn);d.setDate(d.getDate()+i);const k=dk(d),sc=S.wsc[k]||{};ek.forEach(e=>{if(!sc[e]||!sc[e].start)dO[e]++;});}
  $('weekOffs').innerHTML='';ek.forEach(e=>{const emp=S.emp[e];if(!emp)return;const oc=dO[e];if(!oc)return;const c=document.createElement('div');c.className='off-chip';c.innerHTML='<span style="color:'+CD+';">'+esc(emp.name)+' <span style="color:'+CO+';">휴'+oc+'</span></span>';$('weekOffs').appendChild(c);});
}
function renderDS(){
  const con=$('dateStrip');if(!con)return;const today=new Date();today.setHours(0,0,0,0);const ek=Object.keys(S.emp),selDk=dk(S.date),mn=getMon(S.date);
  let h='';['월','화','수','목','금','토','일'].forEach(d=>{h+='<div class="date-strip-hdr" style="position:sticky;top:0;background:#1A1A30;z-index:1;">'+d+'</div>';});
  for(let i=-7;i<56;i++){const d=new Date(mn);d.setDate(d.getDate()+i);const k=dk(d),dw=d.getDay(),isT=sameD(d,today),isSel=k===selDk,isP=d<today;
    let cC=0,aC=0;const sc=k===selDk?S.sc:(S.wsc[k]||{});if(sc)ek.forEach(e=>{if(sc[e]&&sc[e].start){aC++;if(gSt(k,e)==='confirmed')cC++;}});
    let bC='#2E2E52';if(aC){bC=cC===aC?CK:cC?CK+'88':CD;}
    h+='<div class="date-strip-item'+(isP?' ds-past':'')+(isT?' ds-today':'')+(isSel?' ds-selected':'')+'" data-dk="'+k+'" style="'+(isSel?'':'border-color:'+bC+';')+'">';
    if(isT)h+='<div style="font-size:.4rem;color:#2ECC71;font-weight:700;line-height:1;">오늘</div>';
    h+='<div class="ds-date'+((dw===0||isH(d))?' sun':dw===6?' sat':'')+'">'+d.getDate()+'</div>';
    if(aC)h+='<div class="ds-count" style="color:'+(cC===aC?CK:CD)+';">'+aC+'명</div>';h+='</div>';}
  con.innerHTML=h;con.querySelectorAll('.date-strip-item').forEach(el=>{el.addEventListener('click',()=>{const p=el.dataset.dk.split('-');S.date=new Date(+p[0],+p[1]-1,+p[2]);onDC();});});
  const se=con.querySelector('[data-dk="'+selDk+'"]');if(se)setTimeout(()=>se.scrollIntoView({block:'center',behavior:'auto'}),10);
}
function rTab(){S.tab==='list'?rList():rTimebar();}
// === actions ===
function sSt(d,e,st){const k=d+'_'+e;st==='auto'?delete S.sst[k]:S.sst[k]=st;fbP(FW+'/shift_status/'+d+'/'+e,st==='auto'?false:st);renderAll();}
function cfAll(){const d=dk(S.date),b={};Object.keys(S.emp).forEach(id=>{if(S.sc[id]&&S.sc[id].start&&!isOff(id,d)){S.sst[d+'_'+id]='confirmed';b[id]='confirmed';}else if(!S.sc[id]||!S.sc[id].start){if(!isOff(id,d)){if(!S.dof[id])S.dof[id]={};S.dof[id][d]=true;fbP(FW+'/dayoffs/'+id+'/'+d,true);}}});fbP(FW+'/shift_status/'+d,b);S.cf[d]=true;fbP(FW+'/confirmed/'+d,true);renderAll();}
function togOff(eid){const d=dk(S.date);if(!S.dof[eid])S.dof[eid]={};if(S.dof[eid][d]===true){S.dof[eid][d]=false;if(S.sc[eid]&&S.sc[eid].dayoff)delete S.sc[eid];const n=S.emp[eid]?.name||'',fx=gFix(n,S.date);if(fx&&fx.type==='fixed'&&fx.start){S.sc[eid]={start:fx.start,end:fx.end,role:fx.role};fbP(FW+'/schedules/'+d+'/'+eid,S.sc[eid]);sSt(d,eid,'confirmed');}toast('휴무 해제');}else{S.dof[eid][d]=true;if(S.sc[eid]){delete S.sc[eid];fbP(FW+'/schedules/'+d+'/'+eid,false);}toast('휴무 지정');}fbP(FW+'/dayoffs/'+eid+'/'+d,S.dof[eid]?.[d]??false);renderAll();}
function cfOff(eid){const d=dk(S.date);if(!S.dof[eid])S.dof[eid]={};S.dof[eid][d]=true;if(S.sc[eid]){delete S.sc[eid];fbP(FW+'/schedules/'+d+'/'+eid,false);}fbP(FW+'/dayoffs/'+eid+'/'+d,true);toast('휴무 확정');renderAll();}
// === shift modal ===
let smE=null,smR=[],smS=null,smN=null,smEd=false;
function bTS(){
  const ss=$('selStart'),se=$('selEnd');ss.innerHTML='';se.innerHTML='';
  for(let h=DSH;h<DSH+24;h++){const r=h>=24?h-24:h;for(let m=0;m<60;m+=30){const t=pad(r)+':'+pad(m);ss.appendChild(new Option(t,t));}}
  for(let h=DSH;h<=DSH+24;h++){const r=h>=24?h-24:h;for(let m=0;m<60;m+=30){if(h===DSH&&!m)continue;if(h===DSH+24&&m)break;const t=pad(r)+':'+pad(m);se.appendChild(new Option(t,t));}}
  const tk=$('gTicks');tk.innerHTML='';for(let i=0;i<6;i++){const s=document.createElement('span');s.textContent=pad((DSH+i*4)%24);tk.appendChild(s);}
  ss.onchange=()=>{smS=ss.value;uG();};se.onchange=()=>{smN=se.value;uG();};setupGauge();
}
function sS(t){smS=t;$('selStart').value=t;uG();}
function sE(t){smN=t;$('selEnd').value=t;uG();}
function uG(){const f=$('gFill'),l=$('gLabels');if(!smS||!smN){f.style.display='none';l.textContent='';return;}f.style.display='';const L=tPct(smS),R=tPct(smN);let w=R-L;if(w<=0)w+=100;f.style.left=L+'%';f.style.width=Math.min(w,100-L)+'%';l.textContent=smS+' ~ '+smN+' ('+cH(smS,smN)+'h)';}
function setupGauge(){const g=$('gauge');let dr=null;function xT(x){const r=g.getBoundingClientRect(),p=Math.max(0,Math.min(1,(x-r.left)/r.width)),tm=p*TLM;let h=Math.floor(tm/60)+DSH;if(h>=24)h-=24;let m=Math.round((tm%60)/30)*30;if(m>=60){m=0;h=(h+1)%24;}return pad(h)+':'+pad(m);}
  g.addEventListener('touchstart',e=>{const t=xT(e.touches[0].clientX);if(!smS)dr='start';else{const tM=tm12(t),sM=smS?tm12(smS):0,eM=smN?tm12(smN):TLM;dr=Math.abs(tM-sM)<Math.abs(tM-eM)?'start':'end';}dr==='start'?sS(xT(e.touches[0].clientX)):sE(xT(e.touches[0].clientX));},{passive:true});
  g.addEventListener('touchmove',e=>{if(dr)dr==='start'?sS(xT(e.touches[0].clientX)):sE(xT(e.touches[0].clientX));},{passive:true});
  g.addEventListener('touchend',()=>{dr=null;});
}
function bChips(){const c=$('shiftChips');c.innerHTML='';Object.keys(S.emp).forEach(eid=>{const emp=S.emp[eid],ch=document.createElement('div');ch.className='emp-chip';if(eid===smE)ch.classList.add('selected');ch.innerHTML='<div class="chip-dot" style="background:'+(emp.color||'#9090A8')+'"></div>'+esc(emp.name);ch.addEventListener('click',()=>{smE=eid;c.querySelectorAll('.emp-chip').forEach(x=>x.classList.remove('selected'));ch.classList.add('selected');const ex=S.sc[eid];if(ex&&ex.start){sS(ex.start);sE(ex.end);smR=ex.role?ex.role.split(',').filter(Boolean):[];uRP();$('shiftDel').style.display='';smEd=true;}else{$('shiftDel').style.display='none';smEd=false;}});c.appendChild(ch);});}
function uRP(){document.querySelectorAll('#rolePills .role-pill').forEach(p=>{p.classList.toggle('selected',smR.includes(p.dataset.role));});}
function openSh(eid){smE=eid||null;smR=[];smS=null;smN=null;smEd=false;bChips();
  if(eid&&S.sc[eid]&&S.sc[eid].start){const sh=S.sc[eid];smR=sh.role?sh.role.split(',').filter(Boolean):[];smEd=true;sS(sh.start);sE(sh.end);$('shiftDel').style.display='';}
  else{$('selStart').selectedIndex=0;$('selEnd').selectedIndex=0;uG();$('shiftDel').style.display='none';}
  uRP();const m=S.date.getMonth()+1,dd=S.date.getDate();$('shiftTitle').textContent='근무 '+(smEd?'수정':'추가')+' - '+m+'/'+dd+' ('+DOW_KR[S.date.getDay()]+')';
  $('shiftFixed').style.display=eid?'':'none';$('shiftDayoff').style.display=eid?'':'none';
  const io=eid&&isOff(eid,dk(S.date));$('shiftDayoff').textContent=io?'휴무해제':'휴무지정';
  if(io){$('shiftDayoff').classList.remove('btn-danger');$('shiftDayoff').style.cssText='background:#333;color:#9090A8;font-size:.7rem;';}else{$('shiftDayoff').classList.add('btn-danger');$('shiftDayoff').style.cssText='font-size:.7rem;';}
  openM($('shiftModal'));
}
document.querySelectorAll('#rolePills .role-pill').forEach(p=>{p.addEventListener('click',()=>{const r=p.dataset.role,i=smR.indexOf(r);i>=0?smR.splice(i,1):smR.push(r);uRP();});});
document.querySelectorAll('#presets .preset-btn').forEach(b=>{b.addEventListener('click',()=>{sS(b.dataset.s);sE(b.dataset.e);});});
$('shiftSave').addEventListener('click',async()=>{if(!smE){toast('직원을 선택해주세요');return;}if(!smS||!smN){toast('시간을 선택해주세요');return;}const d=dk(S.date),data={start:smS,end:smN,role:smR.join(',')};closeM($('shiftModal'));S.sc[smE]=data;sSt(d,smE,'confirmed');renderAll();if(await fbP(FW+'/schedules/'+d+'/'+smE,data)){toast('저장 확정');loadWk();}else toast('저장 실패');});
$('shiftDel').addEventListener('click',async()=>{if(!smE)return;const d=dk(S.date);closeM($('shiftModal'));delete S.sc[smE];renderAll();if(await fbP(FW+'/schedules/'+d+'/'+smE,false)){toast('삭제됨');loadWk();}});
$('shiftFixed').addEventListener('click',async()=>{if(!smE||!smS||!smN){toast('시간을 선택해주세요');return;}const n=S.emp[smE]?.name;if(!n){toast('직원 오류');return;}S.fix[n]={start:smS,end:smN,role:smR.join(','),type:'fixed'};fbP(FW+'/fixed_schedules/'+encodeURIComponent(n),S.fix[n]);const d=dk(S.date),data={start:smS,end:smN,role:smR.join(',')};S.sc[smE]=data;sSt(d,smE,'confirmed');closeM($('shiftModal'));await fbP(FW+'/schedules/'+d+'/'+smE,data);toast(n+' 고정값 변경됨');renderAll();loadWk();});
$('shiftDayoff').addEventListener('click',()=>{if(!smE)return;const d=dk(S.date),io=isOff(smE,d);
  if(io){if(!S.dof[smE])S.dof[smE]={};S.dof[smE][d]=false;fbP(FW+'/dayoffs/'+smE+'/'+d,false);if(S.sc[smE]&&S.sc[smE].dayoff)delete S.sc[smE];const n=S.emp[smE]?.name||'',fx=gFix(n,S.date);if(fx&&fx.type==='fixed'&&fx.start){S.sc[smE]={start:fx.start,end:fx.end,role:fx.role};fbP(FW+'/schedules/'+d+'/'+smE,S.sc[smE]);sSt(d,smE,'confirmed');}closeM($('shiftModal'));toast('휴무 해제');}
  else{if(!S.dof[smE])S.dof[smE]={};S.dof[smE][d]=true;if(S.sc[smE]){delete S.sc[smE];fbP(FW+'/schedules/'+d+'/'+smE,false);}fbP(FW+'/dayoffs/'+smE+'/'+d,true);closeM($('shiftModal'));toast('휴무 지정');}renderAll();});
$('shiftCancel').addEventListener('click',()=>closeM($('shiftModal')));$('shiftClose').addEventListener('click',()=>closeM($('shiftModal')));
// === employee management ===
$('empMgrBtn').addEventListener('click',()=>{rEL();openM($('empModal'));});$('empClose').addEventListener('click',()=>closeM($('empModal')));
function rEL(){const l=$('empList');l.innerHTML='';const ek=Object.keys(S.emp);if(!ek.length){l.innerHTML='<div style="padding:20px;text-align:center;color:#9090A8;">직원 없음</div>';return;}
  ek.forEach(id=>{const e=S.emp[id],it=document.createElement('div');it.className='emp-list-item';it.innerHTML='<div class="emp-dot" style="background:'+(e.color||'#9090A8')+'"></div><div class="emp-info"><div class="name">'+esc(e.name)+'</div><div class="detail">'+esc(e.phone||'-')+' | '+esc(e.role||'미지정')+' | '+(e.hourlyRate?e.hourlyRate.toLocaleString()+'원':'-')+'</div></div><div style="display:flex;gap:6px;"><button class="btn btn-sm" data-edit="'+id+'">수정</button><button class="btn btn-sm btn-danger" data-del="'+id+'">삭제</button></div>';l.appendChild(it);});
  l.querySelectorAll('[data-edit]').forEach(b=>{b.addEventListener('click',()=>oEE(b.dataset.edit));});
  l.querySelectorAll('[data-del]').forEach(b=>{b.addEventListener('click',async()=>{if(!confirm((S.emp[b.dataset.del]?.name||'')+' 삭제?'))return;if(await fbP(FW+'/employees/'+b.dataset.del,null)){delete S.emp[b.dataset.del];rEL();renderAll();toast('삭제됨');}});});}
let eEid=null,selC=COLORS[0];
function bCP(){const cp=$('colorPicker');cp.innerHTML='';COLORS.forEach(c=>{const sw=document.createElement('div');sw.className='color-swatch'+(c===selC?' selected':'');sw.style.background=c;sw.addEventListener('click',()=>{selC=c;cp.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('selected'));sw.classList.add('selected');});cp.appendChild(sw);});}
function oEE(id){eEid=id;if(id&&S.emp[id]){const e=S.emp[id];$('empEditTitle').textContent='직원 수정';$('empName').value=e.name||'';$('empPhone').value=e.phone||'';$('empRole').value=e.role||'';$('empRate').value=e.hourlyRate||0;selC=e.color||COLORS[0];}else{eEid=null;$('empEditTitle').textContent='직원 추가';$('empName').value='';$('empPhone').value='';$('empRole').value='';$('empRate').value=0;selC=COLORS[0];}bCP();openM($('empEditModal'));}
$('addEmpBtn').addEventListener('click',()=>oEE(null));$('empEditClose').addEventListener('click',()=>closeM($('empEditModal')));$('empEditCancel').addEventListener('click',()=>closeM($('empEditModal')));
$('empEditSave').addEventListener('click',async()=>{const n=$('empName').value.trim();if(!n){toast('이름을 입력해주세요');return;}let id=eEid||'emp'+Date.now();const d={name:n,phone:$('empPhone').value.trim(),color:selC,role:$('empRole').value,hourlyRate:parseInt($('empRate').value)||0};closeM($('empEditModal'));S.emp[id]=d;rEL();renderAll();if(await fbP(FW+'/employees/'+id,d))toast('저장됨');else toast('저장 실패');});
// === dayoff modal ===
const doMod=$('dayoffModal');
function rDL(){const list=$('doList'),sel=$('doEmpSel');sel.innerHTML='';for(const e in S.emp)sel.appendChild(new Option(S.emp[e].name,e));$('doDate').value=dk(S.date);
  const all=[];for(const e in S.dof)for(const k in S.dof[e])if(S.dof[e][k])all.push({e,d:k});all.sort((a,b)=>a.d.localeCompare(b.d));
  if(!all.length){list.innerHTML='<div style="color:#707088;font-size:.8rem;padding:8px;">등록된 휴무 없음</div>';return;}
  let h='',last='';for(const x of all){if(x.d!==last){const d=new Date(x.d);h+='<div style="font-size:.75rem;color:#9090A8;margin-top:8px;margin-bottom:2px;">'+x.d+' ('+DOW_KR[d.getDay()]+')</div>';last=x.d;}
    const emp=S.emp[x.e];h+='<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:#1A1A30;border-radius:6px;margin-bottom:3px;"><span style="width:8px;height:8px;border-radius:50%;background:'+(emp?emp.color:'#9090A8')+';flex-shrink:0;"></span><span style="flex:1;font-size:.85rem;">'+(emp?esc(emp.name):esc(x.e))+'</span><button class="btn btn-sm" style="min-width:30px;min-height:26px;padding:2px 6px;font-size:.7rem;color:#E74C3C;border-color:#E74C3C55;" data-dodel="'+x.e+'|'+x.d+'">✕</button></div>';}
  list.innerHTML=h;list.querySelectorAll('[data-dodel]').forEach(b=>{b.addEventListener('click',async()=>{const[e,k]=b.dataset.dodel.split('|');if(S.dof[e])S.dof[e][k]=false;fbP(FW+'/dayoffs/'+e+'/'+k,false);if(k===dk(S.date))renderAll();rDL();});});}
function pBulk(text){const res=[],lines=text.split('\n').map(l=>l.trim()).filter(Boolean),yr=new Date().getFullYear(),dwM={'일':0,'월':1,'화':2,'수':3,'목':4,'금':5,'토':6};
  for(const line of lines){let mE=null,rest=line;for(const e in S.emp){const n=S.emp[e].name;if(line.startsWith(n)){mE=e;rest=line.slice(n.length).trim();break;}}if(!mE)continue;
    const dp=rest.match(/^([일월화수목금토])([,\s]+[일월화수목금토])*/);if(dp){const dws=rest.match(/[일월화수목금토]/g);if(dws){const m=getMon(new Date());dws.forEach(d=>{const t=dwM[d];if(t!==undefined){const dt=new Date(m);dt.setDate(dt.getDate()+(t===0?6:t-1));res.push({e:mE,d:dk(dt)});}});}continue;}
    const rM=rest.match(/(\d{1,2})[\/\-](\d{1,2})\s*[~\-]\s*(\d{1,2})[\/\-](\d{1,2})/);if(rM){let[,m1,d1,m2,d2]=rM.map(Number);const s=new Date(yr,m1-1,d1),e=new Date(yr,m2-1,d2);for(let d=new Date(s);d<=e;d.setDate(d.getDate()+1))res.push({e:mE,d:dk(d)});continue;}
    const iM=rest.match(/(\d{4})-(\d{1,2})-(\d{1,2})/g);if(iM){iM.forEach(ds=>{const[y,m,d]=ds.split('-').map(Number);res.push({e:mE,d:y+'-'+pad(m)+'-'+pad(d)});});continue;}
    const sD=rest.match(/(\d{1,2})[\/](\d{1,2})/g);if(sD){sD.forEach(ds=>{const[m,d]=ds.split('/').map(Number);res.push({e:mE,d:yr+'-'+pad(m)+'-'+pad(d)});});}}return res;}
$('dayoffMgrBtn').addEventListener('click',()=>{rDL();openM(doMod);});$('dayoffClose').addEventListener('click',()=>closeM(doMod));doMod.addEventListener('click',e=>{if(e.target===doMod)closeM(doMod);});
$('doAddBtn').addEventListener('click',async()=>{const e=$('doEmpSel').value,d=$('doDate').value;if(!e||!d)return;if(!S.dof[e])S.dof[e]={};S.dof[e][d]=true;fbP(FW+'/dayoffs/'+e+'/'+d,true);if(d===dk(S.date))renderAll();toast((S.emp[e]?.name||'')+' '+d+' 휴무 등록');rDL();});
$('doBulkBtn').addEventListener('click',async()=>{const t=$('doBulk').value.trim();if(!t)return;const entries=pBulk(t);if(!entries.length){toast('인식된 휴무 없음');return;}for(const x of entries){if(!S.dof[x.e])S.dof[x.e]={};S.dof[x.e][x.d]=true;await fbP(FW+'/dayoffs/'+x.e+'/'+x.d,true);}$('doBulk').value='';toast(entries.length+'건 등록');rDL();if(entries.some(x=>x.d===dk(S.date)))renderAll();});
// === nav ===
$('prevD').addEventListener('click',()=>{S.date.setDate(S.date.getDate()-1);onDC();});$('nextD').addEventListener('click',()=>{S.date.setDate(S.date.getDate()+1);onDC();});
$('prevW').addEventListener('click',()=>{S.date.setDate(S.date.getDate()-7);onDC();});$('nextW').addEventListener('click',()=>{S.date.setDate(S.date.getDate()+7);onDC();});
$('dateDisp').addEventListener('click',()=>openDP());
function showFlash(){const m=S.date.getMonth()+1,d=S.date.getDate();let el=document.getElementById('dateFlash');if(!el){el=document.createElement('div');el.id='dateFlash';el.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:2.5rem;font-weight:900;color:#fff;opacity:0;pointer-events:none;z-index:999;text-shadow:0 2px 12px #000a;transition:opacity .15s;';document.body.appendChild(el);}el.textContent=m+'/'+d+' '+DOW_KR[S.date.getDay()];el.style.opacity='.35';clearTimeout(el._t);el._t=setTimeout(()=>{el.style.opacity='0';},600);}
let _dc=0;
async function onDC(){const my=++_dc;showFlash();updD();if(S.sseS){try{S.sseS.close();}catch(e){}}conSS(S.gen);const d=dk(S.date);S.sc={};S.att={};genDO();autoFix(d);rTab();if(my!==_dc)return;
  try{const[scD,stD,cfD,atD]=await Promise.all([fbG(FW+'/schedules/'+d),fbG(FW+'/shift_status/'+d),fbG(FW+'/confirmed/'+d),fbG(FB+'/packhelper/storebot_attendance/'+d)]);if(my!==_dc)return;
    if(scD){S.sc=scD;}if(stD)Object.keys(stD).forEach(e=>{stD[e]?S.sst[d+'_'+e]=stD[e]:delete S.sst[d+'_'+e];});
    if(cfD!==undefined&&cfD!==null)S.cf[d]=!!cfD;else delete S.cf[d];S.att=atD||{};autoFix(d);rTab();}catch(e){console.error('onDC',e);}if(my!==_dc)return;loadWk();}
function openDP(){const ov=$('dpOverlay'),list=$('dpList');const today=new Date();today.setHours(0,0,0,0);const selDk=dk(S.date),tDk=dk(today),ek=Object.keys(S.emp);
  let h='<div class="dp-jump"><button data-action="jumpDate" data-days="-7">◀ 1주</button><button data-action="jumpDate" data-days="0">오늘</button><button data-action="jumpDate" data-days="7">1주 ▶</button></div>';
  for(let i=0;i<30;i++){const d=new Date(today);d.setDate(d.getDate()+i);const k=dk(d),dow=DOW_KR[d.getDay()],isT=k===tDk,isSel=k===selDk,m=d.getMonth()+1,dd=d.getDate();
    let wC=0,oC=0;ek.forEach(id=>{if(isOff(id,k))oC++;else{const s=S.wsc[k]?.[id]||(k===dk(S.date)?S.sc[id]:null);if(s&&s.start)wC++;}});
    h+='<div class="'+(isT?'dp-item today':isSel?'dp-item selected':'dp-item')+'" data-dk="'+k+'"><span class="dp-dow" style="color:'+((d.getDay()===0||isH(d))?'#E74C3C':d.getDay()===6?'#45B7D1':'#9090A8')+';">'+dow+'</span><span class="dp-date">'+m+'/'+dd+'</span><span class="dp-summary">';
    if(wC)h+='<span style="color:#2ECC71;">'+wC+'명</span> ';if(oC)h+='<span style="color:#E74C3C;">휴'+oC+'</span>';if(isT)h+=' <span style="color:#FFD700;font-weight:700;">오늘</span>';h+='</span></div>';}
  list.innerHTML=h;ov.classList.add('open');
  list.onclick=function(e){const jb=e.target.closest('[data-action="jumpDate"]');if(jb){const d=parseInt(jb.dataset.days);if(!d)S.date=new Date();else S.date.setDate(S.date.getDate()+d);ov.classList.remove('open');onDC();return;}const it=e.target.closest('.dp-item');if(it&&it.dataset.dk){const p=it.dataset.dk.split('-');S.date=new Date(+p[0],+p[1]-1,+p[2]);ov.classList.remove('open');onDC();}};
  ov.addEventListener('click',e=>{if(e.target===ov)ov.classList.remove('open');},{once:true});}
// === delegation + tabs + swipe ===
function setupDel(){function h(e){const d=dk(S.date),tg=e.target.closest('[data-action]');if(tg){e.stopPropagation();const a=tg.dataset.action;if(a==='confirmAll')cfAll();else if(a==='status')sSt(d,tg.dataset.sid,tg.dataset.st);else if(a==='toggleOff')togOff(tg.dataset.oid);else if(a==='confirmOff')cfOff(tg.dataset.oid);return;}const r=e.target.closest('[data-empid]');if(r)openSh(r.dataset.empid);}$('tbCon').addEventListener('click',h);$('lsCon').addEventListener('click',h);}
function swTab(t){S.tab=t;document.querySelectorAll('.layout-tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===t));document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));$({list:'pList',timebar:'pTimebar'}[t])?.classList.add('active');rTab();}
document.querySelectorAll('.layout-tab').forEach(t=>{t.addEventListener('click',()=>swTab(t.dataset.tab));});
let swX=0,swY=0;$('tabContent').addEventListener('touchstart',e=>{swX=e.touches[0].clientX;swY=e.touches[0].clientY;},{passive:true});
$('tabContent').addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-swX,dy=e.changedTouches[0].clientY-swY;if(Math.abs(dx)<60||Math.abs(dy)>Math.abs(dx)*0.7)return;S.date.setDate(S.date.getDate()+(dx<0?1:-1));onDC();},{passive:true});
// === share ===
$('shareBtn').addEventListener('click',()=>{const ek=Object.keys(S.emp),m=S.date.getMonth()+1,d=S.date.getDate(),dd=dk(S.date);let t='근무표 '+m+'/'+d+' ('+DOW_KR[S.date.getDay()]+')\n─────────────\n',has=false;
  ek.forEach(id=>{const e=S.emp[id];if(e.name==='이원규'||isOff(id,dd))return;const sh=S.sc[id];if(sh&&sh.start){t+=e.name+': '+sh.start+'~'+sh.end+(sh.role?' ('+sh.role+')':'')+' ['+cH(sh.start,sh.end)+'h]\n';has=true;}});
  if(!has)t+='(근무 없음)\n';if(window.NativeBridge?.shareText)window.NativeBridge.shareText(t);else if(navigator.clipboard)navigator.clipboard.writeText(t).then(()=>toast('복사됨'));else{const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();document.execCommand('copy');document.body.removeChild(a);toast('복사됨');}});
$('urlBtn').addEventListener('click',()=>{if(navigator.clipboard)navigator.clipboard.writeText(location.href).then(()=>toast('URL 복사됨'));else{const a=document.createElement('textarea');a.value=location.href;document.body.appendChild(a);a.select();document.execCommand('copy');document.body.removeChild(a);toast('URL 복사됨');}});
// === collapsible + misc ===
(function(tId,aId,bId,def){const b=$(bId),a=$(aId);if(!b||!a||!$(tId))return;if(def){b.classList.add('open');a.classList.add('open');}$(tId).addEventListener('click',()=>{const o=b.classList.toggle('open');a.classList.toggle('open',o);S.sec[bId]=o;if(o&&bId==='weekBody')renderAll(true);});})('weekToggle','weekArrow','weekBody',false);
$('refreshBtn').addEventListener('click',()=>{toast('새로고침...');location.reload();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){connectSSE();loadData();}});
[$('shiftModal'),$('empModal'),$('empEditModal')].forEach(m=>{if(m)m.addEventListener('click',e=>{if(e.target===m)closeM(m);});});
// === init ===
S.date=new Date();updD();bTS();setupDel();loadData();connectSSE();
})();
