(function(){
'use strict';

// ============================================================
// Firebase Config
// ============================================================
const FB_BASE = 'https://poskds-4ba60-default-rtdb.asia-southeast1.firebasedatabase.app';
const FB_WS = FB_BASE + '/workschedule';
const FB_EMPLOYEES = FB_WS + '/employees';
const FB_SCHEDULES = FB_WS + '/schedules';
const FB_SETTINGS = FB_WS + '/settings';

// 읽기 전용 모드 — URL 파라미터 ?readonly=1 또는 Firebase 설정으로 활성화
const READONLY_MODE = new URLSearchParams(location.search).get('readonly') === '1';

// ============================================================
// 하루 시작 시간 (오픈시간) — 이 값만 바꾸면 게이지·정렬·타임바 전부 연동
// ============================================================
const DAY_START_HOUR = 3; // 새벽 3시 = 하루 시작
// DAY_START_HOUR 기준으로 24시간 배열 생성
function makeHoursFrom(start){ const a=[]; for(let i=0;i<24;i++){ a.push((start+i)%24); } return a; }
const ALL_HOURS = makeHoursFrom(DAY_START_HOUR); // [3,4,...,23,0,1,2]

// ============================================================
// Timeline hours: 12~12(+1) = 25 columns
// ============================================================
const TL_HOURS = [12,13,14,15,16,17,18,19,20,21,22,23,0,1,2,3,4,5,6,7,8,9,10,11,12];
const TL_START_HOUR = 12; // 12:00
const TL_TOTAL_HOURS = 25; // 12:00 ~ 12:00(+1) = 24h span, 25 columns (inclusive)

// ============================================================
// Default employees
// ============================================================
const DEFAULT_EMPLOYEES = {
  emp1: {name:'이원규', phone:'', role:'', hourlyRate:9860, maxHours:40, capabilities:['주방','차배달','오토바이']},
  emp2: {name:'권연옥', phone:'', role:'', hourlyRate:9860, maxHours:40, capabilities:['주방']},
  emp3: {name:'리', phone:'', role:'', hourlyRate:9860, maxHours:40, capabilities:['주방']},
  emp4: {name:'히오', phone:'', role:'', hourlyRate:9860, maxHours:40, capabilities:['주방']},
  emp5: {name:'박준모', phone:'', role:'', hourlyRate:9860, maxHours:40, capabilities:['주방','차배달']},
  emp9: {name:'사아야', phone:'', role:'', hourlyRate:9860, maxHours:40, capabilities:['주방']}
};

// ============================================================
// 한국 법정 공휴일
// ============================================================
const KR_HOLIDAYS = new Set([
  // 2026년
  '2026-01-01','2026-01-28','2026-01-29','2026-01-30', // 신정, 설연휴
  '2026-03-01', // 삼일절
  '2026-05-05','2026-05-06', // 어린이날+대체
  '2026-05-24', // 부처님오신날
  '2026-06-06', // 현충일
  '2026-08-15', // 광복절
  '2026-09-24','2026-09-25','2026-09-26', // 추석연휴
  '2026-10-03', // 개천절
  '2026-10-09', // 한글날
  '2026-12-25', // 성탄절
  // 2027년
  '2027-01-01',
  '2027-02-07','2027-02-08','2027-02-09', // 설연휴
  '2027-03-01', // 삼일절
  '2027-05-05', // 어린이날
  '2027-05-13', // 부처님오신날
  '2027-06-06', // 현충일
  '2027-08-15','2027-08-16', // 광복절+대체
  '2027-10-03', // 개천절
  '2027-10-04','2027-10-05','2027-10-06', // 추석연휴
  '2027-10-09', // 한글날
  '2027-12-25', // 성탄절
]);

const KR_HOLIDAY_NAMES = {
  '2026-01-01': '신정',
  '2026-01-28': '설날연휴',
  '2026-01-29': '설날',
  '2026-01-30': '설날연휴',
  '2026-03-01': '삼일절',
  '2026-05-05': '어린이날',
  '2026-05-06': '대체공휴일',
  '2026-05-24': '석가탄신일',
  '2026-06-06': '현충일',
  '2026-08-15': '광복절',
  '2026-09-24': '추석연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석연휴',
  '2026-10-03': '개천절',
  '2026-10-09': '한글날',
  '2026-12-25': '성탄절',
  '2027-01-01': '신정',
  '2027-02-07': '설날연휴',
  '2027-02-08': '설날',
  '2027-02-09': '설날연휴',
  '2027-03-01': '삼일절',
  '2027-05-05': '어린이날',
  '2027-05-13': '석가탄신일',
  '2027-06-06': '현충일',
  '2027-08-15': '광복절',
  '2027-08-16': '대체공휴일',
  '2027-10-03': '개천절',
  '2027-10-04': '추석연휴',
  '2027-10-05': '추석',
  '2027-10-06': '추석연휴',
  '2027-10-09': '한글날',
  '2027-12-25': '성탄절',
};

function getHolidayName(dateObj){
  const dk = (typeof dateObj === 'string') ? dateObj : dateKey(dateObj);
  return KR_HOLIDAY_NAMES[dk] || null;
}

function isKrHoliday(dateObj) {
  if(typeof dateObj === 'string') return KR_HOLIDAYS.has(dateObj);
  return KR_HOLIDAYS.has(dateKey(dateObj));
}
function isWeekend(dateObj) {
  const d = (typeof dateObj === 'string') ? new Date(dateObj.replace(/-/g,'/')) : dateObj;
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}
function isWeekendOrHoliday(dateObj) {
  return isWeekend(dateObj) || isKrHoliday(dateObj);
}

// ============================================================
// 근무형태(Shift Type) 색상 시스템 — Material Design 200 tone
// ============================================================
const SHIFT_TYPES = {
  '새벽':   {color:'#B39DDB', bg:'rgba(179,157,219,0.15)', label:'새벽', order:0},
  '오전':   {color:'#81D4FA', bg:'rgba(129,212,250,0.15)', label:'오전', order:1},
  '피크':   {color:'#FFD180', bg:'rgba(255,209,128,0.15)', label:'피크', order:2},
  '저녁':   {color:'#FFAB91', bg:'rgba(255,171,145,0.15)', label:'저녁', order:3},
  '마감':   {color:'#FF7043', bg:'rgba(255,112,67,0.15)', label:'마감', order:4},
  '풀타임': {color:'#80CBC4', bg:'rgba(128,203,196,0.15)', label:'풀타임', order:5},
  '야간':   {color:'#CE93D8', bg:'rgba(206,147,216,0.15)', label:'야간', order:6},
  '휴무':   {color:'#E74C3C', bg:'rgba(231,76,60,0.10)', label:'휴무', order:7},
  '미입력': {color:'#707088', bg:'transparent', label:'미입력', order:8},
};

function getShiftType(startStr, endStr){
  if(!startStr || !endStr) return SHIFT_TYPES['미입력'];
  const sh = parseInt(startStr.split(':')[0]);
  const hours = calcHours(startStr, endStr);
  if(hours >= 12) return SHIFT_TYPES['풀타임'];
  if(sh >= 0 && sh < 6) return SHIFT_TYPES['새벽'];
  if(sh >= 6 && sh < 12) return SHIFT_TYPES['오전'];
  if(sh >= 12 && sh < 17) return SHIFT_TYPES['피크'];
  if(sh >= 17 && sh < 21) return SHIFT_TYPES['저녁'];
  if(sh >= 21) return SHIFT_TYPES['마감'];
  return SHIFT_TYPES['오전'];
}

// 짧은 이름 (한 글자, 중복 없게)
const SHORT_NAMES = {};
function buildShortNames(){
  const names = Object.values(employees).map(e => e.name);
  const used = new Set();
  names.forEach(name => {
    // 성(첫 글자) 시도
    let short = name.charAt(0);
    if(!used.has(short)){ used.add(short); SHORT_NAMES[name] = short; return; }
    // 둘째 글자 시도
    if(name.length > 1){ short = name.charAt(1); if(!used.has(short)){ used.add(short); SHORT_NAMES[name] = short; return; } }
    // 두 글자
    short = name.substring(0,2);
    used.add(short); SHORT_NAMES[name] = short;
  });
}
function shortName(empName){ return SHORT_NAMES[empName] || empName?.charAt(0) || '?'; }

// ============================================================
// 고정 스케줄 (자동 입력)
// ============================================================
// 직원이름 → {start, end, role, type}
// type: 'fixed'=매일 고정, 'variable'=변칙(수동)
// 고정 스케줄 기본값 (수정 팝업 "고정으로 저장"으로 변경 가능)
let FIXED_SCHEDULES = {
  '이원규': {start:'17:00', end:'03:00', role:'주방,오토바이', type:'fixed'},
  '히오':   {start:'17:00', end:'03:00', role:'주방', type:'fixed'},
  '리':     {start:'17:00', end:'03:00', role:'주방', type:'fixed'},
  '박준모': {start:'03:00', end:'11:00', role:'주방,차배달', type:'fixed'},
  '권연옥': {start:null, end:null, role:'주방', type:'conditional'},
  '사아야': {start:'17:00', end:'22:00', role:'주방', type:'conditional'},
};

function getFixedScheduleForDate(empName, dateObj) {
  const d = (typeof dateObj === 'string') ? new Date(dateObj.replace(/-/g,'/')) : dateObj;
  const dow = d.getDay(); // 0=일,1=월,...6=토
  const holiday = isWeekendOrHoliday(d);

  if(empName === '이원규') return {start:'17:00', end:'03:00', role:'주방,오토바이', type:'fixed'};
  if(empName === '히오') {
    if(dow === 5 || dow === 6) return {start:'17:00', end:'05:00', role:'주방', type:'fixed'}; // 금토
    if(dow === 0) return {start:'17:00', end:'02:00', role:'주방', type:'fixed'}; // 일
    return {start:'17:00', end:'03:00', role:'주방', type:'fixed'};
  }
  if(empName === '리') {
    if(dow === 5 || dow === 6) return {start:'17:00', end:'05:00', role:'주방', type:'fixed'}; // 금토
    if(dow === 0) return {start:'17:00', end:'02:00', role:'주방', type:'fixed'}; // 일
    return {start:'17:00', end:'03:00', role:'주방', type:'fixed'};
  }
  if(empName === '박준모') {
    if(holiday) return {start:'07:00', end:'17:00', role:'주방,차배달', type:'fixed'};
    return {start:'03:00', end:'11:00', role:'주방,차배달', type:'fixed'};
  }
  if(empName === '권연옥') {
    if(dow === 1) return {start:'17:30', end:'03:00', role:'주방', type:'fixed'}; // 월
    if(dow === 2) return {start:'15:00', end:'00:00', role:'주방', type:'fixed'}; // 화
    if(dow === 5) return {start:'17:30', end:'03:00', role:'주방', type:'fixed'}; // 금
    return null; // 수목토일 = 휴무
  }
  if(empName === '사아야') {
    if(dow >= 1 && dow <= 3) return {start:'17:00', end:'22:00', role:'주방', type:'fixed'}; // 월화수
    return null; // 목금토일 = 휴무
  }
  return FIXED_SCHEDULES[empName] || null;
}

// localStorage/Firebase 저장된 고정값 덮어쓰기
try{
  const saved=JSON.parse(localStorage.getItem('ws_fixed_schedules'));
  if(saved) Object.assign(FIXED_SCHEDULES, saved);
}catch(e){}
// Firebase에서도 로드 (비동기)
(async()=>{try{
  const fb=await fbGet('/workschedule/fixed_schedules');
  if(fb){Object.assign(FIXED_SCHEDULES,fb);localStorage.setItem('ws_fixed_schedules',JSON.stringify(FIXED_SCHEDULES));}
}catch(e){}})();

// 직원별 가능 역할 (능력)
const EMP_CAPABILITIES = {
  '이원규': ['주방','차배달','오토바이'],
  '박준모': ['주방','차배달'],
  '리':     ['주방'],
  '히오':   ['주방'],
  '권연옥': ['주방'],
  '사아야': ['주방'],
};

// 역할 표시 (색상 텍스트, 이모지 지양)
const ROLE_LABELS = {'주방':'주방','차배달':'차','오토바이':'바이크'};
const ROLE_COLORS = {'주방':'#E67E22','차배달':'#4ECDC4','오토바이':'#FFD700'};

// ========== 인원 기준 설정 (예상매출 기반) ==========
// ========== 시간별 인원 기준 (per-hour) ==========
const GAUGE_HOURS = ALL_HOURS; // DAY_START_HOUR 기준 24시간
// 4 매출구간 프리셋 — 각 시간별 {주방:{min,max}, 오토바이:{min,max}, 차:{min,max}}
function makeHourlyPreset(label, rules){
  // rules: [{hours:[...], kitchen:{min,max}, bike:{min,max}, car:{min,max}}]
  const hourly = {};
  GAUGE_HOURS.forEach(h => { hourly[h] = {kitchen:{min:0,max:0},bike:{min:0,max:0},car:{min:0,max:0}}; });
  rules.forEach(r => { r.hours.forEach(h => { if(hourly[h]!==undefined){ hourly[h] = {kitchen:r.kitchen, bike:r.bike, car:r.car}; }}); });
  return {label, hourly, daStart:10, daEnd:1};
}
const STAFF_PRESETS = {
  '250': makeHourlyPreset('~250만', [
    {hours:[6,7,8,9,10,11,12], kitchen:{min:1,max:2}, bike:{min:0,max:1}, car:{min:0,max:1}},
    {hours:[13,14,15,16], kitchen:{min:0,max:1}, bike:{min:0,max:1}, car:{min:0,max:1}},
    {hours:[17], kitchen:{min:2,max:3}, bike:{min:0,max:1}, car:{min:0,max:1}},
    {hours:[18,19], kitchen:{min:2,max:2.5}, bike:{min:0,max:1}, car:{min:0,max:1}},
    {hours:[20,21], kitchen:{min:2,max:2.5}, bike:{min:0,max:1}, car:{min:0,max:1}},
    {hours:[22,23,0], kitchen:{min:2,max:2}, bike:{min:0,max:1}, car:{min:0,max:1}},
    {hours:[1,2,3], kitchen:{min:2,max:2}, bike:{min:0,max:1}, car:{min:0,max:1}},
  ]),
  '300': makeHourlyPreset('~300만', [
    {hours:[6,7,8,9,10,11,12], kitchen:{min:1,max:2}, bike:{min:0,max:1.5}, car:{min:0,max:1}},
    {hours:[13,14,15,16], kitchen:{min:0,max:1}, bike:{min:0,max:1}, car:{min:0,max:1}},
    {hours:[17], kitchen:{min:2,max:3}, bike:{min:0,max:1}, car:{min:0,max:1}},
    {hours:[18,19], kitchen:{min:2.5,max:3.5}, bike:{min:0,max:2}, car:{min:0,max:1}},
    {hours:[20,21], kitchen:{min:2.5,max:3.5}, bike:{min:0,max:1}, car:{min:0,max:1}},
    {hours:[22,23,0], kitchen:{min:2.5,max:3}, bike:{min:0,max:1}, car:{min:0,max:1}},
    {hours:[1,2,3], kitchen:{min:2,max:3}, bike:{min:0,max:1}, car:{min:0,max:1}},
  ]),
  '350': makeHourlyPreset('~350만', [
    {hours:[6,7,8,9,10,11,12], kitchen:{min:1,max:2}, bike:{min:0,max:2}, car:{min:0,max:1}},
    {hours:[13,14,15,16], kitchen:{min:0,max:1}, bike:{min:0,max:1}, car:{min:0,max:1}},
    {hours:[17], kitchen:{min:2,max:3}, bike:{min:0,max:1}, car:{min:0,max:1}},
    {hours:[18,19], kitchen:{min:3,max:4}, bike:{min:0,max:2.5}, car:{min:0,max:1}},
    {hours:[20,21], kitchen:{min:3,max:4}, bike:{min:0,max:1}, car:{min:0,max:1}},
    {hours:[22,23,0], kitchen:{min:3,max:3}, bike:{min:0,max:1}, car:{min:0,max:1}},
    {hours:[1,2,3], kitchen:{min:2,max:3}, bike:{min:0,max:1}, car:{min:0,max:1}},
  ]),
  '맥스': makeHourlyPreset('350만~', [
    {hours:[6,7,8,9,10,11,12], kitchen:{min:1,max:2}, bike:{min:0,max:2}, car:{min:0,max:1}},
    {hours:[13,14,15,16], kitchen:{min:0,max:1}, bike:{min:0,max:1}, car:{min:0,max:1}},
    {hours:[17], kitchen:{min:2,max:3}, bike:{min:0,max:1}, car:{min:0,max:1}},
    {hours:[18,19], kitchen:{min:3,max:4.5}, bike:{min:0,max:1}, car:{min:0,max:1}},
    {hours:[20,21], kitchen:{min:3,max:4.5}, bike:{min:0,max:1}, car:{min:0,max:1}},
    {hours:[22,23,0], kitchen:{min:3,max:3}, bike:{min:0,max:1}, car:{min:0,max:1}},
    {hours:[1,2,3], kitchen:{min:2,max:3}, bike:{min:0,max:1}, car:{min:0,max:1}},
  ]),
};
let staffSettings = JSON.parse(localStorage.getItem('ws_staff_settings') || 'null') || {
  preset: '250',
  presetOverrides: {} // {구간키: {h6: {kitchen,bike,car}, h7: ...}}
};
// 마이그레이션: hourlyOverrides → presetOverrides, 숫자키→문자키(h6,h7...)
(function migrateStaffSettings(){
  let changed = false;
  // 구 형식(custom/dailyRevenue/hourlyOverrides) 마이그레이션
  if(staffSettings.custom || staffSettings.hourlyOverrides || staffSettings.dailyRevenue != null){
    const old = staffSettings.hourlyOverrides;
    staffSettings = {preset: staffSettings.preset||'250', presetOverrides: {}};
    if(old){
      const converted = {};
      for(const k in old){ if(old[k]) converted['h'+k] = old[k]; }
      staffSettings.presetOverrides[staffSettings.preset] = converted;
    }
    changed = true;
  }
  if(!staffSettings.presetOverrides) staffSettings.presetOverrides = {};
  // 숫자키→문자키(h접두어) 변환 (Firebase 배열 변환 방지)
  for(const pk in staffSettings.presetOverrides){
    const ov = staffSettings.presetOverrides[pk];
    if(!ov) continue;
    // 배열이면 객체로 변환
    if(Array.isArray(ov)){
      const converted = {};
      ov.forEach((v,i) => { if(v) converted['h'+i] = v; });
      staffSettings.presetOverrides[pk] = converted;
      changed = true;
    } else {
      // 숫자키 있으면 h접두어 추가
      for(const k of Object.keys(ov)){
        if(!k.startsWith('h')){ ov['h'+k] = ov[k]; delete ov[k]; changed = true; }
      }
    }
  }
  // v2: 소수점 프리셋 적용 → 기존 정수 오버라이드 초기화
  if(staffSettings.ver !== 6){
    staffSettings.presetOverrides = {};
    staffSettings.ver = 6;
    changed = true;
  }
  if(changed){
    localStorage.setItem('ws_staff_settings', JSON.stringify(staffSettings));
  }
})();
function saveStaffSettings(){ localStorage.setItem('ws_staff_settings', JSON.stringify(staffSettings)); fbPut(FB_WS+'/staff_settings', staffSettings); }

// 날짜별 매출구간 맵
let dailyRevenueMap = JSON.parse(localStorage.getItem('ws_daily_revenue') || '{}');
// 요일별 기본 매출구간 (0=일,1=월,...6=토)
const WEEKDAY_REVENUE_DEFAULTS = { 0:'350', 1:'350', 2:'250', 3:'250', 4:'250', 5:'300', 6:'300' };
function getActivePresetKey(){
  const dk = dateKey(currentDate);
  if(dailyRevenueMap[dk]) return dailyRevenueMap[dk];
  const d = new Date(dk); const dow = d.getDay();
  return WEEKDAY_REVENUE_DEFAULTS[dow] || staffSettings.preset || '250';
}
function getActivePreset(){ return STAFF_PRESETS[getActivePresetKey()] || STAFF_PRESETS['250']; }

// 시간대별 역할 제한 — 구간별 오버라이드 우선 (키: h6, h7, ...)
function getRoleLimits(hour){
  const pk = getActivePresetKey();
  const ov = staffSettings.presetOverrides[pk];
  const hk = 'h'+hour;
  if(ov && ov[hk]){
    return {
      '주방': ov[hk].kitchen,
      '오토바이': ov[hk].bike,
      '차배달': ov[hk].car,
    };
  }
  const preset = getActivePreset();
  const h = preset.hourly[hour] || {kitchen:{min:0,max:0},bike:{min:0,max:0},car:{min:0,max:0}};
  return {
    '주방': h.kitchen,
    '오토바이': h.bike,
    '차배달': h.car,
  };
}

// 충돌 감지: 시간대별 역할 인원 초과/부족 체크
function detectConflicts(empKeys, dk){
  const conflicts = {}; // empId → [{hour, role, type, msg}]
  const checkHours = ALL_HOURS;

  for(const h of checkHours){
    const hStr = pad(h)+':00';
    const hMin = timeToMinutesFrom12(hStr);
    const roleEmps = {'주방':[],'차배달':[],'오토바이':[]};

    const roleWeights = {'주방':0,'차배달':0,'오토바이':0};
    empKeys.forEach(empId => {
      if(isDayOff(empId, dk)) return;
      const shift = daySchedule[empId];
      if(!shift || !shift.start || !shift.end) return;
      const sMin = timeToMinutesFrom12(shift.start);
      let eMin = timeToMinutesFrom12(shift.end);
      if(eMin <= sMin) eMin += 24*60;
      if(hMin >= sMin && hMin < eMin){
        const roles = shift.role ? shift.role.split(',').filter(Boolean) : [];
        if(roles.length === 0){
          roleEmps['주방'].push(empId);
          roleWeights['주방'] += 1;
        } else {
          const w = roles.length > 1 ? 0.5 : 1;
          roles.forEach(r => {
            if(roleEmps[r]){ roleEmps[r].push(empId); roleWeights[r] += w; }
          });
        }
      }
    });

    const limits = getRoleLimits(h);

    for(const role in limits){
      const emps = roleEmps[role] || [];
      const weight = roleWeights[role] || 0;
      const lim = limits[role];
      // max 초과 (가중치 기준)
      if(weight > lim.max){
        // 뒤쪽 직원에 충돌 표시
        const maxInt = Math.ceil(lim.max);
        for(let i = maxInt; i < emps.length; i++){
          if(!conflicts[emps[i]]) conflicts[emps[i]] = [];
          conflicts[emps[i]].push({hour:h, role, type:'over', msg:h+'시 '+role+' 초과('+weight+'/'+lim.max+')'});
        }
      }
      // min 부족 체크 (가중치 기준)
      if(lim.min > 0 && weight < lim.min){
        if(!conflicts['_hour_'+h]) conflicts['_hour_'+h] = [];
        conflicts['_hour_'+h].push({hour:h, role, type:'under', msg:h+'시 '+role+' 부족('+weight+'/'+lim.min+')'});
      }
    }
  }
  return conflicts;
}

function getFixedSchedule(empName){
  return getFixedScheduleForDate(empName, currentDate);
}

function findEmpIdByName(name){
  for(const id in employees){
    if(employees[id].name === name) return id;
  }
  return null;
}

// ============================================================
// State
// ============================================================
let currentTab = 'timebar'; // 'timebar' | 'list'
let currentDate = new Date();
let employees = {};
let daySchedule = {}; // schedule for currentDate
let weekSchedules = {}; // schedules for the week (dateStr -> data)
let monthScheduleSummary = {}; // monthKey -> {dateStr: count}
let sseEmployees = null;
let sseSchedule = null;
let sseGeneration = 0;
let monthViewYear, monthViewMonth;
let dataLoaded = false;
let confirmedDays = {}; // { 'yyyy-MM-dd': true } — 확정된 날짜
let dayAttendance = {}; // storebot_attendance for currentDate
let shiftStatus = {}; // { 'yyyy-MM-dd_empId': 'auto'|'confirmed'|'pending' } — 보정 상태

// 색상 상수 (전역)
const C_OK = '#2ECC71';   // 확정
const C_DEF = '#9090A8';  // 보정(기본)
const C_OFF = '#E74C3C';  // 휴무/충돌
const C_BG = '#1A1A30';

const LS_CONFIRMED = 'ws_confirmed';
const LS_SHIFT_STATUS = 'ws_shift_status';
const LS_PATTERNS = 'ws_patterns'; // AI 학습용 확정 패턴
function lsLoadConfirmed(){ try{ return JSON.parse(localStorage.getItem(LS_CONFIRMED)) || {}; }catch(e){ return {}; } }
function lsSaveConfirmed(data){ localStorage.setItem(LS_CONFIRMED, JSON.stringify(data)); }
function isConfirmed(dk){ return !!confirmedDays[dk]; }
function lsLoadShiftStatus(){ try{ return JSON.parse(localStorage.getItem(LS_SHIFT_STATUS)) || {}; }catch(e){ return {}; } }
function lsSaveShiftStatus(){ localStorage.setItem(LS_SHIFT_STATUS, JSON.stringify(shiftStatus)); }
function getShiftStatus(dk, empId){ return shiftStatus[dk+'_'+empId] || 'auto'; }
function setShiftStatus(dk, empId, st){
  const key = dk+'_'+empId;
  if(st==='auto') delete shiftStatus[key]; else shiftStatus[key]=st;
  lsSaveShiftStatus();
  // Firebase 동기화
  fbPut(FB_WS+'/shift_status/'+dk+'/'+empId, st==='auto' ? null : st);
  // 확정 시 패턴 기록 (AI 학습)
  if(st==='confirmed'){
    const shift = daySchedule[empId];
    if(shift && shift.start) recordPattern(empId, dk, shift);
  }
  renderAll();
}
function recordPattern(empId, dk, shift){
  try{
    const patterns = JSON.parse(localStorage.getItem(LS_PATTERNS)||'{}');
    const d = new Date(dk+'T00:00:00+09:00');
    const dow = d.getDay();
    const empName = employees[empId]?.name||empId;
    const key = empName+'_'+dow;
    if(!patterns[key]) patterns[key]={count:0,times:{}};
    const timeKey = shift.start+'~'+shift.end;
    patterns[key].count = (patterns[key].count||0)+1;
    patterns[key].times[timeKey] = (patterns[key].times[timeKey]||0)+1;
    patterns[key].lastRole = shift.role||'';
    patterns[key].lastDate = dk;
    localStorage.setItem(LS_PATTERNS, JSON.stringify(patterns));
    // Firebase 백업
    fbPut(FB_WS+'/patterns/'+encodeURIComponent(key), patterns[key]);
  }catch(e){}
}
function getPatternSuggestion(empId, dk){
  try{
    const patterns = JSON.parse(localStorage.getItem(LS_PATTERNS)||'{}');
    const d = new Date(dk+'T00:00:00+09:00');
    const dow = d.getDay();
    const empName = employees[empId]?.name||empId;
    const key = empName+'_'+dow;
    const p = patterns[key];
    if(!p || p.count < 2) return null;
    // 가장 빈번한 시간대 추천
    let bestTime=null, bestCount=0;
    for(const t in p.times){ if(p.times[t]>bestCount){bestCount=p.times[t];bestTime=t;} }
    if(!bestTime) return null;
    const [start,end] = bestTime.split('~');
    return {start, end, role:p.lastRole||'', confidence:Math.min(100,Math.round(bestCount/p.count*100)), count:p.count};
  }catch(e){ return null; }
}

// ============================================================
// DOM refs
// ============================================================
const $ = id => document.getElementById(id);
const $dateDisplay = $('dateDisplay');
const $loading = $('loadingIndicator');
const $tabContent = $('tabContent');
const $timelineContent = $('timelineContent');
const $weekGrid = $('weekGrid');
const $weekOffs = $('weekOffs');
const $shiftModal = $('shiftModal');
const $monthModal = $('monthModal');
const $empModal = $('empModal');
const $empEditModal = $('empEditModal');
const $toast = $('toast');

// ============================================================
// Utility
// ============================================================
function pad(n){ return n < 10 ? '0'+n : ''+n; }
function dateStr(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function dateKey(d){ return dateStr(d); }
function daysInMonth(y,m){ return new Date(y,m,0).getDate(); }
const DOW_KR = ['일','월','화','수','목','금','토'];
const DOW_KR_SHORT = ['일','월','화','수','목','금','토'];

function showToast(msg){
  $toast.textContent = msg;
  $toast.classList.add('show');
  setTimeout(()=> $toast.classList.remove('show'), 2000);
}
function openModal(el){ el.classList.add('active'); }
function closeModal(el){ el.classList.remove('active'); }

function isSameDay(a,b){
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}

function getMonday(d){
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0,0,0,0);
  return dt;
}

// 예정 vs 실제 출퇴근 통합 조회
function getEffectiveShift(empId, dk) {
  const sched = daySchedule[empId];
  const att = dayAttendance[empId];
  const result = { start: null, end: null, role: '', isActual: false, attData: att, schedData: sched };
  if (sched) {
    result.start = sched.start;
    result.end = sched.end;
    result.role = sched.role || '';
  }
  if (att) {
    const trustSources = ['owner', 'staff', 'manual', 'fallback+pair', 'bulk'];
    const startTrust = trustSources.includes(att.actual_start_source);
    const endTrust = trustSources.includes(att.actual_end_source);
    if (att.actual_start && startTrust) {
      result.start = att.actual_start;
      result.isActual = true;
    }
    if (att.actual_end && endTrust) {
      result.end = att.actual_end;
      result.isActual = true;
    }
  }
  return result;
}

// 출퇴근 source → 바 색상
function attSrcColor(source) {
  switch(source) {
    case 'owner': return '#2ECC71';
    case 'staff': return '#3498DB';
    case 'staff+pair': return '#4FC3F7';
    case 'manual': return '#E67E22';
    case 'fallback': return '#E67E22';
    case 'fallback+pair': return '#E67E22';
    case 'gemini': return '#9090A8';
    case 'gemini+pair': return '#4FC3F7';
    case 'bulk': return '#9090A8';
    default: return '#888888';
  }
}

// 시간 문자열 → 분 변환 (오차 계산용)
function parseTimeMin(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1] || 0);
}

// 근무자 배열로 게이지 범위 자동 계산 (최초출근-1h ~ 마지막퇴근+1h)
// 기준: 03시가 하루 시작
function calcGaugeRange(working){
  if(!working || working.length === 0) return {gaugeStart: DAY_START_HOUR, gaugeHours: 12};
  let minH = 48, maxH = 0;
  working.forEach(w => {
    let sH = parseInt(w.shift.start.split(':')[0]);
    let eH = parseInt(w.shift.end.split(':')[0]);
    let eM = parseInt(w.shift.end.split(':')[1] || 0);
    if(eM > 0) eH++; // 올림
    if(sH < DAY_START_HOUR) sH += 24;
    if(eH < DAY_START_HOUR) eH += 24;
    if(eH <= sH) eH += 24; // 자정 넘김 보정
    if(sH < minH) minH = sH;
    if(eH > maxH) maxH = eH;
  });
  // dayAttendance 실제 시간도 범위에 포함
  if (dayAttendance) {
    Object.values(dayAttendance).forEach(att => {
      if (att.actual_start) {
        let h = parseInt(att.actual_start.split(':')[0]);
        if (h < DAY_START_HOUR) h += 24;
        if (h < minH) minH = h;
      }
      if (att.actual_end) {
        let h = parseInt(att.actual_end.split(':')[0]);
        let m2 = parseInt(att.actual_end.split(':')[1] || 0);
        if (m2 > 0) h++;
        if (h < DAY_START_HOUR) h += 24;
        if (h > maxH) maxH = h;
      }
    });
  }
  const gaugeStart = minH - 1;
  const gaugeEnd = maxH + 1;
  let gaugeHours = gaugeEnd - gaugeStart;
  if(gaugeHours < 6) gaugeHours = 6;
  return {gaugeStart, gaugeHours};
}

// Convert time string "HH:MM" to minutes from 12:00(noon)
// Hours 00-11 are treated as next day (24-35)
function timeToMinutesFrom12(timeStr){
  const [h,m] = timeStr.split(':').map(Number);
  let hour = h;
  if(hour < 12) hour += 24; // next day: 00->24, 01->25, ..., 11->35
  return (hour - 12) * 60 + m;
}
// 정렬용: DAY_START_HOUR 기준 (하루 시작점)
function timeToMinutesFromDayStart(timeStr){
  const [h,m] = timeStr.split(':').map(Number);
  let hour = h;
  if(hour < DAY_START_HOUR) hour += 24;
  return (hour - DAY_START_HOUR) * 60 + m;
}

// Calculate hours between start and end
function calcHours(start, end){
  let sm = timeToMinutesFrom12(start);
  let em = timeToMinutesFrom12(end);
  if(em <= sm) em += 24*60;
  return Math.round((em - sm)/60*10)/10;
}

// Get the percentage position of a time in the timeline (0-100%)
// Timeline spans DAY_START_HOUR ~ DAY_START_HOUR+24 = 24 hours = 1440 minutes
const TL_TOTAL_MINUTES = 24 * 60; // 1440 minutes
function timeToPercent(timeStr){
  const mins = timeToMinutesFromDayStart(timeStr);
  return Math.max(0, Math.min(100, (mins / TL_TOTAL_MINUTES) * 100));
}

// ============================================================
// Firebase REST
// ============================================================
async function fbGet(url){
  try{
    const r = await fetch(url+'.json');
    if(!r.ok) throw new Error(r.status);
    return await r.json();
  }catch(e){ console.error('fbGet error',url,e); return null; }
}
async function fbPut(url, data){
  if(READONLY_MODE){ showToast('읽기 전용 모드'); return false; }
  try{
    const r = await fetch(url+'.json',{
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(data)
    });
    if(!r.ok) throw new Error(r.status);
    return true;
  }catch(e){ console.error('fbPut error',url,e); showToast('저장 실패'); return false; }
}
async function fbPatch(url, data){
  if(READONLY_MODE){ showToast('읽기 전용 모드'); return false; }
  try{
    const r = await fetch(url+'.json',{
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(data)
    });
    if(!r.ok) throw new Error(r.status);
    return true;
  }catch(e){ console.error('fbPatch error',url,e); showToast('저장 실패'); return false; }
}
async function fbDelete(url){
  try{
    const r = await fetch(url+'.json',{method:'DELETE'});
    if(!r.ok) throw new Error(r.status);
    return true;
  }catch(e){ console.error('fbDelete error',url,e); showToast('삭제 실패'); return false; }
}

// ============================================================
// localStorage — single source of truth (Firebase = backup)
// ============================================================
const LS_EMPLOYEES = 'ws_employees';
const LS_SCHEDULE_PREFIX = 'ws_sched_';

function lsSaveEmployees(data){
  try{ localStorage.setItem(LS_EMPLOYEES, JSON.stringify(data)); }catch(e){}
}
function lsLoadEmployees(){
  try{
    const s = localStorage.getItem(LS_EMPLOYEES);
    return s ? JSON.parse(s) : null;
  }catch(e){ return null; }
}
function lsSaveSchedule(dateKey, data){
  try{ localStorage.setItem(LS_SCHEDULE_PREFIX + dateKey, JSON.stringify(data)); }catch(e){}
}
function lsLoadSchedule(dateKey){
  try{
    const s = localStorage.getItem(LS_SCHEDULE_PREFIX + dateKey);
    return s ? JSON.parse(s) : null;
  }catch(e){ return null; }
}
function lsDeleteShift(dateKey, empId){
  const sched = lsLoadSchedule(dateKey) || {};
  delete sched[empId];
  lsSaveSchedule(dateKey, sched);
}

// ============================================================
// SSE with generation counter
// ============================================================
function connectSSE(){
  sseGeneration++;
  const gen = sseGeneration;

  // Employees SSE
  if(sseEmployees){ try{sseEmployees.close();}catch(e){} sseEmployees = null; }
  try{
    sseEmployees = new EventSource(FB_EMPLOYEES+'.json');
    sseEmployees.addEventListener('put', function(e){
      if(gen !== sseGeneration){ sseEmployees.close(); return; }
      try{
        const d = JSON.parse(e.data);
        if(d.path === '/'){
          const raw = d.data || {};
          employees = {};
          for(const id in raw){ if(DEFAULT_EMPLOYEES[id]) employees[id] = raw[id]; }
        } else {
          const key = d.path.replace(/^\//,'');
          if(!DEFAULT_EMPLOYEES[key]) return; // 삭제된 직원 무시
          if(d.data === null) delete employees[key];
          else employees[key] = d.data;
        }
        lsSaveEmployees(employees);
        renderAll();
      }catch(err){ console.error('SSE emp parse',err); }
    });
    sseEmployees.addEventListener('patch', function(e){
      if(gen !== sseGeneration){ sseEmployees.close(); return; }
      try{
        const d = JSON.parse(e.data);
        const key = d.path.replace(/^\//,'');
        if(key && d.data) employees[key] = Object.assign(employees[key]||{}, d.data);
        else if(!key && d.data) Object.assign(employees, d.data);
        lsSaveEmployees(employees);
        renderAll();
      }catch(err){ console.error('SSE emp patch parse',err); }
    });
    sseEmployees.onerror = function(){
      if(gen !== sseGeneration) return;
      try{sseEmployees.close();}catch(e){}
      sseEmployees = null;
      setTimeout(()=>{ if(gen === sseGeneration) connectSSE(); }, 3000);
    };
  }catch(e){ console.error('SSE emp connect fail',e); }

  // Schedule SSE for current date
  connectScheduleSSE(gen);
}

function connectScheduleSSE(gen){
  if(sseSchedule){ try{sseSchedule.close();}catch(e){} sseSchedule = null; }
  const dk = dateKey(currentDate);
  try{
    sseSchedule = new EventSource(FB_SCHEDULES+'/'+dk+'.json');
    sseSchedule.addEventListener('put', function(e){
      if(gen !== sseGeneration){ sseSchedule.close(); return; }
      try{
        const d = JSON.parse(e.data);
        if(d.path === '/'){
          daySchedule = d.data || {};
        } else {
          const key = d.path.replace(/^\//,'').split('/')[0];
          if(d.data === null) delete daySchedule[key];
          else {
            if(d.path.split('/').filter(Boolean).length === 1){
              daySchedule[key] = d.data;
            } else {
              if(!daySchedule[key]) daySchedule[key] = {};
              const subkey = d.path.replace(/^\//,'').split('/')[1];
              if(d.data === null) delete daySchedule[key][subkey];
              else daySchedule[key][subkey] = d.data;
            }
          }
        }
        lsSaveSchedule(dateKey(currentDate), daySchedule);
        renderAll();
      }catch(err){ console.error('SSE sched parse',err); }
    });
    sseSchedule.addEventListener('patch', function(e){
      if(gen !== sseGeneration){ sseSchedule.close(); return; }
      try{
        const d = JSON.parse(e.data);
        const parts = d.path.replace(/^\//,'').split('/').filter(Boolean);
        if(parts.length === 0 && d.data){
          Object.keys(d.data).forEach(k=>{
            daySchedule[k] = Object.assign(daySchedule[k]||{}, d.data[k]);
          });
        } else if(parts.length === 1 && d.data){
          daySchedule[parts[0]] = Object.assign(daySchedule[parts[0]]||{}, d.data);
        }
        renderAll();
      }catch(err){ console.error('SSE sched patch parse',err); }
    });
    sseSchedule.onerror = function(){
      if(gen !== sseGeneration) return;
      try{sseSchedule.close();}catch(e){}
      sseSchedule = null;
      setTimeout(()=>{ if(gen === sseGeneration) connectScheduleSSE(gen); }, 3000);
    };
  }catch(e){ console.error('SSE sched connect fail',e); }
}

// ============================================================
// Data loading
// ============================================================
async function loadData(){
  console.log('[WS] loadData start');
  const dk = dateKey(currentDate);

  // 1) localStorage 즉시 로드 (데이터 유실 방지)
  confirmedDays = lsLoadConfirmed();
  shiftStatus = lsLoadShiftStatus();
  const localEmp = lsLoadEmployees();
  const localSched = lsLoadSchedule(dk);
  if(localEmp && Object.keys(localEmp).length > 0){
    employees = localEmp;
    Object.keys(employees).forEach(id => {
      if(!employees[id].hourlyRate) employees[id].hourlyRate = 9860;
      // capabilities 없으면 DEFAULT에서 보충
      if(!employees[id].capabilities && DEFAULT_EMPLOYEES[id]){
        employees[id].capabilities = DEFAULT_EMPLOYEES[id].capabilities;
      }
    });
  }
  if(localSched){
    daySchedule = localSched;
  }

  // 이미 로컬 데이터 있으면 즉시 렌더 (로딩 없이)
  if(localEmp || localSched){
    dataLoaded = true;
    $loading.style.display = 'none';
    $tabContent.style.display = '';
    renderAll();
  } else {
    $loading.style.display = 'flex';
    $tabContent.style.display = 'none';
  }

  // 2) Firebase 백그라운드 동기화
  try {
    const [empData, schedData, fbShiftStatus] = await Promise.all([
      fbGet(FB_EMPLOYEES),
      fbGet(FB_SCHEDULES+'/'+dk),
      fbGet(FB_WS+'/shift_status/'+dk)
    ]);

    if(empData && Object.keys(empData).length > 0){
      // DEFAULT_EMPLOYEES에 있는 직원만 사용 (삭제된 직원 필터)
      const filtered = {};
      for(const id in empData){
        if(DEFAULT_EMPLOYEES[id]) filtered[id] = empData[id];
      }
      employees = Object.keys(filtered).length > 0 ? filtered : JSON.parse(JSON.stringify(DEFAULT_EMPLOYEES));
      lsSaveEmployees(employees);
    } else if(!localEmp || Object.keys(employees).length === 0){
      employees = JSON.parse(JSON.stringify(DEFAULT_EMPLOYEES));
      lsSaveEmployees(employees);
      fbPut(FB_EMPLOYEES, employees);
    }

    if(schedData){
      // Firebase 데이터와 로컬 병합 (로컬 우선) — 삭제된 직원 제외
      const rawMerged = Object.assign({}, schedData, localSched || {});
      const merged = {};
      for(const id in rawMerged){ if(DEFAULT_EMPLOYEES[id]) merged[id] = rawMerged[id]; }
      daySchedule = merged;
      lsSaveSchedule(dk, merged);
    }
    // Firebase shift_status 병합 (Firebase 우선 — 다른 기기에서 확정한 것 반영)
    if(fbShiftStatus){
      Object.keys(fbShiftStatus).forEach(empId => {
        const st = fbShiftStatus[empId];
        if(st) shiftStatus[dk+'_'+empId] = st;
        else delete shiftStatus[dk+'_'+empId];
      });
      lsSaveShiftStatus();
    }
  } catch(err){
    console.error('loadData Firebase sync error:', err);
  }
  dataLoaded = true;

  try {
    // 짧은 이름 빌드
    buildShortNames();
    // 자동 휴무 생성 + 고정 스케줄 적용
    generateAutoDayoffs();
    autoApplyFixed(dk);

    // 첫 실행 시 전 데이터 삭제 후 고정값 초기화
    const initVer = localStorage.getItem('ws_init_ver');
    if(initVer !== 'v10'){
      // 직원 변경(전묘정/대유/김재훈 삭제, 사아야 추가) — 캐시 초기화
      localStorage.removeItem('ws_fixed_schedules');
      localStorage.removeItem('ws_dayoffs');
      localStorage.removeItem('ws_employees');
      localStorage.removeItem('ws_shift_status');
      for(let i=0; i<localStorage.length; i++){
        const key = localStorage.key(i);
        if(key && key.startsWith('ws_sched_')){
          localStorage.removeItem(key);
          i--; // 키 삭제 후 인덱스 조정
        }
      }
      dayoffs = {};
      daySchedule = {};
      shiftStatus = {};
      generateAutoDayoffs();
      autoApplyFixed(dk);
      localStorage.setItem('ws_init_ver', 'v10');
    }
  } catch(e) { console.error('loadData init error:', e); }

  $loading.style.display = 'none';
  $tabContent.style.display = '';
  renderAll();
  loadWeekSchedules();
  updateConfirmBtn();
}

async function loadWeekSchedules(){
  const monday = getMonday(currentDate);
  const schedPromises = [];
  const statusPromises = [];
  const keys = [];
  for(let i=0; i<7; i++){
    const d = new Date(monday);
    d.setDate(d.getDate()+i);
    const dk = dateKey(d);
    keys.push(dk);
    schedPromises.push(fbGet(FB_SCHEDULES+'/'+dk));
    statusPromises.push(fbGet(FB_WS+'/shift_status/'+dk));
  }
  const [schedResults, statusResults] = await Promise.all([
    Promise.all(schedPromises),
    Promise.all(statusPromises)
  ]);
  weekSchedules = {};
  keys.forEach((k,i)=>{
    weekSchedules[k] = schedResults[i] || {};
    // 주간 shift_status 병합
    const fbSt = statusResults[i];
    if(fbSt){
      Object.keys(fbSt).forEach(empId => {
        if(fbSt[empId]) shiftStatus[k+'_'+empId] = fbSt[empId];
        else delete shiftStatus[k+'_'+empId];
      });
    }
  });
  lsSaveShiftStatus();
  renderWeek();
  renderDateStrip();
}

// 고정 스케줄 + 휴무자 자동 적용 (빈 날짜에만)
function autoApplyFixed(dk){
  let changed = false;
  const parts = dk.split('-');
  const dateObj = new Date(+parts[0], +parts[1]-1, +parts[2]);
  const fixedEmpIds = []; // 고정 적용된 직원들

  for(const empName in FIXED_SCHEDULES){
    const fix = getFixedScheduleForDate(empName, dateObj);
    if(!fix || fix.type === 'variable' || (fix.type === 'conditional' && !fix.start) || !fix.start) continue;
    const empId = findEmpIdByName(empName);
    if(!empId) continue;
    if(isDayOff(empId, dk)) continue;
    if(!daySchedule[empId]){
      daySchedule[empId] = {start:fix.start, end:fix.end, role:fix.role};
      changed = true;
    }
    // 고정근무자 자동 확정 (renderAll 없이 직접 설정)
    const stKey = dk+'_'+empId;
    if(shiftStatus[stKey] !== 'confirmed'){
      shiftStatus[stKey] = 'confirmed';
      fbPut(FB_WS+'/shift_status/'+dk+'/'+empId, 'confirmed');
      // AI 학습 패턴 기록
      const shift = daySchedule[empId];
      if(shift && shift.start) recordPattern(empId, dk, shift);
    }
    fixedEmpIds.push(empId);
  }
  if(changed){
    lsSaveSchedule(dk, daySchedule);
    for(const empId in daySchedule){
      const s = daySchedule[empId];
      if(s && s.start) fbPut(FB_SCHEDULES+'/'+dk+'/'+empId, s);
    }
  }
  lsSaveShiftStatus();
  // 고정근무자만 있는 날 → 전체 확정
  const workingIds = Object.keys(daySchedule).filter(id => daySchedule[id] && daySchedule[id].start && !isDayOff(id, dk));
  if(workingIds.length > 0 && workingIds.every(id => fixedEmpIds.includes(id))){
    if(!confirmedDays[dk]){
      confirmedDays[dk] = true;
      lsSaveConfirmed(confirmedDays);
      fbPut(FB_WS+'/confirmed/'+dk, true);
    }
  }
  return changed;
}

// 고정근무자 클리어 후 재배치 (고정 스케줄 강제 덮어쓰기)
function resetToFixed(dk){
  const parts = dk.split('-');
  const dateObj = new Date(+parts[0], +parts[1]-1, +parts[2]);

  for(const empName in FIXED_SCHEDULES){
    const fix = getFixedScheduleForDate(empName, dateObj);
    const empId = findEmpIdByName(empName);
    if(!empId) continue;
    if(!fix || fix.type === 'variable' || !fix.start || isDayOff(empId, dk)){
      delete daySchedule[empId];
    } else {
      daySchedule[empId] = {start:fix.start, end:fix.end, role:fix.role};
    }
  }
  lsSaveSchedule(dk, daySchedule);
  for(const empName in FIXED_SCHEDULES){
    const fix = getFixedScheduleForDate(empName, dateObj);
    const empId = findEmpIdByName(empName);
    if(!empId) continue;
    const s = daySchedule[empId];
    fbPut(FB_SCHEDULES+'/'+dk+'/'+empId, s || null);
  }
  renderCurrentTab();
  showToast('고정 스케줄 재배치 완료');
}

function showDateFlash(){
  const m = currentDate.getMonth()+1;
  const d = currentDate.getDate();
  const dow = DOW_KR[currentDate.getDay()];
  let el = document.getElementById('dateFlash');
  if(!el){
    el = document.createElement('div');
    el.id = 'dateFlash';
    el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:2.5rem;font-weight:900;color:#fff;opacity:0;pointer-events:none;z-index:999;text-shadow:0 2px 12px #000a;transition:opacity .15s;';
    document.body.appendChild(el);
  }
  el.textContent = m+'/'+d+' '+dow;
  el.style.opacity = '.35';
  clearTimeout(el._t);
  el._t = setTimeout(()=>{ el.style.opacity = '0'; }, 600);
}

let _dateChangeId = 0;
async function onDateChange(){
  const myId = ++_dateChangeId;
  showDateFlash();
  updateDateDisplay();
  // Reconnect schedule SSE for new date
  if(sseSchedule){ try{sseSchedule.close();}catch(e){} sseSchedule = null; }
  connectScheduleSSE(sseGeneration);
  const dk = dateKey(currentDate);
  // localStorage 먼저
  const localSched = lsLoadSchedule(dk);
  if(localSched) daySchedule = localSched;
  else daySchedule = {};
  dayAttendance = {}; // 날짜 변경 시 초기화
  // 자동 휴무 생성 + 고정 스케줄 적용
  generateAutoDayoffs();
  autoApplyFixed(dk);
  renderCurrentTab();
  // 연속 호출 시 이전 요청 무시
  if(myId !== _dateChangeId) return;
  // Firebase 동기화 (출퇴근 데이터 병렬 로드)
  try{
    const [schedData, fbShiftSt, fbConfirmed, fbAttendance, fbRevenue] = await Promise.all([
      fbGet(FB_SCHEDULES+'/'+dk),
      fbGet(FB_WS+'/shift_status/'+dk),
      fbGet(FB_WS+'/confirmed/'+dk),
      fbGet(FB_BASE+'/packhelper/storebot_attendance/'+dk),
      fbGet(FB_WS+'/daily_revenue/'+dk)
    ]);
    if(myId !== _dateChangeId) return;
    if(schedData){
      const merged = Object.assign({}, schedData, localSched || {});
      daySchedule = merged;
      lsSaveSchedule(dk, merged);
    }
    // daily_revenue Firebase 동기화
    if(fbRevenue !== undefined && fbRevenue !== null){
      dailyRevenueMap[dk] = fbRevenue;
    }
    // shift_status Firebase 병합
    if(fbShiftSt){
      Object.keys(fbShiftSt).forEach(empId => {
        const st = fbShiftSt[empId];
        if(st) shiftStatus[dk+'_'+empId] = st;
        else delete shiftStatus[dk+'_'+empId];
      });
      lsSaveShiftStatus();
    }
    // confirmed 상태 Firebase 동기화
    if(fbConfirmed !== undefined && fbConfirmed !== null){
      confirmedDays[dk] = !!fbConfirmed;
    } else {
      delete confirmedDays[dk];
    }
    lsSaveConfirmed(confirmedDays);
    // 출퇴근 데이터 저장
    dayAttendance = fbAttendance || {};
    renderCurrentTab();
  }catch(e){ console.error('[WS] onDateChange Firebase sync error:', e); }
  if(myId !== _dateChangeId) return;
  loadWeekSchedules();
  updateConfirmBtn();
}

// ============================================================
// Date display
// ============================================================
function updateDateDisplay(){
  const m = currentDate.getMonth()+1;
  const d = currentDate.getDate();
  const dow = DOW_KR[currentDate.getDay()];
  $dateDisplay.textContent = m+'/'+d+' '+dow;
}

// ============================================================
// Render all
// ============================================================
function renderAll(){
  const steps = [
    ['updateDateDisplay', updateDateDisplay],
    ['renderRevenueBar', renderRevenueBar],
    ['renderBriefing', renderBriefing],
    ['renderCurrentTab', renderCurrentTab],
    ['renderDateStrip', renderDateStrip],
    ['renderWeek', renderWeek],
    ['checkLogistics', checkLogistics],
    ['buildCalButtons', buildCalButtons],
    ['buildKakaoPerEmp', buildKakaoPerEmp],
  ];
  for(const [name, fn] of steps){
    try { fn(); } catch(e) { console.error('[WS] '+name+' error:', e); }
  }
}

// ============================================================
// 매출구간 선택 바
// ============================================================
function renderRevenueBar(){
  const bar = $('revenueBar');
  if(!bar) return;
  const dk = dateKey(currentDate);
  const activeKey = getActivePresetKey();
  const isManual = !!dailyRevenueMap[dk]; // 수동 지정 여부
  const presetLabels = JSON.parse(localStorage.getItem('ws_preset_labels') || '{}');
  bar.innerHTML = '';
  for(const [key, pre] of Object.entries(STAFF_PRESETS)){
    const sel = activeKey === key;
    const label = presetLabels[key] || pre.label;
    const btn = document.createElement('div');
    btn.textContent = label;
    const selBorder = isManual ? '#E67E22' : '#FFD700'; // 수동=주황, 기본=노랑
    const selBg = isManual ? '#E67E2233' : '#FFD70033';
    const selColor = isManual ? '#E67E22' : '#FFD700';
    btn.style.cssText = 'flex:1;padding:5px 2px;border-radius:5px;text-align:center;cursor:pointer;font-size:.6rem;font-weight:700;'
      +(sel?'background:'+selBg+';border:1.5px solid '+selBorder+';color:'+selColor+';':'background:#242444;border:1.5px solid #2E2E52;color:#707088;');
    btn.addEventListener('click', ()=> setDailyRevenue(key));
    bar.appendChild(btn);
  }
  // 시간별 인원설정 버튼
  const editBtn = document.createElement('div');
  editBtn.textContent = '인원';
  editBtn.style.cssText = 'padding:5px 6px;border-radius:5px;cursor:pointer;font-size:.55rem;font-weight:700;color:#FFD700;background:#242444;border:1px solid #2E2E52;';
  editBtn.addEventListener('click', ()=> openHourLimitEdit(17));
  bar.appendChild(editBtn);
}

// ============================================================
// 당일 브리핑 패널 — 한눈에 염두사항 모아보기
// ============================================================
function renderBriefing(){
  const panel = $('briefingPanel');
  if(!panel) return;
  const dk = dateKey(currentDate);
  const empKeys = Object.keys(employees);

  let html = '';

  // ===== KPI 요약 카드 =====
  const offToday = [];
  let workingCount = 0, totalHours = 0, totalCost = 0;
  let fixedCount=0, variableCount=0, emptyCount=0;
  empKeys.forEach(id => {
    if(isDayOff(id, dk)){ offToday.push(employees[id]?.name || id); return; }
    const s = daySchedule[id];
    if(s && s.start){
      workingCount++;
      const h = calcHours(s.start, s.end);
      totalHours += h;
      totalCost += h * (employees[id]?.hourlyRate || 0);
      const fix = getFixedSchedule(employees[id]?.name);
      if(fix && fix.type==='fixed' && s.start===fix.start && s.end===fix.end) fixedCount++;
      else variableCount++;
    } else {
      emptyCount++;
    }
  });

  // 충족률 계산
  const staffing = calcStaffing(empKeys, dk);
  let okHours = 0, totalCheckHours = 0;
  for(const hStr in staffing){
    const s = staffing[hStr];
    totalCheckHours++;
    const kitchenOk = !s.kitchenOver && !s.kitchenUnder;
    const deliveryOk = !s.deliveryUnder && !s.carOver && !s.bikeOver;
    if(kitchenOk && deliveryOk) okHours++;
  }
  const complianceRate = totalCheckHours > 0 ? Math.round((okHours/totalCheckHours)*100) : 0;

  html += '<div style="display:flex;gap:6px;margin-bottom:6px;">';
  // 카드1: 출근 인원
  html += '<div style="flex:1;background:#242444;border-radius:8px;padding:6px 8px;text-align:center;">';
  html += '<div style="font-size:1.1rem;font-weight:800;color:#FFFFFF;">'+workingCount+'<span style="font-size:.6rem;color:#707088;">/'+empKeys.length+'</span></div>';
  html += '<div style="font-size:.55rem;color:#9090A8;">출근</div></div>';
  // 카드2: 총 시간
  html += '<div style="flex:1;background:#242444;border-radius:8px;padding:6px 8px;text-align:center;">';
  html += '<div style="font-size:1.1rem;font-weight:800;color:#FFD700;">'+totalHours.toFixed(1).replace('.0','')+'<span style="font-size:.6rem;color:#707088;">h</span></div>';
  html += '<div style="font-size:.55rem;color:#9090A8;">총시간</div></div>';
  // 카드3: 충족률
  const compColor = complianceRate >= 80 ? '#2ECC71' : complianceRate >= 50 ? '#E67E22' : '#E74C3C';
  html += '<div style="flex:1;background:#242444;border-radius:8px;padding:6px 8px;text-align:center;">';
  html += '<div style="font-size:1.1rem;font-weight:800;color:'+compColor+';">'+complianceRate+'<span style="font-size:.6rem;color:#707088;">%</span></div>';
  html += '<div style="font-size:.55rem;color:#9090A8;">충족률</div></div>';
  // 카드4: 인건비
  html += '<div style="flex:1;background:#242444;border-radius:8px;padding:6px 8px;text-align:center;">';
  html += '<div style="font-size:.85rem;font-weight:800;color:#E0E0EC;">'+(totalCost > 0 ? (totalCost/10000).toFixed(1)+'만' : '-')+'</div>';
  html += '<div style="font-size:.55rem;color:#9090A8;">인건비</div></div>';
  // 카드5: 휴무
  html += '<div style="flex:1;background:#242444;border-radius:8px;padding:6px 8px;text-align:center;">';
  html += '<div style="font-size:1.1rem;font-weight:800;color:#E74C3C;">'+offToday.length+'</div>';
  html += '<div style="font-size:.55rem;color:#9090A8;">휴무</div></div>';
  html += '</div>';

  // ===== 상태 한줄 요약 =====
  html += '<div style="display:flex;flex-wrap:wrap;gap:6px;font-size:.65rem;margin-bottom:4px;">';
  if(isKrHoliday(currentDate)){
    const hName = getHolidayName(currentDate) || '공휴일';
    html += '<span style="color:#E74C3C;font-weight:700;border:1px solid #E74C3C;border-radius:3px;padding:0 3px;">'+hName+'</span>';
  }
  html += '<span style="color:#2ECC71;">고정'+fixedCount+'</span>';
  if(variableCount > 0) html += '<span style="color:#E67E22;">수동'+variableCount+'</span>';
  if(emptyCount > 0) html += '<span style="color:#E74C3C;font-weight:700;">미입력'+emptyCount+'</span>';
  if(offToday.length > 0) html += '<span style="color:#E74C3C;">휴:'+offToday.join(',')+'</span>';
  // 날씨
  const wxNow = hourlyWeather[new Date().getHours()];
  if(wxNow){
    html += '<span style="color:#9090A8;">'+wxNow.i+wxNow.t+'°</span>';
  }
  // 스포츠 (이슈 없으면 표기X)
  const sportsEl = $('sportsInfo');
  if(sportsEl && sportsEl.textContent && !sportsEl.textContent.includes('로딩') && !sportsEl.textContent.includes('경기없음') && !sportsEl.textContent.includes('없음')){
    html += '<span style="color:#2AC1BC;">'+sportsEl.textContent.substring(0,25)+'</span>';
  }
  html += '</div>';

  // ===== 당일 매출 예상 + 3줄 인원 게이지 =====
  const hmHours = GAUGE_HOURS;
  const gaugeRows = [
    {key:'kitchen', roleKey:'주방', label:'주방', color:'#E67E22', getVal:s=>s.kitchen},
    {key:'bikeDel', roleKey:'오토바이', label:'바이크', color:'#FFD700', getVal:s=>s.bikeDel},
    {key:'carDel', roleKey:'차배달', label:'차', color:'#4ECDC4', getVal:s=>s.carDel},
  ];
  const _pk = getActivePresetKey();

  // 공백구간 감지: 전 역할 인원 0인 시간대
  const gapSet = new Set();
  hmHours.forEach(h => {
    const s = staffing[pad(h)+':00'];
    if(!s || s.total === 0) gapSet.add(h);
  });
  // 연속 공백 구간 그룹화
  const gaugeSegments = []; // {type:'gap'|'work', hours:[...]}
  hmHours.forEach(h => {
    const isGap = gapSet.has(h);
    const last = gaugeSegments[gaugeSegments.length-1];
    if(last && last.type === (isGap?'gap':'work')){
      last.hours.push(h);
    } else {
      gaugeSegments.push({type: isGap?'gap':'work', hours:[h]});
    }
  });

  gaugeRows.forEach(row => {
    html += '<div style="display:flex;align-items:center;gap:2px;margin-bottom:1px;">';
    html += '<span style="font-size:.6rem;font-weight:700;color:'+row.color+';min-width:32px;">'+row.label+'</span>';
    html += '<div style="flex:1;display:flex;gap:1px;height:26px;">';
    gaugeSegments.forEach(seg => {
      if(seg.type === 'gap'){
        // 공백구간 축소
        html += '<div style="flex:0.3;background:#0D0D1A;display:flex;align-items:center;justify-content:center;border-radius:2px;opacity:.5;">';
        html += '</div>';
      } else {
        seg.hours.forEach(h => {
          const hStr = pad(h)+':00';
          const s = staffing[hStr];
          const val = s ? row.getVal(s) : 0;
          const lim = getRoleLimits(h)[row.roleKey];
          const isBikeDA = row.key==='bikeDel' && val===0 && s && s.daAvail;
          let bg = '#1A1A30', tc = '#707088', txt = '';
          if(isBikeDA){
            bg = '#E67E2230'; tc = '#E67E22'; txt = '대';
          } else if(val > 0){
            if(val > lim.max){ bg = C_OFF; tc = '#fff'; }
            else if(val < lim.min){ bg = C_OFF+'55'; tc = C_OFF; }
            else { bg = '#3498DB40'; tc = '#E0E0EC'; }
            txt = val%1===0 ? val : val.toFixed(1);
          } else if(lim.min > 0){
            bg = C_OFF+'22'; tc = C_OFF; txt = '!';
          }
          html += '<div data-gauge-hour="'+h+'" style="flex:1;background:'+bg+';display:flex;align-items:center;justify-content:center;font-size:.55rem;color:'+tc+';font-weight:700;border-radius:2px;cursor:pointer;">';
          html += txt;
          html += '</div>';
        });
      }
    });
    html += '</div></div>';
  });
  // 시간 레이블 (공백구간 축소 + "공백" 표기)
  html += '<div style="display:flex;align-items:center;gap:2px;">';
  html += '<span style="min-width:32px;"></span>';
  html += '<div style="flex:1;display:flex;gap:1px;">';
  gaugeSegments.forEach(seg => {
    if(seg.type === 'gap'){
      html += '<div style="flex:0.3;text-align:center;font-size:.45rem;color:#404058;font-style:italic;">공백</div>';
    } else {
      seg.hours.forEach(h => { html += '<div style="flex:1;text-align:center;font-size:.5rem;color:#707088;">'+h+'</div>'; });
    }
  });
  html += '</div></div>';

  panel.innerHTML = html;

  // 이벤트 위임: 게이지 셀 + 초기화
  const clrBtn = panel.querySelector('[data-clear-overrides]');
  if(clrBtn) clrBtn.addEventListener('click', () => clearHourlyOverrides());
  panel.querySelectorAll('[data-gauge-hour]').forEach(cell => {
    cell.addEventListener('click', (e) => {
      e.stopPropagation();
      openHourLimitEdit(parseInt(cell.dataset.gaugeHour));
    });
  });
}

// ============================================================
// Timeline Rendering — VERTICAL, FIT TO SCREEN
// ============================================================
let hourlyWeather = {}; // {hour: {t:temp, i:icon}}

function renderTimeline(){
  if(!dataLoaded) return;
  const container = $timelineContent;
  container.innerHTML = '';

  const empKeys = Object.keys(employees);

  if(empKeys.length === 0){
    container.innerHTML = '<div style="padding:30px;text-align:center;color:#9090A8;font-size:.9rem;">직원을 먼저 추가해주세요</div>';
    return;
  }

  // --- Header (employee names) ---
  const header = document.createElement('div');
  header.className = 'vt-header';

  const timeHdr = document.createElement('div');
  timeHdr.className = 'vt-time-hdr';
  timeHdr.textContent = '';
  header.appendChild(timeHdr);

  const dk = dateKey(currentDate);
  empKeys.forEach(empId => {
    const emp = employees[empId];
    const off = isDayOff(empId, dk);
    const hdr = document.createElement('div');
    hdr.className = 'vt-emp-hdr';
    const empShift = daySchedule[empId];
    const dotColor = off ? '#E74C3C' : (empShift && empShift.start ? getShiftType(empShift.start, empShift.end).color : '#707088');
    hdr.innerHTML = '<div class="vt-dot" style="background:'+dotColor+'"></div><div class="vt-name">'+(off?'<span style="color:#E74C3C;">휴</span> ':'')+emp.name+'</div>';
    if(off) hdr.style.opacity = '.5';
    header.appendChild(hdr);
  });
  container.appendChild(header);

  // --- Body (fills remaining screen) ---
  const wrapper = document.createElement('div');
  wrapper.className = 'vt-wrapper';

  const body = document.createElement('div');
  body.className = 'vt-body';

  // Time column with weather
  const timeCol = document.createElement('div');
  timeCol.className = 'vt-time-col';
  const SHOW_HOURS = new Set([12,15,18,21,0,3,6,9]);
  TL_HOURS.forEach((h, idx) => {
    const pct = (idx / TL_HOURS.length) * 100;
    const tick = document.createElement('div');
    tick.className = 'vt-hour-tick';
    tick.style.top = pct + '%';
    tick.style.height = (100 / TL_HOURS.length) + '%';
    let html = SHOW_HOURS.has(h) ? '<span>'+pad(h)+'</span>' : '';
    // Weather at this hour
    // 온도 표기 삭제 (가시성 저해)
    tick.innerHTML = html;
    timeCol.appendChild(tick);
  });
  body.appendChild(timeCol);

  // 충돌 감지
  const conflictsMap = detectConflicts(empKeys, dk);

  // Employee columns with drag support
  empKeys.forEach(empId => {
    const emp = employees[empId];
    const shift = daySchedule[empId];
    const off = isDayOff(empId, dk);
    const col = document.createElement('div');
    col.className = 'vt-emp-col';
    col.dataset.empid = empId;
    const hasConflict = !!conflictsMap[empId];

    // Grid lines at each hour
    TL_HOURS.forEach((h, idx) => {
      const pct = (idx / TL_HOURS.length) * 100;
      const line = document.createElement('div');
      line.className = 'vt-grid-line';
      line.style.top = pct + '%';
      line.style.height = (100 / TL_HOURS.length) + '%';
      col.appendChild(line);
    });

    // Day-off overlay
    if(off){
      const offBlock = document.createElement('div');
      offBlock.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;background:#E74C3C10;z-index:1;';
      offBlock.innerHTML = '<span style="color:#E74C3C;font-size:.75rem;font-weight:700;writing-mode:vertical-rl;opacity:.6;">휴 무</span>';
      col.appendChild(offBlock);
      col.style.opacity = '.4';
    }

    // Shift block
    if(!off && shift && shift.start && shift.end){
      const block = document.createElement('div');
      block.className = 'vt-shift';
      const topPct = timeToPercent(shift.start);
      const bottomPct = timeToPercent(shift.end);
      let heightPct = bottomPct - topPct;
      if(heightPct <= 0) heightPct += 100;

      block.style.top = topPct + '%';
      block.style.height = Math.min(heightPct, 100 - topPct) + '%';

      // 근무형태 색상
      const shiftType = getShiftType(shift.start, shift.end);
      if(hasConflict){
        block.style.background = '#E74C3C44';
        block.style.borderLeft = '3px solid #E74C3C';
        block.style.borderTop = '1px solid #E74C3Caa';
        block.style.boxShadow = 'inset 0 0 8px #E74C3C33';
      } else {
        block.style.background = shiftType.bg;
        block.style.borderLeft = '3px solid '+shiftType.color;
        block.style.borderTop = '1px solid '+shiftType.color+'55';
      }

      const roles = shift.role ? shift.role.split(',').filter(Boolean) : [];
      const roleHtml = roles.map(r => '<span style="color:'+(ROLE_COLORS[r]||'#9090A8')+';font-weight:700;">'+(ROLE_LABELS[r]||r)+'</span>').join(' ');
      const timeText = shift.start.replace(/^0/,'')+'-'+shift.end.replace(/^0/,'');
      const hours = calcHours(shift.start, shift.end);

      const nameLbl = emp.name;
      let conflictBadge = '';
      if(hasConflict){
        const reasons = conflictsMap[empId].map(c=>c.msg);
        const uniqueReasons = [...new Set(reasons)];
        conflictBadge = '<span style="font-size:.55rem;color:#FF6B6B;font-weight:700;background:#E74C3C33;padding:1px 3px;border-radius:3px;">'+uniqueReasons[0]+'</span>';
      }
      // 보정값 뱃지 (출근)
      let attBadge = '';
      const _att = dayAttendance[empId];
      const _sch = daySchedule[empId];
      if(_att && _att.actual_start && shift.start){
        const _diffVal = (_sch && _sch.diff_start !== undefined) ? _sch.diff_start : (function(){
          const sp=shift.start.split(':'), ap=_att.actual_start.split(':');
          let d2=parseInt(ap[0])*60+parseInt(ap[1]||0)-(parseInt(sp[0])*60+parseInt(sp[1]||0));
          if(d2>720)d2-=1440; else if(d2<-720)d2+=1440; return d2;
        })();
        const _dc = _diffVal<0?'#2ECC71':(_diffVal>0?'#E74C3C':'#9090A8');
        const _dt = _diffVal===0?'정시':(_diffVal>0?'+'+_diffVal+'분':_diffVal+'분');
        attBadge = '<span style="font-size:.5rem;color:'+_dc+';font-weight:700;">✓'+_att.actual_start+' ('+_dt+')</span>';
      }

      block.innerHTML =
        '<span style="font-size:.75rem;font-weight:700;color:#FFFFFF;text-shadow:0 1px 2px #000;">'+nameLbl+'</span>'+
        '<span style="font-size:.7rem;font-weight:600;color:#FFFFFF;">'+timeText+'</span>'+
        (roleHtml ? '<span style="font-size:.6rem;">'+roleHtml+'</span>' : '')+
        '<span style="font-size:.6rem;color:#FFD700;font-weight:600;">'+hours+'h</span>'+
        attBadge+
        conflictBadge;

      block.addEventListener('click', (e)=>{
        e.stopPropagation();
        openShiftModal(empId);
      });
      col.appendChild(block);
    }

    // 충돌 컬럼 배경 (헤더와 연동)
    if(hasConflict && !off){
      col.style.background = '#E74C3C0A';
    }

    // 터치 시 팝업 열기 (드래그 입력 제거 — 수정창에서만 입력)
    col.addEventListener('click', ()=> openShiftModal(empId));

    body.appendChild(col);
  });

  wrapper.appendChild(body);
  container.appendChild(wrapper);

  // --- Summary row ---
  const summary = document.createElement('div');
  summary.className = 'vt-summary';

  const sumTime = document.createElement('div');
  sumTime.className = 'vt-summary-time';
  sumTime.textContent = '합계';
  summary.appendChild(sumTime);

  empKeys.forEach(empId => {
    const shift = daySchedule[empId];
    const off = isDayOff(empId, dk);
    const cell = document.createElement('div');
    cell.className = 'vt-summary-cell';
    if(off){
      cell.textContent = '휴';
      cell.style.color = '#E74C3C';
      cell.style.fontSize = '.6rem';
    } else if(shift && shift.start && shift.end){
      cell.textContent = calcHours(shift.start, shift.end) + 'h';
    } else {
      cell.textContent = '-';
      cell.style.color = '#707088';
    }
    summary.appendChild(cell);
  });
  container.appendChild(summary);

  // --- Role-Based Coverage View (역할별 커버리지) ---
  const staffing = calcStaffing(empKeys, dk);
  const staffDiv = document.createElement('div');
  staffDiv.style.cssText = 'padding:6px 8px;background:#1A1A30;border-top:1px solid #2E2E52;';

  const checkHours = ALL_HOURS;
  const totalSlots = checkHours.length;

  // 커버리지 공백구간 감지
  const _cvGap = new Set();
  checkHours.forEach(h => { const s = staffing[pad(h)+':00']; if(!s || s.total===0) _cvGap.add(h); });
  const _cvSegs = [];
  checkHours.forEach(h => {
    const isGap = _cvGap.has(h);
    const last = _cvSegs[_cvSegs.length-1];
    if(last && last.type===(isGap?'gap':'work')) last.hours.push(h);
    else _cvSegs.push({type:isGap?'gap':'work', hours:[h]});
  });

  let html = '<div style="font-size:.7rem;color:#FFD700;font-weight:600;margin-bottom:6px;">역할별 커버리지</div>';

  // === 역할별 수평 바 ===
  const roles = [
    {key:'kitchen', label:'주방', color:'#E67E22', getVal:(s)=>s.kitchen, getLimits:(h)=>getRoleLimits(h)['주방']},
    {key:'bikeDel', label:'바이크', color:'#FFD700', getVal:(s)=>s.bikeDel, getLimits:(h)=>getRoleLimits(h)['오토바이']},
    {key:'carDel', label:'차', color:'#4ECDC4', getVal:(s)=>s.carDel, getLimits:(h)=>getRoleLimits(h)['차배달']},
  ];

  roles.forEach(role => {
    html += '<div style="margin-bottom:4px;">';
    html += '<div style="display:flex;align-items:center;gap:4px;margin-bottom:1px;">';
    html += '<span style="font-size:.6rem;font-weight:700;color:'+role.color+';min-width:38px;">'+role.label+'</span>';
    html += '<div style="flex:1;display:flex;gap:1px;height:16px;">';
    _cvSegs.forEach(seg => {
      if(seg.type==='gap'){
        html += '<div style="flex:0.3;background:#0D0D1A;border-radius:1px;"></div>';
      } else {
        seg.hours.forEach(h => {
          const hStr = pad(h)+':00';
          const s = staffing[hStr];
          const val = s ? role.getVal(s) : 0;
          const lim = role.getLimits(h);
          const isBikeDA = role.key==='bikeDel' && val===0 && s && s.daAvail;
          let bg = '#1A1A30', textColor = '#707088', txt = '';
          if(isBikeDA){
            bg = '#E67E2230'; textColor = '#E67E22'; txt = '대';
          } else if(val > 0){
            if(val > lim.max){ bg = C_OFF; textColor = '#fff'; }
            else if(val < lim.min){ bg = C_OFF+'55'; textColor = C_OFF; }
            else { bg = '#3498DB40'; textColor = '#E0E0EC'; }
            txt = val%1===0 ? val : val.toFixed(1);
          } else if(lim.min > 0){
            bg = C_OFF+'22'; textColor = C_OFF; txt = '!';
          }
          html += '<div style="flex:1;background:'+bg+';display:flex;align-items:center;justify-content:center;font-size:.45rem;color:'+textColor+';font-weight:700;border-radius:1px;">';
          html += txt;
          html += '</div>';
        });
      }
    });
    html += '</div></div></div>';
  });

  // === 배달대행 행 ===
  html += '<div style="margin-bottom:4px;">';
  html += '<div style="display:flex;align-items:center;gap:4px;margin-bottom:1px;">';
  html += '<span style="font-size:.6rem;font-weight:700;color:#E67E22;min-width:38px;">대행</span>';
  html += '<div style="flex:1;display:flex;gap:1px;height:12px;">';
  _cvSegs.forEach(seg => {
    if(seg.type==='gap'){
      html += '<div style="flex:0.3;background:#0D0D1A;border-radius:1px;"></div>';
    } else {
      seg.hours.forEach(h => {
        const hStr = pad(h)+':00';
        const s = staffing[hStr];
        const df = s ? s.daFill : 0;
        const hasDA = df > 0;
        html += '<div style="flex:1;background:'+(hasDA?'#E67E2233':'#1A1A30')+';display:flex;align-items:center;justify-content:center;font-size:.4rem;color:'+(hasDA?'#E67E22':'#707088')+';font-weight:600;border-radius:1px;">';
        html += hasDA ? (df % 1 !== 0 ? df.toFixed(1) : df.toString()) : '';
        html += '</div>';
      });
    }
  });
  html += '</div></div></div>';

  // === 시간 레이블 (공백 축소) ===
  html += '<div style="display:flex;align-items:center;gap:4px;">';
  html += '<span style="min-width:38px;"></span>';
  html += '<div style="flex:1;display:flex;gap:1px;">';
  _cvSegs.forEach(seg => {
    if(seg.type==='gap'){
      html += '<div style="flex:0.3;text-align:center;font-size:.35rem;color:#404058;font-style:italic;">공백</div>';
    } else {
      seg.hours.forEach(h => {
        html += '<div style="flex:1;text-align:center;font-size:.4rem;color:#707088;">'+h+'</div>';
      });
    }
  });
  html += '</div></div>';

  // === 합계 인원 행 (공백 축소) ===
  html += '<div style="display:flex;align-items:center;gap:4px;margin-top:2px;">';
  html += '<span style="font-size:.55rem;color:#9090A8;min-width:38px;">합계</span>';
  html += '<div style="flex:1;display:flex;gap:1px;height:14px;">';
  _cvSegs.forEach(seg => {
    if(seg.type==='gap'){
      html += '<div style="flex:0.3;background:#0D0D1A;border-radius:1px;"></div>';
    } else {
      seg.hours.forEach(h => {
        const hStr = pad(h)+':00';
        const s = staffing[hStr];
        const total = s ? s.total : 0;
        const anyConflict = s && (s.kitchenOver || s.kitchenUnder || s.carOver || s.bikeOver || s.deliveryUnder);
        html += '<div style="flex:1;background:'+(anyConflict?'#E74C3C22':'#2ECC7115')+';display:flex;align-items:center;justify-content:center;font-size:.5rem;color:'+(anyConflict?'#E74C3C':'#2ECC71')+';font-weight:700;border-radius:1px;">';
        html += total > 0 ? total : '';
        html += '</div>';
      });
    }
  });
  html += '</div></div>';

  // 범례
  html += '<div style="font-size:.5rem;color:#707088;margin-top:4px;display:flex;gap:8px;flex-wrap:wrap;">';
  html += '<span><span style="color:#2ECC71;">■</span> 충족</span>';
  html += '<span><span style="color:#E74C3C;">■</span> 초과</span>';
  html += '<span><span style="color:#E67E22;">■</span> 부족</span>';
  html += '<span><span style="color:#E67E22;">!</span> 최소미달</span>';
  html += '<span>대행=배달대행(10~01시)</span>';
  html += '</div>';

  staffDiv.innerHTML = html;
  container.appendChild(staffDiv);
}

// Staffing calculation (편입 로직 포함)
function calcStaffing(empKeys, dk){
  const result = {};
  const checkHours = ALL_HOURS;
  const preset = getActivePreset();

  for(const h of checkHours){
    const hStr = pad(h)+':00';
    const hMin = timeToMinutesFrom12(hStr);
    let kitchen = 0, carDel = 0, bikeDel = 0, total = 0;
    let hasBikeWorker = false; // 오토바이 출근자 존재 여부

    // 배달 가능 인력 카운트
    let bikeCapable = 0, carCapable = 0;
    empKeys.forEach(empId => {
      if(isDayOff(empId, dk)) return;
      const shift = daySchedule[empId];
      if(!shift || !shift.start || !shift.end) return;
      const sMin = timeToMinutesFrom12(shift.start);
      let eMin = timeToMinutesFrom12(shift.end);
      if(eMin <= sMin) eMin += 24*60;
      if(hMin >= sMin && hMin < eMin){
        total++;
        const caps = employees[empId]?.capabilities || [];
        // 편입 = 배달 전담 → 가능하면 1명으로 편입 (기존 인력 우선, 대행은 추가비용)
        if(caps.includes('오토바이')){ bikeCapable += 1; hasBikeWorker = true; }
        if(caps.includes('차배달')) carCapable += 1;
      }
    });

    const limits = getRoleLimits(h);

    // === 편입 로직: min 먼저 채우고 → 나머지 배달 가능자를 배달로 편입 ===
    // 멀티역할자는 0.5명으로 편입 (두 업무 겸업 → 배달 0.5 capacity)
    let kitchenFinal = total; // 전원 주방 시작
    let bikeFinal = 0, carFinal = 0;
    const kMin = limits['주방'].min;
    let extras = Math.max(0, kitchenFinal - kMin); // min 초과 인력

    // 오토바이 편입 (가능자 capacity 기준, 0.5 단위)
    if(extras > 0){
      const move = Math.min(extras, limits['오토바이'].max, bikeCapable);
      bikeFinal += move; kitchenFinal -= move; extras -= move;
    }
    // 차배달 편입
    if(extras > 0){
      const move = Math.min(extras, limits['차배달'].max, carCapable);
      carFinal += move; kitchenFinal -= move; extras -= move;
    }

    const delivery = carFinal + bikeFinal;
    // 배달대행 = 바이크만 (차 안 탐), 10~01시 영업
    const DA_START = timeToMinutesFrom12(pad(preset.daStart||10)+':00');
    const DA_END = timeToMinutesFrom12(pad(preset.daEnd||1)+':00');
    const daAvail = hMin >= DA_START && hMin < DA_END;
    const bikeNeed = Math.max(0, limits['오토바이'].max - bikeFinal);
    const daFill = daAvail ? bikeNeed : 0; // 대행 = 바이크 부족분만
    const deliveryWithDA = delivery + daFill;

    // 충돌 체크 (역할별 개별 min/max)
    const kitchenOver = kitchenFinal > limits['주방'].max;
    const kitchenUnder = kitchenFinal < limits['주방'].min;
    const carOver = carFinal > limits['차배달'].max;
    const bikeOver = bikeFinal > limits['오토바이'].max;
    // 01~03시 (대행 마감 후): 배달 합산(차+바이크) min1 max1 필요
    const lateNight = (h >= 1 && h <= 3);
    const deliveryUnder = lateNight && !daAvail && delivery < 1;

    result[hStr] = {
      kitchen: kitchenFinal, carDel: carFinal, bikeDel: bikeFinal,
      delivery, deliveryWithDA, daFill, total, daAvail, hasBikeWorker,
      carOver, bikeOver, kitchenOver, kitchenUnder, deliveryUnder
    };
  }
  return result;
}

// ============================================================
// Touch Drag to Create/Edit Shifts
// ============================================================
let dragState = null;

function yToTime(y, totalH){
  const pct = Math.max(0, Math.min(1, y / totalH));
  const totalMin = pct * TL_TOTAL_MINUTES;
  let h = Math.floor(totalMin / 60) + 12;
  if(h >= 24) h -= 24;
  let m = Math.round((totalMin % 60) / 30) * 30;
  if(m >= 60){ m = 0; h = (h+1) >= 24 ? h+1-24 : h+1; }
  return pad(h)+':'+pad(m);
}

function onDragStart(e){
  const col = e.currentTarget;
  const empId = col.dataset.empid;
  if(!empId) return;
  // Tap on existing shift → open modal
  if(e.target.closest && e.target.closest('.vt-shift')) return;

  const rect = col.getBoundingClientRect();
  const y = e.touches[0].clientY - rect.top;
  dragState = {
    empId: empId,
    col: col,
    rect: rect,
    startY: y,
    endY: y,
    moved: false,
    preview: null
  };
  // Attach move/end to document for reliable tracking
  document.addEventListener('touchmove', onDragMove, {passive:false});
  document.addEventListener('touchend', onDragEnd, {passive:false});
}

function onDragMove(e){
  if(!dragState) return;
  const touch = e.touches[0];
  if(!touch) return;
  const y = touch.clientY - dragState.rect.top;
  if(Math.abs(y - dragState.startY) > 10) dragState.moved = true;
  if(!dragState.moved) return;
  e.preventDefault();
  e.stopPropagation();
  dragState.endY = y;

  const totalH = dragState.rect.height;
  const topY = Math.max(0, Math.min(dragState.startY, dragState.endY));
  const botY = Math.min(totalH, Math.max(dragState.startY, dragState.endY));
  const topPct = (topY / totalH) * 100;
  const heightPct = Math.max(2, ((botY - topY) / totalH) * 100);

  if(!dragState.preview){
    dragState.preview = document.createElement('div');
    dragState.preview.className = 'vt-drag';
    dragState.col.appendChild(dragState.preview);
  }
  const startTime = yToTime(topY, totalH);
  const endTime = yToTime(botY, totalH);
  dragState.preview.style.top = topPct + '%';
  dragState.preview.style.height = heightPct + '%';
  dragState.preview.textContent = startTime + '~' + endTime;
}

function onDragEnd(e){
  // Always remove document listeners
  document.removeEventListener('touchmove', onDragMove);
  document.removeEventListener('touchend', onDragEnd);

  if(!dragState) return;
  const ds = dragState;
  dragState = null;

  if(ds.preview) ds.preview.remove();

  if(!ds.moved){
    // Tap → open modal for this employee
    openShiftModal(ds.empId);
    return;
  }

  const totalH = ds.rect.height;
  const topY = Math.max(0, Math.min(ds.startY, ds.endY));
  const botY = Math.min(totalH, Math.max(ds.startY, ds.endY));

  if(botY - topY < 12) return;

  const startTime = yToTime(topY, totalH);
  const endTime = yToTime(botY, totalH);
  if(startTime === endTime) return;

  const dk = dateKey(currentDate);
  // 드래그 생성 시 능력 기반 기본 역할 지정
  const empName = employees[ds.empId]?.name || '';
  const caps = EMP_CAPABILITIES[empName] || ['주방'];
  const defaultRole = caps.join(',');
  const data = {start: startTime, end: endTime, role: defaultRole};
  daySchedule[ds.empId] = data;
  lsSaveSchedule(dk, daySchedule);
  renderAll();
  fbPut(FB_SCHEDULES+'/'+dk+'/'+ds.empId, data).then(ok => {
    if(ok){
      showToast(employees[ds.empId].name+' '+startTime+'~'+endTime);
      loadWeekSchedules();
    }
  });
}

// ============================================================
// Hourly Weather (Gemini → display in timeline)
// ============================================================
async function loadHourlyWeather(){
  const todayStr = dateStr(new Date());
  const cacheKey = 'ws_hourly_wx';
  const cached = localStorage.getItem(cacheKey);
  if(cached){
    try{
      const c = JSON.parse(cached);
      if(c.date === todayStr && c.data){
        hourlyWeather = {};
        c.data.forEach(w => { hourlyWeather[w.h] = {t:w.t, i:w.i}; });
        return;
      }
    }catch(e){}
  }
  if(!geminiKey) return;
  try{
    const prompt = '오늘 '+todayStr+' 경기도 이천시 시간별 날씨. JSON 배열만 응답: [{"h":10,"t":5,"i":"☀"},{"h":11,"t":6,"i":"☁"},...] h=시(10~3시, 정수), t=기온(정수), i=날씨이모지(☀☁🌧🌨❄🌫 중 1개). 10시~새벽3시만, 순수 JSON만(마크다운 금지).';
    const result = await callGemini(prompt);
    const clean = result.replace(/```json\s*/g,'').replace(/```\s*/g,'').trim();
    const arr = JSON.parse(clean);
    if(Array.isArray(arr)){
      hourlyWeather = {};
      arr.forEach(w => { hourlyWeather[w.h] = {t:w.t, i:w.i}; });
      localStorage.setItem(cacheKey, JSON.stringify({date:todayStr, data:arr}));
    }
  }catch(e){ console.error('hourly wx error', e); }
}

function isHourInShift(hour, start, end){
  // Check if 'hour' (e.g., 10) falls within [start, end)
  const hourMin = timeToMinutesFrom12(pad(hour)+':00');
  const startMin = timeToMinutesFrom12(start);
  let endMin = timeToMinutesFrom12(end);
  if(endMin <= startMin) endMin += 24*60;
  return hourMin >= startMin && hourMin < endMin;
}

// ============================================================
// Date Strip (60일 스크롤 날짜 바)
// ============================================================
function renderDateStrip(){
  const con = $('dateStrip');
  if(!con) return;
  const today = new Date(); today.setHours(0,0,0,0);
  const empKeys = Object.keys(employees);
  const selectedDk = dateKey(currentDate);

  // 4주: 이번주 포함 4주
  const monday = getMonday(currentDate);
  let html = '';
  // 요일 헤더 (sticky)
  ['월','화','수','목','금','토','일'].forEach(d => {
    html += '<div class="date-strip-hdr" style="position:sticky;top:0;background:#1A1A30;z-index:1;">'+d+'</div>';
  });
  for(let i=-7; i<56; i++){
    const d = new Date(monday);
    d.setDate(d.getDate()+i);
    const dk = dateKey(d);
    const dow = d.getDay();
    const isToday = isSameDay(d, today);
    const isSelected = dk===selectedDk;
    const isPast = d < today;

    let confirmedCount = 0, assignedCount = 0;
    const sched = dk===selectedDk ? daySchedule : (weekSchedules[dk] || lsLoadSchedule(dk));
    if(sched){
      empKeys.forEach(eid => {
        if(sched[eid] && sched[eid].start){
          assignedCount++;
          if(getShiftStatus(dk, eid)==='confirmed') confirmedCount++;
        }
      });
    }

    let borderColor = '#2E2E52';
    if(assignedCount > 0){
      if(confirmedCount === assignedCount) borderColor = C_OK;
      else if(confirmedCount > 0) borderColor = C_OK+'88';
      else borderColor = C_DEF;
    }

    const dowCls = (dow===0 || isKrHoliday(d)) ? ' sun' : dow===6 ? ' sat' : '';
    const cls = 'date-strip-item'+(isPast?' ds-past':'')+(isToday?' ds-today':'')+(isSelected?' ds-selected':'');
    const selStyle = isSelected ? '' : 'border-color:'+borderColor+';';

    html += '<div class="'+cls+'" data-dk="'+dk+'" style="'+selStyle+'">';
    if(isToday) html += '<div style="font-size:.4rem;color:#2ECC71;font-weight:700;line-height:1;">오늘</div>';
    html += '<div class="ds-date'+dowCls+'">'+d.getDate()+'</div>';
    if(assignedCount > 0){
      html += '<div class="ds-count" style="color:'+(confirmedCount===assignedCount?C_OK:C_DEF)+';">'+assignedCount+'명</div>';
    }
    html += '</div>';
  }
  con.innerHTML = html;

  con.querySelectorAll('.date-strip-item').forEach(el => {
    el.addEventListener('click', ()=>{
      const parts = el.dataset.dk.split('-');
      currentDate = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
      onDateChange();
    });
  });
  // 선택된 날짜가 보이도록 스크롤
  const selEl = con.querySelector('.date-strip-item[data-dk="'+selectedDk+'"]');
  if(selEl) setTimeout(()=> selEl.scrollIntoView({block:'center',behavior:'auto'}), 10);
}

// ============================================================
// Week Overview Rendering
// ============================================================
function renderWeek(){
  if(!dataLoaded) return;
  const monday = getMonday(currentDate);
  const empKeys = Object.keys(employees);

  // weekGrid는 상단 dateStrip이 대체하므로 비움
  $weekGrid.innerHTML = '';

  // 휴무 요약은 유지
  const daysOff = {};
  empKeys.forEach(id => { daysOff[id] = 0; });
  for(let i=0; i<7; i++){
    const d = new Date(monday);
    d.setDate(d.getDate()+i);
    const dk = dateKey(d);
    const sched = weekSchedules[dk] || {};
    empKeys.forEach(empId => {
      if(!sched[empId] || !sched[empId].start){
        daysOff[empId] = (daysOff[empId]||0) + 1;
      }
    });
  }

  $weekOffs.innerHTML = '';
  empKeys.forEach(empId => {
    const emp = employees[empId];
    if(!emp) return;
    const offCount = daysOff[empId]||0;
    if(offCount === 0) return;
    const chip = document.createElement('div');
    chip.className = 'off-chip';
    chip.innerHTML = '<span class="off-text" style="color:'+C_DEF+';">'+emp.name+' <span style="color:'+C_OFF+';">휴'+offCount+'</span></span>';
    $weekOffs.appendChild(chip);
  });
}

// ============================================================
// Shift Modal
// ============================================================
let shiftSelectedEmpId = null;
let shiftSelectedRoles = []; // ['주방'], ['차배달'], ['오토바이'], etc
let shiftSelectedStart = null;
let shiftSelectedEnd = null;
let shiftEditMode = false; // editing existing shift

function buildTimeSelects(){
  const $start = $('shiftStartSel');
  const $end = $('shiftEndSel');
  $start.innerHTML = '';
  $end.innerHTML = '';

  // DAY_START_HOUR 기준 24시간 (30분 단위)
  const base = DAY_START_HOUR;
  for(let h=base; h<base+24; h++){
    const rh = h>=24?h-24:h;
    for(let m=0; m<60; m+=30){
      const t = pad(rh)+':'+pad(m);
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = t;
      $start.appendChild(opt);
    }
  }
  for(let h=base; h<=base+24; h++){
    const rh = h>=24?h-24:h;
    for(let m=0; m<60; m+=30){
      if(h===base&&m===0) continue;
      if(h===base+24&&m>0) break;
      const t = pad(rh)+':'+pad(m);
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = t;
      $end.appendChild(opt);
    }
  }

  // 게이지 눈금 동적 생성 (4시간 간격, 7개)
  const ticks = $('shiftGaugeTicks');
  ticks.innerHTML = '';
  for(let i=0; i<6; i++){
    const h = (base + i*4) % 24;
    const sp = document.createElement('span');
    sp.textContent = pad(h);
    ticks.appendChild(sp);
  }

  // sync select ↔ gauge
  $start.addEventListener('change', ()=>{
    shiftSelectedStart = $start.value;
    updateShiftGauge();
  });
  $end.addEventListener('change', ()=>{
    shiftSelectedEnd = $end.value;
    updateShiftGauge();
  });

  // Gauge drag
  setupShiftGauge();
}

function selectStartTime(t){
  shiftSelectedStart = t;
  $('shiftStartSel').value = t;
  updateShiftGauge();
}
function selectEndTime(t){
  shiftSelectedEnd = t;
  $('shiftEndSel').value = t;
  updateShiftGauge();
}

function updateShiftGauge(){
  const fill = $('shiftGaugeFill');
  const labels = $('shiftGaugeLabels');
  if(!shiftSelectedStart || !shiftSelectedEnd){ fill.style.display='none'; labels.textContent=''; return; }
  fill.style.display='';
  const left = timeToPercent(shiftSelectedStart);
  const right = timeToPercent(shiftSelectedEnd);
  let width = right - left;
  if(width<=0) width+=100;
  fill.style.left = left+'%';
  fill.style.width = Math.min(width,100-left)+'%';
  const hours = calcHours(shiftSelectedStart, shiftSelectedEnd);
  labels.textContent = shiftSelectedStart+' ~ '+shiftSelectedEnd+' ('+hours+'h)';
}

function setupShiftGauge(){
  const gauge = $('shiftGauge');
  let dragging = null; // 'start' | 'end'
  function xToTime(x){
    const rect = gauge.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (x-rect.left)/rect.width));
    const totalMin = pct * TL_TOTAL_MINUTES;
    let h = Math.floor(totalMin/60)+DAY_START_HOUR;
    if(h>=24) h-=24;
    let m = Math.round((totalMin%60)/30)*30;
    if(m>=60){m=0;h=(h+1)>=24?h+1-24:h+1;}
    return pad(h)+':'+pad(m);
  }
  gauge.addEventListener('touchstart', (e)=>{
    const t = xToTime(e.touches[0].clientX);
    // decide if adjusting start or end
    if(!shiftSelectedStart) dragging='start';
    else{
      const tMin = timeToMinutesFrom12(t);
      const sMin = shiftSelectedStart ? timeToMinutesFrom12(shiftSelectedStart) : 0;
      const eMin = shiftSelectedEnd ? timeToMinutesFrom12(shiftSelectedEnd) : TL_TOTAL_MINUTES;
      dragging = Math.abs(tMin-sMin) < Math.abs(tMin-eMin) ? 'start' : 'end';
    }
    const tv = xToTime(e.touches[0].clientX);
    if(dragging==='start') selectStartTime(tv);
    else selectEndTime(tv);
  }, {passive:true});
  gauge.addEventListener('touchmove', (e)=>{
    if(!dragging) return;
    const tv = xToTime(e.touches[0].clientX);
    if(dragging==='start') selectStartTime(tv);
    else selectEndTime(tv);
  }, {passive:true});
  gauge.addEventListener('touchend', ()=>{ dragging=null; });
}

function buildEmpChips(){
  const $chips = $('shiftEmpChips');
  $chips.innerHTML = '';
  Object.keys(employees).forEach(empId => {
    const emp = employees[empId];
    const chip = document.createElement('div');
    chip.className = 'emp-chip';
    if(empId === shiftSelectedEmpId) chip.classList.add('selected');
    chip.innerHTML = '<div class="chip-dot" style="background:'+(emp.color||'#9090A8')+'"></div>'+emp.name;
    chip.addEventListener('click', ()=>{
      shiftSelectedEmpId = empId;
      $chips.querySelectorAll('.emp-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      // Load existing shift if any
      const existing = daySchedule[empId];
      if(existing && existing.start){
        selectStartTime(existing.start);
        selectEndTime(existing.end);
        shiftSelectedRoles = existing.role ? existing.role.split(',').filter(Boolean) : [];
        updateRolePills();
        $('shiftDelete').style.display = '';
        shiftEditMode = true;
      } else {
        $('shiftDelete').style.display = 'none';
        shiftEditMode = false;
      }
    });
    $chips.appendChild(chip);
  });
}

function updateRolePills(){
  const empName = shiftSelectedEmpId ? (employees[shiftSelectedEmpId]?.name || '') : '';
  const caps = EMP_CAPABILITIES[empName] || ['주방'];
  document.querySelectorAll('#shiftRolePills .role-pill').forEach(pill => {
    const r = pill.dataset.role;
    pill.classList.toggle('selected', shiftSelectedRoles.includes(r));
    pill.classList.toggle('disabled', !caps.includes(r));
  });
  // 능력 안내 표시
  $('shiftRoleNote').textContent = empName ? '('+empName+': '+caps.map(c=>ROLE_LABELS[c]||c).join('+')+' 가능)' : '';
}

// ========== 당일 매출 예상 설정 ==========
function saveDailyRevenueMap(){ localStorage.setItem('ws_daily_revenue', JSON.stringify(dailyRevenueMap)); fbPut(FB_WS+'/daily_revenue', dailyRevenueMap); }

function setDailyRevenue(key){
  const dk = dateKey(currentDate);
  const d = new Date(dk); const dow = d.getDay();
  const weekdayDefault = WEEKDAY_REVENUE_DEFAULTS[dow] || '250';
  if(key === weekdayDefault){
    // 요일 기본값과 같으면 명시 지정 제거 (디폴트로 복원)
    delete dailyRevenueMap[dk];
  } else {
    dailyRevenueMap[dk] = key;
  }
  saveDailyRevenueMap();
  renderAll();
}
function clearHourlyOverrides(){
  staffSettings.presetOverrides = {}; // 모든 구간 오버라이드 초기화 → 디폴트 적용
  saveStaffSettings();
  renderAll();
}
// 구간 매출 금액 수정 모달
function openRevenueEditModal(){
  let overlay = document.getElementById('revenueEditOverlay');
  if(overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'revenueEditOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;';
  // 구간별 라벨 수정
  const presetLabels = JSON.parse(localStorage.getItem('ws_preset_labels') || 'null') || {};
  let h = '<div style="background:#1E1E3A;border-radius:12px;padding:16px;width:85%;max-width:320px;">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
  h += '<span style="font-size:.85rem;font-weight:800;color:#FFD700;">매출 구간 설정</span>';
  h += '<span id="rvClose" style="font-size:1.2rem;color:#707088;cursor:pointer;">&times;</span>';
  h += '</div>';
  h += '<div style="font-size:.55rem;color:#9090A8;margin-bottom:6px;">구간명을 수정하면 버튼 라벨이 변경됩니다</div>';
  Object.entries(STAFF_PRESETS).forEach(([key, pre]) => {
    const customLabel = presetLabels[key] || pre.label;
    h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;padding:6px 8px;background:#242444;border-radius:6px;">';
    h += '<span style="font-size:.6rem;color:#FFD700;font-weight:700;min-width:40px;">'+key+'</span>';
    h += '<input type="text" value="'+customLabel+'" data-rv-key="'+key+'" style="flex:1;background:#1A1A30;border:1px solid #2E2E52;color:#E0E0EC;font-size:.65rem;border-radius:3px;padding:4px 6px;">';
    h += '</div>';
  });
  h += '<div id="rvSaveBtn" style="padding:8px;border-radius:6px;text-align:center;cursor:pointer;font-size:.7rem;font-weight:700;background:#FFD70033;border:1px solid #FFD700;color:#FFD700;margin-top:6px;">저장</div>';
  h += '</div>';
  overlay.innerHTML = h;
  document.body.appendChild(overlay);
  overlay.querySelector('#rvClose').addEventListener('click', ()=> overlay.remove());
  overlay.addEventListener('click', e=>{ if(e.target===overlay) overlay.remove(); });
  overlay.querySelector('#rvSaveBtn').addEventListener('click', ()=>{
    const labels = {};
    overlay.querySelectorAll('[data-rv-key]').forEach(inp => { labels[inp.dataset.rvKey] = inp.value.trim(); });
    localStorage.setItem('ws_preset_labels', JSON.stringify(labels));
    overlay.remove();
    renderAll();
  });
}

// ========== 시간별 인원 수정 팝업 — 매출구간별 저장 ==========
function openHourLimitEdit(hour){
  let overlay = document.getElementById('hourLimitOverlay');
  if(overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'hourLimitOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;';

  const pk = getActivePresetKey();
  const presetLabel = (STAFF_PRESETS[pk]||{}).label || pk;
  const limits = getRoleLimits(hour);
  const roles = [
    {key:'kitchen', label:'주방', color:'#E67E22', lim:limits['주방']},
    {key:'bike', label:'바이크', color:'#FFD700', lim:limits['오토바이']},
    {key:'car', label:'차', color:'#4ECDC4', lim:limits['차배달']},
  ];

  const allH = [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,0,1,2];
  const hourIdx = allH.indexOf(hour);

  let h = '<div style="background:#1E1E3A;border-radius:12px;padding:16px;width:300px;max-height:90vh;overflow-y:auto;">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
  h += '<span style="font-size:.9rem;font-weight:800;color:#FFD700;">시간별 인원</span>';
  h += '<span id="hlClose" style="font-size:1.4rem;color:#707088;cursor:pointer;padding:4px;">&times;</span>';
  h += '</div>';

  // 매출구간 표시 + 전환
  h += '<div style="display:flex;gap:4px;margin-bottom:8px;">';
  for(const [key, pre] of Object.entries(STAFF_PRESETS)){
    const sel = key === pk;
    h += '<span data-hl-preset="'+key+'" style="flex:1;padding:4px 2px;border-radius:5px;text-align:center;cursor:pointer;font-size:.6rem;font-weight:700;'
      +(sel?'background:#FFD70033;border:1.5px solid #FFD700;color:#FFD700;':'background:#242444;border:1.5px solid #2E2E52;color:#707088;')+'">'+pre.label+'</span>';
  }
  h += '</div>';

  // 시간 범위
  h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:6px 8px;background:#242444;border-radius:8px;">';
  h += '<span style="font-size:.65rem;color:#9090A8;font-weight:700;">시간</span>';
  h += '<select id="hlFrom" style="flex:1;background:#1A1A30;border:1px solid #2E2E52;color:#FFD700;font-size:.8rem;padding:4px;border-radius:4px;text-align:center;">';
  allH.forEach((hv,i) => { h += '<option value="'+i+'"'+(i===hourIdx?' selected':'')+'>'+hv+'시</option>'; });
  h += '</select>';
  h += '<span style="font-size:.7rem;color:#707088;">~</span>';
  h += '<select id="hlTo" style="flex:1;background:#1A1A30;border:1px solid #2E2E52;color:#FFD700;font-size:.8rem;padding:4px;border-radius:4px;text-align:center;">';
  allH.forEach((hv,i) => { h += '<option value="'+i+'"'+(i===hourIdx?' selected':'')+'>'+hv+'시</option>'; });
  h += '</select>';
  h += '</div>';

  // 빠른시간 선택
  h += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">';
  const quickRanges = [{l:'6-16',f:0,t:10},{l:'17-19',f:11,t:13},{l:'20-23',f:14,t:17},{l:'0-2',f:18,t:20},{l:'전체',f:0,t:20}];
  quickRanges.forEach(q => {
    h += '<span data-hl-range="'+q.f+'_'+q.t+'" style="font-size:.55rem;padding:3px 7px;border-radius:5px;background:#1A1A30;border:1px solid #2E2E52;color:#9090A8;cursor:pointer;font-weight:600;">'+q.l+'</span>';
  });
  h += '</div>';

  // 역할별 min/max
  roles.forEach(r => {
    h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:8px 10px;background:#242444;border-radius:8px;">';
    h += '<span style="font-size:.75rem;font-weight:700;color:'+r.color+';min-width:44px;">'+r.label+'</span>';
    h += '<span style="font-size:.65rem;color:#707088;">최소</span>';
    h += '<div style="display:flex;align-items:center;gap:3px;">';
    h += '<span data-hl-btn="'+r.key+'_min_-1" style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:#1A1A30;border-radius:5px;color:#E0E0EC;font-weight:700;cursor:pointer;font-size:.9rem;">-</span>';
    h += '<input type="number" value="'+r.lim.min+'" min="0" max="9" data-hl="'+r.key+'_min" style="width:32px;background:#1A1A30;border:1px solid #2E2E52;color:#FFD700;text-align:center;font-size:.9rem;border-radius:4px;padding:3px;">';
    h += '<span data-hl-btn="'+r.key+'_min_1" style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:#1A1A30;border-radius:5px;color:#E0E0EC;font-weight:700;cursor:pointer;font-size:.9rem;">+</span>';
    h += '</div>';
    h += '<span style="font-size:.65rem;color:#707088;margin-left:4px;">최대</span>';
    h += '<div style="display:flex;align-items:center;gap:3px;">';
    h += '<span data-hl-btn="'+r.key+'_max_-1" style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:#1A1A30;border-radius:5px;color:#E0E0EC;font-weight:700;cursor:pointer;font-size:.9rem;">-</span>';
    h += '<input type="number" value="'+r.lim.max+'" min="0" max="9" data-hl="'+r.key+'_max" style="width:32px;background:#1A1A30;border:1px solid #2E2E52;color:#FFD700;text-align:center;font-size:.9rem;border-radius:4px;padding:3px;">';
    h += '<span data-hl-btn="'+r.key+'_max_1" style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:#1A1A30;border-radius:5px;color:#E0E0EC;font-weight:700;cursor:pointer;font-size:.9rem;">+</span>';
    h += '</div>';
    h += '</div>';
  });

  h += '<div style="display:flex;gap:6px;margin-top:8px;">';
  h += '<div id="hlSave" style="flex:1;padding:10px;border-radius:8px;text-align:center;cursor:pointer;font-size:.8rem;font-weight:700;background:#FFD70033;border:1px solid #FFD700;color:#FFD700;">저장</div>';
  h += '<div id="hlReset" style="flex:1;padding:10px;border-radius:8px;text-align:center;cursor:pointer;font-size:.8rem;font-weight:700;background:#24244480;border:1px solid #2E2E52;color:#9090A8;">초기화</div>';
  h += '</div>';
  h += '</div>';

  overlay.innerHTML = h;
  document.body.appendChild(overlay);

  let editingPreset = pk; // 현재 편집 중인 매출구간

  // 매출구간 전환 → 값 갱신
  function refreshValues(presetKey){
    editingPreset = presetKey;
    // 구간 버튼 하이라이트
    overlay.querySelectorAll('[data-hl-preset]').forEach(b => {
      const sel = b.dataset.hlPreset === presetKey;
      b.style.background = sel ? '#FFD70033' : '#242444';
      b.style.borderColor = sel ? '#FFD700' : '#2E2E52';
      b.style.color = sel ? '#FFD700' : '#707088';
    });
    // 해당 구간의 값 로드
    const ov = staffSettings.presetOverrides[presetKey] || {};
    const preset = STAFF_PRESETS[presetKey] || STAFF_PRESETS['250'];
    const hr = hour;
    const src = ov['h'+hr] || preset.hourly[hr] || {kitchen:{min:0,max:0},bike:{min:0,max:0},car:{min:0,max:0}};
    overlay.querySelector('[data-hl="kitchen_min"]').value = src.kitchen.min;
    overlay.querySelector('[data-hl="kitchen_max"]').value = src.kitchen.max;
    overlay.querySelector('[data-hl="bike_min"]').value = src.bike.min;
    overlay.querySelector('[data-hl="bike_max"]').value = src.bike.max;
    overlay.querySelector('[data-hl="car_min"]').value = src.car.min;
    overlay.querySelector('[data-hl="car_max"]').value = src.car.max;
  }

  // 이벤트
  overlay.querySelector('#hlClose').onclick = ()=> overlay.remove();
  overlay.addEventListener('click', e=>{ if(e.target===overlay) overlay.remove(); });

  // 매출구간 전환
  overlay.querySelectorAll('[data-hl-preset]').forEach(btn => {
    btn.addEventListener('click', ()=> refreshValues(btn.dataset.hlPreset));
  });
  // +/- 버튼
  overlay.querySelectorAll('[data-hl-btn]').forEach(btn => {
    btn.addEventListener('click', ()=>{
      const parts = btn.dataset.hlBtn.split('_');
      const field = parts[0]+'_'+parts[1];
      const delta = parseFloat(parts[2]) * 0.5; // 0.5 단위
      const inp = overlay.querySelector('[data-hl="'+field+'"]');
      if(inp) inp.value = Math.max(0, Math.min(9, parseFloat(inp.value||'0')+delta));
    });
  });
  // 빠른시간 선택
  overlay.querySelectorAll('[data-hl-range]').forEach(btn => {
    btn.addEventListener('click', ()=>{
      const [f,t] = btn.dataset.hlRange.split('_').map(Number);
      overlay.querySelector('#hlFrom').value = f;
      overlay.querySelector('#hlTo').value = t;
    });
  });
  // 저장 — 선택된 매출구간에 시간범위 일괄 저장
  overlay.querySelector('#hlSave').addEventListener('click', ()=>{
    const fromIdx = parseInt(overlay.querySelector('#hlFrom').value);
    const toIdx = parseInt(overlay.querySelector('#hlTo').value);
    const g = (k) => parseFloat(overlay.querySelector('[data-hl="'+k+'"]')?.value||'0');
    const val = {
      kitchen:{min:g('kitchen_min'),max:g('kitchen_max')},
      bike:{min:g('bike_min'),max:g('bike_max')},
      car:{min:g('car_min'),max:g('car_max')},
    };
    if(!staffSettings.presetOverrides[editingPreset]) staffSettings.presetOverrides[editingPreset] = {};
    for(let i=fromIdx; i!==(toIdx+1)%allH.length || i===fromIdx; i=(i+1)%allH.length){
      staffSettings.presetOverrides[editingPreset]['h'+allH[i]] = JSON.parse(JSON.stringify(val));
      if(i===toIdx) break;
    }
    saveStaffSettings();
    overlay.remove();
    renderAll();
  });
  // 초기화 — 선택된 매출구간의 시간범위 오버라이드 삭제
  overlay.querySelector('#hlReset').addEventListener('click', ()=>{
    const fromIdx = parseInt(overlay.querySelector('#hlFrom').value);
    const toIdx = parseInt(overlay.querySelector('#hlTo').value);
    const ov = staffSettings.presetOverrides[editingPreset];
    if(ov){
      for(let i=fromIdx; i!==(toIdx+1)%allH.length || i===fromIdx; i=(i+1)%allH.length){
        delete ov['h'+allH[i]];
        if(i===toIdx) break;
      }
      if(!Object.keys(ov).length) delete staffSettings.presetOverrides[editingPreset];
    }
    saveStaffSettings();
    overlay.remove();
    renderAll();
  });
}

// ========== 기존 호환용 ==========
function openStaffSettingsModal(){ /* 게이지 셀 터치로 대체됨 */ }
function applyStaffPreset(key){ setDailyRevenue(key); }
function resetStaffToPreset(){ clearHourlyOverrides(); }

function openShiftModal(empId){
  shiftSelectedEmpId = empId || null;
  shiftSelectedRoles = [];
  shiftSelectedStart = null;
  shiftSelectedEnd = null;
  shiftEditMode = false;

  buildEmpChips();

  // If empId provided and has existing shift, load it
  if(empId && daySchedule[empId] && daySchedule[empId].start){
    const shift = daySchedule[empId];
    shiftSelectedRoles = shift.role ? shift.role.split(',').filter(Boolean) : [];
    shiftEditMode = true;
    selectStartTime(shift.start);
    selectEndTime(shift.end);
    $('shiftDelete').style.display = '';
  } else {
    $('shiftStartSel').selectedIndex = 0;
    $('shiftEndSel').selectedIndex = 0;
    updateShiftGauge();
    $('shiftDelete').style.display = 'none';
  }

  updateRolePills();

  const m = currentDate.getMonth()+1;
  const d = currentDate.getDate();
  const dow = DOW_KR[currentDate.getDay()];
  const empName = empId ? (employees[empId]?.name||'') : '';
  $('shiftTitle').textContent = '근무 ' + (shiftEditMode ? '수정' : '추가') + ' - ' + m+'/'+d+' ('+dow+')';

  // 고정/휴무 버튼 표시
  $('shiftSaveFixed').style.display = empId ? '' : 'none';
  $('shiftDayoff').style.display = empId ? '' : 'none';
  // 휴무 상태면 버튼을 "휴무해제"로 변경
  const isOff = empId && isDayOff(empId, dateKey(currentDate));
  if(isOff){
    $('shiftDayoff').textContent = '휴무해제';
    $('shiftDayoff').classList.remove('btn-danger');
    $('shiftDayoff').style.background = '#333';
    $('shiftDayoff').style.color = '#9090A8';
  } else {
    $('shiftDayoff').textContent = '휴무지정';
    $('shiftDayoff').classList.add('btn-danger');
    $('shiftDayoff').style.background = '';
    $('shiftDayoff').style.color = '';
  }

  openModal($shiftModal);
}

// Role pill clicks (multi-select toggle)
document.querySelectorAll('#shiftRolePills .role-pill').forEach(pill => {
  pill.addEventListener('click', ()=>{
    if(pill.classList.contains('disabled')) return;
    const r = pill.dataset.role;
    const idx = shiftSelectedRoles.indexOf(r);
    if(idx >= 0) shiftSelectedRoles.splice(idx, 1);
    else shiftSelectedRoles.push(r);
    updateRolePills();
  });
});

// Presets
document.querySelectorAll('#shiftPresets .preset-btn').forEach(btn => {
  btn.addEventListener('click', ()=>{
    selectStartTime(btn.dataset.start);
    selectEndTime(btn.dataset.end);
  });
});

// Save shift
$('shiftSave').addEventListener('click', async()=>{
  if(!shiftSelectedEmpId){
    showToast('직원을 선택해주세요');
    return;
  }
  if(!shiftSelectedStart || !shiftSelectedEnd){
    showToast('시간을 선택해주세요');
    return;
  }
  const dk = dateKey(currentDate);
  const data = {
    start: shiftSelectedStart,
    end: shiftSelectedEnd,
    role: shiftSelectedRoles.join(',')
  };

  closeModal($shiftModal);

  // Optimistic update — localStorage first
  daySchedule[shiftSelectedEmpId] = data;
  lsSaveSchedule(dk, daySchedule);
  // 수동 저장 = 확정 처리
  setShiftStatus(dk, shiftSelectedEmpId, 'confirmed');
  renderAll();

  const ok = await fbPut(FB_SCHEDULES+'/'+dk+'/'+shiftSelectedEmpId, data);
  if(ok){
    showToast('저장 확정');
    loadWeekSchedules();
  } else {
    showToast('로컬 저장됨 (서버 동기화 대기)');
  }
});

// Delete shift
$('shiftDelete').addEventListener('click', async()=>{
  if(!shiftSelectedEmpId) return;
  const dk = dateKey(currentDate);

  closeModal($shiftModal);

  // Optimistic — localStorage first
  delete daySchedule[shiftSelectedEmpId];
  lsSaveSchedule(dk, daySchedule);
  renderAll();

  const ok = await fbDelete(FB_SCHEDULES+'/'+dk+'/'+shiftSelectedEmpId);
  if(ok){
    showToast('삭제됨');
    loadWeekSchedules();
  }
});

// "고정으로 저장" — FIXED_SCHEDULES 업데이트 + Firebase 저장
$('shiftSaveFixed').addEventListener('click', async()=>{
  if(!shiftSelectedEmpId || !shiftSelectedStart || !shiftSelectedEnd){
    showToast('시간을 선택해주세요');
    return;
  }
  const empName = employees[shiftSelectedEmpId]?.name;
  if(!empName){ showToast('직원 오류'); return; }

  const newFixed = {start:shiftSelectedStart, end:shiftSelectedEnd, role:shiftSelectedRoles.join(','), type:'fixed'};
  // 로컬 FIXED_SCHEDULES 업데이트
  FIXED_SCHEDULES[empName] = newFixed;
  // Firebase에 저장 (고정값 영구 보존)
  fbPut(FB_WS+'/fixed_schedules/'+encodeURIComponent(empName), newFixed);
  // localStorage 캐시
  try{ localStorage.setItem('ws_fixed_schedules', JSON.stringify(FIXED_SCHEDULES)); }catch(e){}

  // 당일 스케줄에도 적용
  const dk = dateKey(currentDate);
  const data = {start:shiftSelectedStart, end:shiftSelectedEnd, role:shiftSelectedRoles.join(',')};
  daySchedule[shiftSelectedEmpId] = data;
  lsSaveSchedule(dk, daySchedule);
  setShiftStatus(dk, shiftSelectedEmpId, 'confirmed');

  closeModal($shiftModal);
  await fbPut(FB_SCHEDULES+'/'+dk+'/'+shiftSelectedEmpId, data);
  showToast(empName+' 고정값 변경됨');
  renderAll();
  loadWeekSchedules();
});

// 수정 팝업에서 휴무 지정
$('shiftDayoff').addEventListener('click', ()=>{
  if(!shiftSelectedEmpId) return;
  const dk = dateKey(currentDate);
  const isOff = isDayOff(shiftSelectedEmpId, dk);
  if(isOff){
    // 휴무 해제 (false = 수동해제 표시, 자동생성 방지)
    if(!dayoffs[shiftSelectedEmpId]) dayoffs[shiftSelectedEmpId] = {};
    dayoffs[shiftSelectedEmpId][dk] = false;
    lsSaveDayoffs();
    fbPut(FB_DAYOFFS+'/'+shiftSelectedEmpId+'/'+dk, false);
    // dayoff 플래그 스케줄 삭제
    if(daySchedule[shiftSelectedEmpId] && daySchedule[shiftSelectedEmpId].dayoff){
      delete daySchedule[shiftSelectedEmpId];
    }
    // 고정스케줄 재적용 (날짜별 동적 스케줄)
    const empName = employees[shiftSelectedEmpId]?.name || '';
    const fix = getFixedScheduleForDate(empName, currentDate);
    if(fix && fix.type==='fixed' && fix.start){
      daySchedule[shiftSelectedEmpId] = {start:fix.start, end:fix.end, role:fix.role};
      fbPut(FB_SCHEDULES+'/'+dk+'/'+shiftSelectedEmpId, daySchedule[shiftSelectedEmpId]);
      setShiftStatus(dk, shiftSelectedEmpId, 'confirmed');
    }
    lsSaveSchedule(dk, daySchedule);
    closeModal($shiftModal);
    showToast('휴무 해제 + 확정');
  } else {
    // 휴무 지정
    if(!dayoffs[shiftSelectedEmpId]) dayoffs[shiftSelectedEmpId] = {};
    dayoffs[shiftSelectedEmpId][dk] = true;
    if(daySchedule[shiftSelectedEmpId]){
      delete daySchedule[shiftSelectedEmpId];
      lsSaveSchedule(dk, daySchedule);
      fbDelete(FB_SCHEDULES+'/'+dk+'/'+shiftSelectedEmpId);
    }
    lsSaveDayoffs();
    fbPut(FB_DAYOFFS+'/'+shiftSelectedEmpId+'/'+dk, true);
    closeModal($shiftModal);
    showToast('휴무 지정');
  }
  renderAll();
});

$('shiftCancel').addEventListener('click',()=> closeModal($shiftModal));
$('shiftModalClose').addEventListener('click',()=> closeModal($shiftModal));

// ============================================================
// Month View Modal
// ============================================================
if($('monthViewBtn')) $('monthViewBtn').addEventListener('click', ()=>{
  monthViewYear = currentDate.getFullYear();
  monthViewMonth = currentDate.getMonth()+1;
  renderMonthView();
  openModal($monthModal);
});
$('monthModalClose').addEventListener('click', ()=> closeModal($monthModal));
$('monthPrev').addEventListener('click', ()=>{
  monthViewMonth--;
  if(monthViewMonth < 1){ monthViewMonth=12; monthViewYear--; }
  renderMonthView();
});
$('monthNext').addEventListener('click', ()=>{
  monthViewMonth++;
  if(monthViewMonth > 12){ monthViewMonth=1; monthViewYear++; }
  renderMonthView();
});

async function renderMonthView(){
  $('monthModalLabel').textContent = monthViewYear+'년 '+monthViewMonth+'월';
  const grid = $('monthGrid');
  grid.innerHTML = '';

  // DOW labels
  DOW_KR_SHORT.forEach(d => {
    const label = document.createElement('div');
    label.className = 'month-dow-label';
    label.textContent = d;
    grid.appendChild(label);
  });

  const days = daysInMonth(monthViewYear, monthViewMonth);
  const firstDow = new Date(monthViewYear, monthViewMonth-1, 1).getDay();
  const today = new Date();

  // Load month schedule counts
  const monthData = {};
  const promises = [];
  const dateKeys = [];
  for(let d=1; d<=days; d++){
    const dk = monthViewYear+'-'+pad(monthViewMonth)+'-'+pad(d);
    dateKeys.push({dk, d});
  }

  // Fetch all days in parallel (batch — just fetch the whole month folder)
  const monthFolder = await fbGet(FB_SCHEDULES);
  const allSchedules = monthFolder || {};

  // Empty cells before first day
  for(let i=0; i<firstDow; i++){
    const cell = document.createElement('div');
    cell.className = 'month-day-cell empty';
    grid.appendChild(cell);
  }

  for(let d=1; d<=days; d++){
    const dk = monthViewYear+'-'+pad(monthViewMonth)+'-'+pad(d);
    const daySched = allSchedules[dk] || {};
    const count = Object.keys(daySched).filter(k => daySched[k] && daySched[k].start).length;
    const dow = new Date(monthViewYear, monthViewMonth-1, d).getDay();
    const isToday2 = (today.getFullYear()===monthViewYear && (today.getMonth()+1)===monthViewMonth && today.getDate()===d);

    const cell = document.createElement('div');
    cell.className = 'month-day-cell';
    if(isToday2) cell.classList.add('today');
    if(count > 0) cell.classList.add('has-staff');

    const num = document.createElement('div');
    num.className = 'md-num';
    const cellDateObj = new Date(monthViewYear, monthViewMonth-1, d);
    if(dow === 0 || isKrHoliday(cellDateObj)) num.classList.add('sun');
    if(dow === 6 && !isKrHoliday(cellDateObj)) num.classList.add('sat');
    num.textContent = d;
    cell.appendChild(num);

    if(count > 0){
      const cnt = document.createElement('div');
      cnt.className = 'md-count';
      cnt.textContent = count+'명';
      cell.appendChild(cnt);
    }

    cell.addEventListener('click', ()=>{
      currentDate = new Date(monthViewYear, monthViewMonth-1, d);
      closeModal($monthModal);
      onDateChange();
    });

    grid.appendChild(cell);
  }
}

// ============================================================
// Employee Management Modal
// ============================================================
$('empMgrBtn').addEventListener('click', ()=>{
  renderEmpList();
  openModal($empModal);
});
$('empModalClose').addEventListener('click', ()=> closeModal($empModal));

function renderEmpList(){
  const $list = $('empList');
  $list.innerHTML = '';
  const empKeys = Object.keys(employees);
  if(empKeys.length === 0){
    $list.innerHTML = '<div style="padding:20px;text-align:center;color:#9090A8;">등록된 직원이 없습니다</div>';
    return;
  }
  empKeys.forEach(id => {
    const emp = employees[id];
    const item = document.createElement('div');
    item.className = 'emp-list-item';
    const roleText = emp.role || '미지정';
    const rateText = emp.hourlyRate ? emp.hourlyRate.toLocaleString()+'원' : '-';
    let detailExtra = '';
    if(emp.preferredHours) detailExtra += ' | 선호:'+emp.preferredHours;
    if(emp.unavailableHours) detailExtra += ' | 불가:'+emp.unavailableHours;
    item.innerHTML =
      '<div class="emp-dot" style="background:'+(emp.color||'#9090A8')+'"></div>'+
      '<div class="emp-info">'+
        '<div class="name">'+emp.name+'</div>'+
        '<div class="detail">'+(emp.phone||'전화없음')+' | '+roleText+' | '+rateText+detailExtra+'</div>'+
      '</div>'+
      '<div class="emp-list-actions">'+
        '<button class="btn btn-sm" data-edit="'+id+'">수정</button>'+
        '<button class="btn btn-sm btn-danger" data-del="'+id+'">삭제</button>'+
      '</div>';
    $list.appendChild(item);
  });

  $list.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', ()=> openEmpEdit(btn.dataset.edit));
  });
  $list.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async()=>{
      if(!confirm(employees[btn.dataset.del].name+' 삭제?')) return;
      const ok = await fbDelete(FB_EMPLOYEES+'/'+btn.dataset.del);
      if(ok){
        delete employees[btn.dataset.del];
        renderEmpList();
        renderAll();
        showToast('삭제됨');
      }
    });
  });
}

// ============================================================
// Employee Edit Modal
// ============================================================
const PRESET_COLORS = [
  '#FF6B6B','#4ECDC4','#45B7D1','#96CEB4',
  '#FFEAA7','#DDA0DD','#F0A500','#6C5CE7',
  '#A8E6CF','#FF8A5C','#EA80FC','#00BCD4'
];
let editingEmpId = null;
let selectedColor = PRESET_COLORS[0];

function buildColorPicker(){
  const $cp = $('colorPicker');
  $cp.innerHTML = '';
  PRESET_COLORS.forEach(c => {
    const sw = document.createElement('div');
    sw.className = 'color-swatch' + (c === selectedColor ? ' selected' : '');
    sw.style.background = c;
    sw.addEventListener('click', ()=>{
      selectedColor = c;
      $cp.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
    });
    $cp.appendChild(sw);
  });
}

function openEmpEdit(id){
  editingEmpId = id;
  if(id && employees[id]){
    const emp = employees[id];
    $('empEditTitle').textContent = '직원 수정';
    $('empName').value = emp.name || '';
    $('empPhone').value = emp.phone || '';
    $('empRole').value = emp.role || '';
    $('empHourlyRate').value = emp.hourlyRate || 0;
    $('empMaxHours').value = emp.maxHours || 40;
    $('empPreferredHours').value = emp.preferredHours || '';
    $('empUnavailableHours').value = emp.unavailableHours || '';
    selectedColor = emp.color || PRESET_COLORS[0];
  } else {
    editingEmpId = null;
    $('empEditTitle').textContent = '직원 추가';
    $('empName').value = '';
    $('empPhone').value = '';
    $('empRole').value = '';
    $('empHourlyRate').value = 0;
    $('empMaxHours').value = 40;
    $('empPreferredHours').value = '';
    $('empUnavailableHours').value = '';
    selectedColor = PRESET_COLORS[0];
  }
  buildColorPicker();
  openModal($empEditModal);
}

$('addEmpBtn').addEventListener('click', ()=> openEmpEdit(null));
$('empEditClose').addEventListener('click', ()=> closeModal($empEditModal));
$('empEditCancel').addEventListener('click', ()=> closeModal($empEditModal));

$('empEditSave').addEventListener('click', async()=>{
  const name = $('empName').value.trim();
  if(!name){ showToast('이름을 입력해주세요'); return; }
  let id = editingEmpId;
  if(!id) id = 'emp' + Date.now();
  // 기존 capabilities 보존
  const prevData = employees[id] || {};
  const data = {
    name: name,
    phone: $('empPhone').value.trim(),
    color: selectedColor,
    role: $('empRole').value,
    hourlyRate: parseInt($('empHourlyRate').value) || 0,
    maxHours: parseInt($('empMaxHours').value) || 40,
    preferredHours: $('empPreferredHours').value.trim() || '',
    unavailableHours: $('empUnavailableHours').value.trim() || '',
    capabilities: prevData.capabilities || (DEFAULT_EMPLOYEES[id]?.capabilities) || ['주방']
  };
  closeModal($empEditModal);
  employees[id] = data;
  lsSaveEmployees(employees);
  renderEmpList();
  renderAll();
  const ok = await fbPut(FB_EMPLOYEES+'/'+id, data);
  if(ok) showToast('저장됨');
  else showToast('로컬 저장됨');
});

// ============================================================
// Day-off (휴무) Management
// ============================================================
const LS_DAYOFFS = 'ws_dayoffs';
const FB_DAYOFFS = FB_WS + '/dayoffs';
let dayoffs = {}; // {empId: {yyyy-MM-dd: true, ...}, ...}

function lsSaveDayoffs(){ try{ localStorage.setItem(LS_DAYOFFS, JSON.stringify(dayoffs)); }catch(e){} }
function lsLoadDayoffs(){ try{ const s = localStorage.getItem(LS_DAYOFFS); return s ? JSON.parse(s) : null; }catch(e){ return null; } }

function isDayOff(empId, dk){
  return dayoffs[empId] && dayoffs[empId][dk];
}

function getDayOffEmployees(dk){
  const result = [];
  for(const empId in dayoffs){
    if(dayoffs[empId][dk]) result.push(empId);
  }
  return result;
}

async function loadDayoffs(){
  const local = lsLoadDayoffs();
  if(local) dayoffs = local;
  try{
    const fb = await fbGet(FB_DAYOFFS);
    if(fb){
      // 병합: 로컬 우선
      for(const empId in fb){
        if(!dayoffs[empId]) dayoffs[empId] = {};
        for(const dk in fb[empId]){
          if(dayoffs[empId][dk] === undefined) dayoffs[empId][dk] = fb[empId][dk];
        }
      }
      lsSaveDayoffs();
    }
  }catch(e){ console.error('loadDayoffs error', e); }
}

// 매주 반복 휴무 (요일 기반) + 특정 기간 휴무 자동 생성
// 월=1, 화=2, ..., 일=0
const WEEKLY_DAYOFFS = {
  '리': [2],       // 매주 화요일
  '히오': [1],     // 매주 월요일
  '권연옥': [0, 3, 4, 6],  // 매주 일,수,목,토
  '박준모': [1],     // 매주 월요일
  '사아야': [0, 4, 5, 6],  // 매주 일,목,금,토
};

// 특정 기간 휴무
const PERIOD_DAYOFFS = [
  // 권연옥 기간 휴무 종료 (2026-03-08까지, 3/9~ 고정 복귀)
];

// 특정 날짜 휴무
const SPECIFIC_DAYOFFS = [
];

function generateAutoDayoffs(){
  let changed = false;
  const today = new Date();
  // 8주 앞까지 자동 생성
  for(let i=0; i<56; i++){
    const d = new Date(today);
    d.setDate(d.getDate()+i);
    const dk = dateKey(d);
    const dow = d.getDay();

    // 매주 반복 휴무 (수동 해제=false 표시된 건 건드리지 않음)
    for(const empName in WEEKLY_DAYOFFS){
      if(WEEKLY_DAYOFFS[empName].includes(dow)){
        const empId = findEmpIdByName(empName);
        if(empId){
          if(!dayoffs[empId]) dayoffs[empId] = {};
          if(dayoffs[empId][dk] === undefined){
            dayoffs[empId][dk] = true;
            changed = true;
          }
        }
      }
    }
  }

  // 기간 휴무
  PERIOD_DAYOFFS.forEach(pd => {
    const empId = findEmpIdByName(pd.name);
    if(!empId) return;
    if(!dayoffs[empId]) dayoffs[empId] = {};
    const from = new Date(pd.from), to = new Date(pd.to);
    for(let d = new Date(from); d <= to; d.setDate(d.getDate()+1)){
      const dk = dateKey(d);
      if(dayoffs[empId][dk] === undefined){
        dayoffs[empId][dk] = true;
        changed = true;
      }
    }
  });

  // 특정 날짜 휴무
  SPECIFIC_DAYOFFS.forEach(sd => {
    const empId = findEmpIdByName(sd.name);
    if(!empId) return;
    if(!dayoffs[empId]) dayoffs[empId] = {};
    if(dayoffs[empId][sd.date] === undefined){
      dayoffs[empId][sd.date] = true;
      changed = true;
    }
  });

  if(changed) lsSaveDayoffs();
  return changed;
}

async function addDayOff(empId, dk){
  if(!dayoffs[empId]) dayoffs[empId] = {};
  dayoffs[empId][dk] = true;
  lsSaveDayoffs();
  // 해당 날짜 스케줄에 휴무 마킹
  const schedKey = dateKey(currentDate);
  if(dk === schedKey){
    daySchedule[empId] = {start:'', end:'', role:'휴무', dayoff:true};
    lsSaveSchedule(schedKey, daySchedule);
    renderAll();
  }
  fbPut(FB_DAYOFFS+'/'+empId+'/'+dk, true);
}

async function removeDayOff(empId, dk){
  if(dayoffs[empId]) delete dayoffs[empId][dk];
  lsSaveDayoffs();
  const schedKey = dateKey(currentDate);
  if(dk === schedKey && daySchedule[empId] && daySchedule[empId].dayoff){
    delete daySchedule[empId];
    lsSaveSchedule(schedKey, daySchedule);
    renderAll();
  }
  fbDelete(FB_DAYOFFS+'/'+empId+'/'+dk);
}

// Parse bulk dayoff input (여러 형태 지원)
function parseBulkDayoffs(text){
  const results = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;

  for(const line of lines){
    // 직원이름 찾기
    let matchedEmpId = null;
    let matchedName = '';
    let restText = line;
    for(const empId in employees){
      const name = employees[empId].name;
      if(line.startsWith(name)){
        matchedEmpId = empId;
        matchedName = name;
        restText = line.slice(name.length).trim();
        break;
      }
    }
    if(!matchedEmpId) continue;

    // 요일 처리 (화,목 → 이번주 해당 요일)
    const dowMap = {'일':0,'월':1,'화':2,'수':3,'목':4,'금':5,'토':6};
    const dowPattern = restText.match(/^([일월화수목금토])([,\s]+[일월화수목금토])*/);
    if(dowPattern){
      const dows = restText.match(/[일월화수목금토]/g);
      if(dows){
        const mon = getMonday(now);
        dows.forEach(d => {
          const target = dowMap[d];
          if(target !== undefined){
            const dt = new Date(mon);
            dt.setDate(dt.getDate() + (target === 0 ? 6 : target - 1));
            results.push({empId: matchedEmpId, date: dateKey(dt)});
          }
        });
      }
      continue;
    }

    // 범위 처리 (M/D~M/D 또는 M/D-M/D)
    const rangeMatch = restText.match(/(\d{1,2})[\/\-](\d{1,2})\s*[~\-]\s*(\d{1,2})[\/\-](\d{1,2})/);
    if(rangeMatch){
      let [,m1,d1,m2,d2] = rangeMatch.map(Number);
      const start = new Date(thisYear, m1-1, d1);
      const end = new Date(thisYear, m2-1, d2);
      for(let d = new Date(start); d <= end; d.setDate(d.getDate()+1)){
        results.push({empId: matchedEmpId, date: dateKey(d)});
      }
      continue;
    }

    // yyyy-MM-dd 형태
    const isoMatch = restText.match(/(\d{4})-(\d{1,2})-(\d{1,2})/g);
    if(isoMatch){
      isoMatch.forEach(ds => {
        const [y,m,d] = ds.split('-').map(Number);
        results.push({empId: matchedEmpId, date: y+'-'+pad(m)+'-'+pad(d)});
      });
      continue;
    }

    // M/D, M/D 콤마 구분
    const slashDates = restText.match(/(\d{1,2})[\/](\d{1,2})/g);
    if(slashDates && slashDates.length > 0){
      slashDates.forEach(ds => {
        const [m,d] = ds.split('/').map(Number);
        results.push({empId: matchedEmpId, date: thisYear+'-'+pad(m)+'-'+pad(d)});
      });
      continue;
    }

    // M-D 콤마 구분
    const dashDates = restText.match(/(\d{1,2})-(\d{1,2})/g);
    if(dashDates && dashDates.length > 0){
      dashDates.forEach(ds => {
        const [m,d] = ds.split('-').map(Number);
        results.push({empId: matchedEmpId, date: thisYear+'-'+pad(m)+'-'+pad(d)});
      });
    }
  }
  return results;
}

// Render dayoff modal
const $dayoffModal = $('dayoffModal');

function renderDayoffList(){
  const list = $('dayoffList');
  const select = $('dayoffEmpSelect');

  // populate employee select
  select.innerHTML = '';
  for(const empId in employees){
    const opt = document.createElement('option');
    opt.value = empId;
    opt.textContent = employees[empId].name;
    select.appendChild(opt);
  }

  // Set default date
  $('dayoffDate').value = dateKey(currentDate);

  // Render list grouped by date (upcoming first)
  const allEntries = [];
  for(const empId in dayoffs){
    for(const dk in dayoffs[empId]){
      if(dayoffs[empId][dk]) allEntries.push({empId, date:dk});
    }
  }
  allEntries.sort((a,b) => a.date.localeCompare(b.date));

  if(allEntries.length === 0){
    list.innerHTML = '<div style="color:#707088;font-size:.8rem;padding:8px;">등록된 휴무가 없습니다</div>';
    return;
  }

  let html = '';
  let lastDate = '';
  for(const entry of allEntries){
    if(entry.date !== lastDate){
      const d = new Date(entry.date);
      const dow = DOW_KR[d.getDay()];
      html += '<div style="font-size:.75rem;color:#9090A8;margin-top:8px;margin-bottom:2px;">'+entry.date+' ('+dow+')</div>';
      lastDate = entry.date;
    }
    const emp = employees[entry.empId];
    const name = emp ? emp.name : entry.empId;
    const color = emp ? emp.color : '#9090A8';
    html += '<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:#1A1A30;border-radius:6px;margin-bottom:3px;">';
    html += '<span style="width:8px;height:8px;border-radius:50%;background:'+color+';flex-shrink:0;"></span>';
    html += '<span style="flex:1;font-size:.85rem;">'+name+'</span>';
    html += '<button class="btn btn-sm" style="min-width:30px;min-height:26px;padding:2px 6px;font-size:.7rem;color:#E74C3C;border-color:#E74C3C55;" data-dayoff-del="'+entry.empId+'|'+entry.date+'">✕</button>';
    html += '</div>';
  }
  list.innerHTML = html;

  // Delete buttons
  list.querySelectorAll('[data-dayoff-del]').forEach(btn => {
    btn.addEventListener('click', async ()=>{
      const [empId, dk] = btn.dataset.dayoffDel.split('|');
      await removeDayOff(empId, dk);
      renderDayoffList();
    });
  });
}

$('dayoffMgrBtn').addEventListener('click', ()=>{
  renderDayoffList();
  openModal($dayoffModal);
});
$('dayoffModalClose').addEventListener('click', ()=> closeModal($dayoffModal));
$dayoffModal.addEventListener('click', (e)=>{ if(e.target === $dayoffModal) closeModal($dayoffModal); });

// Single add
$('dayoffAddBtn').addEventListener('click', async ()=>{
  const empId = $('dayoffEmpSelect').value;
  const dk = $('dayoffDate').value;
  if(!empId || !dk) return;
  await addDayOff(empId, dk);
  showToast((employees[empId]?.name||'')+' '+dk+' 휴무 등록');
  renderDayoffList();
});

// Bulk add
$('dayoffBulkBtn').addEventListener('click', async ()=>{
  const text = $('dayoffBulkInput').value.trim();
  if(!text) return;
  const entries = parseBulkDayoffs(text);
  if(entries.length === 0){
    showToast('인식된 휴무가 없습니다');
    return;
  }
  for(const e of entries){
    await addDayOff(e.empId, e.date);
  }
  $('dayoffBulkInput').value = '';
  showToast(entries.length+'건 휴무 등록 완료');
  renderDayoffList();
});

// ============================================================
// Day Navigation
// ============================================================
// 1일 이동
$('prevDay1').addEventListener('click', ()=>{
  currentDate.setDate(currentDate.getDate()-1);
  onDateChange();
});
$('nextDay1').addEventListener('click', ()=>{
  currentDate.setDate(currentDate.getDate()+1);
  onDateChange();
});
// 1주 이동
$('prevDay').addEventListener('click', ()=>{
  currentDate.setDate(currentDate.getDate()-7);
  onDateChange();
});
$('nextDay').addEventListener('click', ()=>{
  currentDate.setDate(currentDate.getDate()+7);
  onDateChange();
});
// 날짜 터치 → 30일 리스트 피커
$dateDisplay.addEventListener('click', ()=> openDatePicker());

function openDatePicker(){
  const overlay = $('datePickerOverlay');
  const list = $('datePickerList');
  const today = new Date(); today.setHours(0,0,0,0);
  const selectedDk = dateKey(currentDate);
  const todayDk = dateKey(today);
  const empKeys = Object.keys(employees);

  let html = '<div class="dp-jump">';
  html += '<button data-action="jumpDate" data-days="-7">◀ 1주</button>';
  html += '<button data-action="jumpDate" data-days="0">오늘</button>';
  html += '<button data-action="jumpDate" data-days="7">1주 ▶</button>';
  html += '</div>';

  for(let i=0; i<30; i++){
    const d = new Date(today); d.setDate(d.getDate()+i);
    const dk = dateKey(d);
    const dow = DOW_KR[d.getDay()];
    const isToday = dk === todayDk;
    const isSelected = dk === selectedDk;
    const m = d.getMonth()+1, dd = d.getDate();
    // 요약: 근무자수 / 휴무수
    let workCount=0, offCount=0;
    empKeys.forEach(id => {
      if(isDayOff(id, dk)) offCount++;
      else {
        const s = weekSchedules[dk]?.[id] || (dk===dateKey(currentDate)?daySchedule[id]:null);
        if(s && s.start) workCount++;
      }
    });
    const cls = isToday ? 'dp-item today' : isSelected ? 'dp-item selected' : 'dp-item';
    const dowColor = (d.getDay()===0||isKrHoliday(d))?'#E74C3C':d.getDay()===6?'#45B7D1':'#9090A8';
    html += '<div class="'+cls+'" data-dk="'+dk+'">';
    html += '<span class="dp-dow" style="color:'+dowColor+';">'+dow+'</span>';
    html += '<span class="dp-date">'+m+'/'+dd+'</span>';
    html += '<span class="dp-summary">';
    if(workCount>0) html += '<span style="color:#2ECC71;">'+workCount+'명</span> ';
    if(offCount>0) html += '<span style="color:#E74C3C;">휴'+offCount+'</span>';
    if(isToday) html += ' <span style="color:#FFD700;font-weight:700;">오늘</span>';
    html += '</span></div>';
  }
  list.innerHTML = html;
  overlay.classList.add('open');

  // 이벤트 위임 (날짜 선택 + jumpDate 버튼)
  list.addEventListener('click', function(e){
    const jumpBtn = e.target.closest('[data-action="jumpDate"]');
    if(jumpBtn){
      jumpDate(parseInt(jumpBtn.dataset.days));
      return;
    }
    const item = e.target.closest('.dp-item');
    if(item && item.dataset.dk){
      const parts = item.dataset.dk.split('-');
      currentDate = new Date(+parts[0], +parts[1]-1, +parts[2]);
      overlay.classList.remove('open');
      onDateChange();
    }
  });
  overlay.addEventListener('click', (e)=>{
    if(e.target === overlay) overlay.classList.remove('open');
  }, {once:true});
}
function jumpDate(days){
  if(days === 0){ currentDate = new Date(); }
  else { currentDate.setDate(currentDate.getDate()+days); }
  $('datePickerOverlay').classList.remove('open');
  onDateChange();
}

// 고정 스케줄 재배치 버튼
$('resetFixedBtn').addEventListener('click', ()=>{
  if(!confirm('고정근무자 스케줄을 초기화하고 재배치합니다.\n(변칙 직원 스케줄은 유지)')) return;
  const dk = dateKey(currentDate);
  resetToFixed(dk);
});

// 확정/작업중 토글
$('confirmDayBtn').addEventListener('click', ()=>{
  const dk = dateKey(currentDate);
  confirmedDays = lsLoadConfirmed();
  if(confirmedDays[dk]){
    delete confirmedDays[dk];
    showToast(dk+' 작업중으로 변경');
  } else {
    confirmedDays[dk] = true;
    showToast(dk+' 확정 완료');
  }
  lsSaveConfirmed(confirmedDays);
  fbPut(FB_WS+'/confirmed/'+dk, confirmedDays[dk]||null);
  updateConfirmBtn();
});

function updateConfirmBtn(){
  const dk = dateKey(currentDate);
  const btn = $('confirmDayBtn');
  if(confirmedDays[dk]){
    btn.textContent = '확정';
    btn.style.color = '#2ECC71';
    btn.style.borderColor = '#2ECC71';
    btn.style.background = '#2ECC7120';
  } else {
    btn.textContent = '작업중';
    btn.style.color = '#E67E22';
    btn.style.borderColor = '#E67E2255';
    btn.style.background = 'transparent';
  }
}

// ============================================================
// Layout Tab Switching
// ============================================================
const TAB_ORDER = ['list','timebar'];
function switchTab(tabName){
  currentTab = tabName;
  document.querySelectorAll('.layout-tab').forEach(t => t.classList.toggle('active', t.dataset.tab===tabName));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const panelMap = {list:'panelList',timebar:'panelTimebar'};
  const panel = $(panelMap[tabName]);
  if(panel) panel.classList.add('active');
  renderCurrentTab();
}
document.querySelectorAll('.layout-tab').forEach(tab => {
  tab.addEventListener('click', ()=> switchTab(tab.dataset.tab));
});

// 스와이프 → 날짜 변경 (좌=다음날, 우=이전날)
let swipeStartX=0, swipeStartY=0;
$('tabContent').addEventListener('touchstart', (e)=>{
  swipeStartX = e.touches[0].clientX;
  swipeStartY = e.touches[0].clientY;
}, {passive:true});
$('tabContent').addEventListener('touchend', (e)=>{
  const dx = e.changedTouches[0].clientX - swipeStartX;
  const dy = e.changedTouches[0].clientY - swipeStartY;
  if(Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)*0.7) return;
  if(dx < 0){ currentDate.setDate(currentDate.getDate()+1); onDateChange(); }
  else { currentDate.setDate(currentDate.getDate()-1); onDateChange(); }
}, {passive:true});

function renderCurrentTab(){
  if(currentTab==='list') renderListView();
  else if(currentTab==='timebar') renderTimebarView();
}

// Calendar view renderer (미래 날짜만 표시)
function renderCalendarView(){
  const con = $('calendarContent');
  if(!con) return;
  const dk = dateKey(currentDate);
  const today = new Date();
  today.setHours(0,0,0,0);
  const y = currentDate.getFullYear(), m = currentDate.getMonth();
  const days = daysInMonth(y, m+1);
  const firstDow = new Date(y,m,1).getDay();
  const empKeys = Object.keys(employees);

  let html = '<div class="cal-grid">';
  ['일','월','화','수','목','금','토'].forEach(d => html+='<div class="cal-hdr">'+d+'</div>');

  for(let i=0;i<firstDow;i++) html+='<div class="cal-cell other"></div>';

  for(let d=1;d<=days;d++){
    const cellDate = new Date(y,m,d);
    const cdk = dateKey(cellDate);
    const isToday = cdk===dk;
    const isPast = cellDate < today;
    if(isPast){
      html+='<div class="cal-cell other" style="pointer-events:none;"><div class="cal-date" style="color:#707088;">'+d+'</div></div>';
      continue;
    }
    html+='<div class="cal-cell'+(isToday?' today':'')+'" data-date="'+cdk+'">';
    const _calHName = getHolidayName(cellDate);
    html+='<div class="cal-date" style="font-size:.7rem;font-weight:700;'+((cellDate.getDay()===0||isKrHoliday(cellDate))?'color:#E74C3C;':cellDate.getDay()===6?'color:#45B7D1;':'color:#E0E0EC;')+'">'+d+'<span style="font-size:.55rem;color:#707088;margin-left:2px;">'+DOW_KR[cellDate.getDay()]+'</span></div>';
    if(_calHName) html+='<div style="font-size:.4rem;color:#E74C3C;font-weight:600;line-height:1;margin-top:1px;">'+_calHName+'</div>';

    // 근무자 요약 (색상 도트 + 이름)
    html+='<div class="cal-emp">';
    let empCount = 0, offCount = 0;
    empKeys.forEach(id => {
      const off = isDayOff(id, cdk);
      const sched = weekSchedules[cdk]?.[id] || (cdk===dk ? daySchedule[id] : null);
      if(off){
        offCount++;
        html+='<div style="color:#E74C3C;font-size:.5rem;font-weight:600;">'+shortName(employees[id].name)+' 휴</div>';
      } else if(sched && sched.start){
        empCount++;
        const st = getShiftType(sched.start, sched.end);
        html+='<div style="color:'+st.color+';font-size:.5rem;font-weight:600;">'+shortName(employees[id].name)+' '+sched.start.replace(/^0/,'')+'-'+sched.end.replace(/^0/,'')+'</div>';
      }
    });
    if(empCount===0 && offCount===0){
      html+='<div style="color:#707088;font-size:.5rem;">미입력</div>';
    }
    html+='</div></div>';
  }
  html+='</div>';
  con.innerHTML = html;

  con.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', ()=>{
      const parts = cell.dataset.date.split('-');
      currentDate = new Date(+parts[0], +parts[1]-1, +parts[2]);
      onDateChange();
      document.querySelector('.layout-tab[data-tab="list"]').click();
    });
  });
}

// 출퇴근 source → 색상/라벨
const ATT_SRC_MAP = {
  owner:          {color:'#2ECC71', label:'사장'},
  staff:          {color:'#3498DB', label:'본인'},
  'staff+pair':   {color:'#4FC3F7', label:'동시출근'},
  'gemini+pair':  {color:'#4FC3F7', label:'AI+동시'},
  gemini:         {color:'#9090A8', label:'AI'},
  manual:         {color:'#E67E22', label:'수동'},
  fallback:       {color:'#E67E22', label:'자동'},
  'fallback+pair':{color:'#E67E22', label:'자동+동시'},
  bulk:           {color:'#9090A8', label:'일괄'}
};
function attSrcBadge(source){
  if(!source) return '';
  const m = ATT_SRC_MAP[source] || {color:'#707088', label:source};
  return '<span style="font-size:.5rem;color:'+m.color+';font-weight:600;padding:1px 3px;border:1px solid '+m.color+'44;border-radius:3px;">'+m.label+'</span>';
}
// 스케줄 시간 대비 실제 시간 차이(분) — ±3시간(180분) 초과 시 경고
function attTimeDiffWarning(schedTime, actualTime){
  if(!schedTime || !actualTime) return '';
  const sParts = schedTime.split(':'), aParts = actualTime.split(':');
  let sMin = parseInt(sParts[0])*60 + parseInt(sParts[1]||0);
  let aMin = parseInt(aParts[0])*60 + parseInt(aParts[1]||0);
  // 자정 넘김 보정
  if(sMin < DAY_START_HOUR*60) sMin += 24*60;
  if(aMin < DAY_START_HOUR*60) aMin += 24*60;
  const diff = Math.abs(aMin - sMin);
  if(diff > 180) return ' <span class="src-warning" style="font-size:.5rem;font-weight:700;">'+Math.round(diff)+'분차</span>';
  return '';
}
function buildAttendanceRow(empId, shift){
  const att = dayAttendance[empId];
  // daySchedule에서도 actual_ 데이터 확인 (workschedule 경로에 저장된 것)
  const sched = daySchedule[empId];
  const actualStart = (att && att.actual_start) || (sched && sched.actual_start) || null;
  const actualEnd = (att && att.actual_end) || (sched && sched.actual_end) || null;

  if(!actualStart && !actualEnd){
    return '<div style="padding:1px 0 0 42px;font-size:.55rem;color:#707088;">실제 <span class="src-warning" style="font-weight:600;">미기록</span></div>';
  }

  // 보정값 계산 함수
  function calcDiff(schedTime, actualTime){
    if(!schedTime || !actualTime) return null;
    const sp = schedTime.split(':'), ap = actualTime.split(':');
    let sMin = parseInt(sp[0])*60 + parseInt(sp[1]||0);
    let aMin = parseInt(ap[0])*60 + parseInt(ap[1]||0);
    let diff = aMin - sMin;
    if(diff > 720) diff -= 1440;
    else if(diff < -720) diff += 1440;
    return diff;
  }

  function diffBadge(diff){
    if(diff === null) return '';
    let color, text;
    if(diff < 0){ color = '#2ECC71'; text = diff+'분'; }
    else if(diff > 0){ color = '#E74C3C'; text = '+'+diff+'분'; }
    else { color = '#9090A8'; text = '정시'; }
    return ' <span style="color:'+color+';font-weight:700;">('+text+')</span>';
  }

  let html = '<div style="padding:1px 0 0 42px;font-size:.55rem;color:#9090A8;">';

  // 출근 보정값
  if(actualStart){
    const schedStart = shift ? shift.start : null;
    const startDiff = (sched && sched.diff_start !== undefined) ? sched.diff_start : calcDiff(schedStart, actualStart);
    html += '<span style="color:#2ECC71;">✓'+actualStart+'</span>'+diffBadge(startDiff);
  }

  // 퇴근 보정값
  if(actualEnd){
    const schedEnd = shift ? shift.end : null;
    const endDiff = (sched && sched.diff_end !== undefined) ? sched.diff_end : calcDiff(schedEnd, actualEnd);
    if(actualStart) html += ' ';
    html += '<span style="color:#3498DB;">→'+actualEnd+'</span>'+diffBadge(endDiff);
  }

  // source 배지
  if(att){
    const sSrc = att.actual_start_source || '';
    const eSrc = att.actual_end_source || '';
    const srcSet = new Set(); if(sSrc) srcSet.add(sSrc); if(eSrc) srcSet.add(eSrc);
    srcSet.forEach(s => { html += ' '+attSrcBadge(s); });
  }

  html += '</div>';
  return html;
}

// List view renderer — 보정 기반 리스트 (메인 뷰)
function renderListView(){
  const con = $('listContent');
  if(!con) return;
  const dk = dateKey(currentDate);
  const empKeys = Object.keys(employees);
  const m = currentDate.getMonth()+1, d = currentDate.getDate();
  const dow = DOW_KR[currentDate.getDay()];
  const confirmed = isConfirmed(dk);

  // 주간 휴무 누적일 계산 + 주간 총 근무시간 계산
  const weekOffCount = {};
  const weekTotalHoursMap = {};
  const mon = getMonday(currentDate);
  for(let i=0;i<7;i++){
    const wd = new Date(mon); wd.setDate(wd.getDate()+i);
    const wdk = dateKey(wd);
    const wSched = wdk===dk ? daySchedule : (weekSchedules[wdk] || lsLoadSchedule(wdk) || {});
    empKeys.forEach(id => {
      if(isDayOff(id,wdk)) weekOffCount[id] = (weekOffCount[id]||0)+1;
      const ws = wSched[id];
      if(ws && ws.start && ws.end){
        weekTotalHoursMap[id] = (weekTotalHoursMap[id]||0) + calcHours(ws.start, ws.end);
      }
    });
  }

  // 분류
  const working = [], offList = [], empty = [];
  let totalHours = 0, confirmedCount = 0, unconfirmedCount = 0;
  empKeys.forEach(id => {
    const emp = employees[id];
    const off = isDayOff(id, dk);
    const shift = daySchedule[id];
    if(off){ offList.push({id, emp}); return; }
    if(shift && shift.start){
      const st = getShiftStatus(dk, id);
      const fix = getFixedSchedule(emp.name);
      const isFixed = fix && fix.type==='fixed' && shift.start===fix.start && shift.end===fix.end;
      const hours = calcHours(shift.start, shift.end);
      totalHours += hours;
      if(st==='confirmed') confirmedCount++;
      else unconfirmedCount++; // auto + pending = 미확정
      working.push({id, emp, shift, status:st, isFixed, hours});
    } else {
      empty.push({id, emp});
    }
  });
  working.sort((a,b) => timeToMinutesFromDayStart(a.shift.start) - timeToMinutesFromDayStart(b.shift.start));

  // 전원확정 시 리스트 보드 통으로 초록 테두리
  const allCf = working.length > 0 && unconfirmedCount === 0;
  const boardBorder = allCf ? 'border:2px solid '+C_OK+';border-radius:12px;' : '';
  let html = '<div style="padding:6px 8px;'+boardBorder+'">';

  // === 헤더 (확정일은 초록 표시) ===
  const anyConfirmed = confirmed || allCf;
  const hdrBorder = anyConfirmed ? 'border-bottom:2px solid '+C_OK+';' : 'border-bottom:1px solid #2E2E52;';
  const hdrDateC = anyConfirmed ? C_OK : '#FFF';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;padding-bottom:5px;'+hdrBorder+'">';
  html += '<div>';
  html += '<span style="font-size:1rem;font-weight:800;color:'+hdrDateC+';">'+m+'/'+d+' '+dow+'</span>';
  if(anyConfirmed) html += ' <span style="font-size:.6rem;color:'+C_OK+';">확정</span>';
  html += '</div>';
  html += '<div style="display:flex;gap:4px;align-items:center;">';
  if(unconfirmedCount > 0){
    html += '<span data-action="confirmAll" style="font-size:.75rem;padding:5px 12px;border-radius:6px;background:'+C_OK+'44;color:'+C_OK+';cursor:pointer;font-weight:700;border:1px solid '+C_OK+'66;">전체확정</span>';
  } else if(working.length > 0){
    html += '<span style="font-size:.7rem;padding:4px 10px;border-radius:6px;background:'+C_OK+'22;color:'+C_OK+';font-weight:700;">확정됨</span>';
  }
  html += '</div></div>';

  // === 진행률 게이지 (초록+회색 2톤) ===
  const total = working.length + empty.length;
  const pctCf = total > 0 ? Math.round(confirmedCount/total*100) : 0;
  const pctRest = 100 - pctCf;

  html += '<div style="margin-bottom:6px;">';
  html += '<div style="display:flex;height:5px;border-radius:3px;overflow:hidden;background:'+C_BG+';">';
  if(pctCf > 0) html += '<div style="width:'+pctCf+'%;background:'+C_OK+';"></div>';
  if(pctRest > 0) html += '<div style="width:'+pctRest+'%;background:#2E2E52;"></div>';
  html += '</div>';
  html += '<div style="display:flex;gap:8px;margin-top:3px;font-size:.55rem;">';
  html += '<span style="color:'+C_OK+';font-weight:700;">확정 '+confirmedCount+'</span>';
  if(unconfirmedCount) html += '<span style="color:'+C_DEF+';font-weight:700;">미확정 '+unconfirmedCount+'</span>';
  if(empty.length) html += '<span style="color:#707088;">미입력 '+empty.length+'</span>';
  html += '<span style="color:#707088;margin-left:auto;">'+working.length+'명 '+totalHours.toFixed(1).replace('.0','')+'h</span>';
  if(offList.length) html += '<span style="color:'+C_OFF+';">휴'+offList.length+'</span>';
  html += '</div></div>';

  // === 충돌 요약 배너 (시간대별) ===
  const allConflicts = detectConflicts(empKeys, dk);
  const hourConflicts = {}; // hour → [{role, type, msg}]
  for(const key in allConflicts){
    if(key.startsWith('_hour_')){
      allConflicts[key].forEach(c => {
        if(!hourConflicts[c.hour]) hourConflicts[c.hour] = [];
        hourConflicts[c.hour].push(c);
      });
    } else {
      allConflicts[key].forEach(c => {
        if(!hourConflicts[c.hour]) hourConflicts[c.hour] = [];
        // 중복 방지
        if(!hourConflicts[c.hour].some(x => x.hour===c.hour && x.role===c.role && x.type===c.type))
          hourConflicts[c.hour].push(c);
      });
    }
  }
  const conflictHours = Object.keys(hourConflicts).map(Number).sort((a,b)=>a-b);
  if(conflictHours.length > 0){
    html += '<div style="margin-bottom:4px;padding:4px 8px;background:#E74C3C12;border:1px solid #E74C3C33;border-radius:6px;">';
    html += '<div style="font-size:.55rem;color:#E74C3C;font-weight:700;margin-bottom:2px;">인원 알림</div>';
    // 연속 시간 그룹핑
    const groups = [];
    conflictHours.forEach(h => {
      hourConflicts[h].forEach(c => {
        const last = groups[groups.length-1];
        if(last && last.role===c.role && last.type===c.type && last.hours[last.hours.length-1]===h-1){
          last.hours.push(h);
        } else {
          groups.push({role:c.role, type:c.type, hours:[h], msg:c.msg});
        }
      });
    });
    groups.forEach(g => {
      const rangeStr = g.hours.length===1 ? g.hours[0]+'시' : g.hours[0]+'~'+g.hours[g.hours.length-1]+'시';
      const typeLabel = g.type==='over' ? '초과' : '부족';
      const icon = g.type==='over' ? '▲' : '▼';
      const color = g.type==='over' ? '#E74C3C' : '#E67E22';
      html += '<div style="font-size:.55rem;color:'+color+';padding:1px 0;">'+icon+' '+rangeStr+' '+(ROLE_LABELS[g.role]||g.role)+' '+typeLabel+'</div>';
    });
    html += '</div>';
  }

  // === 근무자 리스트 (게이지 + 출퇴근 텍스트 + 상태 버튼) ===
  const _g = calcGaugeRange(working);
  const GAUGE_START = _g.gaugeStart;
  const GAUGE_RANGE = _g.gaugeHours;
  const GAUGE_END = GAUGE_START + GAUGE_RANGE;

  working.forEach(w => {
    const roles = w.shift.role ? w.shift.role.split(',').filter(Boolean) : [];

    // 게이지 위치 계산 (DAY_START_HOUR 기준)
    let sH = parseInt(w.shift.start.split(':')[0]), sM = parseInt(w.shift.start.split(':')[1]||0);
    let eH = parseInt(w.shift.end.split(':')[0]), eM = parseInt(w.shift.end.split(':')[1]||0);
    if(sH < DAY_START_HOUR) sH += 24;
    if(eH < DAY_START_HOUR) eH += 24;
    if(eH <= sH) eH += 24; // 자정 넘김 보정
    const startPct = Math.max(0, ((sH + sM/60) - GAUGE_START) / GAUGE_RANGE * 100);
    const endPct = Math.min(100, ((eH + eM/60) - GAUGE_START) / GAUGE_RANGE * 100);
    const widthPct = Math.max(1, endPct - startPct);

    // 상태 색상: confirmed만 확정, 나머지(auto+pending)는 미확정
    const isConfirmed = w.status==='confirmed';
    const stColor = isConfirmed ? C_OK : C_DEF;
    const stBg = isConfirmed ? C_OK+'10' : C_DEF+'08';

    const barC = stColor;
    const timeLabel = w.shift.start.replace(/^0/,'')+'-'+w.shift.end.replace(/^0/,'');

    const _listBorderC = ROLE_COLORS[roles[0]||'주방'] || stColor;
    html += '<div style="margin-bottom:2px;padding:4px 6px;background:'+stBg+';border-left:3px solid '+_listBorderC+';border-radius:6px;cursor:pointer;" data-empid="'+w.id+'">';
    // Row 1: 이름 + 게이지 + 상태버튼
    html += '<div style="display:flex;align-items:center;gap:4px;">';
    // 이름 + 주간휴무 + 주간근무시간
    const wOff = weekOffCount[w.id]||0;
    const wHrs = weekTotalHoursMap[w.id]||0;
    const wHrsColor = wHrs > 40 ? '#E74C3C' : '#9090A8';
    const wHrsLabel = wHrs > 0 ? '<span style="font-size:.5rem;color:'+wHrsColor+';font-weight:600;">[주'+Math.round(wHrs)+'h]</span>' : '';
    const _listPrimRole = roles[0] || '주방';
    const _listRoleC = ROLE_COLORS[_listPrimRole] || '#E0E0EC';
    html += '<span style="font-size:.8rem;font-weight:800;color:'+_listRoleC+';min-width:38px;">'+w.emp.name+(wOff?'<span style="font-size:.55rem;color:'+C_OFF+';font-weight:600;">('+wOff+')</span>':'')+wHrsLabel+'</span>';
    // 게이지 (시간 내장)
    html += '<div style="position:relative;flex:1;height:18px;background:#1A1A30;border-radius:3px;overflow:hidden;">';
    html += '<div style="position:absolute;left:'+startPct+'%;width:'+widthPct+'%;top:1px;bottom:1px;background:'+barC+'40;border-radius:2px;border-left:2px solid '+barC+';"></div>';
    html += '<span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:.55rem;color:#E0E0EC;font-weight:600;white-space:nowrap;text-shadow:0 0 3px #000;">'+timeLabel+' ('+w.hours+'h)</span>';
    html += '</div>';
    // 상태 버튼
    if(isConfirmed){
      html += '<span data-action="status" data-sid="'+w.id+'" data-st="auto" style="font-size:.55rem;padding:2px 5px;border-radius:3px;cursor:pointer;background:'+C_OK+';color:#fff;font-weight:700;">확</span>';
    } else {
      html += '<span data-action="status" data-sid="'+w.id+'" data-st="confirmed" style="font-size:.55rem;padding:2px 5px;border-radius:3px;cursor:pointer;background:#333;color:'+C_DEF+';font-weight:700;">미</span>';
    }
    html += '</div>';
    // Row 2: 실제 출퇴근 시간
    html += buildAttendanceRow(w.id, w.shift);
    html += '</div>';
  });

  // === 미입력 직원 ===
  if(empty.length > 0){
    html += '<div style="margin-top:4px;padding-top:4px;border-top:1px solid #2E2E5240;">';
    html += '<div style="font-size:.6rem;color:'+C_DEF+';font-weight:700;margin-bottom:3px;padding-left:4px;border-left:2px solid '+C_DEF+';">미입력 ('+empty.length+'명)</div>';
    empty.forEach(e => {
      const pattern = getPatternSuggestion(e.id, dk);
      html += '<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;margin-bottom:2px;background:#1A1A30;border-radius:6px;border-left:3px solid #707088;cursor:pointer;" data-empid="'+e.id+'">';
      html += '<span style="font-size:.85rem;font-weight:800;color:#707088;min-width:44px;">'+e.emp.name+'</span>';
      if(pattern){
        html += '<span style="font-size:.65rem;color:'+C_OK+';">AI '+pattern.start+'~'+pattern.end+'</span>';
        html += '<span data-action="applyPattern" data-pid="'+e.id+'" style="font-size:.55rem;padding:2px 6px;border-radius:3px;background:'+C_OK+'33;color:'+C_OK+';cursor:pointer;font-weight:700;">확정</span>';
      } else {
        html += '<span style="font-size:.7rem;color:#707088;">미입력</span>';
      }
      html += '<span style="margin-left:auto;display:flex;gap:3px;">';
      html += '<span data-action="confirmOff" data-oid="'+e.id+'" style="font-size:.55rem;padding:2px 6px;border-radius:3px;background:#E74C3C33;color:#E74C3C;cursor:pointer;font-weight:700;">휴확</span>';
      html += '</span>';
      html += '</div>';
    });
    html += '</div>';
  }

  // === 휴무 ===
  if(offList.length > 0){
    html += '<div style="margin-top:4px;padding-top:4px;border-top:1px solid #2E2E5240;">';
    html += '<div style="font-size:.6rem;color:#E74C3C;font-weight:700;margin-bottom:3px;padding-left:4px;border-left:2px solid #E74C3C;">휴무 ('+offList.length+'명)</div>';
    offList.forEach(o => {
      html += '<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;margin-bottom:2px;background:#E74C3C08;border-radius:6px;border-left:3px solid #E74C3C;cursor:pointer;" data-empid="'+o.id+'">';
      const oOff = weekOffCount[o.id]||0;
      const oHrs = weekTotalHoursMap[o.id]||0;
      const oHrsColor = oHrs > 40 ? '#E74C3C' : '#9090A8';
      const oHrsLabel = oHrs > 0 ? '<span style="font-size:.5rem;color:'+oHrsColor+';font-weight:600;">[주'+Math.round(oHrs)+'h]</span>' : '';
      html += '<span style="font-size:.8rem;font-weight:800;color:#E74C3C;">'+o.emp.name+(oOff?'<span style="font-size:.55rem;color:'+C_OFF+';font-weight:600;">('+oOff+')</span>':'')+oHrsLabel+'</span>';
      html += '<span style="font-size:.65rem;color:#E74C3C;">휴무</span>';
      html += '<span data-action="toggleOff" data-oid="'+o.id+'" style="margin-left:auto;font-size:.55rem;padding:2px 6px;border-radius:3px;background:#333;color:#9090A8;cursor:pointer;font-weight:700;">해제</span>';
      html += '</div>';
    });
    html += '</div>';
  }

  html += '</div>';
  con.innerHTML = html;

  // === 이벤트 위임 (data-action) ===
  con.addEventListener('click', function(e){
    const tgt = e.target.closest('[data-action]');
    if(tgt){
      e.stopPropagation();
      const action = tgt.dataset.action;
      if(action==='confirmAll') confirmAllShifts();
      else if(action==='status') setShiftStatus(dk, tgt.dataset.sid, tgt.dataset.st);
      else if(action==='applyPattern') applyPatternSuggestion(tgt.dataset.pid, dk);
      else if(action==='confirmOff') confirmDayOff(tgt.dataset.oid);
      else if(action==='toggleOff') toggleDayOffFromList(tgt.dataset.oid);
      return;
    }
    const row = e.target.closest('[data-empid]');
    if(row) openShiftModal(row.dataset.empid);
  });
}

// 당일 휴무 토글 (리스트에서 직접)
function toggleDayOffFromList(empId){
  const dk = dateKey(currentDate);
  if(!dayoffs[empId]) dayoffs[empId] = {};
  if(dayoffs[empId][dk] === true){
    // 휴무 해제 (false = 수동해제, 자동생성 방지)
    dayoffs[empId][dk] = false;
    if(daySchedule[empId] && daySchedule[empId].dayoff) delete daySchedule[empId];
    const empName = employees[empId]?.name || '';
    const fix = getFixedScheduleForDate(empName, currentDate);
    if(fix && fix.type==='fixed' && fix.start){
      daySchedule[empId] = {start:fix.start, end:fix.end, role:fix.role};
      fbPut(FB_SCHEDULES+'/'+dk+'/'+empId, daySchedule[empId]);
      setShiftStatus(dk, empId, 'confirmed');
    }
    lsSaveSchedule(dk, daySchedule);
    showToast('휴무 해제 + 확정');
  } else {
    // 휴무 지정
    dayoffs[empId][dk] = true;
    if(daySchedule[empId]){
      delete daySchedule[empId];
      lsSaveSchedule(dk, daySchedule);
      fbDelete(FB_SCHEDULES+'/'+dk+'/'+empId);
    }
    showToast('휴무 지정');
  }
  lsSaveDayoffs();
  const dval = dayoffs[empId]?.[dk];
  fbPut(FB_DAYOFFS+'/'+empId+'/'+dk, dval === undefined ? null : dval);
  renderAll();
}

// 전체 확정
function confirmAllShifts(){
  const dk = dateKey(currentDate);
  const fbBatch = {};
  const fbDayoffBatch = {};
  Object.keys(employees).forEach(id => {
    if(daySchedule[id] && daySchedule[id].start && !isDayOff(id, dk)){
      // 근무자 확정
      shiftStatus[dk+'_'+id] = 'confirmed';
      recordPattern(id, dk, daySchedule[id]);
      fbBatch[id] = 'confirmed';
    } else if(!daySchedule[id] || !daySchedule[id].start){
      // 미입력자 → 휴무 확정 (휴확)
      if(!isDayOff(id, dk)){
        if(!dayoffs[id]) dayoffs[id] = {};
        dayoffs[id][dk] = true;
        fbDayoffBatch[id+'/'+dk] = true;
      }
    }
  });
  lsSaveShiftStatus();
  if(Object.keys(fbDayoffBatch).length > 0){
    lsSaveDayoffs();
    Object.entries(fbDayoffBatch).forEach(([path, val]) => {
      fbPut(FB_DAYOFFS+'/'+path, val);
    });
  }
  // Firebase 일괄 동기화
  fbPut(FB_WS+'/shift_status/'+dk, fbBatch);
  // 전원 확정 시 날짜도 확정 처리
  confirmedDays[dk] = true;
  lsSaveConfirmed(confirmedDays);
  fbPut(FB_WS+'/confirmed/'+dk, true);
  renderAll();
}
// 전체 보정(리셋)
function resetAllShifts(){
  const dk = dateKey(currentDate);
  Object.keys(employees).forEach(id => {
    delete shiftStatus[dk+'_'+id];
  });
  lsSaveShiftStatus();
  // Firebase 리셋
  fbPut(FB_WS+'/shift_status/'+dk, null);
  renderAll();
}
// AI 패턴 추천 적용 (적용+확정)
function applyPatternSuggestion(empId, dk){
  const pattern = getPatternSuggestion(empId, dk);
  if(!pattern) return;
  const data = {start:pattern.start, end:pattern.end, role:pattern.role||''};
  daySchedule[empId] = data;
  lsSaveSchedule(dk, daySchedule);
  fbPut(FB_SCHEDULES+'/'+dk+'/'+empId, data);
  setShiftStatus(dk, empId, 'confirmed');
  showToast('AI 추천 적용+확정');
  renderAll();
}
// 휴무 확정 (미입력→휴무 원터치)
function confirmDayOff(empId){
  const dk = dateKey(currentDate);
  if(!dayoffs[empId]) dayoffs[empId] = {};
  dayoffs[empId][dk] = true;
  if(daySchedule[empId]){
    delete daySchedule[empId];
    lsSaveSchedule(dk, daySchedule);
    fbDelete(FB_SCHEDULES+'/'+dk+'/'+empId);
  }
  lsSaveDayoffs();
  fbPut(FB_DAYOFFS+'/'+empId+'/'+dk, true);
  showToast('휴무 확정');
  renderAll();
}

// ============================================================
// 타임바 뷰 — 미니 간트 (직원별 수평 시간 바)
// ============================================================
function renderTimebarView(){
  const con = $('timebarContent');
  if(!con) return;
  const dk = dateKey(currentDate);
  const empKeys = Object.keys(employees);
  const staffing = calcStaffing(empKeys, dk);
  const allConflicts = detectConflicts(empKeys, dk);
  const confirmed = isConfirmed(dk);

  // 주간 휴무 누적
  const weekOffCount = {};
  const mon = getMonday(currentDate);
  for(let i=0;i<7;i++){
    const wd = new Date(mon); wd.setDate(wd.getDate()+i);
    const wdk = dateKey(wd);
    empKeys.forEach(id => { if(isDayOff(id,wdk)) weekOffCount[id] = (weekOffCount[id]||0)+1; });
  }

  // 분류
  const working = [], offList = [], empty = [];
  let totalHours = 0, confirmedCount = 0, unconfirmedCount = 0;
  empKeys.forEach(id => {
    const emp = employees[id];
    const off = isDayOff(id, dk);
    const shift = daySchedule[id];
    if(off){ offList.push({id, emp}); return; }
    if(shift && shift.start){
      const st = getShiftStatus(dk, id);
      const hours = calcHours(shift.start, shift.end);
      totalHours += hours;
      if(st==='confirmed') confirmedCount++; else unconfirmedCount++;
      working.push({id, emp, shift, status:st, hours});
    } else {
      empty.push({id, emp});
    }
  });
  working.sort((a,b) => timeToMinutesFromDayStart(a.shift.start) - timeToMinutesFromDayStart(b.shift.start));

  // 시간축: 근무자 기준 유동 범위
  const _mg = calcGaugeRange(working);
  const barStart = _mg.gaugeStart, barHours = _mg.gaugeHours;
  function timeToPct(timeStr){
    let [h,m] = timeStr.split(':').map(Number);
    if(h < DAY_START_HOUR) h += 24;
    return Math.max(0, Math.min(100, ((h - barStart) + m/60) / barHours * 100));
  }

  const nowH = new Date().getHours(), nowM = new Date().getMinutes();
  const nowPct = timeToPct(pad(nowH)+':'+pad(nowM));
  const isToday = dateKey(new Date()) === dk;

  let html = '<div style="padding:5px 6px 0;">';

  // === 진행률 게이지 ===
  const total = working.length + empty.length;
  const pctCf = total > 0 ? Math.round(confirmedCount/total*100) : 0;
  html += '<div style="margin-bottom:6px;">';
  html += '<div style="display:flex;height:5px;border-radius:3px;overflow:hidden;background:'+C_BG+';">';
  if(pctCf > 0) html += '<div style="width:'+pctCf+'%;background:'+C_OK+';"></div>';
  html += '<div style="flex:1;background:#2E2E52;"></div>';
  html += '</div>';
  html += '<div style="display:flex;gap:8px;margin-top:3px;font-size:.65rem;">';
  html += '<span style="color:'+C_OK+';font-weight:700;">확정'+confirmedCount+'</span>';
  if(unconfirmedCount) html += '<span style="color:'+C_DEF+';font-weight:700;">미확정'+unconfirmedCount+'</span>';
  if(empty.length) html += '<span style="color:#707088;">미입력'+empty.length+'</span>';
  html += '<span style="color:#707088;margin-left:auto;">'+working.length+'명 '+totalHours.toFixed(1).replace('.0','')+'h</span>';
  if(offList.length) html += '<span style="color:'+C_OFF+';">휴'+offList.length+'</span>';
  if(unconfirmedCount > 0) html += '<span data-action="confirmAll" style="color:'+C_OK+';cursor:pointer;font-weight:700;margin-left:4px;font-size:.7rem;padding:2px 8px;background:'+C_OK+'33;border-radius:4px;">전체확정</span>';
  else if(working.length > 0) html += '<span style="color:'+C_OK+';font-weight:700;margin-left:4px;font-size:.65rem;">확정됨</span>';
  html += '</div></div>';

  // === 시간 헤더 ===
  html += '<div style="display:flex;align-items:center;margin-bottom:2px;">';
  html += '<div style="min-width:58px;"></div>';
  html += '<div style="flex:1;position:relative;height:16px;display:flex;">';
  const _labelStep = barHours <= 8 ? 1 : barHours <= 14 ? 2 : 3;
  for(let h=barStart;h<=barStart+barHours;h+=_labelStep){
    const rh = h>=24?h-24:h;
    const pct = (h-barStart)/barHours*100;
    html += '<span style="position:absolute;left:'+pct+'%;font-size:.55rem;color:#707088;transform:translateX(-50%);">'+rh+'</span>';
  }
  html += '</div><div style="min-width:36px;"></div></div>';

  // === 충돌 요약 배너 ===
  const _tbHourConf = {};
  for(const key in allConflicts){
    allConflicts[key].forEach(c => {
      if(!_tbHourConf[c.hour]) _tbHourConf[c.hour] = [];
      if(!_tbHourConf[c.hour].some(x => x.role===c.role && x.type===c.type))
        _tbHourConf[c.hour].push(c);
    });
  }
  const _tbConfHours = Object.keys(_tbHourConf).map(Number).sort((a,b)=>a-b);
  if(_tbConfHours.length > 0){
    html += '<div style="margin-bottom:4px;padding:4px 8px;background:#E74C3C12;border:1px solid #E74C3C33;border-radius:6px;">';
    html += '<div style="font-size:.55rem;color:#E74C3C;font-weight:700;margin-bottom:2px;">인원 알림</div>';
    const _tbGroups = [];
    _tbConfHours.forEach(h => {
      _tbHourConf[h].forEach(c => {
        const last = _tbGroups[_tbGroups.length-1];
        if(last && last.role===c.role && last.type===c.type && last.hours[last.hours.length-1]===h-1){
          last.hours.push(h);
        } else {
          _tbGroups.push({role:c.role, type:c.type, hours:[h]});
        }
      });
    });
    _tbGroups.forEach(g => {
      const rangeStr = g.hours.length===1 ? g.hours[0]+'시' : g.hours[0]+'~'+g.hours[g.hours.length-1]+'시';
      const typeLabel = g.type==='over' ? '초과' : '부족';
      const icon = g.type==='over' ? '▲' : '▼';
      const color = g.type==='over' ? '#E74C3C' : '#E67E22';
      html += '<div style="font-size:.55rem;color:'+color+';padding:1px 0;">'+icon+' '+rangeStr+' '+(ROLE_LABELS[g.role]||g.role)+' '+typeLabel+'</div>';
    });
    html += '</div>';
  }

  // === 근무자 타임바 ===
  working.forEach(w => {
    const roles = w.shift.role ? w.shift.role.split(',').filter(Boolean) : [];
    const primaryRole = roles[0] || '주방';
    const roleColor = ROLE_COLORS[primaryRole] || '#9090A8';
    const isCf = w.status==='confirmed';
    const wOff = weekOffCount[w.id]||0;
    const att = dayAttendance[w.id];
    const hasActual = att && att.actual_start;

    const left = timeToPct(w.shift.start);
    let right = timeToPct(w.shift.end);
    let width = right - left;
    if(width <= 0) width += 100;
    width = Math.min(width, 100 - left);

    // 실제 데이터 있으면 예정 바는 항상 dashed, 없으면 기존 로직
    const barBg = hasActual ? roleColor+'18' : (isCf ? roleColor+'40' : roleColor+'18');
    const borderL = hasActual ? roleColor+'55' : (isCf ? roleColor : roleColor+'88');
    const rowOpacity = isCf ? '1' : '.6';

    html += '<div data-empid="'+w.id+'" style="opacity:'+rowOpacity+';">';
    html += '<div style="display:flex;align-items:center;padding:2px 6px;cursor:pointer;">';
    // 이름 + 주간휴무
    const nameColor = isCf ? roleColor : roleColor+'bb';
    html += '<div style="min-width:58px;font-size:.85rem;font-weight:700;color:'+nameColor+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">';
    html += w.emp.name;
    if(wOff) html += '<span style="font-size:.6rem;color:'+C_OFF+';">('+wOff+')</span>';
    html += '</div>';
    // 바 영역
    html += '<div style="flex:1;position:relative;height:32px;background:#1A1A30;border-radius:4px;overflow:hidden;">';
    if(isToday) html += '<div style="position:absolute;left:'+nowPct+'%;top:0;bottom:0;width:1px;background:#FFD70066;z-index:3;"></div>';
    const isNarrow = width < 30;
    // 예정 바 (Layer 1) — 실제 데이터 있으면 항상 dashed
    const schedBarBorder = hasActual ? 'border:1.5px dashed '+roleColor+'55;' : (isCf ? '' : 'border:1px dashed '+roleColor+'66;');
    html += '<div style="position:absolute;left:'+left+'%;width:'+width+'%;top:1px;bottom:1px;background:'+barBg+';border-left:3px solid '+borderL+';border-radius:3px;'+schedBarBorder+'z-index:1;"></div>';
    // 실제 바 (Layer 2) — dayAttendance 있을 때만
    if(hasActual) {
      const actStartPct = timeToPct(att.actual_start);
      const actEndPct = att.actual_end ? timeToPct(att.actual_end) : actStartPct;
      const actWidthPct = Math.max(actEndPct - actStartPct, 1);
      const srcColor = attSrcColor(att.actual_start_source || att.actual_end_source || '');
      html += '<div style="position:absolute;left:'+actStartPct+'%;width:'+actWidthPct+'%;top:5px;bottom:5px;background:'+srcColor+'40;border-left:3px solid '+srcColor+';border-radius:2px;z-index:2;"></div>';
      // 오차 배지
      const schedMin = parseTimeMin(w.shift.start);
      const actMin = parseTimeMin(att.actual_start);
      if (schedMin !== null && actMin !== null) {
        let diff = actMin - schedMin;
        if (diff > 720) diff -= 1440;
        if (diff < -720) diff += 1440;
        const absDiff = Math.abs(diff);
        if (absDiff >= 10) {
          const label = diff > 0 ? absDiff + '분늦음' : absDiff + '분일찍';
          const badgeColor = absDiff >= 180 ? '#FF4444' : absDiff >= 60 ? '#E67E22' : '#888';
          html += '<span style="position:absolute;right:2px;top:50%;transform:translateY(-50%);font-size:.45rem;color:'+badgeColor+';font-weight:700;z-index:3;">'+label+'</span>';
        }
      }
    }
    // 텍스트: 바 좁으면 바 오른쪽에 표시, 넓으면 바 안에 표시
    const txtLeft = isNarrow ? (left+width+1) : left;
    const txtW = isNarrow ? (100-left-width-1) : width;
    html += '<div style="position:absolute;left:'+txtLeft+'%;width:'+txtW+'%;top:1px;bottom:1px;display:flex;align-items:center;padding:0 4px;gap:3px;overflow:hidden;">';
    const sShort = w.shift.start.split(':')[0].replace(/^0/,''), eShort = w.shift.end.split(':')[0].replace(/^0/,'');
    const timeStr = isNarrow ? sShort+'-'+eShort : w.shift.start.replace(/^0/,'')+'-'+w.shift.end.replace(/^0/,'');
    html += '<span style="font-size:.65rem;color:#E0E0EC;font-weight:600;white-space:nowrap;">'+timeStr+'</span>';
    if(!isNarrow && roles.length) html += '<span style="font-size:.55rem;white-space:nowrap;">'+roles.map(r=>'<span style="color:'+(ROLE_COLORS[r]||'#fff')+';">'+(ROLE_LABELS[r]||r)+'</span>').join(' ')+'</span>';
    html += '<span style="font-size:.55rem;color:#9090A8;">('+w.hours+'h)</span>';
    html += '</div>';
    html += '</div>';
    // 상태 버튼
    if(isCf){
      html += '<span data-action="status" data-sid="'+w.id+'" data-st="auto" style="min-width:32px;text-align:center;font-size:.65rem;padding:4px 6px;border-radius:5px;cursor:pointer;background:'+C_OK+';color:#fff;font-weight:700;margin-left:3px;">확</span>';
    } else {
      html += '<span data-action="status" data-sid="'+w.id+'" data-st="confirmed" style="min-width:32px;text-align:center;font-size:.65rem;padding:4px 6px;border-radius:5px;cursor:pointer;background:'+C_DEF+'33;color:'+C_DEF+';font-weight:700;margin-left:3px;border:1px solid '+C_DEF+';">미</span>';
    }
    html += '</div>';
    // Row 2: 실제 출퇴근 시간 (timebar)
    html += buildAttendanceRow(w.id, w.shift);
    html += '</div>';
  });

  // === 미입력 직원 ===
  if(empty.length > 0){
    html += '<div style="margin-top:5px;padding-top:5px;border-top:1px solid #2E2E5240;">';
    empty.forEach(e => {
      const pattern = getPatternSuggestion(e.id, dk);
      html += '<div data-empid="'+e.id+'" style="display:flex;align-items:center;gap:4px;padding:2px 6px;cursor:pointer;">';
      html += '<div style="min-width:58px;font-size:.85rem;font-weight:700;color:#707088;">'+e.emp.name+'</div>';
      html += '<div style="flex:1;position:relative;height:32px;background:#1A1A30;border-radius:4px;overflow:hidden;">';
      if(isToday) html += '<div style="position:absolute;left:'+nowPct+'%;top:0;bottom:0;width:1px;background:#FFD70066;z-index:2;"></div>';
      if(pattern){
        const pL = timeToPct(pattern.start), pR = timeToPct(pattern.end);
        let pW = pR - pL; if(pW<=0) pW+=100; pW = Math.min(pW, 100-pL);
        html += '<div style="position:absolute;left:'+pL+'%;width:'+pW+'%;top:1px;bottom:1px;background:#2ECC7120;border:1px dashed #2ECC7160;border-radius:3px;display:flex;align-items:center;padding:0 5px;">';
        html += '<span style="font-size:.6rem;color:'+C_OK+';font-weight:600;">AI '+pattern.start.replace(/^0/,'')+'-'+pattern.end.replace(/^0/,'')+'</span>';
        html += '</div>';
      } else {
        html += '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.65rem;color:#707088;">미입력</div>';
      }
      html += '</div>';
      if(pattern) html += '<span data-action="applyPattern" data-pid="'+e.id+'" style="font-size:.65rem;padding:4px 7px;border-radius:5px;background:'+C_OK+'33;color:'+C_OK+';cursor:pointer;font-weight:700;">확정</span>';
      html += '<span data-action="confirmOff" data-oid="'+e.id+'" style="font-size:.65rem;padding:4px 7px;border-radius:5px;background:#E74C3C33;color:#E74C3C;cursor:pointer;font-weight:700;">휴확</span>';
      html += '</div>';
    });
    html += '</div>';
  }

  // === 휴무 직원 ===
  if(offList.length > 0){
    html += '<div style="margin-top:5px;padding-top:5px;border-top:1px solid #2E2E5240;">';
    offList.forEach(o => {
      const oOff = weekOffCount[o.id]||0;
      html += '<div data-empid="'+o.id+'" style="display:flex;align-items:center;gap:4px;padding:2px 6px;opacity:.4;cursor:pointer;">';
      html += '<div style="min-width:58px;font-size:.85rem;font-weight:700;color:#E74C3C;">'+o.emp.name;
      if(oOff) html += '<span style="font-size:.6rem;">('+oOff+')</span>';
      html += '</div>';
      html += '<div style="flex:1;position:relative;height:32px;background:#1A1A30;border-radius:4px;overflow:hidden;">';
      html += '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.65rem;color:#E74C3C;font-weight:600;">휴무</div>';
      html += '</div>';
      html += '<span data-action="toggleOff" data-oid="'+o.id+'" style="font-size:.65rem;padding:4px 7px;border-radius:5px;background:#333;color:#9090A8;cursor:pointer;font-weight:700;">해제</span>';
      html += '</div>';
    });
    html += '</div>';
  }

  // === 합계 인원 행 (터치→구간설정, 공백축소) ===
  const _tbGapSet = new Set();
  GAUGE_HOURS.forEach(h => { const s = staffing[pad(h)+':00']; if(!s || s.total===0) _tbGapSet.add(h); });
  const _tbSegs = [];
  GAUGE_HOURS.forEach(h => {
    const isGap = _tbGapSet.has(h);
    const last = _tbSegs[_tbSegs.length-1];
    if(last && last.type===(isGap?'gap':'work')) last.hours.push(h);
    else _tbSegs.push({type:isGap?'gap':'work', hours:[h]});
  });
  html += '<div style="display:flex;align-items:center;padding:3px 6px;margin-top:4px;border-top:1px solid #2E2E52;">';
  html += '<div style="min-width:58px;font-size:.55rem;color:#9090A8;">인원</div>';
  html += '<div style="flex:1;position:relative;height:22px;display:flex;gap:1px;">';
  _tbSegs.forEach(seg => {
    if(seg.type==='gap'){
      html += '<div style="flex:0.3;background:#0D0D1A;display:flex;align-items:center;justify-content:center;font-size:.4rem;color:#404058;font-style:italic;border-radius:1px;">공백</div>';
    } else {
      seg.hours.forEach(h => {
        const hStr = pad(h)+':00';
        const s = staffing[hStr];
        const t = s ? s.total : 0;
        const anyConflict = s && (s.kitchenOver || s.kitchenUnder || s.carOver || s.bikeOver || s.deliveryUnder);
        html += '<div data-action="gaugeEdit" data-hour="'+h+'" style="flex:1;background:'+(anyConflict?C_OFF+'22':t>0?'#3498DB15':'#1A1A30')+';display:flex;align-items:center;justify-content:center;font-size:.55rem;color:'+(anyConflict?C_OFF:t>0?'#3498DB':'#707088')+';font-weight:700;border-radius:1px;cursor:pointer;">';
        html += t > 0 ? t : '';
        html += '</div>';
      });
    }
  });
  html += '</div><div style="min-width:36px;"></div></div>';

  html += '</div>';
  con.innerHTML = html;

  // === 이벤트 위임 ===
  con.addEventListener('click', function(e){
    const tgt = e.target.closest('[data-action]');
    if(tgt){
      e.stopPropagation();
      const action = tgt.dataset.action;
      if(action==='confirmAll') confirmAllShifts();
      else if(action==='status') setShiftStatus(dk, tgt.dataset.sid, tgt.dataset.st);
      else if(action==='applyPattern') applyPatternSuggestion(tgt.dataset.pid, dk);
      else if(action==='toggleOff') toggleDayOffFromList(tgt.dataset.oid);
      else if(action==='confirmOff') confirmDayOff(tgt.dataset.oid);
      else if(action==='gaugeEdit') openHourLimitEdit(parseInt(tgt.dataset.hour));
      return;
    }
    const row = e.target.closest('[data-empid]');
    if(row) openShiftModal(row.dataset.empid);
  });
}

// ============================================================
// ============================================================
// (Legacy) Horizontal view renderer — 삭제됨, 호환용 빈 함수
// ============================================================
function renderHorizontalView(){
  const con = $('horizontalContent');
  if(!con) return;
  const dk = dateKey(currentDate);
  const empKeys = Object.keys(employees);

  // 역할별 그룹화
  const groups = {'주방':[], '차배달':[], '오토바이':[], '미지정':[]};
  const offList = [];
  empKeys.forEach(id => {
    const emp = employees[id];
    const off = isDayOff(id, dk);
    const shift = daySchedule[id];
    if(off){ offList.push({id, emp}); return; }
    const roles = shift && shift.role ? shift.role.split(',').filter(Boolean) : [];
    let placed = false;
    // 주 역할 기준으로 분류 (첫번째 역할)
    if(roles.includes('차배달')){ groups['차배달'].push({id, emp, shift}); placed = true; }
    else if(roles.includes('오토바이')){ groups['오토바이'].push({id, emp, shift}); placed = true; }
    if(roles.includes('주방') || !placed){ groups['주방'].push({id, emp, shift}); if(!placed) placed = true; }
    if(!placed) groups['미지정'].push({id, emp, shift});
  });

  let html = '';
  // hour labels row
  html += '<div class="ht-row" style="border-bottom:2px solid #2E2E52;">';
  html += '<div class="ht-name" style="font-size:.6rem;color:#707088;">이름</div>';
  html += '<div class="ht-bar" style="background:transparent;display:flex;align-items:center;">';
  for(let h=6;h<=27;h++){
    const rh = h>=24?h-24:h;
    if(h%2===0) html+='<span style="flex:1;font-size:.55rem;color:#707088;text-align:center;">'+pad(rh)+'</span>';
    else html+='<span style="flex:1;"></span>';
  }
  html += '</div></div>';

  // 역할별 섹션 렌더
  const roleEntries = [
    {key:'주방', label:'주방', color:'#E67E22'},
    {key:'차배달', label:'차배달', color:'#4ECDC4'},
    {key:'오토바이', label:'바이크', color:'#FFD700'},
  ];

  roleEntries.forEach(role => {
    const members = groups[role.key];
    if(members.length === 0) return;
    // 역할 헤더
    html += '<div style="display:flex;align-items:center;gap:6px;padding:2px 8px;background:#242444;border-left:3px solid '+role.color+';">';
    html += '<span style="font-size:.6rem;font-weight:700;color:'+role.color+';">'+role.label+'</span>';
    html += '<span style="font-size:.5rem;color:#9090A8;">'+members.length+'명</span>';
    html += '</div>';

    members.forEach(m => {
      const shift = m.shift;
      const hasConflict = shift && shift.start ? !!detectConflicts(empKeys, dk)[m.id] : false;
      html += '<div class="ht-row" data-empid="'+m.id+'">';
      const htSt = m.shift && m.shift.start ? getShiftType(m.shift.start, m.shift.end) : SHIFT_TYPES['미입력'];
      html += '<div class="ht-name" style="color:'+htSt.color+';">'+m.emp.name+'</div>';
      html += '<div class="ht-bar">';
      html += '<div class="ht-hours">';
      for(let h=6;h<=27;h++) html+='<span></span>';
      html += '</div>';
      if(shift && shift.start && shift.end){
        const left = timeToPercent(shift.start);
        const right = timeToPercent(shift.end);
        let width = right - left;
        if(width<=0) width+=100;
        const roles = shift.role ? shift.role.split(',').filter(Boolean) : [];
        const roleHtml = roles.map(r => '<span style="color:'+(ROLE_COLORS[r]||'#fff')+';">'+(ROLE_LABELS[r]||r)+'</span>').join(' ');
        const stBar = getShiftType(shift.start, shift.end);
        const barBg = hasConflict ? '#E74C3C66' : stBar.color+'44';
        const barBorder = hasConflict ? 'border:1px solid #E74C3C;' : '';
        html += '<div class="ht-fill" style="left:'+left+'%;width:'+Math.min(width,100-left)+'%;background:'+barBg+';'+barBorder+'">';
        html += '<span style="font-size:.55rem;">'+shift.start.replace(/^0/,'')+'-'+shift.end.replace(/^0/,'')+'</span>';
        html += ' <span style="font-size:.5rem;">'+roleHtml+'</span>';
        html += '</div>';
      } else {
        html += '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#707088;font-size:.6rem;">미입력</div>';
      }
      html += '</div></div>';
    });
  });

  // 휴무자 섹션
  if(offList.length > 0){
    html += '<div style="display:flex;align-items:center;gap:6px;padding:2px 8px;background:#242444;border-left:3px solid #E74C3C;">';
    html += '<span style="font-size:.6rem;font-weight:700;color:#E74C3C;">휴무</span>';
    html += '<span style="font-size:.5rem;color:#9090A8;">'+offList.length+'명</span>';
    html += '</div>';
    offList.forEach(o => {
      html += '<div class="ht-row" style="opacity:.4;">';
      html += '<div class="ht-name" style="color:'+(o.emp.color||'#FFFFFF')+';">'+o.emp.name+'</div>';
      html += '<div class="ht-bar">';
      html += '<div class="ht-hours">';
      for(let h=6;h<=27;h++) html+='<span></span>';
      html += '</div>';
      html += '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#E74C3C;font-size:.65rem;font-weight:600;">휴무</div>';
      html += '</div></div>';
    });
  }

  con.innerHTML = html;

  // tap row to edit
  con.querySelectorAll('.ht-row[data-empid]').forEach(row => {
    row.addEventListener('click', ()=> openShiftModal(row.dataset.empid));
  });
}

// ============================================================
// Refresh Button
// ============================================================
$('refreshBtn').addEventListener('click', ()=>{
  showToast('새로고침...');
  location.reload();
});

// ============================================================
// Contact Import (NativeBridge or Contact Picker API)
// ============================================================
$('contactImportBtn').addEventListener('click', async()=>{
  let contacts = null;

  // 1) Try NativeBridge (앱 내)
  if(window.NativeBridge && window.NativeBridge.getContacts){
    try{
      const raw = window.NativeBridge.getContacts();
      contacts = JSON.parse(raw);
    }catch(e){ console.error('NativeBridge contacts error',e); }
  }

  // 2) Fallback: Contact Picker API (Chrome/웹)
  if(!contacts && 'contacts' in navigator && 'ContactsManager' in window){
    try{
      const props = ['name','tel'];
      const opts = {multiple:true};
      const picked = await navigator.contacts.select(props, opts);
      contacts = picked.map(c => ({
        name: (c.name && c.name[0]) || '',
        phone: (c.tel && c.tel[0]) || ''
      }));
    }catch(e){
      if(e.name !== 'TypeError') console.error('Contact Picker error',e);
    }
  }

  if(!contacts || contacts.length === 0){
    showToast('연락처를 가져올 수 없습니다');
    return;
  }

  // Show selection UI
  openContactPicker(contacts);
});

function openContactPicker(contacts){
  // Reuse empModal body for contact selection
  const $list = $('empList');
  $list.innerHTML = '<div style="padding:8px 0;font-size:.85rem;color:#FFD700;font-weight:600;">연락처 선택 (탭하여 추가)</div>';

  const existingNames = new Set(Object.values(employees).map(e => e.name));

  contacts.forEach(c => {
    if(!c.name) return;
    const item = document.createElement('div');
    item.className = 'emp-list-item';
    const alreadyExists = existingNames.has(c.name);
    item.innerHTML =
      '<div class="emp-dot" style="background:'+(alreadyExists?'#2ECC71':'#9090A8')+'"></div>'+
      '<div class="emp-info">'+
        '<div class="name">'+c.name+'</div>'+
        '<div class="detail">'+(c.phone||'전화없음')+(alreadyExists?' (등록됨)':'')+'</div>'+
      '</div>'+
      (alreadyExists ? '' : '<button class="btn btn-sm btn-accent" data-cname="'+c.name.replace(/"/g,'&quot;')+'" data-cphone="'+(c.phone||'').replace(/"/g,'&quot;')+'">추가</button>');
    $list.appendChild(item);
  });

  // Back button
  const backBtn = document.createElement('button');
  backBtn.className = 'btn';
  backBtn.style.cssText = 'width:100%;margin-top:8px;';
  backBtn.textContent = '돌아가기';
  backBtn.addEventListener('click', ()=> renderEmpList());
  $list.appendChild(backBtn);

  // Add button handlers
  $list.querySelectorAll('[data-cname]').forEach(btn => {
    btn.addEventListener('click', async()=>{
      const name = btn.dataset.cname;
      const phone = btn.dataset.cphone;
      const colorIdx = Object.keys(employees).length % PRESET_COLORS.length;
      const data = {
        name: name,
        phone: phone,
        color: PRESET_COLORS[colorIdx],
        role: '',
        hourlyRate: 0,
        maxHours: 40
      };
      const id = 'emp' + Date.now();
      employees[id] = data;
      lsSaveEmployees(employees);
      const ok = await fbPut(FB_EMPLOYEES+'/'+id, data);
      if(ok){
        btn.textContent = '완료';
        btn.disabled = true;
        btn.style.opacity = '.5';
        showToast(name+' 추가됨');
        renderAll();
      }
    });
  });
}

// ============================================================
// Collapsible sections (localStorage persistence)
// ============================================================
function setupCollapsible(toggleId, arrowId, bodyId, storageKey, defaultOpen){
  const body = $(bodyId);
  const arrow = $(arrowId);
  const stored = localStorage.getItem(storageKey);
  const isOpen = stored !== null ? stored === 'true' : defaultOpen;
  if(isOpen){
    body.classList.add('open');
    arrow.classList.add('open');
  }
  $(toggleId).addEventListener('click', ()=>{
    const open = body.classList.toggle('open');
    arrow.classList.toggle('open', open);
    localStorage.setItem(storageKey, open);
  });
}

setupCollapsible('weekToggle','weekArrow','weekBody','ws_week_open', false);
setupCollapsible('infoToggle','infoArrow','infoBody','ws_info_open', false);
setupCollapsible('aiToggle','aiArrow','aiBody','ws_ai_open', false);
setupCollapsible('payToggle','payArrow','payBody','ws_pay_open', false);
setupCollapsible('shareToggle','shareArrow','shareBody','ws_share_open', false);

// ============================================================
// Share / Image
// ============================================================
$('shareImageBtn').addEventListener('click', async()=>{
  showToast('이미지 생성 중...');
  try{
    // 현재 선택 날짜 기준 당일 스케줄로 이미지 생성
    const dk = dateKey(currentDate);
    const sched = daySchedule;
    const empKeys = Object.keys(employees);
    const dow = DOW_KR[currentDate.getDay()];
    const events = [];
    let dayLine = (currentDate.getMonth()+1)+'/'+currentDate.getDate()+'('+dow+') ';
    const offNames = [];
    empKeys.forEach(eid=>{
      if(isDayOff(eid, dk)){ offNames.push(employees[eid].name); return; }
      const shift = sched[eid];
      if(!shift || !shift.start) return;
      const emp = employees[eid];
      dayLine += emp.name+' '+shift.start+'~'+shift.end+' ';
      events.push({date:dk, empId:eid, start:shift.start, end:shift.end, role:shift.role||''});
    });
    if(offNames.length) dayLine += '| '+offNames.join(',')+'휴무 ';
    if(events.length === 0){ showToast('근무 데이터 없음'); return; }
    const dayTexts = [dayLine.trim()];
    const imgBase64 = await buildShareImage_full(dayTexts, events, {}, empKeys);
    const proceed = await showSharePreview(imgBase64);
    if(!proceed) return;
    if(window.NativeBridge && window.NativeBridge.shareImage){
      window.NativeBridge.shareImage(imgBase64);
    } else {
      const link = document.createElement('a');
      const m = currentDate.getMonth()+1;
      const d = currentDate.getDate();
      link.download = '근무표_'+m+'월'+d+'일.png';
      link.href = imgBase64;
      link.click();
      showToast('이미지 다운로드 완료');
    }
  }catch(e){
    console.error('이미지 공유 에러',e);
    showToast('이미지 생성 실패: '+e.message);
  }
});

$('shareTextBtn').addEventListener('click', ()=>{
  const empKeys = Object.keys(employees);
  const m = currentDate.getMonth()+1;
  const d = currentDate.getDate();
  const dow = DOW_KR[currentDate.getDay()];
  let text = '근무표 '+m+'/'+d+' ('+dow+')\n';
  text += '─────────────\n';
  let hasShift = false;
  const dk = dateKey(currentDate);
  empKeys.forEach(empId => {
    const emp = employees[empId];
    if(emp.name === '이원규') return; // 사장 제외
    if(isDayOff(empId, dk)) return; // 휴무 제외
    const shift = daySchedule[empId];
    if(shift && shift.start){
      text += emp.name+': '+shift.start+'~'+shift.end;
      if(shift.role) text += ' ('+shift.role+')';
      text += ' ['+calcHours(shift.start,shift.end)+'h]\n';
      hasShift = true;
    }
  });
  if(!hasShift) text += '(근무 없음)\n';

  if(window.NativeBridge && window.NativeBridge.shareText){
    window.NativeBridge.shareText(text);
  } else if(navigator.clipboard){
    navigator.clipboard.writeText(text).then(()=> showToast('텍스트 복사됨'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('텍스트 복사됨');
  }
});

$('copyUrlBtn').addEventListener('click', ()=>{
  const url = window.location.href;
  if(navigator.clipboard){
    navigator.clipboard.writeText(url).then(()=> showToast('URL 복사됨'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('URL 복사됨');
  }
});

// ============================================================
// 공유 이미지 빌더 + 미리보기
// ============================================================

// 미리보기 모달 — Promise 반환 (true=전송, false=취소)
function showSharePreview(imgBase64){
  return new Promise(resolve=>{
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.92);display:flex;flex-direction:column;padding:8px;';
    // 상단 바: 제목 + 줌 버튼
    const topBar = document.createElement('div');
    topBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 0 8px;';
    const title = document.createElement('div');
    title.style.cssText = 'color:#E0E0EC;font-size:15px;font-weight:700;';
    title.textContent = '공유 미리보기';
    const zoomRow = document.createElement('div');
    zoomRow.style.cssText = 'display:flex;gap:6px;';
    const btnZoomOut = document.createElement('button');
    btnZoomOut.textContent = '−';
    btnZoomOut.style.cssText = 'width:36px;height:36px;border:1px solid #555;border-radius:6px;background:#333;color:#fff;font-size:18px;font-weight:700;cursor:pointer;';
    const btnZoomIn = document.createElement('button');
    btnZoomIn.textContent = '+';
    btnZoomIn.style.cssText = 'width:36px;height:36px;border:1px solid #555;border-radius:6px;background:#333;color:#fff;font-size:18px;font-weight:700;cursor:pointer;';
    zoomRow.append(btnZoomOut, btnZoomIn);
    topBar.append(title, zoomRow);
    // 이미지 영역
    const imgWrap = document.createElement('div');
    imgWrap.style.cssText = 'flex:1;overflow:auto;-webkit-overflow-scrolling:touch;border-radius:8px;';
    const img = document.createElement('img');
    img.src = imgBase64;
    let scale = 100;
    img.style.cssText = 'width:100%;display:block;';
    imgWrap.appendChild(img);
    btnZoomIn.onclick = e=>{ e.stopPropagation(); scale = Math.min(300, scale+50); img.style.width = scale+'%'; };
    btnZoomOut.onclick = e=>{ e.stopPropagation(); scale = Math.max(50, scale-50); img.style.width = scale+'%'; };
    imgWrap.onclick = e=>e.stopPropagation();
    // 하단 버튼
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:12px;justify-content:center;padding:10px 0 4px;';
    const btnSend = document.createElement('button');
    btnSend.textContent = '전송';
    btnSend.style.cssText = 'padding:10px 32px;border:none;border-radius:8px;font-size:14px;font-weight:700;color:#FFF;background:linear-gradient(135deg,#667eea,#764ba2);cursor:pointer;';
    const btnCancel = document.createElement('button');
    btnCancel.textContent = '취소';
    btnCancel.style.cssText = 'padding:10px 32px;border:1px solid rgba(255,255,255,.2);border-radius:8px;font-size:14px;font-weight:600;color:#9090A8;background:rgba(255,255,255,.05);cursor:pointer;';
    btnRow.append(btnCancel, btnSend);
    overlay.append(topBar, imgWrap, btnRow);
    document.body.appendChild(overlay);
    const close = ok=>{ document.body.removeChild(overlay); resolve(ok); };
    btnSend.onclick = ()=> close(true);
    btnCancel.onclick = ()=> close(false);
    overlay.onclick = e=>{ if(e.target===overlay) close(false); };
  });
}

// 전체 근무표 이미지 (클린 다크 카드)
async function buildShareImage_full(dayTexts, events, contactMap, empKeys){
  const W = 420;
  const tmpDiv = document.createElement('div');
  tmpDiv.style.cssText = 'position:absolute;left:-9999px;top:0;width:'+W+'px;padding:0;font-family:"Pretendard",system-ui,-apple-system,sans-serif;font-size:14px;overflow:hidden;background:#13111F;';
  // 이름→색상 맵 (전역 employees 활용)
  const nameColorMap = {};
  if(typeof employees !== 'undefined'){
    Object.values(employees).forEach(e=>{ if(e.name && e.color) nameColorMap[e.name]=e.color; });
  }
  // 날짜 범위 텍스트
  const firstDate = dayTexts.length ? dayTexts[0].split(')')[0]+')' : '';
  const lastDate  = dayTexts.length>1 ? dayTexts[dayTexts.length-1].split(')')[0]+')' : '';
  const rangeText = lastDate && firstDate!==lastDate ? firstDate+' ~ '+lastDate : firstDate;
  let html = '<div style="background:#13111F;padding:24px 20px 18px;position:relative;">';
  // 상단 장식: 3색 스트라이프 (얇게)
  html += '<div style="position:absolute;top:0;left:0;right:0;height:4px;display:flex;">';
  html += '<div style="flex:1;background:#7C6FE0;"></div>';
  html += '<div style="flex:1;background:#2ECC71;"></div>';
  html += '<div style="flex:1;background:#4FC3F7;"></div>';
  html += '</div>';
  // 헤더: 아이콘 + 제목 + 날짜 범위
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;padding-top:4px;">';
  html += '<div style="display:flex;align-items:center;gap:10px;">';
  html += '<div style="width:36px;height:36px;border-radius:10px;background:#1E1C30;border:1px solid #2E2E52;display:flex;align-items:center;justify-content:center;">';
  html += '<span style="font-size:18px;">📋</span></div>';
  html += '<div><div style="font-size:18px;font-weight:800;color:#FFFFFF;letter-spacing:-.3px;line-height:1.2;">근무표</div>';
  html += '<div style="font-size:11px;color:#707088;margin-top:1px;font-weight:500;">'+events.length+'건 확정</div></div>';
  html += '</div>';
  if(rangeText) html += '<div style="font-size:11px;font-weight:600;color:#9090A8;background:#1E1C30;border:1px solid #2E2E52;border-radius:20px;padding:4px 10px;">'+rangeText+'</div>';
  html += '</div>';
  // 날짜 카드들
  dayTexts.forEach((t,idx)=>{
    const parts = t.split(') ');
    const dateP = parts[0]+')';
    const rest = parts.slice(1).join(') ');
    const [shiftPart, offPart] = rest.split('|').map(s=>(s||'').trim());
    // 좌측 강조 바 색상 (카드마다 순환)
    const accentColors = ['#7C6FE0','#2ECC71','#4FC3F7','#E67E22','#E74C3C','#2AC1BC'];
    const accent = accentColors[idx % accentColors.length];
    html += '<div style="background:#1A1832;border:1px solid #252340;border-radius:12px;padding:12px 14px;margin-bottom:8px;position:relative;overflow:hidden;">';
    // 좌측 컬러 스트라이프
    html += '<div style="position:absolute;top:0;left:0;bottom:0;width:3px;background:'+accent+';border-radius:2px 0 0 2px;"></div>';
    // 날짜 헤더
    html += '<div style="font-size:12px;font-weight:700;color:'+accent+';margin-bottom:9px;letter-spacing:.4px;padding-left:8px;">'+dateP+'</div>';
    // 근무자 행들
    const matches = [...shiftPart.matchAll(/(\S+)\s+(\d{1,2}:\d{2}~\d{1,2}:\d{2})/g)];
    matches.forEach((m,mi)=>{
      const eName = m[1];
      const eTime = m[2];
      const dotColor = nameColorMap[eName] || '#7C6FE0';
      // 행 사이 구분선
      const topBorder = mi>0 ? 'border-top:1px solid rgba(255,255,255,.04);' : '';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0 6px 8px;'+topBorder+'">';
      html += '<div style="display:flex;align-items:center;gap:7px;">';
      html += '<div style="width:7px;height:7px;border-radius:50%;background:'+dotColor+';flex-shrink:0;box-shadow:0 0 5px '+dotColor+'80;"></div>';
      html += '<span style="color:#E0E0EC;font-size:13px;font-weight:700;">'+eName+'</span></div>';
      html += '<div style="background:#242244;border:1px solid #32305A;border-radius:6px;padding:3px 10px;">';
      html += '<span style="font-size:12px;font-weight:700;color:#C5BFFF;letter-spacing:.5px;font-variant-numeric:tabular-nums;">'+eTime+'</span></div>';
      html += '</div>';
    });
    // 휴무자
    if(offPart){
      const topBdr = matches.length>0 ? 'border-top:1px solid rgba(255,255,255,.04);margin-top:4px;' : '';
      html += '<div style="display:flex;align-items:center;gap:7px;padding:6px 0 2px 8px;'+topBdr+'">';
      html += '<div style="width:7px;height:7px;border-radius:50%;background:#E74C3C;flex-shrink:0;"></div>';
      html += '<span style="color:#E07070;font-size:12px;font-weight:600;">휴무 · '+offPart+'</span>';
      html += '</div>';
    }
    html += '</div>';
  });
  // 하단 워터마크
  html += '<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:14px;padding-top:12px;border-top:1px solid #1E1C30;">';
  html += '<div style="width:3px;height:3px;border-radius:50%;background:#3A3860;"></div>';
  html += '<span style="font-size:10px;color:#3A3860;letter-spacing:1.5px;font-weight:600;">WORK SCHEDULE</span>';
  html += '<div style="width:3px;height:3px;border-radius:50%;background:#3A3860;"></div>';
  html += '</div>';
  html += '</div>';
  tmpDiv.innerHTML = html;
  document.body.appendChild(tmpDiv);
  const canvas = await html2canvas(tmpDiv,{backgroundColor:'#13111F',scale:2,logging:false});
  document.body.removeChild(tmpDiv);
  return canvas.toDataURL('image/png');
}

// 개별 직원 이미지 (클린 다크 카드)
async function buildShareImage_personal(emp, lines){
  const W = 380;
  const empColor = emp.color || '#7C6FE0';
  // 밝기 보정: 너무 어두운 색은 밝게 (html2canvas 캡처 시 육안 가독성 확보)
  const tmpDiv = document.createElement('div');
  tmpDiv.style.cssText = 'position:absolute;left:-9999px;top:0;width:'+W+'px;padding:0;font-family:"Pretendard",system-ui,-apple-system,sans-serif;font-size:14px;overflow:hidden;background:#13111F;';
  // 아바타 이니셜
  const initial = emp.name.charAt(0);
  let html = '<div style="background:#13111F;padding:24px 20px 18px;position:relative;">';
  // 상단 컬러 바 (직원 고유색)
  html += '<div style="position:absolute;top:0;left:0;right:0;height:4px;background:'+empColor+';"></div>';
  // 프로필 헤더
  html += '<div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;padding-top:4px;">';
  // 아바타 원
  html += '<div style="width:48px;height:48px;border-radius:50%;background:#1A1832;border:2px solid '+empColor+';display:flex;align-items:center;justify-content:center;flex-shrink:0;">';
  html += '<span style="font-size:20px;font-weight:900;color:'+empColor+';">'+initial+'</span></div>';
  // 이름 + 서브타이틀
  html += '<div>';
  html += '<div style="font-size:18px;font-weight:800;color:#FFFFFF;letter-spacing:-.3px;line-height:1.2;">'+emp.name+'</div>';
  html += '<div style="font-size:11px;color:#707088;margin-top:2px;font-weight:500;">확정 근무 스케줄</div></div>';
  // 건수 뱃지
  html += '<div style="margin-left:auto;background:#1A1832;border:1px solid #2E2E52;border-radius:20px;padding:4px 10px;white-space:nowrap;">';
  html += '<span style="font-size:11px;font-weight:700;color:'+empColor+';">'+lines.length+'일</span></div>';
  html += '</div>';
  // 구분선
  html += '<div style="height:1px;background:#1E1C30;margin-bottom:14px;"></div>';
  // 스케줄 행들
  lines.forEach((l,i)=>{
    const match = l.match(/^(\d+\/\d+\([^)]+\))\s+(\d+:\d+~\d+:\d+)(.*)/);
    const dateStr = match ? match[1] : l;
    const timeStr = match ? match[2] : '';
    const roleStr = match ? match[3].trim() : '';
    const isLast = i === lines.length-1;
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;'+(isLast?'':'border-bottom:1px solid #1E1C30;')+'">';
    // 좌: 날짜 + 역할
    html += '<div style="display:flex;align-items:center;gap:10px;">';
    html += '<div style="width:3px;height:36px;border-radius:2px;background:'+empColor+';flex-shrink:0;opacity:.7;"></div>';
    html += '<div>';
    html += '<div style="font-size:13px;font-weight:700;color:#E0E0EC;letter-spacing:.2px;">'+dateStr+'</div>';
    if(roleStr) html += '<div style="font-size:10px;color:#707088;margin-top:2px;font-weight:500;">'+roleStr+'</div>';
    html += '</div></div>';
    // 우: 시간 뱃지
    html += '<div style="background:#1A1832;border:1px solid #252340;border-left:2px solid '+empColor+';border-radius:6px;padding:5px 12px;min-width:90px;text-align:center;">';
    html += '<span style="font-size:13px;font-weight:700;color:#E0E0EC;letter-spacing:.5px;font-variant-numeric:tabular-nums;">'+timeStr+'</span></div>';
    html += '</div>';
  });
  // 하단 워터마크
  html += '<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:14px;padding-top:12px;border-top:1px solid #1E1C30;">';
  html += '<div style="width:3px;height:3px;border-radius:50%;background:#3A3860;"></div>';
  html += '<span style="font-size:10px;color:#3A3860;letter-spacing:1.5px;font-weight:600;">WORK SCHEDULE</span>';
  html += '<div style="width:3px;height:3px;border-radius:50%;background:#3A3860;"></div>';
  html += '</div>';
  html += '</div>';
  tmpDiv.innerHTML = html;
  document.body.appendChild(tmpDiv);
  const canvas = await html2canvas(tmpDiv,{backgroundColor:'#13111F',scale:2,logging:false});
  document.body.removeChild(tmpDiv);
  return canvas.toDataURL('image/png');
}

// 전체 확정 데이터 수집 (공통 헬퍼)
function collectAllConfirmed(){
  const today = new Date(); today.setHours(0,0,0,0);
  const empKeys = Object.keys(employees);
  const events = [], dayTexts = [];
  for(let i=0;i<7;i++){
    const d = new Date(today); d.setDate(d.getDate()+i);
    const dk = dateKey(d);
    const sched = lsLoadSchedule(dk)||{};
    const dow = DOW_KR[d.getDay()];
    // 당일 전원 확정 체크
    let allConfirmed = true;
    empKeys.forEach(eid=>{
      const shift = sched[eid];
      if(!shift||!shift.start) return;
      if(getShiftStatus(dk,eid)!=='confirmed') allConfirmed = false;
    });
    if(!allConfirmed) continue;
    let dayLine = (d.getMonth()+1)+'/'+d.getDate()+'('+dow+') ';
    let hasShift = false;
    const offNames = [];
    empKeys.forEach(eid=>{
      if(isDayOff(eid, dk)){ offNames.push(employees[eid].name); return; }
      if(getShiftStatus(dk,eid)!=='confirmed') return;
      const shift = sched[eid];
      if(!shift||!shift.start) return;
      hasShift = true;
      dayLine += employees[eid].name+' '+shift.start+'~'+shift.end+' ';
      events.push({date:dk, empId:eid, start:shift.start, end:shift.end, role:shift.role||''});
    });
    if(offNames.length) dayLine += '| '+offNames.join(',')+'휴무 ';
    if(hasShift) dayTexts.push(dayLine.trim());
  }
  return {events, dayTexts};
}

// 직원 1명분 .ics 생성 (공통 헬퍼, trackHistory=false면 ws_shared_ 안 건드림)
function buildIcsForEmployee(empId, events, trackHistory){
  const seq = Math.floor(Date.now()/1000);
  const prevKey = 'ws_shared_'+empId;
  const prevDates = trackHistory ? JSON.parse(localStorage.getItem(prevKey)||'[]') : [];
  const curDates = events.map(ev=>ev.date);

  let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//WorkSchedule//KR\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n'
    + 'BEGIN:VTIMEZONE\r\nTZID:Asia/Seoul\r\nBEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+0900\r\nTZOFFSETTO:+0900\r\nTZNAME:KST\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\n';
  events.forEach(ev=>{
    const [y,mo,dd] = ev.date.split('-');
    const [sh,sm] = ev.start.split(':').map(Number);
    const [eh,em] = ev.end.split(':').map(Number);
    let endDate = ev.date;
    if(eh<sh||(eh===sh&&em<sm)){
      const nd = new Date(parseInt(y),parseInt(mo)-1,parseInt(dd));
      nd.setDate(nd.getDate()+1);
      endDate = dateStr(nd);
    }
    const [ey,emo,ed] = endDate.split('-');
    ics += 'BEGIN:VEVENT\r\nUID:bbq-'+ev.date+'-'+ev.empId+'@workschedule\r\n';
    ics += 'SEQUENCE:'+seq+'\r\n';
    ics += 'DTSTART;TZID=Asia/Seoul:'+y+mo+dd+'T'+pad(sh)+pad(sm)+'00\r\n';
    ics += 'DTEND;TZID=Asia/Seoul:'+ey+emo+ed+'T'+pad(eh)+pad(em)+'00\r\n';
    ics += 'SUMMARY:BBQ\r\nDESCRIPTION:'+ev.start+'~'+ev.end+' '+(ev.role||'')+'\r\nEND:VEVENT\r\n';
  });
  // 이전 공유 이력 대비 취소
  prevDates.forEach(pd=>{
    if(curDates.includes(pd)) return;
    const [y,mo,dd] = pd.split('-');
    ics += 'BEGIN:VEVENT\r\nUID:bbq-'+pd+'-'+empId+'@workschedule\r\n';
    ics += 'SEQUENCE:'+seq+'\r\nSTATUS:CANCELLED\r\n';
    ics += 'DTSTART;TZID=Asia/Seoul:'+y+mo+dd+'T000000\r\n';
    ics += 'DTEND;TZID=Asia/Seoul:'+y+mo+dd+'T235900\r\n';
    ics += 'SUMMARY:BBQ (취소)\r\nEND:VEVENT\r\n';
  });
  ics += 'END:VCALENDAR\r\n';
  if(trackHistory) localStorage.setItem(prevKey, JSON.stringify(curDates));
  return ics;
}

// ============================================================
// 카톡 공유 Mode1: 전체이미지 + 전원 개별ICS
// ============================================================
$('shareKakaoBtn').addEventListener('click', async()=>{
  showToast('확정 근무표 생성 중...');
  try{
    // 오늘부터 7일간 확정된 스케줄 수집
    const today = new Date();
    today.setHours(0,0,0,0);
    const events = [];
    const dayTexts = [];
    // 연락처 매칭
    let contacts = [];
    if(window.NativeBridge && window.NativeBridge.getContacts){
      try{ contacts = JSON.parse(window.NativeBridge.getContacts()); }catch(e){}
    }
    const contactMap = {};
    const empKeys = Object.keys(employees);
    empKeys.forEach(eid=>{
      const name = employees[eid]?.name||'';
      const match = contacts.find(c=> c.name && c.name.includes(name));
      if(match) contactMap[eid] = match.phone;
    });

    for(let i=0;i<7;i++){
      const d = new Date(today); d.setDate(d.getDate()+i);
      const dk = dateKey(d);
      const sched = lsLoadSchedule(dk) || {};
      const dow = DOW_KR[d.getDay()];
      // 당일 전원 확정 여부 체크
      let allConfirmed = true;
      empKeys.forEach(eid=>{
        const shift = sched[eid];
        if(!shift || !shift.start) return; // 미입력은 무시
        if(getShiftStatus(dk, eid) !== 'confirmed') allConfirmed = false;
      });
      if(!allConfirmed) continue; // 일부라도 미확정이면 해당 날짜 스킵
      let dayLine = (d.getMonth()+1)+'/'+d.getDate()+'('+dow+') ';
      let hasShift = false;
      const offNames = [];
      empKeys.forEach(eid=>{
        if(isDayOff(eid, dk)){ offNames.push(employees[eid].name); return; }
        const st = getShiftStatus(dk, eid);
        if(st !== 'confirmed') return;
        const shift = sched[eid];
        if(!shift || !shift.start) return;
        hasShift = true;
        const emp = employees[eid];
        dayLine += emp.name+' '+shift.start+'~'+shift.end+' ';
        events.push({
          date:dk, empId:eid,
          start:shift.start, end:shift.end,
          role:shift.role||''
        });
      });
      if(offNames.length) dayLine += '| '+offNames.join(',')+'휴무 ';
      if(hasShift) dayTexts.push(dayLine.trim());
    }

    if(events.length === 0){ showToast('확정된 근무가 없습니다'); return; }

    // 전체 이미지 생성
    const imgBase64 = await buildShareImage_full(dayTexts, events, contactMap, empKeys);

    // 미리보기
    const proceed = await showSharePreview(imgBase64);
    if(!proceed) return;

    // Mode 1: 전체이미지 + 인원별 개별 .ics 모두 첨부
    const perEmpIcs = [];
    const byEmp = {};
    events.forEach(ev=>{
      if(!byEmp[ev.empId]) byEmp[ev.empId] = [];
      byEmp[ev.empId].push(ev);
    });
    Object.keys(byEmp).forEach(eid=>{
      const emp = employees[eid];
      if(!emp) return;
      if(emp.name === '이원규') return; // 사장 제외
      const ics = buildIcsForEmployee(eid, byEmp[eid], false);
      perEmpIcs.push({name: emp.name, ics: ics});
    });

    if(window.NativeBridge && window.NativeBridge.shareMultiFiles){
      window.NativeBridge.shareMultiFiles(imgBase64, JSON.stringify(perEmpIcs));
    } else {
      // 웹 fallback: 이미지 + 개별 ics 다운로드
      const link = document.createElement('a');
      link.download = '근무표.png';
      link.href = imgBase64;
      link.click();
      perEmpIcs.forEach(p=>{
        downloadBlob(p.ics, p.name+'.ics', 'text/calendar;charset=utf-8');
      });
    }
  }catch(e){
    console.error('카톡 공유 에러',e);
    showToast('공유 실패: '+e.message);
  }
});

// 개별 직원 카톡 공유 버튼 생성 (Mode2: 개별이미지 / Mode3: 전체이미지)
function buildKakaoPerEmp(){
  const box = $('kakaoPerEmp');
  if(!box) return;
  box.innerHTML = '';
  const today = new Date(); today.setHours(0,0,0,0);
  const empKeys = Object.keys(employees);
  // Mode 2 라벨
  const lbl2 = document.createElement('div');
  lbl2.style.cssText = 'font-size:.6rem;color:#707088;margin-bottom:2px;';
  lbl2.textContent = '개별이미지+ICS';
  const row2 = document.createElement('div');
  row2.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;';
  // Mode 3 라벨
  const lbl3 = document.createElement('div');
  lbl3.style.cssText = 'font-size:.6rem;color:#707088;margin-bottom:2px;';
  lbl3.textContent = '전체이미지+ICS';
  const row3 = document.createElement('div');
  row3.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';

  let hasAny = false;
  empKeys.forEach(eid=>{
    const emp = employees[eid];
    if(emp.name === '이원규') return;
    let hasConfirmed = false;
    for(let i=0;i<7;i++){
      const d = new Date(today); d.setDate(d.getDate()+i);
      const dk = dateKey(d);
      if(getShiftStatus(dk,eid)==='confirmed'){
        const sched = lsLoadSchedule(dk)||{};
        if(sched[eid]&&sched[eid].start){ hasConfirmed=true; break; }
      }
    }
    const hasPrev = JSON.parse(localStorage.getItem('ws_shared_'+eid)||'[]').length > 0;
    if(!hasConfirmed && !hasPrev) return;
    hasAny = true;
    const isCancel = !hasConfirmed && hasPrev;
    const mkBtn = (mode)=>{
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm';
      btn.style.cssText = isCancel
        ? 'background:#E74C3C33;color:#E74C3C;font-size:.65rem;font-weight:700;padding:2px 7px;border-radius:4px;'
        : mode==='full'
          ? 'background:#667eea33;color:#a78bfa;font-size:.65rem;font-weight:700;padding:2px 7px;border-radius:4px;'
          : 'background:#FFE81266;color:#FFE812;font-size:.65rem;font-weight:700;padding:2px 7px;border-radius:4px;';
      btn.textContent = emp.name+(isCancel?' ✕':'');
      btn.addEventListener('click', ()=> sharePerEmployee(eid, mode));
      return btn;
    };
    row2.appendChild(mkBtn('personal'));
    row3.appendChild(mkBtn('full'));
  });
  if(hasAny){
    box.append(lbl2, row2, lbl3, row3);
  } else {
    box.innerHTML = '<span style="font-size:.7rem;color:#707088;">확정 근무 없음</span>';
  }
}

// Mode 2: 개별이미지+1명ICS / Mode 3: 전체이미지+1명ICS
async function sharePerEmployee(empId, mode){
  const emp = employees[empId];
  if(!emp) return;
  showToast(emp.name+' 공유 준비...');
  try{
    const today = new Date(); today.setHours(0,0,0,0);
    const events = [];
    const lines = [];
    for(let i=0;i<7;i++){
      const d = new Date(today); d.setDate(d.getDate()+i);
      const dk = dateKey(d);
      if(getShiftStatus(dk,empId)!=='confirmed') continue;
      const sched = lsLoadSchedule(dk)||{};
      const shift = sched[empId];
      if(!shift||!shift.start) continue;
      const dow = DOW_KR[d.getDay()];
      lines.push((d.getMonth()+1)+'/'+d.getDate()+'('+dow+') '+shift.start+'~'+shift.end+(shift.role?' '+shift.role:''));
      events.push({date:dk, empId, start:shift.start, end:shift.end, role:shift.role||''});
    }
    const prevDates = JSON.parse(localStorage.getItem('ws_shared_'+empId)||'[]');
    if(!events.length && !prevDates.length){ showToast(emp.name+' 확정 근무 없음'); return; }
    const cancelOnly = !events.length && prevDates.length > 0;

    // .ics (공통 헬퍼 사용)
    const ics = buildIcsForEmployee(empId, events, true);

    if(cancelOnly){
      downloadBlob(ics, emp.name+'.ics', 'text/calendar;charset=utf-8');
      showToast(emp.name+' 일정 취소 전송');
      return;
    }

    // 이미지: mode==='full' → 전체, 기본 → 개별
    let imgBase64;
    if(mode==='full'){
      // 전체 근무표 이미지 생성
      const allData = collectAllConfirmed();
      imgBase64 = await buildShareImage_full(allData.dayTexts, allData.events, {}, Object.keys(employees));
    } else {
      imgBase64 = await buildShareImage_personal(emp, lines);
    }

    const proceed = await showSharePreview(imgBase64);
    if(!proceed) return;

    if(window.NativeBridge && window.NativeBridge.shareSchedule){
      window.NativeBridge.shareSchedule(imgBase64, ics, emp.name);
    } else {
      const link = document.createElement('a');
      link.download = emp.name+'_근무표.png';
      link.href = imgBase64;
      link.click();
      downloadBlob(ics, emp.name+'.ics', 'text/calendar;charset=utf-8');
    }
  }catch(e){
    console.error('개별 공유 에러',e);
    showToast('공유 실패');
  }
}

// ============================================================
// Gemini AI Integration
// ============================================================
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
let geminiKey = '';

function loadAiKey(){
  // Priority 1: localStorage
  let k = localStorage.getItem('ws_gemini_key') || '';
  // Priority 2: Firebase (BankTotal shared key)
  if(!k){
    fetch(FB_BASE+'/banktotal/settings/gemini_key.json')
      .then(r=>r.json())
      .then(d=>{
        if(d && typeof d === 'string'){
          geminiKey = d;
          localStorage.setItem('ws_gemini_key', d);
        }
      }).catch(()=>{});
  } else {
    geminiKey = k;
  }
  // Also refresh from Firebase in background
  if(k){
    fetch(FB_BASE+'/banktotal/settings/gemini_key.json')
      .then(r=>r.json())
      .then(d=>{
        if(d && typeof d === 'string' && d !== k){
          geminiKey = d;
          localStorage.setItem('ws_gemini_key', d);
        }
      }).catch(()=>{});
  }
}

async function callGemini(prompt){
  if(!geminiKey) loadAiKey();
  if(!geminiKey) throw new Error('Gemini API 키 없음');
  const r = await fetch(GEMINI_URL+'?key='+geminiKey,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({contents:[{parts:[{text:prompt}]}]})
  });
  if(!r.ok){
    const err = await r.json().catch(()=>({}));
    throw new Error(err.error?.message || 'Gemini API 오류 '+r.status);
  }
  const d = await r.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ============================================================
// Weather & Sports (Gemini)
// ============================================================
let weatherCache = {date:'', data:''};
let sportsCache = {date:'', data:''};

async function loadWeatherAndSports(){
  const today = new Date();
  const todayStr = dateStr(today);
  const $weather = $('weatherInfo');
  const $sports = $('sportsInfo');

  // Weather
  if(weatherCache.date === todayStr && weatherCache.data){
    $weather.innerHTML = weatherCache.data;
  } else {
    try{
      const wPrompt = '오늘 날짜: '+todayStr+'. 경기도 이천시 오늘 날씨를 한줄로 알려줘. 기온, 강수확률, 비/눈/결빙 여부만. 배달에 영향 있으면 "배달주의" 추가. 50자 이내. 순수 텍스트만 (마크다운 금지).';
      const wResult = await callGemini(wPrompt);
      const wClean = wResult.replace(/\*/g,'').replace(/\n/g,' ').trim().substring(0,80);
      weatherCache = {date:todayStr, data:wClean};
      localStorage.setItem('ws_weather_cache', JSON.stringify(weatherCache));
      $weather.innerHTML = wClean;
    }catch(e){
      const cached = localStorage.getItem('ws_weather_cache');
      if(cached){
        try{
          const c = JSON.parse(cached);
          $weather.innerHTML = c.data || '<span class="info-placeholder">날씨 로딩 실패</span>';
        }catch(x){ $weather.innerHTML = '<span class="info-placeholder">날씨 로딩 실패</span>'; }
      } else {
        $weather.innerHTML = '<span class="info-placeholder">날씨 로딩 실패</span>';
      }
    }
  }

  // Sports (경기 없는 날엔 표기 X)
  const $sportsRow = $sports.closest('.info-row');
  if(sportsCache.date === todayStr && sportsCache.data){
    if(sportsCache.data.includes('경기없음') || sportsCache.data.includes('없음')){
      if($sportsRow) $sportsRow.style.display = 'none';
    } else {
      if($sportsRow) $sportsRow.style.display = '';
      $sports.innerHTML = sportsCache.data;
    }
  } else {
    try{
      const sPrompt = '오늘 날짜: '+todayStr+'. 오늘/내일 중 한국 스포츠 경기 일정 알려줘. KBO(프로야구), 한국 국가대표 축구, 챔피언스리그만. 경기 없으면 "경기없음". 각 경기 팀+시간만 한줄씩. 80자 이내. 순수 텍스트만 (마크다운 금지).';
      const sResult = await callGemini(sPrompt);
      const sClean = sResult.replace(/\*/g,'').replace(/\n/g,' | ').trim().substring(0,120);
      sportsCache = {date:todayStr, data:sClean};
      localStorage.setItem('ws_sports_cache', JSON.stringify(sportsCache));
      if(sClean.includes('경기없음') || sClean.includes('없음')){
        if($sportsRow) $sportsRow.style.display = 'none';
      } else {
        if($sportsRow) $sportsRow.style.display = '';
        $sports.innerHTML = sClean;
      }
    }catch(e){
      if($sportsRow) $sportsRow.style.display = 'none';
    }
  }
}

// ============================================================
// Logistics Check (min 2 people, 3 after 16:30)
// ============================================================
function checkLogistics(){
  // 물류 체크 → 역할별 커버리지 뷰에 통합됨
}

// ============================================================
// AI Scheduling Chat
// ============================================================
let aiProcessing = false;

function buildScheduleContext(targetDates){
  const empKeys = Object.keys(employees);
  let ctx = '## 직원 목록\n';
  empKeys.forEach(id => {
    const e = employees[id];
    let info = '- '+e.name+' (ID:'+id+', 역할:'+(e.role||'미지정')+', 주간최대:'+(e.maxHours||40)+'h';
    if(e.preferredHours) info += ', 선호시간:'+e.preferredHours;
    if(e.unavailableHours) info += ', 불가시간:'+e.unavailableHours;
    info += ')\n';
    ctx += info;
  });
  ctx += '\n## 현재 스케줄\n';
  if(targetDates && targetDates.length > 0){
    targetDates.forEach(dk => {
      const sched = weekSchedules[dk] || daySchedule;
      ctx += dk+': ';
      const parts = [];
      empKeys.forEach(id => {
        const s = (dk === dateKey(currentDate)) ? daySchedule[id] : (weekSchedules[dk]||{})[id];
        if(s && s.start) parts.push(employees[id].name+' '+s.start+'~'+s.end+(s.role?' ('+s.role+')':''));
      });
      ctx += parts.length > 0 ? parts.join(', ') : '(없음)';
      ctx += '\n';
    });
  }
  ctx += '\n## 규칙\n';
  ctx += '- 영업시간: 10:00~03:00 (새벽)\n';
  ctx += '- 최소 인원: 10:00~16:00 2명, 16:00~03:00 3명\n';
  ctx += '- 배달 역할 필요 (16:30 이후 물류)\n';
  ctx += '- 근무시간: 12:00~12:00(+1) 범위, 30분 단위\n';
  ctx += '- 시간 형식: HH:MM (24시간)\n';
  ctx += '- 직원별 선호시간/불가시간이 있으면 가능한 반영 (강제는 아님, 참고용)\n';
  if(weatherCache.data) ctx += '\n## 날씨: '+weatherCache.data+'\n';
  if(sportsCache.data) ctx += '\n## 경기일정: '+sportsCache.data+'\n';
  return ctx;
}

function getTargetDates(userMsg){
  const today = new Date();
  const todayDk = dateStr(today);
  if(/이번\s*주|이번주/.test(userMsg)){
    const mon = getMonday(today);
    const dates = [];
    for(let i=0;i<7;i++){
      const d = new Date(mon);
      d.setDate(d.getDate()+i);
      dates.push(dateStr(d));
    }
    return dates;
  }
  if(/내일/.test(userMsg)){
    const tm = new Date(today);
    tm.setDate(tm.getDate()+1);
    return [dateStr(tm)];
  }
  if(/모레|모래/.test(userMsg)){
    const tm = new Date(today);
    tm.setDate(tm.getDate()+2);
    return [dateStr(tm)];
  }
  // Default: current displayed date
  return [dateKey(currentDate)];
}

async function sendAiMessage(userMsg){
  if(aiProcessing) return;
  if(!userMsg.trim()) return;
  if(!geminiKey){ showToast('Gemini API 키 로딩중...'); loadAiKey(); return; }
  aiProcessing = true;

  const $chat = $('aiChatList');
  // User message
  const userDiv = document.createElement('div');
  userDiv.className = 'ai-msg user';
  userDiv.textContent = userMsg;
  $chat.appendChild(userDiv);

  // Loading
  const loadDiv = document.createElement('div');
  loadDiv.className = 'ai-msg ai loading';
  loadDiv.textContent = '생각중...';
  $chat.appendChild(loadDiv);
  $chat.scrollTop = $chat.scrollHeight;

  try{
    const targetDates = getTargetDates(userMsg);
    const ctx = buildScheduleContext(targetDates);

    const prompt = `너는 매장 근무 스케줄 관리 AI야. 한국어로 답변해.

${ctx}

## 요청
${userMsg}

## 응답 형식
스케줄 배치 요청이면 반드시 아래 JSON 배열을 포함해:
\`\`\`json
[{"date":"YYYY-MM-DD","empId":"emp1","start":"HH:MM","end":"HH:MM","role":"주방|배달|오전"}]
\`\`\`
스케줄 배치가 아닌 질문이면 텍스트로 답변해.
답변은 간결하게 (200자 이내 설명 + JSON).`;

    const result = await callGemini(prompt);
    $chat.removeChild(loadDiv);

    // Parse response
    const aiDiv = document.createElement('div');
    aiDiv.className = 'ai-msg ai';

    // Extract JSON if present
    const jsonMatch = result.match(/```json\s*([\s\S]*?)```/);
    let scheduleData = null;
    if(jsonMatch){
      try{
        scheduleData = JSON.parse(jsonMatch[1].trim());
      }catch(e){ /* not valid JSON */ }
    }

    // Clean text (remove json block)
    let textPart = result.replace(/```json[\s\S]*?```/g, '').replace(/\*/g,'').trim();
    if(textPart.length > 300) textPart = textPart.substring(0,300)+'...';

    let html = textPart.replace(/\n/g,'<br>');
    if(scheduleData && Array.isArray(scheduleData) && scheduleData.length > 0){
      html += '<br><br>';
      scheduleData.forEach(s => {
        const emp = employees[s.empId];
        const name = emp ? emp.name : s.empId;
        html += '<span style="color:#FFD700">'+s.date+'</span> '+name+' '+s.start+'~'+s.end+(s.role?' ('+s.role+')':'')+' <br>';
      });
      html += '<button class="ai-apply-btn" id="aiApplyBtn_'+(+new Date())+'">적용하기</button>';
    }
    aiDiv.innerHTML = html;
    $chat.appendChild(aiDiv);
    // Attach apply handler via JS (not onclick attribute — safer)
    if(scheduleData){
      const applyBtn = aiDiv.querySelector('.ai-apply-btn');
      if(applyBtn){
        const capturedData = scheduleData;
        applyBtn.addEventListener('click', ()=> window.applyAiSchedule(capturedData));
      }
    }
  }catch(e){
    $chat.removeChild(loadDiv);
    const errDiv = document.createElement('div');
    errDiv.className = 'ai-msg ai';
    errDiv.style.color = '#E74C3C';
    errDiv.textContent = 'AI 오류: '+e.message;
    $chat.appendChild(errDiv);
  }
  $chat.scrollTop = $chat.scrollHeight;
  aiProcessing = false;
}

// Global: apply AI schedule
window.applyAiSchedule = async function(data){
  if(!Array.isArray(data)) return;
  let applied = 0;
  for(const s of data){
    if(!s.date || !s.empId || !s.start || !s.end) continue;
    const shiftData = {start:s.start, end:s.end, role:s.role||''};
    // localStorage first
    const lsData = lsLoadSchedule(s.date) || {};
    lsData[s.empId] = shiftData;
    lsSaveSchedule(s.date, lsData);
    if(s.date === dateKey(currentDate)){
      daySchedule[s.empId] = shiftData;
    }
    const ok = await fbPut(FB_SCHEDULES+'/'+s.date+'/'+s.empId, shiftData);
    if(ok) applied++;
  }
  renderAll();
  loadWeekSchedules();
  showToast(applied+'건 적용 완료');
};

// AI event listeners
$('aiSendBtn').addEventListener('click', ()=>{
  const input = $('aiInput');
  sendAiMessage(input.value);
  input.value = '';
});
$('aiInput').addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){
    e.preventDefault();
    const input = $('aiInput');
    sendAiMessage(input.value);
    input.value = '';
  }
});
document.querySelectorAll('.ai-quick').forEach(btn => {
  btn.addEventListener('click', ()=> sendAiMessage(btn.dataset.prompt));
});

// ============================================================
// .ics Calendar Generation (iPhone + Galaxy compatible)
// ============================================================
function generateICS(events, filename){
  let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//WorkSchedule//KR\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n'
    + 'BEGIN:VTIMEZONE\r\nTZID:Asia/Seoul\r\nBEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+0900\r\nTZOFFSETTO:+0900\r\nTZNAME:KST\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\n';
  events.forEach(ev => {
    const [y,mo,d] = ev.date.split('-');
    const [sh,sm] = ev.start.split(':').map(Number);
    const [eh,em] = ev.end.split(':').map(Number);
    // Handle overnight shifts (end hour < start hour means next day)
    let endDate = ev.date;
    if(eh < sh || (eh === sh && em < sm)){
      const nd = new Date(parseInt(y), parseInt(mo)-1, parseInt(d));
      nd.setDate(nd.getDate()+1);
      endDate = dateStr(nd);
    }
    const [ey,emo,ed] = endDate.split('-');
    const dtStart = y+mo+d+'T'+pad(sh)+pad(sm)+'00';
    const dtEnd = ey+emo+ed+'T'+pad(eh)+pad(em)+'00';
    const uid = ev.date+'-'+ev.empId+'-'+(+new Date())+'@workschedule';
    ics += 'BEGIN:VEVENT\r\n';
    ics += 'UID:'+uid+'\r\n';
    ics += 'DTSTART;TZID=Asia/Seoul:'+dtStart+'\r\n';
    ics += 'DTEND;TZID=Asia/Seoul:'+dtEnd+'\r\n';
    ics += 'SUMMARY:'+ev.summary+'\r\n';
    if(ev.description) ics += 'DESCRIPTION:'+ev.description+'\r\n';
    ics += 'END:VEVENT\r\n';
  });
  ics += 'END:VCALENDAR\r\n';
  downloadBlob(ics, filename, 'text/calendar;charset=utf-8');
}

function downloadBlob(content, filename, mime){
  const blob = new Blob([content], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=> URL.revokeObjectURL(url), 1000);
}

function buildCalButtons(){
  const $btns = $('calBtns');
  if(!$btns) return;
  $btns.innerHTML = '';
  const empKeys = Object.keys(employees);
  empKeys.forEach(empId => {
    const emp = employees[empId];
    const shift = daySchedule[empId];
    if(!shift || !shift.start) return;
    const btn = document.createElement('button');
    btn.className = 'cal-btn';
    btn.innerHTML = '<div class="cdot" style="background:'+(emp.color||'#9090A8')+'"></div>'+emp.name;
    btn.addEventListener('click', ()=>{
      const dk = dateKey(currentDate);
      const events = [{
        date:dk, empId:empId,
        start:shift.start, end:shift.end,
        summary:'근무 - '+emp.name,
        description:'역할: '+(shift.role||'미지정')+', '+shift.start+'~'+shift.end
      }];
      const m = currentDate.getMonth()+1;
      const d = currentDate.getDate();
      generateICS(events, emp.name+'_'+m+'월'+d+'일.ics');
      showToast(emp.name+' 캘린더 다운로드');
    });
    $btns.appendChild(btn);
  });
}

$('calAllBtn').addEventListener('click', ()=>{
  const empKeys = Object.keys(employees);
  const events = [];
  const dk = dateKey(currentDate);
  empKeys.forEach(empId => {
    const emp = employees[empId];
    const shift = daySchedule[empId];
    if(!shift || !shift.start) return;
    events.push({
      date:dk, empId:empId,
      start:shift.start, end:shift.end,
      summary:'근무 - '+emp.name,
      description:'역할: '+(shift.role||'미지정')+', '+shift.start+'~'+shift.end
    });
  });
  if(events.length === 0){ showToast('오늘 근무 없음'); return; }
  const m = currentDate.getMonth()+1;
  const d = currentDate.getDate();
  generateICS(events, '근무표_'+m+'월'+d+'일.ics');
  showToast('전체 캘린더 다운로드');
});

// ============================================================
// Monthly Pay Calculation
// ============================================================
function calcMonthlyPay(empId, year, month){
  const emp = employees[empId];
  if(!emp) return null;
  const rate = emp.hourlyRate || 9860;
  const daysInMonth = new Date(year, month, 0).getDate();
  let totalHours = 0, normalHours = 0, nightHours = 0;
  let weeklyHoursArr = []; // 주별 근무시간 (주휴수당 계산용)

  // 주 시작일(월요일) 기준으로 주 구분
  let currentWeekStart = null;
  let currentWeekHours = 0;

  for(let d = 1; d <= daysInMonth; d++){
    const dk = year+'-'+pad(month)+'-'+pad(d);
    const dateObj = new Date(year, month-1, d);
    const dayOfWeek = dateObj.getDay(); // 0=일, 1=월

    // 주 경계 처리 (월요일 시작)
    if(dayOfWeek === 1 || currentWeekStart === null){
      if(currentWeekStart !== null){
        weeklyHoursArr.push(currentWeekHours);
      }
      currentWeekStart = dk;
      currentWeekHours = 0;
    }

    // 휴무 체크
    if(isDayOff(empId, dk)) continue;

    const sched = lsLoadSchedule(dk);
    if(!sched || !sched[empId] || !sched[empId].start) continue;
    const s = sched[empId];

    // 시간 파싱
    const startParts = s.start.split(':').map(Number);
    const endParts = s.end.split(':').map(Number);
    let startMin = startParts[0]*60 + startParts[1];
    let endMin = endParts[0]*60 + endParts[1];

    // 야간근무 (03:00 등) = 다음날 처리
    if(endMin <= startMin) endMin += 24*60;

    const totalMin = endMin - startMin;
    const dayHours = totalMin / 60;
    totalHours += dayHours;
    currentWeekHours += dayHours;

    // 야간 구간 계산 (22:00~30:00=06:00 다음날)
    // 야간 = 22:00~30:00 (= 22:00~06:00 다음날)
    const nightStart = 22*60;
    const nightEnd = 30*60; // 06:00 다음날

    let nightMin = 0;
    // 구간 겹침 계산
    const overlapStart = Math.max(startMin, nightStart);
    const overlapEnd = Math.min(endMin, nightEnd);
    if(overlapEnd > overlapStart) nightMin += (overlapEnd - overlapStart);

    // 0:00~6:00 구간도 야간 (startMin이 0~6시 사이일 수 있음 — 드물지만)
    // 이미 endMin <= startMin일 때 +24*60 했으므로, 22:00~30:00으로 커버됨

    nightHours += nightMin / 60;
    normalHours += (totalMin - nightMin) / 60;
  }

  // 마지막 주 처리
  if(currentWeekStart !== null){
    weeklyHoursArr.push(currentWeekHours);
  }

  // 주휴수당: 주 15시간 이상 근무 시 1일 유급 (시급 * 8시간)
  let weeklyHolidayPay = 0;
  let qualifiedWeeks = 0;
  weeklyHoursArr.forEach(wh => {
    if(wh >= 15){
      qualifiedWeeks++;
      weeklyHolidayPay += rate * 8;
    }
  });

  const normalPay = Math.round(normalHours * rate);
  const nightPay = Math.round(nightHours * rate * 1.5);

  return {
    totalHours: Math.round(totalHours*100)/100,
    normalHours: Math.round(normalHours*100)/100,
    nightHours: Math.round(nightHours*100)/100,
    normalPay,
    nightPay,
    weeklyHolidayPay: Math.round(weeklyHolidayPay),
    qualifiedWeeks,
    totalPay: normalPay + nightPay + Math.round(weeklyHolidayPay)
  };
}

let lastPayData = null; // BankTotal 전송용 캐시

function initPaySection(){
  const sel = $('payMonthSelect');
  if(!sel) return;
  const now = new Date();
  const thisMonth = now.getFullYear()+'-'+pad(now.getMonth()+1);
  const lastDate = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const lastMonth = lastDate.getFullYear()+'-'+pad(lastDate.getMonth()+1);
  sel.innerHTML = '<option value="'+thisMonth+'">이번달 ('+thisMonth+')</option>'
                + '<option value="'+lastMonth+'">지난달 ('+lastMonth+')</option>';
}

function renderPayTable(){
  const sel = $('payMonthSelect');
  const wrap = $('payTableWrap');
  if(!sel || !wrap) return;
  const ym = sel.value.split('-');
  const year = parseInt(ym[0]), month = parseInt(ym[1]);

  const empKeys = Object.keys(employees);
  const payResults = {};
  let grandTotal = 0;

  empKeys.forEach(id => {
    const result = calcMonthlyPay(id, year, month);
    if(result){
      payResults[id] = result;
      grandTotal += result.totalPay;
    }
  });

  lastPayData = {year, month, results: payResults};

  let html = '<table class="pay-table"><thead><tr>';
  html += '<th>이름</th><th>총시간</th><th>기본급</th><th>야간수당</th><th>주휴수당</th><th>합계</th>';
  html += '</tr></thead><tbody>';

  empKeys.forEach(id => {
    const emp = employees[id];
    const r = payResults[id];
    if(!r) return;
    if(r.totalHours === 0) return; // 근무 없는 직원 스킵
    html += '<tr>';
    html += '<td>'+emp.name+'</td>';
    html += '<td>'+r.totalHours+'h</td>';
    html += '<td>'+r.normalPay.toLocaleString()+'</td>';
    html += '<td>'+r.nightPay.toLocaleString()+'</td>';
    html += '<td>'+r.weeklyHolidayPay.toLocaleString()+'</td>';
    html += '<td>'+r.totalPay.toLocaleString()+'</td>';
    html += '</tr>';
  });

  html += '<tr class="pay-total">';
  html += '<td>합계</td><td></td><td></td><td></td><td></td>';
  html += '<td>'+grandTotal.toLocaleString()+'원</td>';
  html += '</tr>';
  html += '</tbody></table>';

  wrap.innerHTML = html;
}

$('payCalcBtn').addEventListener('click', ()=> renderPayTable());
$('payMonthSelect').addEventListener('change', ()=> renderPayTable());

$('payBankTotalBtn').addEventListener('click', async()=>{
  if(!lastPayData || !lastPayData.results){
    showToast('먼저 계산을 실행하세요');
    return;
  }
  const ym = lastPayData.year+'-'+pad(lastPayData.month);
  const empKeys = Object.keys(lastPayData.results);
  let successCount = 0;

  for(const id of empKeys){
    const emp = employees[id];
    const r = lastPayData.results[id];
    if(!r || r.totalHours === 0) continue;
    const fbPath = FB_BASE+'/banktotal/payroll/'+ym+'/'+emp.name;
    const payload = {
      hours: r.totalHours,
      normalPay: r.normalPay,
      nightPay: r.nightPay,
      weeklyPay: r.weeklyHolidayPay,
      totalPay: r.totalPay,
      updatedAt: Date.now()
    };
    const ok = await fbPut(fbPath, payload);
    if(ok) successCount++;
  }

  if(successCount > 0) showToast('BankTotal 전송 완료 ('+successCount+'명)');
  else showToast('전송할 데이터 없음');
});

initPaySection();

// ============================================================
// Visibility change handler (foreground return)
// ============================================================
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'visible'){
    connectSSE();
    loadData();
    loadWeatherAndSports();
  }
});

// ============================================================
// Close modals on overlay click
// ============================================================
[$shiftModal, $monthModal, $empModal, $empEditModal].forEach(modal => {
  modal.addEventListener('click', (e)=>{
    if(e.target === modal) closeModal(modal);
  });
});

// ============================================================
// Init
// ============================================================
function init(){
  currentDate = new Date();
  updateDateDisplay();
  buildTimeSelects();
  loadAiKey();
  loadDayoffs();
  loadData().then(()=>{
    // Load weather after data + key ready
    setTimeout(()=>{
      loadHourlyWeather().then(()=> renderAll());
      loadWeatherAndSports();
    }, 1500);
  });
  connectSSE();
}

init();

})();
