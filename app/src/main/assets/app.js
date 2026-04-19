(function(){
'use strict';

// ============================================================
// 1. Firebase Config
// ============================================================
const FB_BASE = 'https://poskds-4ba60-default-rtdb.asia-southeast1.firebasedatabase.app';
const FB_WS = FB_BASE + '/workschedule';
const FB_EMPLOYEES = FB_WS + '/employees';
const FB_SCHEDULES = FB_WS + '/schedules';
const FB_DAYOFFS = FB_WS + '/dayoffs';
const READONLY_MODE = new URLSearchParams(location.search).get('readonly') === '1';

// ============================================================
// 2. Constants
// ============================================================
const DAY_START_HOUR = 3;
function makeHoursFrom(s){ const a=[]; for(let i=0;i<24;i++) a.push((s+i)%24); return a; }
const ALL_HOURS = makeHoursFrom(DAY_START_HOUR);
const TL_TOTAL_MINUTES = 24 * 60;
const DOW_KR = ['일','월','화','수','목','금','토'];
const DOW_MAP = {sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6};
const ROLE_COLORS = {'주방':'#E67E22','차배달':'#4ECDC4','오토바이':'#FFD700'};
const ROLE_LABELS = {'주방':'주방','차배달':'차','오토바이':'바이크'};
const C_OK = '#2ECC71';
const C_DEF = '#9090A8';
const C_OFF = '#E74C3C';
const C_BG = '#1A1A30';

// ============================================================
// 3. Default Employees (fallback)
// ============================================================
const DEFAULT_EMPLOYEES = {
  emp1: {name:'이원규', phone:'', role:'', hourlyRate:9860, maxHours:40},
  emp2: {name:'권연옥', phone:'', role:'', hourlyRate:9860, maxHours:40},
  emp3: {name:'리', phone:'', role:'', hourlyRate:9860, maxHours:40},
  emp4: {name:'히오', phone:'', role:'', hourlyRate:9860, maxHours:40},
  emp9: {name:'사아야', phone:'', role:'', hourlyRate:9860, maxHours:40}
};

// ============================================================
// 4. Holidays (compact)
// ============================================================
const KR_HOLIDAYS = new Set([
  '2026-01-01','2026-01-28','2026-01-29','2026-01-30','2026-03-01',
  '2026-05-05','2026-05-06','2026-05-24','2026-06-06','2026-08-15',
  '2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-09','2026-12-25',
  '2027-01-01','2027-02-07','2027-02-08','2027-02-09','2027-03-01',
  '2027-05-05','2027-05-13','2027-06-06','2027-08-15','2027-08-16',
  '2027-10-03','2027-10-04','2027-10-05','2027-10-06','2027-10-09','2027-12-25'
]);
const KR_HOLIDAY_NAMES = {
  '2026-01-01':'신정','2026-01-28':'설날연휴','2026-01-29':'설날','2026-01-30':'설날연휴',
  '2026-03-01':'삼일절','2026-05-05':'어린이날','2026-05-06':'대체공휴일','2026-05-24':'석가탄신일',
  '2026-06-06':'현충일','2026-08-15':'광복절','2026-09-24':'추석연휴','2026-09-25':'추석',
  '2026-09-26':'추석연휴','2026-10-03':'개천절','2026-10-09':'한글날','2026-12-25':'성탄절',
  '2027-01-01':'신정','2027-02-07':'설날연휴','2027-02-08':'설날','2027-02-09':'설날연휴',
  '2027-03-01':'삼일절','2027-05-05':'어린이날','2027-05-13':'석가탄신일','2027-06-06':'현충일',
  '2027-08-15':'광복절','2027-08-16':'대체공휴일','2027-10-03':'개천절','2027-10-04':'추석연휴',
  '2027-10-05':'추석','2027-10-06':'추석연휴','2027-10-09':'한글날','2027-12-25':'성탄절'
};
function getHolidayName(d){ const dk = typeof d==='string'?d:dateKey(d); return KR_HOLIDAY_NAMES[dk]||null; }
function isKrHoliday(d){ return KR_HOLIDAYS.has(typeof d==='string'?d:dateKey(d)); }
function isWeekend(d){ const o=typeof d==='string'?new Date(d.replace(/-/g,'/')):d; const w=o.getDay(); return w===0||w===6; }
function isWeekendOrHoliday(d){ return isWeekend(d)||isKrHoliday(d); }

// ============================================================
// 5. Global State
// ============================================================
let currentTab = 'timebar';
let currentDate = new Date();
let employees = {};
let daySchedule = {};
let weekSchedules = {};
let fixedSchedules = {};  // Firebase /workschedule/fixed_schedules
let dayoffs = {};
let confirmedDays = {};
let shiftStatus = {};
let dayAttendance = {};
let sseEmployees = null, sseSchedule = null, sseGeneration = 0;
let monthViewYear, monthViewMonth;
let dataLoaded = false;
// Collapsible section state (session only, no localStorage)
const sectionState = {};

// ============================================================
// 6. Utility
// ============================================================
function pad(n){ return n<10?'0'+n:''+n; }
function dateStr(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function dateKey(d){ return dateStr(d); }
function daysInMonth(y,m){ return new Date(y,m,0).getDate(); }
function showToast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2000); }
function openModal(el){ el.classList.add('active'); }
function closeModal(el){ el.classList.remove('active'); }
function isSameDay(a,b){ return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
function getMonday(d){ const dt=new Date(d); const day=dt.getDay(); dt.setDate(dt.getDate()+(day===0?-6:1-day)); dt.setHours(0,0,0,0); return dt; }

function timeToMinutesFrom12(ts){
  const [h,m]=ts.split(':').map(Number);
  let hr=h; if(hr<12) hr+=24;
  return (hr-12)*60+m;
}
function timeToMinutesFromDayStart(ts){
  const [h,m]=ts.split(':').map(Number);
  let hr=h; if(hr<DAY_START_HOUR) hr+=24;
  return (hr-DAY_START_HOUR)*60+m;
}
function calcHours(s,e){
  let sm=timeToMinutesFrom12(s), em=timeToMinutesFrom12(e);
  if(em<=sm) em+=24*60;
  return Math.round((em-sm)/60*10)/10;
}
function timeToPercent(ts){
  const mins=timeToMinutesFromDayStart(ts);
  return Math.max(0,Math.min(100,(mins/TL_TOTAL_MINUTES)*100));
}
function parseTimeMin(ts){
  if(!ts)return null;
  const p=ts.split(':');
  return parseInt(p[0])*60+parseInt(p[1]||0);
}

const $ = id => document.getElementById(id);
const $dateDisplay = $('dateDisplay');
const $loading = $('loadingIndicator');
const $tabContent = $('tabContent');
const $weekGrid = $('weekGrid');
const $weekOffs = $('weekOffs');
const $shiftModal = $('shiftModal');
const $monthModal = $('monthModal');
const $empModal = $('empModal');
const $empEditModal = $('empEditModal');
const $toast = $('toast');

function findEmpIdByName(name){
  for(const id in employees) if(employees[id].name===name) return id;
  return null;
}

function calcGaugeRange(working){
  if(!working||working.length===0) return {gaugeStart:DAY_START_HOUR, gaugeHours:12};
  let minH=48,maxH=0;
  working.forEach(w=>{
    let sH=parseInt(w.shift.start.split(':')[0]), eH=parseInt(w.shift.end.split(':')[0]);
    let eM=parseInt(w.shift.end.split(':')[1]||0); if(eM>0)eH++;
    if(sH<DAY_START_HOUR)sH+=24; if(eH<DAY_START_HOUR)eH+=24;
    if(eH<=sH)eH+=24;
    if(sH<minH)minH=sH; if(eH>maxH)maxH=eH;
  });
  if(dayAttendance){
    Object.values(dayAttendance).forEach(att=>{
      if(att.actual_start){let h=parseInt(att.actual_start.split(':')[0]); if(h<DAY_START_HOUR)h+=24; if(h<minH)minH=h;}
      if(att.actual_end){let h=parseInt(att.actual_end.split(':')[0]),m2=parseInt(att.actual_end.split(':')[1]||0); if(m2>0)h++; if(h<DAY_START_HOUR)h+=24; if(h>maxH)maxH=h;}
    });
  }
  const gs=minH-1, ge=maxH+1; let gh=ge-gs; if(gh<6)gh=6;
  return {gaugeStart:gs, gaugeHours:gh};
}

// ============================================================
// 7. Firebase REST
// ============================================================
async function fbGet(url){
  try{ const r=await fetch(url+'.json'); if(!r.ok)throw new Error(r.status); return await r.json(); }
  catch(e){ console.error('fbGet',url,e); return null; }
}
async function fbPut(url,data){
  if(READONLY_MODE){showToast('읽기 전용');return false;}
  try{ const r=await fetch(url+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); if(!r.ok)throw new Error(r.status); return true; }
  catch(e){ console.error('fbPut',url,e); showToast('저장 실패'); return false; }
}
async function fbPatch(url,data){
  if(READONLY_MODE){showToast('읽기 전용');return false;}
  try{ const r=await fetch(url+'.json',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); if(!r.ok)throw new Error(r.status); return true; }
  catch(e){ console.error('fbPatch',url,e); showToast('저장 실패'); return false; }
}
async function fbDelete(url){
  try{ const r=await fetch(url+'.json',{method:'DELETE'}); if(!r.ok)throw new Error(r.status); return true; }
  catch(e){ console.error('fbDelete',url,e); showToast('삭제 실패'); return false; }
}

// ============================================================
// 8. SSE
// ============================================================
function connectSSE(){
  sseGeneration++;
  const gen=sseGeneration;
  if(sseEmployees){try{sseEmployees.close();}catch(e){} sseEmployees=null;}
  try{
    sseEmployees=new EventSource(FB_EMPLOYEES+'.json');
    sseEmployees.addEventListener('put',function(e){
      if(gen!==sseGeneration){sseEmployees.close();return;}
      try{
        const d=JSON.parse(e.data);
        if(d.path==='/'){
          const raw=d.data||{};
          employees={};
          for(const id in raw) if(DEFAULT_EMPLOYEES[id]) employees[id]=raw[id];
        } else {
          const key=d.path.replace(/^\//,'');
          if(!DEFAULT_EMPLOYEES[key])return;
          if(d.data===null)delete employees[key]; else employees[key]=d.data;
        }
        renderAll();
      }catch(err){console.error('SSE emp',err);}
    });
    sseEmployees.addEventListener('patch',function(e){
      if(gen!==sseGeneration){sseEmployees.close();return;}
      try{
        const d=JSON.parse(e.data);
        const key=d.path.replace(/^\//,'');
        if(key&&d.data) employees[key]=Object.assign(employees[key]||{},d.data);
        else if(!key&&d.data) Object.assign(employees,d.data);
        renderAll();
      }catch(err){console.error('SSE emp patch',err);}
    });
    sseEmployees.onerror=function(){
      if(gen!==sseGeneration)return;
      try{sseEmployees.close();}catch(e){} sseEmployees=null;
      setTimeout(()=>{if(gen===sseGeneration)connectSSE();},3000);
    };
  }catch(e){console.error('SSE emp connect',e);}
  connectScheduleSSE(gen);
}

function connectScheduleSSE(gen){
  if(sseSchedule){try{sseSchedule.close();}catch(e){} sseSchedule=null;}
  const dk=dateKey(currentDate);
  try{
    sseSchedule=new EventSource(FB_SCHEDULES+'/'+dk+'.json');
    sseSchedule.addEventListener('put',function(e){
      if(gen!==sseGeneration){sseSchedule.close();return;}
      try{
        const d=JSON.parse(e.data);
        if(d.path==='/'){daySchedule=d.data||{};}
        else{
          const key=d.path.replace(/^\//,'').split('/')[0];
          if(d.data===null)delete daySchedule[key];
          else{
            if(d.path.split('/').filter(Boolean).length===1) daySchedule[key]=d.data;
            else{
              if(!daySchedule[key])daySchedule[key]={};
              const sub=d.path.replace(/^\//,'').split('/')[1];
              if(d.data===null)delete daySchedule[key][sub]; else daySchedule[key][sub]=d.data;
            }
          }
        }
        renderAll();
      }catch(err){console.error('SSE sched',err);}
    });
    sseSchedule.addEventListener('patch',function(e){
      if(gen!==sseGeneration){sseSchedule.close();return;}
      try{
        const d=JSON.parse(e.data);
        const parts=d.path.replace(/^\//,'').split('/').filter(Boolean);
        if(parts.length===0&&d.data) Object.keys(d.data).forEach(k=>{daySchedule[k]=Object.assign(daySchedule[k]||{},d.data[k]);});
        else if(parts.length===1&&d.data) daySchedule[parts[0]]=Object.assign(daySchedule[parts[0]]||{},d.data);
        renderAll();
      }catch(err){console.error('SSE sched patch',err);}
    });
    sseSchedule.onerror=function(){
      if(gen!==sseGeneration)return;
      try{sseSchedule.close();}catch(e){} sseSchedule=null;
      setTimeout(()=>{if(gen===sseGeneration)connectScheduleSSE(gen);},3000);
    };
  }catch(e){console.error('SSE sched connect',e);}
}

// ============================================================
// 9. getFixedScheduleForDate — Firebase data based
// ============================================================
function getFixedScheduleForDate(empName, dateObj){
  const d = typeof dateObj==='string' ? new Date(dateObj.replace(/-/g,'/')) : dateObj;
  const dow = d.getDay(); // 0=sun,1=mon,...6=sat
  const fs = fixedSchedules[empName];
  if(!fs || !fs.start) return null;

  if(fs.type === 'fixed'){
    // off array check (dow numbers)
    if(fs.off && Array.isArray(fs.off) && fs.off.includes(dow)) return null;
    return {start:fs.start, end:fs.end, role:fs.role||'', type:'fixed'};
  }
  if(fs.type === 'weekly'){
    // days array check (string day names)
    if(!fs.days || !Array.isArray(fs.days)) return null;
    const dayNames = fs.days;
    const dowStr = ['sun','mon','tue','wed','thu','fri','sat'][dow];
    if(dayNames.includes(dowStr)) return {start:fs.start, end:fs.end, role:fs.role||'', type:'fixed'};
    return null;
  }
  return null;
}

function getFixedSchedule(empName){ return getFixedScheduleForDate(empName, currentDate); }

// ============================================================
// 10. Data loading
// ============================================================
async function loadData(){
  console.log('[WS] loadData start');
  const dk = dateKey(currentDate);
  $loading.style.display = 'flex';
  $tabContent.style.display = 'none';

  try{
    const [empData, schedData, fbFixed, fbDayoffs, fbConfirmed, fbShiftSt, fbAttendance] = await Promise.all([
      fbGet(FB_EMPLOYEES),
      fbGet(FB_SCHEDULES+'/'+dk),
      fbGet(FB_WS+'/fixed_schedules'),
      fbGet(FB_DAYOFFS),
      fbGet(FB_WS+'/confirmed'),
      fbGet(FB_WS+'/shift_status/'+dk),
      fbGet(FB_BASE+'/packhelper/storebot_attendance/'+dk)
    ]);

    // Employees
    if(empData && Object.keys(empData).length > 0){
      const filtered = {};
      for(const id in empData) if(DEFAULT_EMPLOYEES[id]) filtered[id] = empData[id];
      employees = Object.keys(filtered).length > 0 ? filtered : JSON.parse(JSON.stringify(DEFAULT_EMPLOYEES));
    } else {
      employees = JSON.parse(JSON.stringify(DEFAULT_EMPLOYEES));
      fbPut(FB_EMPLOYEES, employees);
    }

    // Schedule
    if(schedData){
      const merged = {};
      for(const id in schedData) if(DEFAULT_EMPLOYEES[id]) merged[id] = schedData[id];
      daySchedule = merged;
    } else {
      daySchedule = {};
    }

    // Fixed schedules
    if(fbFixed) fixedSchedules = fbFixed;

    // Dayoffs
    if(fbDayoffs) dayoffs = fbDayoffs;

    // Confirmed
    if(fbConfirmed) confirmedDays = fbConfirmed;

    // Shift status
    if(fbShiftSt){
      Object.keys(fbShiftSt).forEach(empId => {
        const st = fbShiftSt[empId];
        if(st) shiftStatus[dk+'_'+empId] = st; else delete shiftStatus[dk+'_'+empId];
      });
    }

    // Attendance
    dayAttendance = fbAttendance || {};

  } catch(err){
    console.error('loadData error:', err);
  }

  dataLoaded = true;
  generateAutoDayoffs();
  autoApplyFixed(dk);

  $loading.style.display = 'none';
  $tabContent.style.display = '';
  renderAll();
  loadWeekSchedules();
  updateConfirmBtn();
}

async function loadWeekSchedules(){
  const monday = getMonday(currentDate);
  const schedP = [], statusP = [], keys = [];
  for(let i=0;i<7;i++){
    const d=new Date(monday); d.setDate(d.getDate()+i);
    const dk=dateKey(d); keys.push(dk);
    schedP.push(fbGet(FB_SCHEDULES+'/'+dk));
    statusP.push(fbGet(FB_WS+'/shift_status/'+dk));
  }
  const [sR,stR] = await Promise.all([Promise.all(schedP),Promise.all(statusP)]);
  weekSchedules = {};
  keys.forEach((k,i)=>{
    weekSchedules[k] = sR[i]||{};
    const fbSt = stR[i];
    if(fbSt) Object.keys(fbSt).forEach(eid=>{ if(fbSt[eid])shiftStatus[k+'_'+eid]=fbSt[eid]; else delete shiftStatus[k+'_'+eid]; });
  });
  renderWeek();
  renderDateStrip();
}

// ============================================================
// 11. autoApplyFixed, generateAutoDayoffs
// ============================================================
// autoApplyFixed — 로컬 메모리에만 fixed 병합 (Firebase 쓰기 없음)
// 원칙: fixed_schedules = 메모(SOT), schedules = 수동 예외만
// 렌더 편의상 로컬 daySchedule 에 fixed 값을 채우되 Firebase 에는 쓰지 않음
function autoApplyFixed(dk){
  let changed = false;
  const parts = dk.split('-');
  const dateObj = new Date(+parts[0], +parts[1]-1, +parts[2]);

  for(const empName in fixedSchedules){
    const fix = getFixedScheduleForDate(empName, dateObj);
    if(!fix || !fix.start) continue;
    const empId = findEmpIdByName(empName);
    if(!empId || isDayOff(empId, dk)) continue;
    if(!daySchedule[empId]){
      daySchedule[empId] = {start:fix.start, end:fix.end, role:fix.role};
      changed = true;
    }
    // fixed 매칭 셀 = 자동 confirmed 간주 (로컬만, Firebase shift_status 쓰기 없음)
    const stKey = dk+'_'+empId;
    if(shiftStatus[stKey] !== 'confirmed') shiftStatus[stKey] = 'confirmed';
  }
  return changed;
}

// generateAutoDayoffs 제거 — 휴무는 isDayOff() 가 fixed.off 즉석 해석
function generateAutoDayoffs(){ /* no-op: isDayOff() 즉석 해석으로 대체 */ }

// ============================================================
// 12. Render functions
// ============================================================
function isSectionOpen(bodyId){ const el=$(bodyId); return !!el&&el.classList.contains('open'); }

function performRenderAll(){
  const steps = [
    ['updateDateDisplay', updateDateDisplay],
    ['renderBriefing', renderBriefing],
    ['renderCurrentTab', renderCurrentTab],
    ['renderDateStrip', renderDateStrip],
  ];
  for(const [name,fn] of steps){
    try{fn();}catch(e){console.error('[WS] '+name,e);}
  }
  if(isSectionOpen('weekBody')){
    try{renderWeek();}catch(e){console.error('[WS] renderWeek',e);}
  }
}

let renderQueued=false, renderAgain=false;
function renderAll(force){
  if(force===true){performRenderAll();return;}
  if(renderQueued){renderAgain=true;return;}
  renderQueued=true;
  const run=()=>{renderQueued=false;performRenderAll();if(renderAgain){renderAgain=false;renderAll();}};
  if(window.requestAnimationFrame) window.requestAnimationFrame(run); else setTimeout(run,16);
}

// --- Briefing Panel ---
function renderBriefing(){
  const panel=$('briefingPanel'); if(!panel)return;
  const dk=dateKey(currentDate);
  const empKeys=Object.keys(employees);
  let html='';
  const offToday=[];
  let workingCount=0,totalHours=0,totalCost=0,fixedCount=0,variableCount=0,emptyCount=0;
  empKeys.forEach(id=>{
    if(isDayOff(id,dk)){offToday.push(employees[id]?.name||id);return;}
    const s=daySchedule[id];
    if(s&&s.start){
      workingCount++;
      const h=calcHours(s.start,s.end); totalHours+=h; totalCost+=h*(employees[id]?.hourlyRate||0);
      const fix=getFixedSchedule(employees[id]?.name);
      if(fix&&fix.type==='fixed'&&s.start===fix.start&&s.end===fix.end)fixedCount++; else variableCount++;
    } else emptyCount++;
  });

  html+='<div style="display:flex;gap:6px;margin-bottom:6px;">';
  html+='<div style="flex:1;background:#242444;border-radius:8px;padding:6px 8px;text-align:center;"><div style="font-size:1.1rem;font-weight:800;color:#FFF;">'+workingCount+'<span style="font-size:.6rem;color:#707088;">/'+empKeys.length+'</span></div><div style="font-size:.55rem;color:#9090A8;">출근</div></div>';
  html+='<div style="flex:1;background:#242444;border-radius:8px;padding:6px 8px;text-align:center;"><div style="font-size:1.1rem;font-weight:800;color:#FFD700;">'+totalHours.toFixed(1).replace('.0','')+'<span style="font-size:.6rem;color:#707088;">h</span></div><div style="font-size:.55rem;color:#9090A8;">총시간</div></div>';
  html+='<div style="flex:1;background:#242444;border-radius:8px;padding:6px 8px;text-align:center;"><div style="font-size:.85rem;font-weight:800;color:#E0E0EC;">'+(totalCost>0?(totalCost/10000).toFixed(1)+'만':'-')+'</div><div style="font-size:.55rem;color:#9090A8;">인건비</div></div>';
  html+='<div style="flex:1;background:#242444;border-radius:8px;padding:6px 8px;text-align:center;"><div style="font-size:1.1rem;font-weight:800;color:#E74C3C;">'+offToday.length+'</div><div style="font-size:.55rem;color:#9090A8;">휴무</div></div>';
  html+='</div>';

  html+='<div style="display:flex;flex-wrap:wrap;gap:6px;font-size:.65rem;">';
  if(isKrHoliday(currentDate)){
    const hName=getHolidayName(currentDate)||'공휴일';
    html+='<span style="color:#E74C3C;font-weight:700;border:1px solid #E74C3C;border-radius:3px;padding:0 3px;">'+hName+'</span>';
  }
  html+='<span style="color:#2ECC71;">고정'+fixedCount+'</span>';
  if(variableCount>0) html+='<span style="color:#E67E22;">수동'+variableCount+'</span>';
  if(emptyCount>0) html+='<span style="color:#E74C3C;font-weight:700;">미입력'+emptyCount+'</span>';
  if(offToday.length>0) html+='<span style="color:#E74C3C;">휴:'+offToday.join(',')+'</span>';
  html+='</div>';
  panel.innerHTML=html;
}

// --- Timebar View ---
function renderTimebarView(){
  const con=$('timebarContent'); if(!con)return;
  const dk=dateKey(currentDate);
  const empKeys=Object.keys(employees);

  // Weekly off count
  const weekOffCount={};
  const mon=getMonday(currentDate);
  for(let i=0;i<7;i++){
    const wd=new Date(mon);wd.setDate(wd.getDate()+i);
    const wdk=dateKey(wd);
    empKeys.forEach(id=>{if(isDayOff(id,wdk))weekOffCount[id]=(weekOffCount[id]||0)+1;});
  }

  const working=[],offList=[],empty=[];
  let totalHours=0,confirmedCount=0,unconfirmedCount=0;
  empKeys.forEach(id=>{
    const emp=employees[id]; const off=isDayOff(id,dk); const shift=daySchedule[id];
    if(off){offList.push({id,emp});return;}
    if(shift&&shift.start){
      const st=getShiftStatus(dk,id); const hours=calcHours(shift.start,shift.end);
      totalHours+=hours; if(st==='confirmed')confirmedCount++;else unconfirmedCount++;
      working.push({id,emp,shift,status:st,hours});
    } else empty.push({id,emp});
  });
  working.sort((a,b)=>timeToMinutesFromDayStart(a.shift.start)-timeToMinutesFromDayStart(b.shift.start));

  const _mg=calcGaugeRange(working);
  const barStart=_mg.gaugeStart, barHours=_mg.gaugeHours;
  function timeToPct(ts){let[h,m]=ts.split(':').map(Number);if(h<DAY_START_HOUR)h+=24;return Math.max(0,Math.min(100,((h-barStart)+m/60)/barHours*100));}

  const nowH=new Date().getHours(),nowM=new Date().getMinutes();
  const nowPct=timeToPct(pad(nowH)+':'+pad(nowM));
  const isToday=dateKey(new Date())===dk;

  let html='<div style="padding:5px 6px 0;">';

  // Progress bar
  const total=working.length+empty.length;
  const pctCf=total>0?Math.round(confirmedCount/total*100):0;
  html+='<div style="margin-bottom:6px;"><div style="display:flex;height:5px;border-radius:3px;overflow:hidden;background:'+C_BG+';">';
  if(pctCf>0)html+='<div style="width:'+pctCf+'%;background:'+C_OK+';"></div>';
  html+='<div style="flex:1;background:#2E2E52;"></div></div>';
  html+='<div style="display:flex;gap:8px;margin-top:3px;font-size:.65rem;">';
  html+='<span style="color:'+C_OK+';font-weight:700;">확정'+confirmedCount+'</span>';
  if(unconfirmedCount)html+='<span style="color:'+C_DEF+';font-weight:700;">미확정'+unconfirmedCount+'</span>';
  if(empty.length)html+='<span style="color:#707088;">미입력'+empty.length+'</span>';
  html+='<span style="color:#707088;margin-left:auto;">'+working.length+'명 '+totalHours.toFixed(1).replace('.0','')+'h</span>';
  if(offList.length)html+='<span style="color:'+C_OFF+';">휴'+offList.length+'</span>';
  if(unconfirmedCount>0)html+='<span data-action="confirmAll" style="color:'+C_OK+';cursor:pointer;font-weight:700;margin-left:4px;font-size:.7rem;padding:2px 8px;background:'+C_OK+'33;border-radius:4px;">전체확정</span>';
  else if(working.length>0)html+='<span style="color:'+C_OK+';font-weight:700;margin-left:4px;font-size:.65rem;">확정됨</span>';
  html+='</div></div>';

  // Time header
  html+='<div style="display:flex;align-items:center;margin-bottom:2px;"><div style="min-width:58px;"></div><div style="flex:1;position:relative;height:16px;display:flex;">';
  const _labelStep=barHours<=8?1:barHours<=14?2:3;
  for(let h=barStart;h<=barStart+barHours;h+=_labelStep){const rh=h>=24?h-24:h;const pct=(h-barStart)/barHours*100;html+='<span style="position:absolute;left:'+pct+'%;font-size:.55rem;color:#707088;transform:translateX(-50%);">'+rh+'</span>';}
  html+='</div><div style="min-width:36px;"></div></div>';

  // Worker bars
  working.forEach(w=>{
    const roles=w.shift.role?w.shift.role.split(',').filter(Boolean):[];
    const primaryRole=roles[0]||'주방';
    const roleColor=ROLE_COLORS[primaryRole]||'#9090A8';
    const isCf=w.status==='confirmed';
    const wOff=weekOffCount[w.id]||0;
    const att=dayAttendance[w.id];
    const hasActual=att&&att.actual_start;

    const left=timeToPct(w.shift.start);
    let right=timeToPct(w.shift.end); let width=right-left; if(width<=0)width+=100; width=Math.min(width,100-left);
    const barBg=hasActual?roleColor+'18':(isCf?roleColor+'40':roleColor+'18');
    const borderL=hasActual?roleColor+'55':(isCf?roleColor:roleColor+'88');
    const rowOp=isCf?'1':'.6';

    html+='<div data-empid="'+w.id+'" style="opacity:'+rowOp+';">';
    html+='<div style="display:flex;align-items:center;padding:2px 6px;cursor:pointer;">';
    const nameColor=isCf?roleColor:roleColor+'bb';
    html+='<div style="min-width:58px;font-size:.85rem;font-weight:700;color:'+nameColor+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">';
    html+=w.emp.name;
    if(wOff)html+='<span style="font-size:.6rem;color:'+C_OFF+';">('+wOff+')</span>';
    html+='</div>';
    html+='<div style="flex:1;position:relative;height:32px;background:#1A1A30;border-radius:4px;overflow:hidden;">';
    if(isToday)html+='<div style="position:absolute;left:'+nowPct+'%;top:0;bottom:0;width:1px;background:#FFD70066;z-index:3;"></div>';
    const isNarrow=width<30;
    const schedBorder=hasActual?'border:1.5px dashed '+roleColor+'55;':(isCf?'':'border:1px dashed '+roleColor+'66;');
    html+='<div style="position:absolute;left:'+left+'%;width:'+width+'%;top:1px;bottom:1px;background:'+barBg+';border-left:3px solid '+borderL+';border-radius:3px;'+schedBorder+'z-index:1;"></div>';
    // Actual bar
    if(hasActual){
      const aL=timeToPct(att.actual_start);
      const aR=att.actual_end?timeToPct(att.actual_end):aL;
      const aW=Math.max(aR-aL,1);
      const srcC=attSrcColor(att.actual_start_source||att.actual_end_source||'');
      html+='<div style="position:absolute;left:'+aL+'%;width:'+aW+'%;top:5px;bottom:5px;background:'+srcC+'40;border-left:3px solid '+srcC+';border-radius:2px;z-index:2;"></div>';
      const sMin=parseTimeMin(w.shift.start),aMin=parseTimeMin(att.actual_start);
      if(sMin!==null&&aMin!==null){
        let diff=aMin-sMin;if(diff>720)diff-=1440;if(diff<-720)diff+=1440;
        const abs=Math.abs(diff);
        if(abs>=10){
          const label=diff>0?abs+'분늦음':abs+'분일찍';
          const bc=abs>=180?'#FF4444':abs>=60?'#E67E22':'#888';
          html+='<span style="position:absolute;right:2px;top:50%;transform:translateY(-50%);font-size:.45rem;color:'+bc+';font-weight:700;z-index:3;">'+label+'</span>';
        }
      }
    }
    // Text
    const tL=isNarrow?(left+width+1):left;
    const tW=isNarrow?(100-left-width-1):width;
    html+='<div style="position:absolute;left:'+tL+'%;width:'+tW+'%;top:1px;bottom:1px;display:flex;align-items:center;padding:0 4px;gap:3px;overflow:hidden;">';
    const sS=w.shift.start.split(':')[0].replace(/^0/,''),eS=w.shift.end.split(':')[0].replace(/^0/,'');
    const timeStr=isNarrow?sS+'-'+eS:w.shift.start.replace(/^0/,'')+'-'+w.shift.end.replace(/^0/,'');
    html+='<span style="font-size:.65rem;color:#E0E0EC;font-weight:600;white-space:nowrap;">'+timeStr+'</span>';
    if(!isNarrow&&roles.length)html+='<span style="font-size:.55rem;white-space:nowrap;">'+roles.map(r=>'<span style="color:'+(ROLE_COLORS[r]||'#fff')+';">'+(ROLE_LABELS[r]||r)+'</span>').join(' ')+'</span>';
    html+='<span style="font-size:.55rem;color:#9090A8;">('+w.hours+'h)</span>';
    html+='</div></div>';
    // Status button
    if(isCf) html+='<span data-action="status" data-sid="'+w.id+'" data-st="auto" style="min-width:32px;text-align:center;font-size:.65rem;padding:4px 6px;border-radius:5px;cursor:pointer;background:'+C_OK+';color:#fff;font-weight:700;margin-left:3px;">확</span>';
    else html+='<span data-action="status" data-sid="'+w.id+'" data-st="confirmed" style="min-width:32px;text-align:center;font-size:.65rem;padding:4px 6px;border-radius:5px;cursor:pointer;background:'+C_DEF+'33;color:'+C_DEF+';font-weight:700;margin-left:3px;border:1px solid '+C_DEF+';">미</span>';
    html+='</div>';
    html+=buildAttendanceRow(w.id,w.shift);
    html+='</div>';
  });

  // Empty employees
  if(empty.length>0){
    html+='<div style="margin-top:5px;padding-top:5px;border-top:1px solid #2E2E5240;">';
    empty.forEach(e=>{
      html+='<div data-empid="'+e.id+'" style="display:flex;align-items:center;gap:4px;padding:2px 6px;cursor:pointer;">';
      html+='<div style="min-width:58px;font-size:.85rem;font-weight:700;color:#707088;">'+e.emp.name+'</div>';
      html+='<div style="flex:1;position:relative;height:32px;background:#1A1A30;border-radius:4px;overflow:hidden;">';
      if(isToday)html+='<div style="position:absolute;left:'+nowPct+'%;top:0;bottom:0;width:1px;background:#FFD70066;z-index:2;"></div>';
      html+='<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.65rem;color:#707088;">미입력</div>';
      html+='</div>';
      html+='<span data-action="confirmOff" data-oid="'+e.id+'" style="font-size:.65rem;padding:4px 7px;border-radius:5px;background:#E74C3C33;color:#E74C3C;cursor:pointer;font-weight:700;">휴확</span>';
      html+='</div>';
    });
    html+='</div>';
  }

  // Off employees
  if(offList.length>0){
    html+='<div style="margin-top:5px;padding-top:5px;border-top:1px solid #2E2E5240;">';
    offList.forEach(o=>{
      const oOff=weekOffCount[o.id]||0;
      html+='<div data-empid="'+o.id+'" style="display:flex;align-items:center;gap:4px;padding:2px 6px;opacity:.4;cursor:pointer;">';
      html+='<div style="min-width:58px;font-size:.85rem;font-weight:700;color:#E74C3C;">'+o.emp.name;
      if(oOff)html+='<span style="font-size:.6rem;">('+oOff+')</span>';
      html+='</div>';
      html+='<div style="flex:1;position:relative;height:32px;background:#1A1A30;border-radius:4px;overflow:hidden;">';
      html+='<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.65rem;color:#E74C3C;font-weight:600;">휴무</div>';
      html+='</div>';
      html+='<span data-action="toggleOff" data-oid="'+o.id+'" style="font-size:.65rem;padding:4px 7px;border-radius:5px;background:#333;color:#9090A8;cursor:pointer;font-weight:700;">해제</span>';
      html+='</div>';
    });
    html+='</div>';
  }

  html+='</div>';
  con.innerHTML=html;

  // Event delegation
  con.addEventListener('click',function(e){
    const tgt=e.target.closest('[data-action]');
    if(tgt){
      e.stopPropagation();
      const a=tgt.dataset.action;
      if(a==='confirmAll')confirmAllShifts();
      else if(a==='status')setShiftStatus(dk,tgt.dataset.sid,tgt.dataset.st);
      else if(a==='toggleOff')toggleDayOffFromList(tgt.dataset.oid);
      else if(a==='confirmOff')confirmDayOff(tgt.dataset.oid);
      return;
    }
    const row=e.target.closest('[data-empid]');
    if(row)openShiftModal(row.dataset.empid);
  });
}

// --- List View ---
function renderListView(){
  const con=$('listContent'); if(!con)return;
  const dk=dateKey(currentDate);
  const empKeys=Object.keys(employees);
  const m=currentDate.getMonth()+1,d=currentDate.getDate();
  const dow=DOW_KR[currentDate.getDay()];
  const confirmed=isConfirmed(dk);

  const weekOffCount={},weekTotalHoursMap={};
  const mon=getMonday(currentDate);
  for(let i=0;i<7;i++){
    const wd=new Date(mon);wd.setDate(wd.getDate()+i);const wdk=dateKey(wd);
    const wSched=wdk===dk?daySchedule:(weekSchedules[wdk]||{});
    empKeys.forEach(id=>{
      if(isDayOff(id,wdk))weekOffCount[id]=(weekOffCount[id]||0)+1;
      const ws=wSched[id]; if(ws&&ws.start&&ws.end)weekTotalHoursMap[id]=(weekTotalHoursMap[id]||0)+calcHours(ws.start,ws.end);
    });
  }

  const working=[],offList=[],empty=[];
  let totalHours=0,confirmedCount=0,unconfirmedCount=0;
  empKeys.forEach(id=>{
    const emp=employees[id]; const off=isDayOff(id,dk); const shift=daySchedule[id];
    if(off){offList.push({id,emp});return;}
    if(shift&&shift.start){
      const st=getShiftStatus(dk,id);
      const fix=getFixedSchedule(emp.name);
      const isFixed=fix&&fix.type==='fixed'&&shift.start===fix.start&&shift.end===fix.end;
      const hours=calcHours(shift.start,shift.end); totalHours+=hours;
      if(st==='confirmed')confirmedCount++;else unconfirmedCount++;
      working.push({id,emp,shift,status:st,isFixed,hours});
    } else empty.push({id,emp});
  });
  working.sort((a,b)=>timeToMinutesFromDayStart(a.shift.start)-timeToMinutesFromDayStart(b.shift.start));

  const allCf=working.length>0&&unconfirmedCount===0;
  const boardBorder=allCf?'border:2px solid '+C_OK+';border-radius:12px;':'';
  let html='<div style="padding:6px 8px;'+boardBorder+'">';

  // Header
  const anyCf=confirmed||allCf;
  const hdrBorder=anyCf?'border-bottom:2px solid '+C_OK+';':'border-bottom:1px solid #2E2E52;';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;padding-bottom:5px;'+hdrBorder+'">';
  html+='<div><span style="font-size:1rem;font-weight:800;color:'+(anyCf?C_OK:'#FFF')+';">'+m+'/'+d+' '+dow+'</span>';
  if(anyCf)html+=' <span style="font-size:.6rem;color:'+C_OK+';">확정</span>';
  html+='</div><div style="display:flex;gap:4px;align-items:center;">';
  if(unconfirmedCount>0) html+='<span data-action="confirmAll" style="font-size:.75rem;padding:5px 12px;border-radius:6px;background:'+C_OK+'44;color:'+C_OK+';cursor:pointer;font-weight:700;border:1px solid '+C_OK+'66;">전체확정</span>';
  else if(working.length>0) html+='<span style="font-size:.7rem;padding:4px 10px;border-radius:6px;background:'+C_OK+'22;color:'+C_OK+';font-weight:700;">확정됨</span>';
  html+='</div></div>';

  // Progress
  const total=working.length+empty.length;
  const pctCf=total>0?Math.round(confirmedCount/total*100):0;
  html+='<div style="margin-bottom:6px;"><div style="display:flex;height:5px;border-radius:3px;overflow:hidden;background:'+C_BG+';">';
  if(pctCf>0)html+='<div style="width:'+pctCf+'%;background:'+C_OK+';"></div>';
  html+='<div style="width:'+(100-pctCf)+'%;background:#2E2E52;"></div></div>';
  html+='<div style="display:flex;gap:8px;margin-top:3px;font-size:.55rem;">';
  html+='<span style="color:'+C_OK+';font-weight:700;">확정 '+confirmedCount+'</span>';
  if(unconfirmedCount)html+='<span style="color:'+C_DEF+';font-weight:700;">미확정 '+unconfirmedCount+'</span>';
  if(empty.length)html+='<span style="color:#707088;">미입력 '+empty.length+'</span>';
  html+='<span style="color:#707088;margin-left:auto;">'+working.length+'명 '+totalHours.toFixed(1).replace('.0','')+'h</span>';
  if(offList.length)html+='<span style="color:'+C_OFF+';">휴'+offList.length+'</span>';
  html+='</div></div>';

  // Workers
  const _g=calcGaugeRange(working);
  const GS=_g.gaugeStart,GR=_g.gaugeHours;
  working.forEach(w=>{
    const roles=w.shift.role?w.shift.role.split(',').filter(Boolean):[];
    let sH=parseInt(w.shift.start.split(':')[0]),sM=parseInt(w.shift.start.split(':')[1]||0);
    let eH=parseInt(w.shift.end.split(':')[0]),eM=parseInt(w.shift.end.split(':')[1]||0);
    if(sH<DAY_START_HOUR)sH+=24;if(eH<DAY_START_HOUR)eH+=24;if(eH<=sH)eH+=24;
    const startPct=Math.max(0,((sH+sM/60)-GS)/GR*100);
    const endPct=Math.min(100,((eH+eM/60)-GS)/GR*100);
    const widthPct=Math.max(1,endPct-startPct);
    const isCf=w.status==='confirmed';
    const stColor=isCf?C_OK:C_DEF;
    const stBg=isCf?C_OK+'10':C_DEF+'08';
    const barC=stColor;
    const timeLabel=w.shift.start.replace(/^0/,'')+'-'+w.shift.end.replace(/^0/,'');
    const wOff=weekOffCount[w.id]||0;
    const wHrs=weekTotalHoursMap[w.id]||0;
    const _lRC=ROLE_COLORS[roles[0]||'주방']||stColor;

    html+='<div style="margin-bottom:2px;padding:4px 6px;background:'+stBg+';border-left:3px solid '+_lRC+';border-radius:6px;cursor:pointer;" data-empid="'+w.id+'">';
    html+='<div style="display:flex;align-items:center;gap:4px;">';
    const wHrsC=wHrs>40?'#E74C3C':'#9090A8';
    const wHrsL=wHrs>0?'<span style="font-size:.5rem;color:'+wHrsC+';font-weight:600;">[주'+Math.round(wHrs)+'h]</span>':'';
    html+='<span style="font-size:.8rem;font-weight:800;color:'+_lRC+';min-width:38px;">'+w.emp.name+(wOff?'<span style="font-size:.55rem;color:'+C_OFF+';font-weight:600;">('+wOff+')</span>':'')+wHrsL+'</span>';
    html+='<div style="position:relative;flex:1;height:18px;background:#1A1A30;border-radius:3px;overflow:hidden;">';
    html+='<div style="position:absolute;left:'+startPct+'%;width:'+widthPct+'%;top:1px;bottom:1px;background:'+barC+'40;border-radius:2px;border-left:2px solid '+barC+';"></div>';
    html+='<span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:.55rem;color:#E0E0EC;font-weight:600;white-space:nowrap;text-shadow:0 0 3px #000;">'+timeLabel+' ('+w.hours+'h)</span>';
    html+='</div>';
    if(isCf) html+='<span data-action="status" data-sid="'+w.id+'" data-st="auto" style="font-size:.55rem;padding:2px 5px;border-radius:3px;cursor:pointer;background:'+C_OK+';color:#fff;font-weight:700;">확</span>';
    else html+='<span data-action="status" data-sid="'+w.id+'" data-st="confirmed" style="font-size:.55rem;padding:2px 5px;border-radius:3px;cursor:pointer;background:#333;color:'+C_DEF+';font-weight:700;">미</span>';
    html+='</div>';
    html+=buildAttendanceRow(w.id,w.shift);
    html+='</div>';
  });

  // Empty
  if(empty.length>0){
    html+='<div style="margin-top:4px;padding-top:4px;border-top:1px solid #2E2E5240;">';
    html+='<div style="font-size:.6rem;color:'+C_DEF+';font-weight:700;margin-bottom:3px;padding-left:4px;border-left:2px solid '+C_DEF+';">미입력 ('+empty.length+'명)</div>';
    empty.forEach(e=>{
      html+='<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;margin-bottom:2px;background:#1A1A30;border-radius:6px;border-left:3px solid #707088;cursor:pointer;" data-empid="'+e.id+'">';
      html+='<span style="font-size:.85rem;font-weight:800;color:#707088;min-width:44px;">'+e.emp.name+'</span>';
      html+='<span style="font-size:.7rem;color:#707088;">미입력</span>';
      html+='<span style="margin-left:auto;display:flex;gap:3px;">';
      html+='<span data-action="confirmOff" data-oid="'+e.id+'" style="font-size:.55rem;padding:2px 6px;border-radius:3px;background:#E74C3C33;color:#E74C3C;cursor:pointer;font-weight:700;">휴확</span>';
      html+='</span></div>';
    });
    html+='</div>';
  }

  // Off
  if(offList.length>0){
    html+='<div style="margin-top:4px;padding-top:4px;border-top:1px solid #2E2E5240;">';
    html+='<div style="font-size:.6rem;color:#E74C3C;font-weight:700;margin-bottom:3px;padding-left:4px;border-left:2px solid #E74C3C;">휴무 ('+offList.length+'명)</div>';
    offList.forEach(o=>{
      const oOff=weekOffCount[o.id]||0;
      html+='<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;margin-bottom:2px;background:#E74C3C08;border-radius:6px;border-left:3px solid #E74C3C;cursor:pointer;" data-empid="'+o.id+'">';
      html+='<span style="font-size:.8rem;font-weight:800;color:#E74C3C;">'+o.emp.name+(oOff?'<span style="font-size:.55rem;color:'+C_OFF+';font-weight:600;">('+oOff+')</span>':'')+'</span>';
      html+='<span style="font-size:.65rem;color:#E74C3C;">휴무</span>';
      html+='<span data-action="toggleOff" data-oid="'+o.id+'" style="margin-left:auto;font-size:.55rem;padding:2px 6px;border-radius:3px;background:#333;color:#9090A8;cursor:pointer;font-weight:700;">해제</span>';
      html+='</div>';
    });
    html+='</div>';
  }

  html+='</div>';
  con.innerHTML=html;

  con.addEventListener('click',function(e){
    const tgt=e.target.closest('[data-action]');
    if(tgt){
      e.stopPropagation();
      const a=tgt.dataset.action;
      if(a==='confirmAll')confirmAllShifts();
      else if(a==='status')setShiftStatus(dk,tgt.dataset.sid,tgt.dataset.st);
      else if(a==='confirmOff')confirmDayOff(tgt.dataset.oid);
      else if(a==='toggleOff')toggleDayOffFromList(tgt.dataset.oid);
      return;
    }
    const row=e.target.closest('[data-empid]');
    if(row)openShiftModal(row.dataset.empid);
  });
}

// --- Week Overview ---
function renderWeek(){
  if(!dataLoaded)return;
  const monday=getMonday(currentDate);
  const empKeys=Object.keys(employees);
  $weekGrid.innerHTML='';
  const daysOff={};
  empKeys.forEach(id=>{daysOff[id]=0;});
  for(let i=0;i<7;i++){
    const d=new Date(monday);d.setDate(d.getDate()+i);const dk=dateKey(d);
    const sched=weekSchedules[dk]||{};
    empKeys.forEach(eid=>{if(!sched[eid]||!sched[eid].start)daysOff[eid]=(daysOff[eid]||0)+1;});
  }
  $weekOffs.innerHTML='';
  empKeys.forEach(eid=>{
    const emp=employees[eid]; if(!emp)return;
    const oc=daysOff[eid]||0; if(oc===0)return;
    const chip=document.createElement('div'); chip.className='off-chip';
    chip.innerHTML='<span class="off-text" style="color:'+C_DEF+';">'+emp.name+' <span style="color:'+C_OFF+';">휴'+oc+'</span></span>';
    $weekOffs.appendChild(chip);
  });
}

// --- Date Strip ---
function renderDateStrip(){
  const con=$('dateStrip'); if(!con)return;
  const today=new Date();today.setHours(0,0,0,0);
  const empKeys=Object.keys(employees);
  const selectedDk=dateKey(currentDate);
  const monday=getMonday(currentDate);
  let html='';
  ['월','화','수','목','금','토','일'].forEach(d=>{html+='<div class="date-strip-hdr" style="position:sticky;top:0;background:#1A1A30;z-index:1;">'+d+'</div>';});
  for(let i=-7;i<56;i++){
    const d=new Date(monday);d.setDate(d.getDate()+i);
    const dk=dateKey(d); const dow=d.getDay();
    const isToday=isSameDay(d,today);const isSelected=dk===selectedDk;const isPast=d<today;
    let confirmedC=0,assignedC=0;
    const sched=dk===selectedDk?daySchedule:(weekSchedules[dk]||{});
    if(sched) empKeys.forEach(eid=>{if(sched[eid]&&sched[eid].start){assignedC++;if(getShiftStatus(dk,eid)==='confirmed')confirmedC++;}});
    let borderColor='#2E2E52';
    if(assignedC>0){if(confirmedC===assignedC)borderColor=C_OK;else if(confirmedC>0)borderColor=C_OK+'88';else borderColor=C_DEF;}
    const dowCls=(dow===0||isKrHoliday(d))?' sun':dow===6?' sat':'';
    const cls='date-strip-item'+(isPast?' ds-past':'')+(isToday?' ds-today':'')+(isSelected?' ds-selected':'');
    const selStyle=isSelected?'':'border-color:'+borderColor+';';
    html+='<div class="'+cls+'" data-dk="'+dk+'" style="'+selStyle+'">';
    if(isToday)html+='<div style="font-size:.4rem;color:#2ECC71;font-weight:700;line-height:1;">오늘</div>';
    html+='<div class="ds-date'+dowCls+'">'+d.getDate()+'</div>';
    if(assignedC>0) html+='<div class="ds-count" style="color:'+(confirmedC===assignedC?C_OK:C_DEF)+';">'+assignedC+'명</div>';
    html+='</div>';
  }
  con.innerHTML=html;
  con.querySelectorAll('.date-strip-item').forEach(el=>{
    el.addEventListener('click',()=>{const p=el.dataset.dk.split('-');currentDate=new Date(+p[0],+p[1]-1,+p[2]);onDateChange();});
  });
  const selEl=con.querySelector('.date-strip-item[data-dk="'+selectedDk+'"]');
  if(selEl)setTimeout(()=>selEl.scrollIntoView({block:'center',behavior:'auto'}),10);
}

// --- Month View ---
async function renderMonthView(){
  $('monthModalLabel').textContent=monthViewYear+'년 '+monthViewMonth+'월';
  const grid=$('monthGrid'); grid.innerHTML='';
  DOW_KR.forEach(d=>{const l=document.createElement('div');l.className='month-dow-label';l.textContent=d;grid.appendChild(l);});
  const days=daysInMonth(monthViewYear,monthViewMonth);
  const firstDow=new Date(monthViewYear,monthViewMonth-1,1).getDay();
  const today=new Date();
  const allSchedules=await fbGet(FB_SCHEDULES)||{};
  for(let i=0;i<firstDow;i++){const c=document.createElement('div');c.className='month-day-cell empty';grid.appendChild(c);}
  for(let d=1;d<=days;d++){
    const dk=monthViewYear+'-'+pad(monthViewMonth)+'-'+pad(d);
    const daySch=allSchedules[dk]||{};
    const count=Object.keys(daySch).filter(k=>daySch[k]&&daySch[k].start).length;
    const dow=new Date(monthViewYear,monthViewMonth-1,d).getDay();
    const isToday2=(today.getFullYear()===monthViewYear&&(today.getMonth()+1)===monthViewMonth&&today.getDate()===d);
    const cell=document.createElement('div');cell.className='month-day-cell';
    if(isToday2)cell.classList.add('today');if(count>0)cell.classList.add('has-staff');
    const num=document.createElement('div');num.className='md-num';
    const cellDate=new Date(monthViewYear,monthViewMonth-1,d);
    if(dow===0||isKrHoliday(cellDate))num.classList.add('sun');if(dow===6&&!isKrHoliday(cellDate))num.classList.add('sat');
    num.textContent=d;cell.appendChild(num);
    if(count>0){const cnt=document.createElement('div');cnt.className='md-count';cnt.textContent=count+'명';cell.appendChild(cnt);}
    cell.addEventListener('click',()=>{currentDate=new Date(monthViewYear,monthViewMonth-1,d);closeModal($monthModal);onDateChange();});
    grid.appendChild(cell);
  }
}

// --- Attendance helpers ---
function attSrcColor(src){
  switch(src){case'owner':return'#2ECC71';case'staff':return'#3498DB';case'staff+pair':return'#4FC3F7';case'manual':case'fallback':case'fallback+pair':return'#E67E22';case'gemini':case'bulk':return'#9090A8';case'gemini+pair':return'#4FC3F7';default:return'#888';}
}
const ATT_SRC_MAP={owner:{color:'#2ECC71',label:'사장'},staff:{color:'#3498DB',label:'본인'},'staff+pair':{color:'#4FC3F7',label:'동시출근'},'gemini+pair':{color:'#4FC3F7',label:'AI+동시'},gemini:{color:'#9090A8',label:'AI'},manual:{color:'#E67E22',label:'수동'},fallback:{color:'#E67E22',label:'자동'},'fallback+pair':{color:'#E67E22',label:'자동+동시'},bulk:{color:'#9090A8',label:'일괄'}};
function attSrcBadge(src){if(!src)return'';const m=ATT_SRC_MAP[src]||{color:'#707088',label:src};return'<span style="font-size:.5rem;color:'+m.color+';font-weight:600;padding:1px 3px;border:1px solid '+m.color+'44;border-radius:3px;">'+m.label+'</span>';}

function buildAttendanceRow(empId,shift){
  const att=dayAttendance[empId];
  const sched=daySchedule[empId];
  const actualStart=(att&&att.actual_start)||(sched&&sched.actual_start)||null;
  const actualEnd=(att&&att.actual_end)||(sched&&sched.actual_end)||null;
  if(!actualStart&&!actualEnd) return'<div style="padding:1px 0 0 42px;font-size:.55rem;color:#707088;">실제 <span class="src-warning" style="font-weight:600;">미기록</span></div>';

  function calcDiff(st,at){
    if(!st||!at)return null;
    const sp=st.split(':'),ap=at.split(':');
    let d2=parseInt(ap[0])*60+parseInt(ap[1]||0)-(parseInt(sp[0])*60+parseInt(sp[1]||0));
    if(d2>720)d2-=1440;else if(d2<-720)d2+=1440;return d2;
  }
  function diffBadge(d2){
    if(d2===null)return'';let c,t;
    if(d2<0){c='#2ECC71';t=d2+'분';}else if(d2>0){c='#E74C3C';t='+'+d2+'분';}else{c='#9090A8';t='정시';}
    return' <span style="color:'+c+';font-weight:700;">('+t+')</span>';
  }

  let html='<div style="padding:1px 0 0 42px;font-size:.55rem;color:#9090A8;">';
  if(actualStart){
    const d2=(sched&&sched.diff_start!==undefined)?sched.diff_start:calcDiff(shift?shift.start:null,actualStart);
    html+='<span style="color:#2ECC71;">✓'+actualStart+'</span>'+diffBadge(d2);
  }
  if(actualEnd){
    const d2=(sched&&sched.diff_end!==undefined)?sched.diff_end:calcDiff(shift?shift.end:null,actualEnd);
    if(actualStart)html+=' ';
    html+='<span style="color:#3498DB;">→'+actualEnd+'</span>'+diffBadge(d2);
  }
  if(att){const srcSet=new Set();if(att.actual_start_source)srcSet.add(att.actual_start_source);if(att.actual_end_source)srcSet.add(att.actual_end_source);srcSet.forEach(s=>{html+=' '+attSrcBadge(s);});}
  html+='</div>';
  return html;
}

// ============================================================
// 13. Shift Modal
// ============================================================
let shiftSelectedEmpId=null, shiftSelectedRoles=[], shiftSelectedStart=null, shiftSelectedEnd=null, shiftEditMode=false;

function buildTimeSelects(){
  const $s=$('shiftStartSel'),$e=$('shiftEndSel');
  $s.innerHTML='';$e.innerHTML='';
  const base=DAY_START_HOUR;
  for(let h=base;h<base+24;h++){const rh=h>=24?h-24:h;for(let m=0;m<60;m+=30){const t=pad(rh)+':'+pad(m);const o=document.createElement('option');o.value=t;o.textContent=t;$s.appendChild(o);}}
  for(let h=base;h<=base+24;h++){const rh=h>=24?h-24:h;for(let m=0;m<60;m+=30){if(h===base&&m===0)continue;if(h===base+24&&m>0)break;const t=pad(rh)+':'+pad(m);const o=document.createElement('option');o.value=t;o.textContent=t;$e.appendChild(o);}}
  const ticks=$('shiftGaugeTicks');ticks.innerHTML='';
  for(let i=0;i<6;i++){const h=(base+i*4)%24;const sp=document.createElement('span');sp.textContent=pad(h);ticks.appendChild(sp);}
  $s.addEventListener('change',()=>{shiftSelectedStart=$s.value;updateShiftGauge();});
  $e.addEventListener('change',()=>{shiftSelectedEnd=$e.value;updateShiftGauge();});
  setupShiftGauge();
}

function selectStartTime(t){shiftSelectedStart=t;$('shiftStartSel').value=t;updateShiftGauge();}
function selectEndTime(t){shiftSelectedEnd=t;$('shiftEndSel').value=t;updateShiftGauge();}

function updateShiftGauge(){
  const fill=$('shiftGaugeFill'),labels=$('shiftGaugeLabels');
  if(!shiftSelectedStart||!shiftSelectedEnd){fill.style.display='none';labels.textContent='';return;}
  fill.style.display='';
  const left=timeToPercent(shiftSelectedStart);const right=timeToPercent(shiftSelectedEnd);
  let width=right-left;if(width<=0)width+=100;
  fill.style.left=left+'%';fill.style.width=Math.min(width,100-left)+'%';
  const hours=calcHours(shiftSelectedStart,shiftSelectedEnd);
  labels.textContent=shiftSelectedStart+' ~ '+shiftSelectedEnd+' ('+hours+'h)';
}

function setupShiftGauge(){
  const gauge=$('shiftGauge');let dragging=null;
  function xToTime(x){const rect=gauge.getBoundingClientRect();const pct=Math.max(0,Math.min(1,(x-rect.left)/rect.width));const totalMin=pct*TL_TOTAL_MINUTES;let h=Math.floor(totalMin/60)+DAY_START_HOUR;if(h>=24)h-=24;let m=Math.round((totalMin%60)/30)*30;if(m>=60){m=0;h=(h+1)>=24?h+1-24:h+1;}return pad(h)+':'+pad(m);}
  gauge.addEventListener('touchstart',(e)=>{const t=xToTime(e.touches[0].clientX);if(!shiftSelectedStart)dragging='start';else{const tM=timeToMinutesFrom12(t),sM=shiftSelectedStart?timeToMinutesFrom12(shiftSelectedStart):0,eM=shiftSelectedEnd?timeToMinutesFrom12(shiftSelectedEnd):TL_TOTAL_MINUTES;dragging=Math.abs(tM-sM)<Math.abs(tM-eM)?'start':'end';}const tv=xToTime(e.touches[0].clientX);if(dragging==='start')selectStartTime(tv);else selectEndTime(tv);},{passive:true});
  gauge.addEventListener('touchmove',(e)=>{if(!dragging)return;const tv=xToTime(e.touches[0].clientX);if(dragging==='start')selectStartTime(tv);else selectEndTime(tv);},{passive:true});
  gauge.addEventListener('touchend',()=>{dragging=null;});
}

function buildEmpChips(){
  const $c=$('shiftEmpChips');$c.innerHTML='';
  Object.keys(employees).forEach(empId=>{
    const emp=employees[empId];
    const chip=document.createElement('div');chip.className='emp-chip';
    if(empId===shiftSelectedEmpId)chip.classList.add('selected');
    chip.innerHTML='<div class="chip-dot" style="background:'+(emp.color||'#9090A8')+'"></div>'+emp.name;
    chip.addEventListener('click',()=>{
      shiftSelectedEmpId=empId;
      $c.querySelectorAll('.emp-chip').forEach(c=>c.classList.remove('selected'));
      chip.classList.add('selected');
      const existing=daySchedule[empId];
      if(existing&&existing.start){
        selectStartTime(existing.start);selectEndTime(existing.end);
        shiftSelectedRoles=existing.role?existing.role.split(',').filter(Boolean):[];
        updateRolePills();$('shiftDelete').style.display='';shiftEditMode=true;
      } else {$('shiftDelete').style.display='none';shiftEditMode=false;}
    });
    $c.appendChild(chip);
  });
}

function updateRolePills(){
  document.querySelectorAll('#shiftRolePills .role-pill').forEach(pill=>{
    const r=pill.dataset.role;
    pill.classList.toggle('selected',shiftSelectedRoles.includes(r));
  });
  const empName=shiftSelectedEmpId?(employees[shiftSelectedEmpId]?.name||''):'';
  $('shiftRoleNote').textContent='';
}

function openShiftModal(empId){
  shiftSelectedEmpId=empId||null;shiftSelectedRoles=[];shiftSelectedStart=null;shiftSelectedEnd=null;shiftEditMode=false;
  buildEmpChips();
  if(empId&&daySchedule[empId]&&daySchedule[empId].start){
    const shift=daySchedule[empId];
    shiftSelectedRoles=shift.role?shift.role.split(',').filter(Boolean):[];
    shiftEditMode=true;selectStartTime(shift.start);selectEndTime(shift.end);
    $('shiftDelete').style.display='';
  } else {$('shiftStartSel').selectedIndex=0;$('shiftEndSel').selectedIndex=0;updateShiftGauge();$('shiftDelete').style.display='none';}
  updateRolePills();
  const m=currentDate.getMonth()+1,d=currentDate.getDate(),dow=DOW_KR[currentDate.getDay()];
  $('shiftTitle').textContent='근무 '+(shiftEditMode?'수정':'추가')+' - '+m+'/'+d+' ('+dow+')';
  $('shiftSaveFixed').style.display=empId?'':'none';
  $('shiftDayoff').style.display=empId?'':'none';
  const isOff=empId&&isDayOff(empId,dateKey(currentDate));
  if(isOff){$('shiftDayoff').textContent='휴무해제';$('shiftDayoff').classList.remove('btn-danger');$('shiftDayoff').style.background='#333';$('shiftDayoff').style.color='#9090A8';}
  else{$('shiftDayoff').textContent='휴무지정';$('shiftDayoff').classList.add('btn-danger');$('shiftDayoff').style.background='';$('shiftDayoff').style.color='';}
  openModal($shiftModal);
}

// Role pill clicks
document.querySelectorAll('#shiftRolePills .role-pill').forEach(pill=>{
  pill.addEventListener('click',()=>{
    const r=pill.dataset.role;const idx=shiftSelectedRoles.indexOf(r);
    if(idx>=0)shiftSelectedRoles.splice(idx,1);else shiftSelectedRoles.push(r);
    updateRolePills();
  });
});
// Presets
document.querySelectorAll('#shiftPresets .preset-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{selectStartTime(btn.dataset.start);selectEndTime(btn.dataset.end);});
});

// Save shift
$('shiftSave').addEventListener('click',async()=>{
  if(!shiftSelectedEmpId){showToast('직원을 선택해주세요');return;}
  if(!shiftSelectedStart||!shiftSelectedEnd){showToast('시간을 선택해주세요');return;}
  const dk=dateKey(currentDate);
  const data={start:shiftSelectedStart,end:shiftSelectedEnd,role:shiftSelectedRoles.join(',')};
  closeModal($shiftModal);
  daySchedule[shiftSelectedEmpId]=data;
  setShiftStatus(dk,shiftSelectedEmpId,'confirmed');
  renderAll();
  const ok=await fbPut(FB_SCHEDULES+'/'+dk+'/'+shiftSelectedEmpId,data);
  if(ok){showToast('저장 확정');loadWeekSchedules();}else showToast('저장 실패');
});

// Delete shift
$('shiftDelete').addEventListener('click',async()=>{
  if(!shiftSelectedEmpId)return;
  const dk=dateKey(currentDate);
  closeModal($shiftModal);
  delete daySchedule[shiftSelectedEmpId];
  renderAll();
  const ok=await fbDelete(FB_SCHEDULES+'/'+dk+'/'+shiftSelectedEmpId);
  if(ok){showToast('삭제됨');loadWeekSchedules();}
});

// Save as fixed
$('shiftSaveFixed').addEventListener('click',async()=>{
  if(!shiftSelectedEmpId||!shiftSelectedStart||!shiftSelectedEnd){showToast('시간을 선택해주세요');return;}
  const empName=employees[shiftSelectedEmpId]?.name;
  if(!empName){showToast('직원 오류');return;}
  const newFixed={start:shiftSelectedStart,end:shiftSelectedEnd,role:shiftSelectedRoles.join(','),type:'fixed'};
  fixedSchedules[empName]=newFixed;
  const fxOk=await fbPut(FB_WS+'/fixed_schedules/'+encodeURIComponent(empName),newFixed);
  const dk=dateKey(currentDate);
  const data={start:shiftSelectedStart,end:shiftSelectedEnd,role:shiftSelectedRoles.join(',')};
  daySchedule[shiftSelectedEmpId]=data;
  setShiftStatus(dk,shiftSelectedEmpId,'confirmed');
  closeModal($shiftModal);
  // 고정값 저장 성공 시에만 schedules 수동 예외 삭제 (fixed 가 이제 SOT)
  if(fxOk) await fbDelete(FB_SCHEDULES+'/'+dk+'/'+shiftSelectedEmpId);
  showToast(empName+' 고정값 변경됨');renderAll();loadWeekSchedules();
});

// Dayoff from shift modal
$('shiftDayoff').addEventListener('click',()=>{
  if(!shiftSelectedEmpId)return;
  const dk=dateKey(currentDate);
  const isOff=isDayOff(shiftSelectedEmpId,dk);
  if(isOff){
    if(!dayoffs[shiftSelectedEmpId])dayoffs[shiftSelectedEmpId]={};
    dayoffs[shiftSelectedEmpId][dk]=false;
    fbPut(FB_DAYOFFS+'/'+shiftSelectedEmpId+'/'+dk,false);
    if(daySchedule[shiftSelectedEmpId]&&daySchedule[shiftSelectedEmpId].dayoff)delete daySchedule[shiftSelectedEmpId];
    const empName=employees[shiftSelectedEmpId]?.name||'';
    const fix=getFixedScheduleForDate(empName,currentDate);
    if(fix&&fix.type==='fixed'&&fix.start){
      // 로컬 daySchedule 에만 fixed 병합 — schedules 에 쓰지 않음
      daySchedule[shiftSelectedEmpId]={start:fix.start,end:fix.end,role:fix.role};
      shiftStatus[dk+'_'+shiftSelectedEmpId]='confirmed';
    }
    closeModal($shiftModal);showToast('휴무 해제 + 확정');
  } else {
    if(!dayoffs[shiftSelectedEmpId])dayoffs[shiftSelectedEmpId]={};
    dayoffs[shiftSelectedEmpId][dk]=true;
    if(daySchedule[shiftSelectedEmpId]){delete daySchedule[shiftSelectedEmpId];fbDelete(FB_SCHEDULES+'/'+dk+'/'+shiftSelectedEmpId);}
    fbPut(FB_DAYOFFS+'/'+shiftSelectedEmpId+'/'+dk,true);
    closeModal($shiftModal);showToast('휴무 지정');
  }
  renderAll();
});

$('shiftCancel').addEventListener('click',()=>closeModal($shiftModal));
$('shiftModalClose').addEventListener('click',()=>closeModal($shiftModal));

// ============================================================
// 14. Employee Management Modal
// ============================================================
$('empMgrBtn').addEventListener('click',()=>{renderEmpList();openModal($empModal);});
$('empModalClose').addEventListener('click',()=>closeModal($empModal));

function renderEmpList(){
  const $list=$('empList');$list.innerHTML='';
  const empKeys=Object.keys(employees);
  if(empKeys.length===0){$list.innerHTML='<div style="padding:20px;text-align:center;color:#9090A8;">등록된 직원이 없습니다</div>';return;}
  empKeys.forEach(id=>{
    const emp=employees[id];const item=document.createElement('div');item.className='emp-list-item';
    const rateText=emp.hourlyRate?emp.hourlyRate.toLocaleString()+'원':'-';
    item.innerHTML='<div class="emp-dot" style="background:'+(emp.color||'#9090A8')+'"></div><div class="emp-info"><div class="name">'+emp.name+'</div><div class="detail">'+(emp.phone||'전화없음')+' | '+(emp.role||'미지정')+' | '+rateText+'</div></div><div class="emp-list-actions"><button class="btn btn-sm" data-edit="'+id+'">수정</button><button class="btn btn-sm btn-danger" data-del="'+id+'">삭제</button></div>';
    $list.appendChild(item);
  });
  $list.querySelectorAll('[data-edit]').forEach(btn=>{btn.addEventListener('click',()=>openEmpEdit(btn.dataset.edit));});
  $list.querySelectorAll('[data-del]').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      const empId=btn.dataset.del;const empName=employees[empId]?.name||empId;
      if(!confirm(empName+' 삭제?'))return;
      const ok=await fbDelete(FB_EMPLOYEES+'/'+empId);
      if(ok){delete employees[empId];renderEmpList();renderAll();showToast('삭제됨');}
    });
  });
}

// Employee Edit
const PRESET_COLORS=['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#F0A500','#6C5CE7','#A8E6CF','#FF8A5C','#EA80FC','#00BCD4'];
let editingEmpId=null, selectedColor=PRESET_COLORS[0];

function buildColorPicker(){
  const $cp=$('colorPicker');$cp.innerHTML='';
  PRESET_COLORS.forEach(c=>{
    const sw=document.createElement('div');sw.className='color-swatch'+(c===selectedColor?' selected':'');sw.style.background=c;
    sw.addEventListener('click',()=>{selectedColor=c;$cp.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('selected'));sw.classList.add('selected');});
    $cp.appendChild(sw);
  });
}

function openEmpEdit(id){
  editingEmpId=id;
  if(id&&employees[id]){
    const emp=employees[id];$('empEditTitle').textContent='직원 수정';
    $('empName').value=emp.name||'';$('empPhone').value=emp.phone||'';$('empRole').value=emp.role||'';
    $('empHourlyRate').value=emp.hourlyRate||0;$('empMaxHours').value=emp.maxHours||40;
    $('empPreferredHours').value=emp.preferredHours||'';$('empUnavailableHours').value=emp.unavailableHours||'';
    selectedColor=emp.color||PRESET_COLORS[0];
  } else {
    editingEmpId=null;$('empEditTitle').textContent='직원 추가';
    $('empName').value='';$('empPhone').value='';$('empRole').value='';
    $('empHourlyRate').value=0;$('empMaxHours').value=40;
    $('empPreferredHours').value='';$('empUnavailableHours').value='';
    selectedColor=PRESET_COLORS[0];
  }
  buildColorPicker();openModal($empEditModal);
}

$('addEmpBtn').addEventListener('click',()=>openEmpEdit(null));
$('empEditClose').addEventListener('click',()=>closeModal($empEditModal));
$('empEditCancel').addEventListener('click',()=>closeModal($empEditModal));

$('empEditSave').addEventListener('click',async()=>{
  const name=$('empName').value.trim();if(!name){showToast('이름을 입력해주세요');return;}
  let id=editingEmpId; if(!id)id='emp'+Date.now();
  const data={name,phone:$('empPhone').value.trim(),color:selectedColor,role:$('empRole').value,
    hourlyRate:parseInt($('empHourlyRate').value)||0,maxHours:parseInt($('empMaxHours').value)||40,
    preferredHours:$('empPreferredHours').value.trim()||'',unavailableHours:$('empUnavailableHours').value.trim()||''};
  closeModal($empEditModal);employees[id]=data;renderEmpList();renderAll();
  const ok=await fbPut(FB_EMPLOYEES+'/'+id,data);if(ok)showToast('저장됨');else showToast('저장 실패');
});

// ============================================================
// 15. Day-off Management Modal
// ============================================================
// 휴무 판정: dayoffs 명시값 우선 → false 면 수동 해제, true 면 휴무
// 값 없으면 fixed.off 즉석 해석 (generateAutoDayoffs 제거 대체)
function isDayOff(empId,dk){
  const dv = dayoffs[empId] ? dayoffs[empId][dk] : undefined;
  if(dv===true) return true;
  if(dv===false) return false;
  const emp = employees[empId]; if(!emp) return false;
  const fs = fixedSchedules[emp.name]; if(!fs) return false;
  const dObj = (typeof dk==='string') ? new Date(dk.replace(/-/g,'/')) : dk;
  const dow = dObj.getDay();
  const dowStr = ['sun','mon','tue','wed','thu','fri','sat'][dow];
  const _tdk = dateKey(currentDate);
  const _wsc = (dk === _tdk) ? daySchedule : (weekSchedules[dk] || {});
  if(fs.type==='fixed'){
    if(fs.off && Array.isArray(fs.off) && fs.off.includes(dow)){
      return !(_wsc[empId] && _wsc[empId].start);
    }
    return false;
  }
  if(fs.type==='weekly'){
    if(fs.days && Array.isArray(fs.days) && !fs.days.includes(dowStr)){
      return !(_wsc[empId] && _wsc[empId].start);
    }
    return false;
  }
  return false;
}
function getDayOffEmployees(dk){ const r=[]; for(const eid in dayoffs)if(dayoffs[eid][dk])r.push(eid); return r; }

async function addDayOff(empId,dk){
  if(!dayoffs[empId])dayoffs[empId]={};
  dayoffs[empId][dk]=true;
  fbPut(FB_DAYOFFS+'/'+empId+'/'+dk,true);
  if(dk===dateKey(currentDate)){renderAll();}
}
async function removeDayOff(empId,dk){
  if(dayoffs[empId])delete dayoffs[empId][dk];
  fbDelete(FB_DAYOFFS+'/'+empId+'/'+dk);
  if(dk===dateKey(currentDate))renderAll();
}

function parseBulkDayoffs(text){
  const results=[];const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);
  const now=new Date();const thisYear=now.getFullYear();
  for(const line of lines){
    let matchedEmpId=null,matchedName='',restText=line;
    for(const empId in employees){const name=employees[empId].name;if(line.startsWith(name)){matchedEmpId=empId;matchedName=name;restText=line.slice(name.length).trim();break;}}
    if(!matchedEmpId)continue;
    const dowMap2={'일':0,'월':1,'화':2,'수':3,'목':4,'금':5,'토':6};
    const dowPat=restText.match(/^([일월화수목금토])([,\s]+[일월화수목금토])*/);
    if(dowPat){const dows=restText.match(/[일월화수목금토]/g);if(dows){const m2=getMonday(now);dows.forEach(d2=>{const t=dowMap2[d2];if(t!==undefined){const dt=new Date(m2);dt.setDate(dt.getDate()+(t===0?6:t-1));results.push({empId:matchedEmpId,date:dateKey(dt)});}});}continue;}
    const rangeM=restText.match(/(\d{1,2})[\/\-](\d{1,2})\s*[~\-]\s*(\d{1,2})[\/\-](\d{1,2})/);
    if(rangeM){let[,m1,d1,m2,d2]=rangeM.map(Number);const s=new Date(thisYear,m1-1,d1),e2=new Date(thisYear,m2-1,d2);for(let d3=new Date(s);d3<=e2;d3.setDate(d3.getDate()+1))results.push({empId:matchedEmpId,date:dateKey(d3)});continue;}
    const isoM=restText.match(/(\d{4})-(\d{1,2})-(\d{1,2})/g);
    if(isoM){isoM.forEach(ds=>{const[y,m,d2]=ds.split('-').map(Number);results.push({empId:matchedEmpId,date:y+'-'+pad(m)+'-'+pad(d2)});});continue;}
    const slashD=restText.match(/(\d{1,2})[\/](\d{1,2})/g);
    if(slashD&&slashD.length>0){slashD.forEach(ds=>{const[m,d2]=ds.split('/').map(Number);results.push({empId:matchedEmpId,date:thisYear+'-'+pad(m)+'-'+pad(d2)});});continue;}
  }
  return results;
}

const $dayoffModal=$('dayoffModal');
function renderDayoffList(){
  const list=$('dayoffList'),select=$('dayoffEmpSelect');
  select.innerHTML='';
  for(const empId in employees){const opt=document.createElement('option');opt.value=empId;opt.textContent=employees[empId].name;select.appendChild(opt);}
  $('dayoffDate').value=dateKey(currentDate);
  const allEntries=[];
  for(const eid in dayoffs)for(const dk in dayoffs[eid])if(dayoffs[eid][dk])allEntries.push({empId:eid,date:dk});
  allEntries.sort((a,b)=>a.date.localeCompare(b.date));
  if(allEntries.length===0){list.innerHTML='<div style="color:#707088;font-size:.8rem;padding:8px;">등록된 휴무가 없습니다</div>';return;}
  let html='',lastDate='';
  for(const entry of allEntries){
    if(entry.date!==lastDate){const d2=new Date(entry.date);html+='<div style="font-size:.75rem;color:#9090A8;margin-top:8px;margin-bottom:2px;">'+entry.date+' ('+DOW_KR[d2.getDay()]+')</div>';lastDate=entry.date;}
    const emp=employees[entry.empId];const name=emp?emp.name:entry.empId;const color=emp?emp.color:'#9090A8';
    html+='<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:#1A1A30;border-radius:6px;margin-bottom:3px;">';
    html+='<span style="width:8px;height:8px;border-radius:50%;background:'+color+';flex-shrink:0;"></span>';
    html+='<span style="flex:1;font-size:.85rem;">'+name+'</span>';
    html+='<button class="btn btn-sm" style="min-width:30px;min-height:26px;padding:2px 6px;font-size:.7rem;color:#E74C3C;border-color:#E74C3C55;" data-dayoff-del="'+entry.empId+'|'+entry.date+'">✕</button></div>';
  }
  list.innerHTML=html;
  list.querySelectorAll('[data-dayoff-del]').forEach(btn=>{
    btn.addEventListener('click',async()=>{const[eid,dk]=btn.dataset.dayoffDel.split('|');await removeDayOff(eid,dk);renderDayoffList();});
  });
}

$('dayoffMgrBtn').addEventListener('click',()=>{renderDayoffList();openModal($dayoffModal);});
$('dayoffModalClose').addEventListener('click',()=>closeModal($dayoffModal));
$dayoffModal.addEventListener('click',(e)=>{if(e.target===$dayoffModal)closeModal($dayoffModal);});
$('dayoffAddBtn').addEventListener('click',async()=>{
  const eid=$('dayoffEmpSelect').value,dk=$('dayoffDate').value;if(!eid||!dk)return;
  await addDayOff(eid,dk);showToast((employees[eid]?.name||'')+' '+dk+' 휴무 등록');renderDayoffList();
});
$('dayoffBulkBtn').addEventListener('click',async()=>{
  const text=$('dayoffBulkInput').value.trim();if(!text)return;
  const entries=parseBulkDayoffs(text);if(entries.length===0){showToast('인식된 휴무가 없습니다');return;}
  for(const e2 of entries)await addDayOff(e2.empId,e2.date);
  $('dayoffBulkInput').value='';showToast(entries.length+'건 휴무 등록 완료');renderDayoffList();
});

// ============================================================
// 16. Navigation
// ============================================================
$('prevDay1').addEventListener('click',()=>{currentDate.setDate(currentDate.getDate()-1);onDateChange();});
$('nextDay1').addEventListener('click',()=>{currentDate.setDate(currentDate.getDate()+1);onDateChange();});
$('prevDay').addEventListener('click',()=>{currentDate.setDate(currentDate.getDate()-7);onDateChange();});
$('nextDay').addEventListener('click',()=>{currentDate.setDate(currentDate.getDate()+7);onDateChange();});
$dateDisplay.addEventListener('click',()=>openDatePicker());

function showDateFlash(){
  const m=currentDate.getMonth()+1,d=currentDate.getDate(),dow=DOW_KR[currentDate.getDay()];
  let el=document.getElementById('dateFlash');
  if(!el){el=document.createElement('div');el.id='dateFlash';el.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:2.5rem;font-weight:900;color:#fff;opacity:0;pointer-events:none;z-index:999;text-shadow:0 2px 12px #000a;transition:opacity .15s;';document.body.appendChild(el);}
  el.textContent=m+'/'+d+' '+dow;el.style.opacity='.35';
  clearTimeout(el._t);el._t=setTimeout(()=>{el.style.opacity='0';},600);
}

function updateDateDisplay(){
  const m=currentDate.getMonth()+1,d=currentDate.getDate(),dow=DOW_KR[currentDate.getDay()];
  $dateDisplay.textContent=m+'/'+d+' '+dow;
}

let _dateChangeId=0;
async function onDateChange(){
  const myId=++_dateChangeId;
  showDateFlash();updateDateDisplay();
  if(sseSchedule){try{sseSchedule.close();}catch(e){} sseSchedule=null;}
  connectScheduleSSE(sseGeneration);
  const dk=dateKey(currentDate);
  daySchedule={};dayAttendance={};
  generateAutoDayoffs();autoApplyFixed(dk);
  renderCurrentTab();
  if(myId!==_dateChangeId)return;
  try{
    const[schedData,fbShiftSt,fbConfirmed,fbAttendance]=await Promise.all([
      fbGet(FB_SCHEDULES+'/'+dk),
      fbGet(FB_WS+'/shift_status/'+dk),
      fbGet(FB_WS+'/confirmed/'+dk),
      fbGet(FB_BASE+'/packhelper/storebot_attendance/'+dk)
    ]);
    if(myId!==_dateChangeId)return;
    if(schedData){const merged={};for(const id in schedData)if(DEFAULT_EMPLOYEES[id])merged[id]=schedData[id];daySchedule=merged;}
    if(fbShiftSt) Object.keys(fbShiftSt).forEach(eid=>{const st=fbShiftSt[eid];if(st)shiftStatus[dk+'_'+eid]=st;else delete shiftStatus[dk+'_'+eid];});
    if(fbConfirmed!==undefined&&fbConfirmed!==null) confirmedDays[dk]=!!fbConfirmed; else delete confirmedDays[dk];
    dayAttendance=fbAttendance||{};
    autoApplyFixed(dk);
    renderCurrentTab();
  }catch(e){console.error('[WS] onDateChange',e);}
  if(myId!==_dateChangeId)return;
  loadWeekSchedules();updateConfirmBtn();
}

function openDatePicker(){
  const overlay=$('datePickerOverlay'),list=$('datePickerList');
  const today=new Date();today.setHours(0,0,0,0);
  const selectedDk=dateKey(currentDate),todayDk=dateKey(today);
  const empKeys=Object.keys(employees);
  let html='<div class="dp-jump"><button data-action="jumpDate" data-days="-7">◀ 1주</button><button data-action="jumpDate" data-days="0">오늘</button><button data-action="jumpDate" data-days="7">1주 ▶</button></div>';
  for(let i=0;i<30;i++){
    const d=new Date(today);d.setDate(d.getDate()+i);const dk=dateKey(d),dow=DOW_KR[d.getDay()];
    const isToday=dk===todayDk,isSelected=dk===selectedDk;
    const m=d.getMonth()+1,dd=d.getDate();
    let workC=0,offC=0;
    empKeys.forEach(id=>{if(isDayOff(id,dk))offC++;else{const s=weekSchedules[dk]?.[id]||(dk===dateKey(currentDate)?daySchedule[id]:null);if(s&&s.start)workC++;}});
    const cls=isToday?'dp-item today':isSelected?'dp-item selected':'dp-item';
    const dowColor=(d.getDay()===0||isKrHoliday(d))?'#E74C3C':d.getDay()===6?'#45B7D1':'#9090A8';
    html+='<div class="'+cls+'" data-dk="'+dk+'"><span class="dp-dow" style="color:'+dowColor+';">'+dow+'</span><span class="dp-date">'+m+'/'+dd+'</span><span class="dp-summary">';
    if(workC>0)html+='<span style="color:#2ECC71;">'+workC+'명</span> ';
    if(offC>0)html+='<span style="color:#E74C3C;">휴'+offC+'</span>';
    if(isToday)html+=' <span style="color:#FFD700;font-weight:700;">오늘</span>';
    html+='</span></div>';
  }
  list.innerHTML=html;overlay.classList.add('open');
  list.addEventListener('click',function(e){
    const jb=e.target.closest('[data-action="jumpDate"]');
    if(jb){jumpDate(parseInt(jb.dataset.days));return;}
    const item=e.target.closest('.dp-item');
    if(item&&item.dataset.dk){const p=item.dataset.dk.split('-');currentDate=new Date(+p[0],+p[1]-1,+p[2]);overlay.classList.remove('open');onDateChange();}
  });
  overlay.addEventListener('click',(e)=>{if(e.target===overlay)overlay.classList.remove('open');},{once:true});
}
function jumpDate(days){if(days===0)currentDate=new Date();else currentDate.setDate(currentDate.getDate()+days);$('datePickerOverlay').classList.remove('open');onDateChange();}

// ============================================================
// 17. Confirm / Reset
// ============================================================
function isConfirmed(dk){return !!confirmedDays[dk];}
function getShiftStatus(dk,empId){return shiftStatus[dk+'_'+empId]||'auto';}
function setShiftStatus(dk,empId,st){
  const key=dk+'_'+empId;
  if(st==='auto')delete shiftStatus[key];else shiftStatus[key]=st;
  fbPut(FB_WS+'/shift_status/'+dk+'/'+empId,st==='auto'?null:st);
  renderAll();
}

$('resetFixedBtn').addEventListener('click',()=>{
  if(!confirm('고정근무자 스케줄을 초기화하고 재배치합니다.'))return;
  const dk=dateKey(currentDate);resetToFixed(dk);
});

function resetToFixed(dk){
  // 로컬 메모리에만 fixed 재배치. schedules 에 자동으로 찍지 않음.
  // (사용자 수동 입력으로 덮인 값이 있다면 삭제)
  const parts=dk.split('-');const dateObj=new Date(+parts[0],+parts[1]-1,+parts[2]);
  for(const empName in fixedSchedules){
    const fix=getFixedScheduleForDate(empName,dateObj);const empId=findEmpIdByName(empName);if(!empId)continue;
    // 수동 예외로 schedules 에 저장된 값이 있으면 삭제 (고정값으로 되돌림)
    fbDelete(FB_SCHEDULES+'/'+dk+'/'+empId);
    if(!fix||!fix.start||isDayOff(empId,dk)){delete daySchedule[empId];}
    else{daySchedule[empId]={start:fix.start,end:fix.end,role:fix.role};}
  }
  renderCurrentTab();showToast('고정 스케줄 재배치 완료');
}

$('confirmDayBtn').addEventListener('click',()=>{
  const dk=dateKey(currentDate);
  if(confirmedDays[dk]){delete confirmedDays[dk];showToast(dk+' 작업중으로 변경');}
  else{confirmedDays[dk]=true;showToast(dk+' 확정 완료');}
  fbPut(FB_WS+'/confirmed/'+dk,confirmedDays[dk]||null);
  updateConfirmBtn();
});

function updateConfirmBtn(){
  const dk=dateKey(currentDate),btn=$('confirmDayBtn');
  if(confirmedDays[dk]){btn.textContent='확정';btn.style.color='#2ECC71';btn.style.borderColor='#2ECC71';btn.style.background='#2ECC7120';}
  else{btn.textContent='작업중';btn.style.color='#E67E22';btn.style.borderColor='#E67E2255';btn.style.background='transparent';}
}

function confirmAllShifts(){
  const dk=dateKey(currentDate);const fbBatch={};
  Object.keys(employees).forEach(id=>{
    if(daySchedule[id]&&daySchedule[id].start&&!isDayOff(id,dk)){shiftStatus[dk+'_'+id]='confirmed';fbBatch[id]='confirmed';}
    else if(!daySchedule[id]||!daySchedule[id].start){
      if(!isDayOff(id,dk)){if(!dayoffs[id])dayoffs[id]={};dayoffs[id][dk]=true;fbPut(FB_DAYOFFS+'/'+id+'/'+dk,true);}
    }
  });
  fbPut(FB_WS+'/shift_status/'+dk,fbBatch);
  confirmedDays[dk]=true;fbPut(FB_WS+'/confirmed/'+dk,true);
  renderAll();
}

function toggleDayOffFromList(empId){
  const dk=dateKey(currentDate);
  if(!dayoffs[empId])dayoffs[empId]={};
  if(dayoffs[empId][dk]===true){
    dayoffs[empId][dk]=false;
    if(daySchedule[empId]&&daySchedule[empId].dayoff)delete daySchedule[empId];
    const empName=employees[empId]?.name||'';
    const fix=getFixedScheduleForDate(empName,currentDate);
    if(fix&&fix.type==='fixed'&&fix.start){
      // 로컬 daySchedule 에만 fixed 병합 — schedules 에 쓰지 않음
      daySchedule[empId]={start:fix.start,end:fix.end,role:fix.role};
      shiftStatus[dk+'_'+empId]='confirmed';
    }
    showToast('휴무 해제 + 확정');
  } else {
    dayoffs[empId][dk]=true;
    if(daySchedule[empId]){delete daySchedule[empId];fbDelete(FB_SCHEDULES+'/'+dk+'/'+empId);}
    showToast('휴무 지정');
  }
  const dval=dayoffs[empId]?.[dk];
  fbPut(FB_DAYOFFS+'/'+empId+'/'+dk,dval===undefined?null:dval);
  renderAll();
}

function confirmDayOff(empId){
  const dk=dateKey(currentDate);
  if(!dayoffs[empId])dayoffs[empId]={};
  dayoffs[empId][dk]=true;
  if(daySchedule[empId]){delete daySchedule[empId];fbDelete(FB_SCHEDULES+'/'+dk+'/'+empId);}
  fbPut(FB_DAYOFFS+'/'+empId+'/'+dk,true);
  showToast('휴무 확정');renderAll();
}

// ============================================================
// 18. Share (text + URL only)
// ============================================================
if($('shareTextBtn')) $('shareTextBtn').addEventListener('click',()=>{
  const empKeys=Object.keys(employees);
  const m=currentDate.getMonth()+1,d=currentDate.getDate(),dow=DOW_KR[currentDate.getDay()];
  let text='근무표 '+m+'/'+d+' ('+dow+')\n─────────────\n';
  let hasShift=false; const dk=dateKey(currentDate);
  empKeys.forEach(empId=>{
    const emp=employees[empId]; if(emp.name==='이원규')return; if(isDayOff(empId,dk))return;
    const shift=daySchedule[empId];
    if(shift&&shift.start){text+=emp.name+': '+shift.start+'~'+shift.end;if(shift.role)text+=' ('+shift.role+')';text+=' ['+calcHours(shift.start,shift.end)+'h]\n';hasShift=true;}
  });
  if(!hasShift)text+='(근무 없음)\n';
  if(window.NativeBridge&&window.NativeBridge.shareText) window.NativeBridge.shareText(text);
  else if(navigator.clipboard) navigator.clipboard.writeText(text).then(()=>showToast('텍스트 복사됨'));
  else{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);showToast('텍스트 복사됨');}
});

if($('copyUrlBtn')) $('copyUrlBtn').addEventListener('click',()=>{
  const url=window.location.href;
  if(navigator.clipboard) navigator.clipboard.writeText(url).then(()=>showToast('URL 복사됨'));
  else{const ta=document.createElement('textarea');ta.value=url;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);showToast('URL 복사됨');}
});

// Safe no-op for removed share features (DOM elements still exist in HTML)
if($('shareKakaoBtn')) $('shareKakaoBtn').addEventListener('click',()=>showToast('카톡 공유 기능 제거됨'));
if($('shareImageBtn')) $('shareImageBtn').addEventListener('click',()=>showToast('이미지 공유 기능 제거됨'));

// ============================================================
// 19. Collapsible sections (session memory only)
// ============================================================
function setupCollapsible(toggleId,arrowId,bodyId,defaultOpen){
  const body=$(bodyId),arrow=$(arrowId);
  if(!body||!arrow||!$(toggleId))return;
  const isOpen=sectionState[bodyId]!==undefined?sectionState[bodyId]:defaultOpen;
  if(isOpen){body.classList.add('open');arrow.classList.add('open');}
  $(toggleId).addEventListener('click',()=>{
    const open=body.classList.toggle('open');
    arrow.classList.toggle('open',open);
    sectionState[bodyId]=open;
    if(open&&bodyId==='weekBody') renderAll(true);
  });
}

setupCollapsible('weekToggle','weekArrow','weekBody',false);
setupCollapsible('infoToggle','infoArrow','infoBody',false);
setupCollapsible('aiToggle','aiArrow','aiBody',false);
setupCollapsible('payToggle','payArrow','payBody',false);
setupCollapsible('shareToggle','shareArrow','shareBody',false);

// ============================================================
// 20. Layout Tab Switching + Swipe
// ============================================================
function switchTab(tabName){
  currentTab=tabName;
  document.querySelectorAll('.layout-tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===tabName));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  const panelMap={list:'panelList',timebar:'panelTimebar'};
  const panel=$(panelMap[tabName]); if(panel)panel.classList.add('active');
  renderCurrentTab();
}
document.querySelectorAll('.layout-tab').forEach(tab=>{tab.addEventListener('click',()=>switchTab(tab.dataset.tab));});

let swipeStartX=0,swipeStartY=0;
$('tabContent').addEventListener('touchstart',(e)=>{swipeStartX=e.touches[0].clientX;swipeStartY=e.touches[0].clientY;},{passive:true});
$('tabContent').addEventListener('touchend',(e)=>{
  const dx=e.changedTouches[0].clientX-swipeStartX,dy=e.changedTouches[0].clientY-swipeStartY;
  if(Math.abs(dx)<60||Math.abs(dy)>Math.abs(dx)*0.7)return;
  if(dx<0){currentDate.setDate(currentDate.getDate()+1);onDateChange();}
  else{currentDate.setDate(currentDate.getDate()-1);onDateChange();}
},{passive:true});

function renderCurrentTab(){
  if(currentTab==='list')renderListView();
  else if(currentTab==='timebar')renderTimebarView();
}

// Month modal
if($('monthViewBtn')) $('monthViewBtn').addEventListener('click',()=>{monthViewYear=currentDate.getFullYear();monthViewMonth=currentDate.getMonth()+1;renderMonthView();openModal($monthModal);});
$('monthModalClose').addEventListener('click',()=>closeModal($monthModal));
$('monthPrev').addEventListener('click',()=>{monthViewMonth--;if(monthViewMonth<1){monthViewMonth=12;monthViewYear--;}renderMonthView();});
$('monthNext').addEventListener('click',()=>{monthViewMonth++;if(monthViewMonth>12){monthViewMonth=1;monthViewYear++;}renderMonthView();});

// Refresh
$('refreshBtn').addEventListener('click',()=>{showToast('새로고침...');location.reload();});

// Contact import (safe no-op)
if($('contactImportBtn')) $('contactImportBtn').addEventListener('click',()=>showToast('연락처 가져오기 기능 제거됨'));

// Visibility change
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){connectSSE();loadData();}});

// Close modals on overlay click
[$shiftModal,$monthModal,$empModal,$empEditModal].forEach(modal=>{
  if(modal) modal.addEventListener('click',(e)=>{if(e.target===modal)closeModal(modal);});
});

// ============================================================
// Init
// ============================================================
function init(){
  currentDate=new Date();
  updateDateDisplay();
  buildTimeSelects();
  const wi=$('weatherInfo');if(wi)wi.innerHTML='<span style="color:#9090A8;">-</span>';
  const si=$('sportsInfo');if(si)si.innerHTML='<span style="color:#9090A8;">-</span>';
  loadData();
  connectSSE();
}

init();

})();
