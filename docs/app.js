(function(){
'use strict';
// === config ===
const FB='https://poskds-4ba60-default-rtdb.asia-southeast1.firebasedatabase.app',FW=FB+'/workschedule_v2';
const OPS_MANUAL_URL=FB+'/packhelper/ops_manual';
const OPS_MANUAL_CANDIDATE_PATH='/packhelper/ops_manual/candidates';
const OPS_MANUAL_CANDIDATE_URL=FB+OPS_MANUAL_CANDIDATE_PATH;
const PREVIEW_QUEUE_PATH='/packhelper/storebot_termux/work_schedule_image_preview_queue';
const CONFIRMED_QUEUE_PATH='/packhelper/storebot_termux/confirmed_schedule_write_requests';
const PREVIEW_QUEUE_URL=FB+PREVIEW_QUEUE_PATH,CONFIRMED_QUEUE_URL=FB+CONFIRMED_QUEUE_PATH;
const INTAKE_QUEUE_KEY='workschedule_intake_queue_v1';
const INTAKE_QUEUE_LIMIT=24;
const CONFIRM_ALLOWED_TARGETS=['/workschedule_v2/overrides','/workschedule_v2/status'];
const READONLY=new URLSearchParams(location.search).get('readonly')==='1';
const TEST_AUTH=new URLSearchParams(location.search).get('testAuth')==='1';
const PREVIEW_ONLY=READONLY||TEST_AUTH;
const AUTH_DEBUG=new URLSearchParams(location.search).get('authDebug')==='1'&&['','localhost','127.0.0.1'].includes(location.hostname);
const AUTH_STD=window.WorkScheduleAuthStdLogic||{};
const AUTH_DEFAULTS={pinSha256:'38083c7ee9121e17401883566a148aa5c2e2d55dc53bc4a94a026517dbff3c6b',storeLat:37.2528352,storeLng:127.4900516,radiusM:150,storageKey:'workschedule_auth_device_v1',allowedDeviceHashes:['d21a6620a9a24efe29e7b6921076e2ccd25c6f9b977154e9f8dfe4653d21bd08','c1aa36e7f5eabff58103bbc86257f3350c222b55c0d883592e438f021721681c'],allowedDevices:{"d21a6620a9a24efe29e7b6921076e2ccd25c6f9b977154e9f8dfe4653d21bd08":{"enabled":true,"label":"사장","updatedAt":"2026-06-26T18:39:12+00:00"},"c1aa36e7f5eabff58103bbc86257f3350c222b55c0d883592e438f021721681c":{"enabled":true,"label":"메인피시","updatedAt":"2026-06-27T11:30:18+00:00","phoneLast4":"0000"}},ipFactorReserved:true};
const AUTH=Object.assign({},AUTH_DEFAULTS,readJsonFromLocalStorage(AUTH_DEFAULTS.storageKey)||{},window.WorkScheduleAuthConfig||{});
const PREVIEW_MODE_LABEL=AUTH_STD.authModeLabel?AUTH_STD.authModeLabel({previewMode:PREVIEW_ONLY,testAuth:TEST_AUTH}):(TEST_AUTH?'테스트 인증':'읽기 전용 검증 모드');
const STD_REQUEST_PREVIEW_KEY='workschedule_std_request_preview_v1';
const DRY_RUN_WRITES_KEY='workschedule_dry_run_writes_v1';
const CONFIRM_ACTION_VALUE_TO_CODE={work_edit:'upsert_shift',day_off:'off',clear_entry:'clear'};
const CONFIRM_ACTION_CODE_TO_VALUE={upsert_shift:'work_edit',off:'day_off',clear:'clear_entry'};
const DSH=6,TLM=1440,DOW_KR=['일','월','화','수','목','금','토'],DOW_EN=['sun','mon','tue','wed','thu','fri','sat'];
const WEATHER_LOCATION={name:'이천시 부발읍',lat:37.2816,lng:127.4892};
const RC={'주방':'#E67E22','차배달':'#4ECDC4','오토바이':'#FFD700'},RL={'주방':'주방','차배달':'차','오토바이':'바이크'};
const CK='#2ECC71',CD='#9090A8',CO='#E74C3C',CB='#1A1A30';
const DE={emp1:{name:'이원규',phone:'',role:'',hourlyRate:9860},emp2:{name:'권연옥',phone:'',role:'',hourlyRate:9860},emp3:{name:'리',phone:'',role:'',hourlyRate:9860},emp4:{name:'히오',phone:'',role:'',hourlyRate:9860},emp9:{name:'사아야',phone:'',role:'',hourlyRate:9860}};
const HOL={'2026-01-01':'신정','2026-01-28':'설날연휴','2026-01-29':'설날','2026-01-30':'설날연휴','2026-03-01':'삼일절','2026-05-05':'어린이날','2026-05-06':'대체공휴일','2026-05-24':'석가탄신일','2026-06-06':'현충일','2026-08-15':'광복절','2026-09-24':'추석연휴','2026-09-25':'추석','2026-09-26':'추석연휴','2026-10-03':'개천절','2026-10-09':'한글날','2026-12-25':'성탄절','2027-01-01':'신정','2027-02-07':'설날연휴','2027-02-08':'설날','2027-02-09':'설날연휴','2027-03-01':'삼일절','2027-05-05':'어린이날','2027-05-13':'석가탄신일','2027-06-06':'현충일','2027-08-15':'광복절','2027-08-16':'대체공휴일','2027-10-03':'개천절','2027-10-04':'추석연휴','2027-10-05':'추석','2027-10-06':'추석연휴','2027-10-09':'한글날','2027-12-25':'성탄절'};
const COLORS=['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#F0A500','#6C5CE7','#A8E6CF','#FF8A5C','#EA80FC','#00BCD4'];
// === store ===
const S={tab:'dashboard',date:new Date(),emp:{},sc:{},wsc:{},msc:{},mst:{},ah:{},xsc:{},xLoading:{},mKey:null,mLoading:false,fix:{},dof:{},cf:{},sst:{},att:{},opsManual:{entries:[],memos:[],loaded:false},intake:{items:[],loaded:false,lastLoadMs:0,lastError:'',draftSource:'text'},confirm:{items:[],selected:'',loading:false,error:'',lastLoadMs:0,renderedSelected:''},sseE:null,sseS:null,gen:0,loaded:false,sec:{}};
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
function empOn(e){return e&&typeof e==='object'&&!e.disabled&&e.active!==false;}
function empIds(){return Object.keys(S.emp).filter(id=>empOn(S.emp[id]));}
function fEmp(n){for(const i of empIds())if(S.emp[i].name===n)return i;return null;}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function loadDryRunWrites(){return readJsonFromLocalStorage(DRY_RUN_WRITES_KEY)||[];}
function saveDryRunWrites(list){try{localStorage.setItem(DRY_RUN_WRITES_KEY,JSON.stringify(list.slice(-24)));}catch(e){}}
function recordDryRunWrite(method,u,d){
  const list=loadDryRunWrites();
  list.push({method,url:u,payload:d,mode:TEST_AUTH?'testAuth':'readonly',atMs:Date.now()});
  saveDryRunWrites(list);
}
function syncPreviewModeUI(){
  const badge=$('authModeBadge'),banner=$('previewBanner'),live=$('confirmLive');
  document.body.classList.toggle('preview-mode',PREVIEW_ONLY);
  if(badge){
    if(PREVIEW_ONLY){badge.hidden=false;badge.textContent=PREVIEW_MODE_LABEL;}
    else{badge.hidden=true;badge.textContent='';}
  }
  if(banner){
    if(PREVIEW_ONLY){
      banner.hidden=false;
      banner.textContent=PREVIEW_MODE_LABEL+' · live write 차단 · post-auth UI 검증';
    }else{
      banner.hidden=true;
      banner.textContent='';
    }
  }
  if(live){
    live.checked=false;
    live.disabled=PREVIEW_ONLY;
  }
}
// v2 resolver: override(state=shift/off/clear) 먼저, clear는 fixed fallback 차단, 그 다음 empId-key fixed.
function isOff(e,d){
  const ov=dayMap(typeof d==='string'?d:dk(d))[e];
  if(ov&&typeof ov==='object'){
    const st=String(ov.state||ov.status||ov.type||'').toLowerCase();
    if(st==='off'||ov.off===true||ov.dayoff===true)return true;
    if(st==='shift'||st==='clear'||ov.clear===true||ov.cancel===true||ov.deleted===true)return false;
  }
  const emp=S.emp[e];if(!emp)return false;
  const fx=S.fix[e];if(!fx)return false;
  const dObj=typeof d==='string'?new Date(d.replace(/-/g,'/')):d,dow=dObj.getDay(),ds=DOW_EN[dow];
  const fov=fx.dayTimes&&fx.dayTimes[ds];
  const kind=fx.kind||fx.type;
  if(kind==='fixed'){if(fx.off&&Array.isArray(fx.off)&&fx.off.includes(dow))return true;return false;}
  if(kind==='weekly'){if(fx.days&&Array.isArray(fx.days)&&!fx.days.includes(ds)&&!fov)return true;return false;}
  return false;
}
function gSt(d,e){return S.sst[d+'_'+e]||'auto';}
function tm12(t){const[h,m]=t.split(':').map(Number);let r=h;if(r<12)r+=24;return(r-12)*60+m;}
function opMin(t){const[h,m]=t.split(':').map(Number);let r=h;if(r<DSH)r+=24;return r*60+m;}
function spanT(s,e){const a=opMin(s);let b=opMin(e);if(b<=a)b+=TLM;return{s:a,e:b};}
function tmDS(t){return opMin(t)-DSH*60;}
function cH(s,e){const p=spanT(s,e);return Math.round((p.e-p.s)/60*10)/10;}
function tPct(t){return Math.max(0,Math.min(100,tmDS(t)/TLM*100));}
function pTM(t){if(!t)return null;const p=t.split(':');return parseInt(p[0])*60+parseInt(p[1]||0);}
function mPct(m,r){return Math.max(0,Math.min(100,(m-r.startMin)/r.rangeMin*100));}
function hLbl(m){return pad(Math.floor(m/60)%24);}
// === api ===
async function fbG(u){try{const r=await fetch(u+'.json');if(!r.ok)throw r.status;return await r.json();}catch(e){console.error('fbG',u,e);return null;}}
async function fbP(u,d){if(PREVIEW_ONLY){recordDryRunWrite('PUT',u,d);return true;}try{const r=await fetch(u+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});if(!r.ok)throw r.status;trackScheduleDeliveryWrite(u);return true;}catch(e){console.error('fbP',e);toast('저장 실패');return false;}}
async function fbPatch(u,d){if(PREVIEW_ONLY){recordDryRunWrite('PATCH',u,d);return true;}try{const r=await fetch(u+'.json',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});if(!r.ok)throw r.status;return true;}catch(e){console.error('fbPatch',u,e);toast('상태 저장 실패');return false;}}
function hasObj(o){return o&&typeof o==='object'&&Object.keys(o).length>0;}
function nowMeta(){const n=Date.now();return{source:'workschedule_web',updated_at:new Date(n).toISOString(),updated_at_ms:n};}
function statusRow(st,extra){return Object.assign(nowMeta(),extra||{},{status:st,state:st,confirmed:st==='confirmed'});}
function shiftRow(s){return Object.assign(nowMeta(),{state:'shift',type:'manual_shift',shift:s,start:s.start,end:s.end,role:s.role||'',work:true,active:true,off:false,dayoff:false,clear:false});}
function offRowData(){return Object.assign(nowMeta(),{state:'off',type:'off',shift:null,start:'',end:'',role:'',work:false,active:false,off:true,dayoff:true,clear:false});}
function clearRow(role){return Object.assign(nowMeta(),{state:'clear',type:'clear',shift:null,start:'',end:'',role:role||'',work:false,active:false,off:false,dayoff:false,clear:true});}
function offIndex(overrides){const out={};if(!overrides||typeof overrides!=='object')return out;Object.keys(overrides).forEach(d=>{const day=overrides[d];if(!day||typeof day!=='object')return;Object.keys(day).forEach(e=>{const r=day[e];if(r&&typeof r==='object'&&(r.state==='off'||r.off===true||r.dayoff===true)){if(!out[e])out[e]={};out[e][d]=true;}});});return out;}
async function cacheAtt(d,a){if(!hasObj(a))return;S.ah[d]=a;if(PREVIEW_ONLY){recordDryRunWrite('PUT',FW+'/attendance/'+d,a);return;}await fbP(FW+'/attendance/'+d,a);}
// === schedule image confirmation queue ===
function safeFbKey(v){return String(v||'item').trim().replace(/[.#$\[\]\/\s]+/g,'_').replace(/^_+|_+$/g,'').slice(0,180)||'item';}
function boolish(v){return v===true||v===1||String(v||'').toLowerCase()==='true'||String(v||'').toLowerCase()==='yes'||String(v||'').toLowerCase()==='1';}
function plainText(v){if(v==null)return'';if(typeof v==='object')return String(v.name||v.employee||v.employee_name||v.employee_id||v.id||'').trim();return String(v).trim();}
function previewRoots(item){const out=[item];['schedule','parsed','parse','parsed_schedule','candidate','candidate_schedule','dry_run_result','write_request','confirmation','proposed_write','request'].forEach(k=>{const v=item&&item[k];if(v&&typeof v==='object')out.push(v);});const dr=item&&item.dry_run_result;if(dr&&dr.request&&typeof dr.request==='object')out.push(dr.request);return out;}
function pickPreviewValue(item,keys){for(const root of previewRoots(item||{})){for(const key of keys){if(root&&root[key]!=null&&root[key]!=='')return root[key];}}return'';}
function previewTs(item){const n=Number(pickPreviewValue(item,['ts_ms','created_at_ms','updated_at_ms','timestamp','event_ts_ms','received_at_ms']));return Number.isFinite(n)?(n<10000000000?n*1000:n):0;}
function fmtTs(ms){if(!ms)return'-';const d=new Date(ms);return (d.getMonth()+1)+'/'+d.getDate()+' '+pad(d.getHours())+':'+pad(d.getMinutes());}
function normalizeConfirmAction(v){const t=String(v||'').trim().toLowerCase();if(t.includes('clear'))return'clear';if(t.includes('off')||t.includes('dayoff'))return'off';if(t.includes('shift')||t.includes('upsert')||t==='work')return'upsert_shift';return'';}
function confirmActionValueFromCode(code){return CONFIRM_ACTION_CODE_TO_VALUE[normalizeConfirmAction(code)]||'work_edit';}
function confirmActionCodeFromValue(value){return CONFIRM_ACTION_VALUE_TO_CODE[String(value||'').trim()]||normalizeConfirmAction(value)||'upsert_shift';}
function previewRows(raw){if(!raw||typeof raw!=='object')return[];return Object.keys(raw).map(key=>({key,item:raw[key]||{}})).filter(r=>r.item&&typeof r.item==='object').sort((a,b)=>previewTs(b.item)-previewTs(a.item)).slice(0,30);}
function previewField(item,key){const map={event_id:['event_id','eventId','source_event_id'],room:['room','room_name','roomName','room_id'],sender:['sender','sender_name','author'],media_kind:['media_kind','mediaKind','kind','attachment_kind'],status_text:['status_text','status','message','summary'],ocr_status:['ocr_status','ocrStatus'],parse_status:['parse_status','parseStatus'],write_status:['write_status','writeStatus']};return plainText(pickPreviewValue(item,map[key]||[key]));}
function previewSafetyFlags(item){
  const flags=[];['no_send','no_live_write','preview_only','execute_live_write','blocked_until_confirmed'].forEach(k=>{if(item&&item[k]!=null)flags.push(k+'='+plainText(item[k]));});
  ['write_status','confirmation_state','safety_status'].forEach(k=>{const v=previewField(item,k);if(v)flags.push(k+'='+v);});
  const targets=pickPreviewValue(item,['target_paths','adapter_allowed_targets','allowed_write_targets']);
  if(Array.isArray(targets))flags.push('targets='+targets.join(','));
  return flags.length?flags:['safety flags 없음'];
}
function shiftTextFromPreview(item){
  const direct=pickPreviewValue(item,['shift','shift_text','time_range','range']);if(typeof direct==='string')return direct.trim();
  if(direct&&typeof direct==='object'&&(direct.start||direct.end))return plainText(direct.start)+'-'+plainText(direct.end);
  const s=plainText(pickPreviewValue(item,['start','start_time'])),e=plainText(pickPreviewValue(item,['end','end_time']));
  return s&&e?s+'-'+e:'';
}
function previewSuggestion(row){
  const item=row?row.item:{},eventId=previewField(item,'event_id')||row?.key||'';
  let action=normalizeConfirmAction(pickPreviewValue(item,['action','schedule_action','write_action','operation']));
  const off=boolish(pickPreviewValue(item,['off','dayoff']));
  const clear=boolish(pickPreviewValue(item,['clear']));
  if(!action)action=clear?'clear':off?'off':'upsert_shift';
  return{source_event_id:eventId,date:plainText(pickPreviewValue(item,['date','work_date','schedule_date']))||dk(S.date),employee:plainText(pickPreviewValue(item,['employee','employee_name','employee_id','name','staff'])),action,shift:shiftTextFromPreview(item),role:plainText(pickPreviewValue(item,['role','job_role'])),off:action==='off'||off,clear:action==='clear'||clear,note:plainText(pickPreviewValue(item,['note','memo','status_text','summary']))};
}
function confirmActionLabel(action){
  return action==='off'?'휴무':action==='clear'?'해제':'근무 추가/수정';
}
function confirmPreviewSummary(row){
  if(!row)return'';
  const s=previewSuggestion(row);
  const parts=[s.date||'날짜 미지정',s.employee||'직원 미지정',confirmActionLabel(s.action)];
  if(s.action==='upsert_shift'&&s.shift)parts.push(s.shift);
  if(s.note)parts.push(s.note);
  return parts.filter(Boolean).join(' · ');
}
function confirmPreviewDetailText(row){
  if(!row)return'확인할 근무표 이미지가 없습니다.';
  const s=previewSuggestion(row);
  const lines=['선택한 이미지 반영 요청',confirmPreviewSummary(row)];
  if(s.shift)lines.push('시간: '+s.shift);
  if(s.role)lines.push('역할: '+s.role);
  if(s.note)lines.push('요청 메모: '+s.note);
  return lines.filter(Boolean).join('\n');
}
function confirmPayloadPreviewText(payload){
  if(!payload||payload.error)return payload&&payload.error?payload.error:'선택한 이미지 반영 요청';
  const lines=['선택한 이미지 반영 요청',payload.date?('날짜: '+payload.date):'',payload.employee?('직원: '+payload.employee):'',confirmActionLabel(payload.action),payload.action==='upsert_shift'&&payload.shift?('시간: '+payload.shift):'',payload.role?('역할: '+payload.role):'',payload.note?('요청 메모: '+payload.note):'',payload.dry_run?'확인 요청 등록':'실제 반영 요청'];
  return lines.filter(Boolean).join('\n');
}
function parseShiftRange(text){const m=String(text||'').trim().match(/^([01]?\d|2[0-3])(?::?([0-5]\d))?\s*(?:시)?\s*[-~–—]\s*([01]?\d|2[0-3])(?::?([0-5]\d))?\s*(?:시)?$/);if(!m)return null;return{start:pad(parseInt(m[1]))+':'+(m[2]||'00'),end:pad(parseInt(m[3]))+':'+(m[4]||'00')};}
function confirmActor(){const a=authStore();return plainText(a&&a.name)||'workschedule_web';}
async function loadConfirmQueue(){
  S.confirm.loading=true;S.confirm.error='';rConfirmPanel();
  const raw=await fbG(PREVIEW_QUEUE_URL);
  S.confirm.loading=false;S.confirm.items=previewRows(raw);S.confirm.lastLoadMs=Date.now();
  if(!S.confirm.items.some(r=>r.key===S.confirm.selected))S.confirm.selected=S.confirm.items[0]?.key||'';
  S.confirm.renderedSelected='';rConfirmPanel();
}
function selectedConfirmRow(){return S.confirm.items.find(r=>r.key===S.confirm.selected)||null;}
function renderConfirmEmployeeOptions(){const dl=$('confirmEmployeeOptions');if(!dl)return;const ids=empIds(),sig=ids.map(id=>id+':'+(S.emp[id]?.name||id)).join('|');if(dl.dataset.sig===sig)return;dl.dataset.sig=sig;dl.innerHTML=ids.map(id=>'<option value="'+esc(S.emp[id].name||id)+'"></option>').join('');}
function setConfirmEditorDisabled(disabled){['confirmDate','confirmEmployee','confirmAction','confirmShift','confirmRole','confirmOff','confirmClear','confirmNote','confirmLive','confirmSend','confirmReject','confirmHold'].forEach(id=>{const el=$(id);if(el)el.disabled=!!disabled;});}
function fillConfirmEditor(row){
  const disabled=!row;setConfirmEditorDisabled(disabled);
  const s=row?previewSuggestion(row):{source_event_id:'',date:'',employee:'',action:'upsert_shift',shift:'',role:'',off:false,clear:false,note:''};
  if($('confirmSource'))$('confirmSource').value=s.source_event_id;
  if($('confirmDate'))$('confirmDate').value=s.date;
  if($('confirmEmployee'))$('confirmEmployee').value=s.employee;
  if($('confirmAction'))$('confirmAction').value=confirmActionValueFromCode(s.action);
  if($('confirmShift'))$('confirmShift').value=s.shift;
  if($('confirmRole'))$('confirmRole').value=s.role;
  if($('confirmOff'))$('confirmOff').checked=!!s.off;
  if($('confirmClear'))$('confirmClear').checked=!!s.clear;
  if($('confirmNote'))$('confirmNote').value=s.note;
  if($('confirmLive'))$('confirmLive').checked=false;
  updateConfirmActionFields();
}
function confirmFormPayload(quiet){
  const row=selectedConfirmRow(),now=Date.now(),source=plainText($('confirmSource')?.value)||row?.key||'',date=plainText($('confirmDate')?.value),employee=plainText($('confirmEmployee')?.value),action=confirmActionCodeFromValue($('confirmAction')?.value),shift=plainText($('confirmShift')?.value),role=plainText($('confirmRole')?.value),note=plainText($('confirmNote')?.value),live=PREVIEW_ONLY?false:!!$('confirmLive')?.checked;
  function bad(m){if(!quiet)toast(m);return{error:m};}
  if(!row)return bad('확인 대기 이미지를 선택해주세요');
  if(!source)return bad('확인 항목 정보가 없습니다');
  if(!date)return bad('날짜를 입력해주세요');
  if(!employee)return bad('직원을 입력해주세요');
  const reqId='confirmed_schedule_write_request_'+safeFbKey(source)+'_'+now;
  const dryRunSource=row.item&&typeof row.item.dry_run_result==='object'?row.item.dry_run_result:{ok:true,source:'workschedule_confirmation_ui',generated_from_preview:true};
  if(dryRunSource.ok===false)return bad('dry_run_result가 실패 상태입니다');
  const payload={request_id:reqId,request_type:'confirmed_schedule_write_request',actor:confirmActor(),source_event_id:source,date,employee,action,confirmed_at_ms:now,queued_at_ms:now,dry_run:PREVIEW_ONLY||!live,execute_live_write:!PREVIEW_ONLY&&live,dry_run_result:Object.assign({},dryRunSource,{reviewed_at_ms:now,reviewed_by:confirmActor(),preview_event_id:source}),target_paths:CONFIRM_ALLOWED_TARGETS,adapter_allowed_targets:CONFIRM_ALLOWED_TARGETS,preview_queue_path:PREVIEW_QUEUE_PATH,confirmation_state:'confirmed',confirmed_via:'workschedule_web_confirmation_panel'};
  if(PREVIEW_ONLY||!live)payload.no_live_write=true;
  if(note)payload.note=note;
  if(action==='upsert_shift'){
    if(!shift)return bad('근무 시간을 입력해주세요');
    const p=parseShiftRange(shift);if(!p)return bad('근무 시간은 10:00-18:00 형식으로 입력해주세요');
    payload.shift=shift;payload.start=p.start;payload.end=p.end;
    if(role)payload.role=role;
  }else if(action==='off'){payload.off=true;}
  else if(action==='clear'){payload.clear=true;}
  return payload;
}
function renderConfirmPayloadPreview(){const el=$('confirmPayloadPreview');if(!el)return;const p=confirmFormPayload(true);el.textContent=confirmPayloadPreviewText(p);}
function updateConfirmActionFields(){
  const action=confirmActionCodeFromValue($('confirmAction')?.value),isShift=action==='upsert_shift',isOff=action==='off',isClear=action==='clear';
  if($('confirmShift'))$('confirmShift').disabled=!isShift||!selectedConfirmRow();
  if($('confirmRole'))$('confirmRole').disabled=!isShift||!selectedConfirmRow();
  if($('confirmOff')){$('confirmOff').checked=isOff;$('confirmOff').disabled=!isOff||!selectedConfirmRow();}
  if($('confirmClear')){$('confirmClear').checked=isClear;$('confirmClear').disabled=!isClear||!selectedConfirmRow();}
  if($('confirmLive')){$('confirmLive').disabled=PREVIEW_ONLY||!selectedConfirmRow();if(PREVIEW_ONLY)$('confirmLive').checked=false;}
  renderConfirmPayloadPreview();
}
function rConfirmPanel(){
  renderConfirmEmployeeOptions();
  const status=$('confirmQueueStatus'),list=$('confirmList');if(status){status.textContent=S.confirm.loading?'카톡 이미지 확인 대기 불러오는 중':S.confirm.items.length?'확인 대기 '+S.confirm.items.length+'건':'카톡 이미지 확인 대기 없음';}
  if(list){
    if(S.confirm.loading&&!S.confirm.items.length)list.innerHTML='<div class="confirm-empty">불러오는 중...</div>';
    else if(!S.confirm.items.length)list.innerHTML='<div class="confirm-empty">확인할 근무표 이미지가 없습니다.</div>';
    else list.innerHTML=S.confirm.items.map(row=>{const sel=row.key===S.confirm.selected,summary=esc(confirmPreviewSummary(row)||'반영 요청'),detail=esc(confirmPreviewDetailText(row).split(String.fromCharCode(10)).slice(1,3).join(' · '));return'<button type="button" class="confirm-item'+(sel?' active':'')+'" data-confirm-key="'+esc(row.key)+'"><strong>'+summary+'</strong><em>'+detail+'</em><small>선택한 이미지 확인</small></button>';}).join('');
  }
  const row=selectedConfirmRow(),detail=$('confirmPreviewDetail');
  if(detail){detail.textContent=confirmPreviewDetailText(row);}
  if(S.confirm.renderedSelected!==S.confirm.selected){S.confirm.renderedSelected=S.confirm.selected;fillConfirmEditor(row);}else renderConfirmPayloadPreview();
}
async function markPreviewReview(decision,payload){
  const row=selectedConfirmRow();if(!row)return false;
  const now=Date.now(),note=plainText($('confirmNote')?.value);
  const patch={review_status:decision,review_decision:decision,reviewed_at_ms:now,reviewed_by:confirmActor(),review_note:note};
  if(payload){patch.confirmed_request_id=payload.request_id;patch.confirmed_request_path=CONFIRMED_QUEUE_PATH+'/'+safeFbKey(payload.request_id);patch.live_requested=!!payload.execute_live_write;patch.dry_run=!!payload.dry_run;}
  return await fbPatch(PREVIEW_QUEUE_URL+'/'+safeFbKey(row.key),patch);
}
async function enqueueConfirmedScheduleRequest(){
  let payload=confirmFormPayload(false);if(payload.error)return;
  if(payload.execute_live_write&&!confirm('실제 근무표 반영 요청을 등록합니다. 계속할까요?'))return;
  const btn=$('confirmSend');if(btn)btn.disabled=true;
  try{
    const ok=await fbP(CONFIRMED_QUEUE_URL+'/'+safeFbKey(payload.request_id),payload);
    if(!ok)return;
    await markPreviewReview(payload.execute_live_write?'confirmed_live_requested':'confirmed_dry_run_requested',payload);
    toast(payload.execute_live_write?'실제 반영 요청 등록됨':'선택한 이미지 반영 요청 등록됨');
    loadConfirmQueue();
  }finally{if(btn)btn.disabled=false;}
}
async function decideConfirmPreview(decision){
  const row=selectedConfirmRow();if(!row){toast('확인 대기 이미지를 선택해주세요');return;}
  if(decision==='rejected'&&!confirm('이 이미지를 반려로 표시할까요?'))return;
  const ok=await markPreviewReview(decision,null);
  if(ok){toast(decision==='hold'?'보류 표시됨':'반려 표시됨');loadConfirmQueue();}
}
// === schedule delivery ===
const DL=window.WorkScheduleDeliveryLogic||{IDLE_MS:300000,PERIODIC_MS:21600000,computeDeliveryState:x=>Object.assign({targetKind:'latest_work_schedule',due:false,nextDueAtMs:null},x||{}),markScheduleChanged:(s,n)=>Object.assign({},s||{},{targetKind:'latest_work_schedule',lastChangedAtMs:n==null?Date.now():n,lastPreparedAtMs:null}),markShareIntentQueued:(s,n)=>Object.assign({},s||{},{targetKind:'latest_work_schedule',lastPreparedAtMs:n==null?Date.now():n,lastSentAtMs:n==null?Date.now():n})};
const DELIVERY_KEY='workschedule_delivery_v1';
let deliveryTimer=null;
function readDeliveryStore(){try{return JSON.parse(localStorage.getItem(DELIVERY_KEY)||'{}')||{};}catch(e){return{};}}
function writeDeliveryStore(s){try{localStorage.setItem(DELIVERY_KEY,JSON.stringify(Object.assign({targetKind:'latest_work_schedule'},s||{})));}catch(e){}}
function isScheduleDeliveryWrite(u){return u&&u.indexOf(FW+'/attendance')<0&&(u.indexOf(FW+'/overrides/')===0||u.indexOf(FW+'/status/')===0||u.indexOf(FW+'/fixed_schedules')===0);}
function markScheduleDeliveryChanged(){writeDeliveryStore(DL.markScheduleChanged(readDeliveryStore(),Date.now()));renderDeliveryPanel();queueDeliveryRender();}
function trackScheduleDeliveryWrite(u){if(!isScheduleDeliveryWrite(u))return;markScheduleDeliveryChanged();}
function deliveryState(now){return DL.computeDeliveryState(Object.assign({targetKind:'latest_work_schedule',nowMs:now||Date.now()},readDeliveryStore()));}
function fmtClock(ms){if(!ms)return'-';const d=new Date(ms);return pad(d.getHours())+':'+pad(d.getMinutes());}
function collectSupportGaps(){const gaps=[];if(!S.supportWeather)gaps.push('weather');if(!S.supportNews)gaps.push('news');return gaps;}
function ensureCliPatchCandidate(gaps,reason){if(!gaps.length)return null;const st=readDeliveryStore(),n=Date.now();st.cliPatchCandidate={lane:'workschedule_delivery_cli_patch',mode:'no_live_no_write',targetKind:'latest_work_schedule',reason:reason||'pre_share_support_gap',gaps:gaps.slice(),createdAtMs:n};writeDeliveryStore(st);return st.cliPatchCandidate;}
function renderDeliveryPanel(){
  const stEl=$('deliveryStatus'),cliEl=$('deliveryCliStatus'),btn=$('deliveryShareBtn');if(!stEl||!cliEl)return;
  const d=deliveryState(),gaps=collectSupportGaps();
  stEl.classList.remove('ready','waiting');cliEl.classList.toggle('needs-cli',!!gaps.length);
  if(d.due){stEl.textContent=(d.dueReason==='periodic'?'6시간 주기 도래':'5분 무작업 완료')+' - 최신 근무표 이미지 준비';stEl.classList.add('ready');ensureCliPatchCandidate(gaps,d.dueReason);}
  else if(d.nextDueAtMs){stEl.textContent='최신 근무표 공유 대기 - 다음 판단 '+fmtClock(d.nextDueAtMs);stEl.classList.add('waiting');}
  else{stEl.textContent='최신 근무표 변경 대기';}
  cliEl.textContent=gaps.length?'보조정보 정리 대기: '+gaps.map(x=>x==='weather'?'날씨':'뉴스').join(', '):'보조정보 준비됨';
  if(btn)btn.disabled=false;
}
function queueDeliveryRender(){clearTimeout(deliveryTimer);const d=deliveryState(),now=Date.now(),wait=d.nextDueAtMs?Math.max(1000,Math.min(60000,d.nextDueAtMs-now)):60000;deliveryTimer=setTimeout(()=>{renderDeliveryPanel();queueDeliveryRender();},wait);}
function scheduleRowsForImage(){const dd=dk(S.date);return empIds().map(id=>{const emp=S.emp[id]||{},off=isOff(id,dd),sh=off?null:getShift(dd,id);return{id:id,name:emp.name||id,color:emp.color||'#9090A8',off:off,shift:sh};});}
function makeCompositeScheduleImage(){
  const rows=scheduleRowsForImage(),gaps=collectSupportGaps(),w=1080,rowH=78,h=270+rows.length*rowH+90,c=document.createElement('canvas'),ctx=c.getContext('2d'),dd=dk(S.date);
  c.width=w;c.height=h;ctx.fillStyle='#1A1A30';ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#E0E0EC';ctx.font='700 48px sans-serif';ctx.fillText('최신 근무표 종합 이미지',52,76);
  ctx.fillStyle='#9090A8';ctx.font='28px sans-serif';ctx.fillText(dd+' ('+DOW_KR[S.date.getDay()]+') / 웹 이미지 출력 후 대상 방 확인',52,118);
  ctx.fillStyle='#242444';ctx.fillRect(52,150,w-104,58);ctx.fillStyle='#FFD700';ctx.font='700 28px sans-serif';ctx.fillText('자동 카카오 전송 없음 · 사용자가 이미지 대상 직접 선택',78,187);
  let y=235;rows.forEach(r=>{ctx.fillStyle='#242444';ctx.fillRect(52,y,w-104,rowH-12);ctx.fillStyle=r.color;ctx.fillRect(52,y,10,rowH-12);ctx.fillStyle='#FFFFFF';ctx.font='700 30px sans-serif';ctx.fillText(r.name,82,y+42);ctx.font='26px sans-serif';ctx.fillStyle=r.off?'#E74C3C':'#E0E0EC';let line=r.off?'휴무':(r.shift&&r.shift.start?r.shift.start+' ~ '+r.shift.end+'  '+(r.shift.role||'')+'  '+cH(r.shift.start,r.shift.end)+'h':'미입력');ctx.fillText(line,320,y+42);y+=rowH;});
  ctx.fillStyle='#1e1e3a';ctx.fillRect(52,y+8,w-104,70);ctx.fillStyle=gaps.length?'#E67E22':'#2ECC71';ctx.font='700 26px sans-serif';ctx.fillText(gaps.length?'보조정보 정리 대기: '+gaps.map(x=>x==='weather'?'날씨':'뉴스').join(', '):'보조정보 준비됨',78,y+51);
  return c.toDataURL('image/png');
}
function downloadCompositeImage(dataUrl,fileName){
  const a=document.createElement('a');a.href=dataUrl;a.download=fileName;document.body.appendChild(a);a.click();document.body.removeChild(a);toast('PNG 이미지 파일 준비됨');
}
async function outputCompositeImage(dataUrl,fileName){
  if(navigator.canShare&&typeof File==='function'){
    try{
      const blob=await(await fetch(dataUrl)).blob(),file=new File([blob],fileName,{type:'image/png'});
      if(navigator.canShare({files:[file]})){await navigator.share({files:[file],title:'WorkSchedule 근무표',text:'최신 근무표 이미지'});toast('이미지 공유 요청됨');return true;}
    }catch(e){if(e&&e.name==='AbortError')return false;console.warn('image share fallback',e);}
  }
  downloadCompositeImage(dataUrl,fileName);return true;
}
async function queueCompositeShare(reason){
  const gaps=collectSupportGaps();ensureCliPatchCandidate(gaps,reason||'manual_share');
  const msg='브라우저 공유 메뉴 또는 PNG 파일로 이미지를 출력합니다.\n카카오 자동 전송은 하지 않습니다.'+(gaps.length?'\n\n날씨/뉴스 보조정보가 비어 있어 자동 정리 대기 상태입니다. 실제 발송 전 보강 여부를 확인하세요.':'');
  if(!confirm(msg))return;
  const dataUrl=makeCompositeScheduleImage();
  if(!await outputCompositeImage(dataUrl,'workschedule_'+dk(S.date)+'.png')){toast('이미지 출력 취소됨');return;}
  writeDeliveryStore(DL.markShareIntentQueued(readDeliveryStore(),Date.now()));renderDeliveryPanel();queueDeliveryRender();
}
// === front auth gate ===
function authMsg(m,cls){const el=$('authMsg');if(!el)return;el.textContent=m;el.className='auth-msg '+(cls||'');}
function authStore(){try{return JSON.parse(localStorage.getItem(AUTH.storageKey)||'null');}catch(e){return null;}}
function readJsonFromLocalStorage(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch(e){return null;}}
async function sha256(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');}
function ensureAuthDevice(name){let d=authStore();if(!d||!d.token){d={token:(crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random()),name:name||'단말',createdAt:Date.now()};localStorage.setItem(AUTH.storageKey,JSON.stringify(d));return d;}if(name&&d.name!==name){d=Object.assign({},d,{name});localStorage.setItem(AUTH.storageKey,JSON.stringify(d));}return d;}
async function deviceHashText(device){try{return await sha256(device.token);}catch(e){return '생성됨';}}
async function hasAllowedAuthDevice(device){const hashes=AUTH.allowedDeviceHashes||[];if(!device||!device.token||!hashes.length)return false;return hashes.includes(await sha256(device.token));}
function gpsReady(){return typeof AUTH.storeLat==='number'&&typeof AUTH.storeLng==='number';}
function distM(a,b,c,d){return AUTH_STD.distanceMeters?AUTH_STD.distanceMeters(a,b,c,d):(()=>{const R=6371000,to=x=>x*Math.PI/180,la1=to(a),la2=to(c),dl=to(c-a),dn=to(d-b),q=Math.sin(dl/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dn/2)**2;return 2*R*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));})();}
function getPos(){return new Promise((res,rej)=>{if(!navigator.geolocation){rej(new Error('GPS 사용 불가'));return;}navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true,timeout:10000,maximumAge:60000});});}
function hasTrustedIpFactor(){return false;} // Static clients cannot trust forwarded IP headers; reserve this for server/hosting enforcement.
async function verifyGps(){
  if(AUTH_DEBUG)return 'debug';
  const p=await getPos(),res=AUTH_STD.verifyGpsPosition?AUTH_STD.verifyGpsPosition(p,AUTH):null;
  if(res&&res.error)throw new Error(res.error);
  if(!res){if(!gpsReady())throw new Error('매장 GPS 기준 설정 필요');const m=distM(p.coords.latitude,p.coords.longitude,AUTH.storeLat,AUTH.storeLng);if(m>AUTH.radiusM)throw new Error('매장 반경 밖입니다 ('+Math.round(m)+'m)');}
  return 'gps';
}
async function verifyPin(pin){
  if(AUTH_STD.verifyPinText){
    const res=await AUTH_STD.verifyPinText(pin,AUTH,async text=>{
      if(!crypto.subtle)throw new Error('이 브라우저는 PIN 검증을 지원하지 않습니다');
      return await sha256(text);
    });
    if(res&&res.error)throw new Error(res.error);
    return true;
  }
  if(!AUTH.pinSha256)throw new Error('PIN 해시 설정 필요');
  if(!pin)throw new Error('PIN을 입력해주세요');
  if(!crypto.subtle)throw new Error('이 브라우저는 PIN 검증을 지원하지 않습니다');
  if(await sha256(pin)!==AUTH.pinSha256)throw new Error('PIN이 맞지 않습니다');
  return true;
}
async function verifyAuthFactor(deviceName){
  const device=ensureAuthDevice(deviceName);
  if(await hasAllowedAuthDevice(device))return 'device';
  if(hasTrustedIpFactor())return 'ip';
  return await verifyGps();
}
function authFactorLabel(f){return AUTH_STD.authFactorLabel?AUTH_STD.authFactorLabel(f):(f==='device'?'등록 단말':f==='gps'?'GPS':f==='debug'?'개발 GPS 우회':f==='ip'?'허용 IP':'factor');}
function renderAuthStatus(){
  const el=$('authStatus');if(!el)return;
  const device=authStore(),rows=AUTH_STD.authStatusRows?AUTH_STD.authStatusRows(AUTH,device,{previewMode:PREVIEW_ONLY,testAuth:TEST_AUTH}):[
    {label:'PIN',value:AUTH.pinSha256?'설정됨':'미설정'},
    {label:'위치',value:gpsReady()?('매장 좌표 · 반경 '+Math.round(Number(AUTH.radiusM)||150)+'m'):'미설정'},
    {label:'단말',value:device&&device.token?'저장됨':'미설정'}
  ];
  el.innerHTML=rows.map(row=>'<div class="auth-status-item"><span class="label">'+esc(row.label)+'</span><span class="value">'+esc(row.value)+'</span></div>').join('');
}
function unlockApp(start){document.body.classList.remove('auth-locked');start();}
function initAuthGate(start){
  const btn=$('authBtn'),pin=$('authPin'),dev=$('authDevice'),stored=authStore();
  if(stored?.name&&dev)dev.value=stored.name;
  const run=async()=>{
    btn.disabled=true;
    authMsg(PREVIEW_ONLY?'검증 중...':'인증 확인 중...');
    try{
      if(PREVIEW_ONLY){
        ensureAuthDevice(dev.value.trim()||'검증 단말');
        pin.value='';
        renderAuthStatus();
        authMsg(PREVIEW_MODE_LABEL+' · PIN/GPS는 모의 상태입니다.','ok');
        unlockApp(start);
        return;
      }
      await verifyPin(pin.value);
      const factor=await verifyAuthFactor(dev.value.trim());
      pin.value='';
      authMsg('인증됨 ('+authFactorLabel(factor)+')','ok');
      unlockApp(start);
    }catch(e){
      authMsg(e.message||'인증 실패','err');
      pin.value='';
    }finally{btn.disabled=false;}
  };
  btn.addEventListener('click',run);pin.addEventListener('keydown',e=>{if(e.key==='Enter')run();});
  const device=ensureAuthDevice(dev?.value?.trim()||'단말');
  renderAuthStatus();
  deviceHashText(device).then(id=>{
    renderAuthStatus();
    if(PREVIEW_ONLY)authMsg(PREVIEW_MODE_LABEL+' · 단말ID '+id+' · live write 차단','ok');
    else if(AUTH_DEBUG)authMsg('개발 검증 모드: PIN은 필요, GPS만 우회. 단말ID '+id,'ok');
    else authMsg('PIN은 매번 입력하고, 등록 단말 또는 매장 반경 GPS로 확인합니다. 단말 상태는 저장됨으로 유지됩니다.');
  });
  dev.addEventListener('input',()=>renderAuthStatus());
  syncPreviewModeUI();
  if(pin)pin.focus();
}
// === getFixedScheduleForDate ===
function canonicalFixedSchedule(empId){
  return S.fix[empId]||null;
}
function gFix(empId,dateObj){
  const d=typeof dateObj==='string'?new Date(dateObj.replace(/-/g,'/')):dateObj,dow=d.getDay(),fs=canonicalFixedSchedule(empId);
  if(!fs)return null;
  const ds=DOW_EN[dow],ov=fs.dayTimes&&fs.dayTimes[ds];
  const start=ov&&ov.start?ov.start:fs.start,end=ov&&ov.end?ov.end:fs.end,role=ov&&ov.role?ov.role:(fs.role||'');
  if(!start&&!end)return null;
  const kind=fs.kind||fs.type||'fixed';
  if(kind==='fixed'){if(fs.off&&Array.isArray(fs.off)&&fs.off.includes(dow))return null;return{start,end,role,type:'fixed'};}
  if(kind==='weekly'){return((Array.isArray(fs.days)&&fs.days.includes(ds))||!!ov)?{start,end,role,type:'fixed'}:null;}
  return null;
}
function gFixC(e){return gFix(e,S.date);}
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
  try{S.sseS=new EventSource(FW+'/overrides/'+d+'.json');
    let seenInitial=false;
    S.sseS.addEventListener('put',function(e){if(g!==S.gen){S.sseS.close();return;}if(dk(S.date)!==exDk){S.sseS.close();return;}try{const isInitial=!seenInitial;seenInitial=true;const p=JSON.parse(e.data);if(p.path==='/'){S.sc=p.data||{};}else{const k=p.path.replace(/^\//,'').split('/')[0];if(p.data===null)delete S.sc[k];else if(p.path.split('/').filter(Boolean).length===1)S.sc[k]=p.data;else{if(!S.sc[k])S.sc[k]={};const s=p.path.replace(/^\//,'').split('/')[1];if(p.data===null)delete S.sc[k][s];else S.sc[k][s]=p.data;}}renderAll();if(!isInitial)markScheduleDeliveryChanged();}catch(x){}});
    S.sseS.addEventListener('patch',function(e){if(g!==S.gen){S.sseS.close();return;}if(dk(S.date)!==exDk){S.sseS.close();return;}try{seenInitial=true;const p=JSON.parse(e.data),pts=p.path.replace(/^\//,'').split('/').filter(Boolean);if(!pts.length&&p.data)Object.keys(p.data).forEach(k=>{S.sc[k]=Object.assign(S.sc[k]||{},p.data[k]);});else if(pts.length===1&&p.data)S.sc[pts[0]]=Object.assign(S.sc[pts[0]]||{},p.data);renderAll();markScheduleDeliveryChanged();}catch(x){}});
    S.sseS.onerror=function(){if(g!==S.gen)return;try{S.sseS.close();}catch(e){} S.sseS=null;setTimeout(()=>{if(g===S.gen)conSS(g);},3000);};
  }catch(e){}
}
// === data loading ===
async function loadData(){
  const d=dk(S.date);$('loader').style.display='flex';$('tabContent').style.display='none';
  try{const[eD,sD,fD,oD,tD,aD,omD]=await Promise.all([fbG(FW+'/employees'),fbG(FW+'/overrides/'+d),fbG(FW+'/fixed_schedules'),fbG(FW+'/overrides'),fbG(FW+'/status/'+d),fbG(FW+'/attendance/'+d),fbG(OPS_MANUAL_URL)]);
    if(eD&&Object.keys(eD).length){S.emp=eD;}else{S.emp=JSON.parse(JSON.stringify(DE));if(!PREVIEW_ONLY)fbP(FW+'/employees',S.emp);}
    if(sD){S.sc=sD;}else S.sc={};
    S.fix=fD||{};if(oD)S.dof=offIndex(oD);
    if(tD)Object.keys(tD).forEach(e=>{const row=tD[e];if(row&&typeof row==='object')S.sst[d+'_'+e]=row.status||row.state||'auto';else if(row)S.sst[d+'_'+e]=row;else delete S.sst[d+'_'+e];});
    S.att=hasObj(aD)?aD:{};if(hasObj(S.att))S.ah[d]=S.att;
    if(window.WorkScheduleManualLogic)S.opsManual=Object.assign({loaded:true},window.WorkScheduleManualLogic.normalizeFirebaseManualPayload(omD,{sourcePath:'/packhelper/ops_manual'}));
  }catch(e){console.error('loadData',e);}
  S.loaded=true;genDO();autoFix(d);$('loader').style.display='none';$('tabContent').style.display='';renderAll();loadWk();
}
async function loadWk(){
  const m=getMon(S.date),ks=[],sp=[],tp=[],ap=[];
  for(let i=0;i<7;i++){const d=new Date(m);d.setDate(d.getDate()+i);const k=dk(d);ks.push(k);sp.push(fbG(FW+'/overrides/'+k));tp.push(fbG(FW+'/status/'+k));ap.push(fbG(FW+'/attendance/'+k));}
  const[sR,tR,aR]=await Promise.all([Promise.all(sp),Promise.all(tp),Promise.all(ap)]);S.wsc={};
  ks.forEach((k,i)=>{S.wsc[k]=sR[i]||{};const f=tR[i];if(f)Object.keys(f).forEach(e=>{if(f[e])S.sst[k+'_'+e]=f[e];else delete S.sst[k+'_'+e];});});
  ks.forEach((k,i)=>{if(hasObj(aR[i]))S.ah[k]=aR[i];});
  renderWeek();renderDS();renderAll(true);
}
function autoFix(d){
  empIds().forEach(e=>{if(gFix(e,d)&&!S.sst[d+'_'+e])S.sst[d+'_'+e]='confirmed';});
}
// genDO (generateAutoDayoffs) 제거 — 휴무는 isOff() 가 fixed.off 즉석 해석
function genDO(){/* no-op: isOff() 즉석 해석으로 대체 */}
// === categorize ===
function catE(d){
  const ek=empIds(),woC={},whM={},mn=getMon(S.date);
  for(let i=0;i<7;i++){const x=new Date(mn);x.setDate(x.getDate()+i);const wk=dk(x);
    ek.forEach(id=>{if(isOff(id,wk))woC[id]=(woC[id]||0)+1;const s=getShift(wk,id);if(s&&s.start&&s.end)whM[id]=(whM[id]||0)+cH(s.start,s.end);});}
  const w=[],off=[],mt=[];let tH=0,cc=0,uc=0;
  ek.forEach(id=>{const emp=S.emp[id];if(isOff(id,d)){off.push({id,emp});return;}const sh=getShift(d,id);
    if(sh&&sh.start){const st=gSt(d,id),h=cH(sh.start,sh.end);tH+=h;st==='confirmed'?cc++:uc++;w.push({id,emp,shift:sh,status:st,hours:h});}else mt.push({id,emp});});
  w.sort((a,b)=>tmDS(a.shift.start)-tmDS(b.shift.start));
  return{ek,w,off,mt,tH,cc,uc,woC,whM};
}
function gRange(w){
  if(!w||!w.length)return{gs:DSH,gh:12,startMin:DSH*60,rangeMin:12*60};
  let mn=Infinity,mx=-Infinity;
  w.forEach(x=>{if(!x.shift||!x.shift.start||!x.shift.end)return;const p=spanT(x.shift.start,x.shift.end);if(p.s<mn)mn=p.s;if(p.e>mx)mx=p.e;});
  if(!isFinite(mn)||!isFinite(mx)||mx<=mn)return{gs:DSH,gh:12,startMin:DSH*60,rangeMin:12*60};
  return{gs:mn/60,gh:(mx-mn)/60,startMin:mn,rangeMin:mx-mn};
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
function doR(){try{updD();}catch(e){}try{rIntakePanel();}catch(e){}try{rStdPanel();}catch(e){}try{rConfirmPanel();}catch(e){}try{rBrief();}catch(e){}try{rTab();}catch(e){}try{renderDS();}catch(e){}if($('weekBody').classList.contains('open'))try{renderWeek();}catch(e){}}
function updD(){$('dateDisp').textContent=(S.date.getMonth()+1)+'/'+S.date.getDate()+' '+DOW_KR[S.date.getDay()];}
// === common builders ===
function dayMap(k){return k===dk(S.date)?S.sc:(S.wsc[k]||S.msc[k]||S.xsc[k]||{});}
function dateObjFromKey(k){const p=String(k||'').split('-');return new Date(+p[0],+p[1]-1,+p[2]);}
function explicitShift(v){if(!v||typeof v!=='object')return null;const st=String(v.state||v.status||v.type||'').toLowerCase();if(st&&st!=='shift'&&st!=='manual_shift')return null;const s=v.shift&&typeof v.shift==='object'?v.shift:v;return(s.start||s.end)?{start:s.start||'',end:s.end||'',role:s.role||v.role||''}:null;}
function getShift(k,eid){
  const m=dayMap(k),raw=m?m[eid]:null,ex=explicitShift(raw);
  if(ex)return ex;
  if(raw&&typeof raw==='object'){const st=String(raw.state||raw.status||raw.type||'').toLowerCase();if(st==='clear'||raw.clear===true)return null;}
  if(isOff(eid,k))return null;
  const emp=S.emp[eid],fx=emp?gFix(eid,dateObjFromKey(k)):null;
  return fx&&fx.start?{start:fx.start,end:fx.end,role:fx.role}:null;
}
function fmtH(v){return (Math.round(v*10)/10).toFixed(1).replace('.0','');}
function monthKey(d){return d.getFullYear()+'-'+pad(d.getMonth()+1);}
function getAtt(k,eid){const m=k===dk(S.date)?(hasObj(S.att)?S.att:S.ah[k]):S.ah[k];return m?m[eid]:null;}
function attStats(days,eid){
  let daysWith=0,start=0,end=0;days.forEach(k=>{const a=getAtt(k,eid);if(!a)return;if(a.actual_start){start++;daysWith++;}if(a.actual_end)end++;});
  return{days:daysWith,start,end};
}
function dayStats(k){
  const ek=empIds(),roles={},work=[],off=[],missing=[];let hours=0,confirmed=0,unconfirmed=0,attStart=0,attEnd=0;
  ek.forEach(id=>{const emp=S.emp[id];if(!emp)return;if(isOff(id,k)){off.push({id,emp});return;}const sh=getShift(k,id);
    if(sh&&sh.start&&sh.end){const h=cH(sh.start,sh.end),st=gSt(k,id);hours+=h;st==='confirmed'?confirmed++:unconfirmed++;work.push({id,emp,shift:sh,status:st,hours:h});
      (sh.role?sh.role.split(',').filter(Boolean):['미지정']).forEach(r=>{roles[r]=(roles[r]||0)+1;});}
    else missing.push({id,emp});const a=getAtt(k,id);if(a&&a.actual_start)attStart++;if(a&&a.actual_end)attEnd++;});
  work.sort((a,b)=>tmDS(a.shift.start)-tmDS(b.shift.start));
  return{ek,work,off,missing,hours,confirmed,unconfirmed,roles,attStart,attEnd};
}
async function loadDayCache(k){
  if(S.xsc[k]||S.wsc[k]||S.msc[k]||S.xLoading[k])return;S.xLoading[k]=true;
  try{const[sc,st,ah]=await Promise.all([fbG(FW+'/overrides/'+k),fbG(FW+'/status/'+k),fbG(FW+'/attendance/'+k)]);S.xsc[k]=sc||{};if(hasObj(ah))S.ah[k]=ah;if(st)Object.keys(st).forEach(e=>{const row=st[e];row?S.sst[k+'_'+e]=(typeof row==='object'?(row.status||row.state||'auto'):row):delete S.sst[k+'_'+e];});}
  catch(e){console.error('loadDayCache',e);}
  delete S.xLoading[k];renderAll(true);
}
function roleChips(roles){
  const ks=Object.keys(roles).sort((a,b)=>roles[b]-roles[a]);
  if(!ks.length)return'<span class="info-chip" style="color:#707088;">역할 없음</span>';
  return ks.map(r=>'<span class="info-chip" style="border-color:'+(RC[r]||'#9090A8')+'55;color:'+(RC[r]||'#E0E0EC')+';">'+esc(r)+' '+roles[r]+'명</span>').join('');
}
function statCard(v,l,c){return'<div class="metric-card"><div class="value" style="color:'+c+';">'+v+'</div><div class="label">'+l+'</div></div>';}
function miniNames(items,empty){return items.length?items.map(x=>'<span class="info-chip">'+esc(x.emp.name)+'</span>').join(''):'<span class="info-chip" style="color:#707088;">'+empty+'</span>';}
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
  if(isT&&nP!==null)h+='<div style="position:absolute;left:'+nP+'%;top:0;bottom:0;width:1px;background:#FFD70066;z-index:2;"></div>';
  return h+'<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.65rem;color:#707088;">미입력</div></div><span data-action="confirmOff" data-oid="'+e.id+'" style="font-size:.65rem;padding:4px 7px;border-radius:5px;background:#E74C3C33;color:#E74C3C;cursor:pointer;font-weight:700;">휴확</span></div>';}
function offRow(o,woC){const oO=woC[o.id]||0;return'<div data-empid="'+o.id+'" style="display:flex;align-items:center;gap:4px;padding:2px 6px;opacity:.4;cursor:pointer;"><div style="min-width:58px;font-size:.85rem;font-weight:700;color:#E74C3C;">'+esc(o.emp.name)+(oO?'<span style="font-size:.6rem;">('+oO+')</span>':'')+'</div><div style="flex:1;position:relative;height:32px;background:#1A1A30;border-radius:4px;overflow:hidden;"><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.65rem;color:#E74C3C;font-weight:600;">휴무</div></div><span data-action="toggleOff" data-oid="'+o.id+'" style="font-size:.65rem;padding:4px 7px;border-radius:5px;background:#333;color:#9090A8;cursor:pointer;font-weight:700;">해제</span></div>';}
function sectWrap(items,fn){if(!items.length)return'';let h='<div style="margin-top:5px;padding-top:5px;border-top:1px solid #2E2E5240;">';items.forEach(i=>{h+=fn(i);});return h+'</div>';}
// === standard input ===
function rStdPanel(){
  const sd=$('stdDate'),se=$('stdEmp');if(!sd||!se)return;
  if(sd.value!==dk(S.date))sd.value=dk(S.date);
  const cur=se.value,ids=empIds();let sig=ids.join('|')+'|'+ids.map(id=>S.emp[id]?.name||id).join('|');
  if(se.dataset.sig!==sig){se.dataset.sig=sig;se.innerHTML='<option value="">직원 선택</option>'+ids.map(id=>'<option value="'+id+'">'+esc(S.emp[id].name||id)+'</option>').join('');if(cur&&ids.includes(cur))se.value=cur;}
  renderStdPreview();
}
function stdDateLabel(value){
  const d=String(value||dk(S.date));
  const parts=d.split('-');
  if(parts.length!==3)return d;
  const dt=new Date(+parts[0],+parts[1]-1,+parts[2]);
  return parts[1]+'/'+parts[2]+'('+DOW_KR[dt.getDay()]+')';
}
function stdPreviewText(){
  const d=$('stdDate')?.value||dk(S.date),eid=$('stdEmp')?.value,emp=S.emp[eid];
  if(!emp)return'직원과 날짜를 고르면 저장 내용이 보입니다.';
  const role=$('stdRole')?.value||'미지정';
  if($('stdOff')?.checked)return emp.name+' · '+stdDateLabel(d)+' · 휴무 저장 요청';
  const s=$('stdStart')?.value||'--:--',e=$('stdEnd')?.value||'--:--';
  return emp.name+' · '+stdDateLabel(d)+' · '+s+' ~ '+e+' · '+role;
}
function renderStdPreview(){const el=$('stdPreview');if(!el)return;el.innerHTML='<strong>저장 내용</strong> '+esc(stdPreviewText());}
function focusStdPanel(){const panel=$('stdPanel');if(!panel)return;panel.scrollIntoView({behavior:'smooth',block:'start'});panel.classList.add('highlight');clearTimeout(panel._hl);panel._hl=setTimeout(()=>panel.classList.remove('highlight'),1200);}
const surfaceCollapseSyncs=[];
function isCompactViewport(){return window.matchMedia&&window.matchMedia('(max-width: 760px)').matches;}
function bindSurfaceCollapse(panelId,headSelector,collapseOnMobile){
  const panel=$(panelId);
  const head=panel&&panel.querySelector(headSelector);
  if(!panel||!head||panel.dataset.collapseBound==='1')return;
  panel.dataset.collapseBound='1';
  panel.classList.add('surface-panel');
  head.classList.add('surface-head');
  let toggle=head.querySelector('.surface-toggle');
  if(!toggle){
    toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='surface-toggle';
    toggle.setAttribute('aria-label','패널 펼치기/접기');
    toggle.innerHTML='<span class="surface-toggle-icon">▾</span>';
    head.appendChild(toggle);
  }
  function syncState(forceOpen){
    const compact=isCompactViewport();
    const shouldCollapse=forceOpen===true?false:(forceOpen===false?true:(compact&&collapseOnMobile));
    panel.classList.toggle('collapsed',shouldCollapse);
    toggle.setAttribute('aria-expanded',String(!shouldCollapse));
  }
  head.addEventListener('click',e=>{
    if(e.target.closest('button,input,label,select,textarea,a'))return;
    syncState(panel.classList.contains('collapsed'));
  });
  toggle.addEventListener('click',e=>{e.stopPropagation();syncState(panel.classList.contains('collapsed'));});
  surfaceCollapseSyncs.push(syncState);
  syncState();
}
window.addEventListener('resize',()=>{surfaceCollapseSyncs.forEach(fn=>fn());},{passive:true});
function setStdDisabled(){const off=$('stdOff')?.checked;['stdStart','stdEnd','stdRole'].forEach(id=>{const el=$(id);if(el)el.disabled=!!off;});renderStdPreview();}
function saveStdRequestPreview(payload){try{localStorage.setItem(STD_REQUEST_PREVIEW_KEY,JSON.stringify(payload));}catch(e){}}
function dailyScheduleStatus(action){return action==='off'?'off':action==='clear'?'clear':'confirmed';}
function dailyScheduleRow(action,shift){
  if(action==='off')return offRowData();
  if(action==='clear')return clearRow(shift&&shift.role||'');
  return shiftRow(shift||{start:'',end:'',role:''});
}
function syncDailyScheduleLocal(date,eid,action,row){
  const k=date+'_'+eid;
  S.sc[eid]=row;
  const st=dailyScheduleStatus(action);
  if(st==='auto')delete S.sst[k];else S.sst[k]=st;
  if(action==='off'){if(!S.dof[eid])S.dof[eid]={};S.dof[eid][date]=true;}
  else if(S.dof[eid])delete S.dof[eid][date];
}
async function commitDailySchedule(date,eid,action,shift,options){
  const row=dailyScheduleRow(action,shift),status=dailyScheduleStatus(action),statusPayload=statusRow(status,status==='clear'?{state:'clear'}:undefined),reload=options&&options.reload||'week';
  if(!PREVIEW_ONLY){syncDailyScheduleLocal(date,eid,action,row);renderAll();}
  const ok=await Promise.all([fbP(FW+'/overrides/'+date+'/'+eid,row),fbP(FW+'/status/'+date+'/'+eid,statusPayload)]);
  if(!ok.every(Boolean)){
    if(!PREVIEW_ONLY){
      if(reload==='full')await loadData();
      else await loadWk();
    }
    return false;
  }
  if(!PREVIEW_ONLY){
    if(reload==='full')await loadData();
    else await loadWk();
  }
  return true;
}
async function commitFixedSchedule(empId,row,options){
  if(!PREVIEW_ONLY){S.fix[empId]=row;renderAll();}
  const ok=await fbP(FW+'/fixed_schedules/'+empId,row);
  if(!ok){
    if(!PREVIEW_ONLY){
      const reload=options&&options.reload||'full';
      if(reload==='week')await loadWk();
      else await loadData();
    }
    return false;
  }
  if(!PREVIEW_ONLY){
    const reload=options&&options.reload||'full';
    if(reload==='week')await loadWk();
    else await loadData();
  }
  return true;
}
async function saveStd(){
  if(document.body.classList.contains('auth-locked')){toast('먼저 인증하세요');return;}
  const d=$('stdDate').value||dk(S.date),eid=$('stdEmp').value,off=$('stdOff').checked;
  if(!eid||!S.emp[eid]){toast('직원을 선택해주세요');return;}
  const btn=$('stdSave');btn.disabled=true;
  try{
    const action=off?'off':'upsert_shift';
    const shift=off?null:{start:($('stdStart').value||''),end:($('stdEnd').value||''),role:($('stdRole').value||'')};
    if(PREVIEW_ONLY){
      const payload=AUTH_STD.buildStdWriteRequest?AUTH_STD.buildStdWriteRequest({
        date:d,
        employee:S.emp[eid].name||eid,
        employee_id:eid,
        action:action,
        start:off?'':shift.start,
        end:off?'':shift.end,
        role:off?'':shift.role,
        note:'근무 수정 요청'
      },{actor:confirmActor(),nowMs:Date.now(),targetPaths:CONFIRM_ALLOWED_TARGETS}):null;
      if(payload&&payload.error){toast(payload.error);return;}
      if(!payload){toast('저장 요청을 만들 수 없습니다');return;}
      if(!confirm((off?'휴무':'근무')+' 저장 요청을 확인 큐에 보낼까요?\n\n'+stdPreviewText()))return;
      saveStdRequestPreview(payload);
      if($('stdHint'))$('stdHint').textContent=PREVIEW_MODE_LABEL+' : 요청 미리보기만 저장했습니다.';
      toast(PREVIEW_MODE_LABEL+' : 요청 미리보기 저장됨');
      return;
    }
    if(!confirm((off?'휴무':'근무')+'를 원천에 바로 반영할까요?\n\n'+stdPreviewText()))return;
    const ok=await commitDailySchedule(d,eid,action,shift,{reload:'week'});
    if(!ok){toast('저장 실패');return;}
    if($('stdHint'))$('stdHint').textContent='원천 반영/출력 동기화됨';
    toast('원천 반영/출력 동기화됨');
  }finally{btn.disabled=false;}
}
// === briefing ===
function rBrief(){
  const p=$('briefing');if(!p)return;const d=dk(S.date),ek=empIds(),logic=window.WorkScheduleManualLogic;
  let wC=0,tH=0,tCo=0,fC=0,vC=0,eC=0;const oN=[];
  ek.forEach(id=>{if(isOff(id,d)){oN.push(S.emp[id]?.name||id);return;}const s=getShift(d,id);if(s&&s.start){wC++;const h=cH(s.start,s.end);tH+=h;tCo+=h*(S.emp[id]?.hourlyRate||0);const fx=gFixC(id);fx&&fx.type==='fixed'&&s.start===fx.start&&s.end===fx.end?fC++:vC++;}else eC++;});
  const entries=manualEntries();
  const briefing=logic&&logic.buildBriefingSections?logic.buildBriefingSections(entries,{schedule:{
    summary:d+' '+(DOW_KR[S.date.getDay()]||''),
    count:wC,
    workSummary:wC+'명 출근 / '+tH.toFixed(1).replace('.0','')+'h',
    taskSummary:'할일·알람 · 입력 대기 '+intakeQueueCount()+'건',
    discountSummary:'할인/행사 확인 필요',
    newsSummary:'뉴스/월드컵 확인 필요',
    weatherSummary:WEATHER_LOCATION.name,
    manualSummary:'오늘 필요한 운영메뉴얼 '+(entries.length?entries[0].title:'대기')
  },intakeCount:intakeQueueCount()}):null;
  let h='<div class="briefing-wrap">';
  h+='<div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;">';
  const bx=(v,c,l)=>'<div style="flex:1;min-width:72px;background:#242444;border-radius:8px;padding:6px 8px;text-align:center;"><div style="font-size:'+(l==='인건비'?'.85':'1.08')+'rem;font-weight:800;color:'+c+';overflow-wrap:anywhere;">'+v+'</div><div style="font-size:.55rem;color:#9090A8;">'+l+'</div></div>';
  h+=bx(wC+'<span style="font-size:.6rem;color:#707088;">/'+ek.length+'</span>','#FFF','출근');
  h+=bx(tH.toFixed(1).replace('.0','')+'<span style="font-size:.6rem;color:#707088;">h</span>','#FFD700','총시간');
  h+=bx(tCo>0?(tCo/10000).toFixed(1)+'만':'-','#E0E0EC','인건비');
  h+=bx(oN.length,'#E74C3C','휴무')+'</div>';
  h+='<div class="briefing-meta">';
  h+='<span class="briefing-chip">날씨 '+esc(WEATHER_LOCATION.name)+'</span>';
  if(isH(S.date))h+='<span class="briefing-chip danger">'+esc(hNm(S.date)||'공휴일')+'</span>';
  h+='<span class="briefing-chip">고정 '+fC+'</span>';
  if(vC)h+='<span class="briefing-chip accent">수동 '+vC+'</span>';
  if(eC)h+='<span class="briefing-chip danger">미입력 '+eC+'</span>';
  if(oN.length)h+='<span class="briefing-chip danger">휴: '+oN.map(esc).join(', ')+'</span>';
  h+='</div>';
  if(briefing){
    h+='<div class="briefing-summary">'+esc(briefing.summary||'브리핑 항목을 확인한다.')+'</div>';
    h+='<div class="briefing-sections">'+briefing.sections.map(section=>{
      const items=(section.items||[]).slice(0,2).map(item=>'<span class="briefing-item">'+esc(item.title||item.summary||'항목')+'</span>').join('');
      const emptyText=section.emptyState||'대기';
      const body=section.summary||emptyText;
      return '<section class="briefing-section'+((section.count||0)===0?' is-empty':'')+'"><div class="briefing-section-head"><strong>'+esc(section.title)+'</strong><span>'+esc(section.count?section.count+'건':emptyText)+'</span></div><div class="briefing-section-body">'+esc(body)+'</div>'+ (items?'<div class="briefing-items">'+items+'</div>':'') +'</section>';
    }).join('')+'</div>';
  }
  h+='<div class="briefing-criteria"><span>사이트 상세는 현재 화면 기준으로만 읽는다</span><span>카카오 요약은 짧게, 출처를 함께 둔다</span><span>근무표 이미지는 PNG 한 장과 대상 방 확인으로 끝낸다</span></div>';
  p.innerHTML=h+'</div>';
}
// === timebar ===
function rTimebar(){
  const con=$('tbCon');if(!con)return;const d=dk(S.date),{w,off,mt,tH,cc,uc,woC}=catE(d);
  const _g=gRange(w),bH=_g.gh;
  const now=new Date(),nM=opMin(pad(now.getHours())+':'+pad(now.getMinutes())),isT=dk(new Date())===d,nP=(nM>=_g.startMin&&nM<=_g.startMin+_g.rangeMin)?mPct(nM,_g):null;
  let h='<div style="padding:5px 6px 0;">'+progBar(cc,uc,mt.length,w.length,off.length,tH);
  if(uc)h+='<span data-action="confirmAll" style="color:'+CK+';cursor:pointer;font-weight:700;margin-left:4px;font-size:.7rem;padding:2px 8px;background:'+CK+'33;border-radius:4px;">전체확정</span>';
  else if(w.length)h+='<span style="color:'+CK+';font-weight:700;margin-left:4px;font-size:.65rem;">확정됨</span>';
  h+='</div></div>';
  // time header
  h+='<div style="display:flex;align-items:center;margin-bottom:2px;"><div style="min-width:58px;"></div><div style="flex:1;position:relative;height:16px;">';
  const ls=bH<=8?1:bH<=14?2:3;
  for(let m=_g.startMin;m<=_g.startMin+_g.rangeMin;m+=ls*60){h+='<span style="position:absolute;left:'+mPct(m,_g)+'%;font-size:.55rem;color:#707088;transform:translateX(-50%);">'+hLbl(m)+'</span>';}
  h+='</div><div style="min-width:36px;"></div></div>';
  // workers
  w.forEach(x=>{
    const roles=x.shift.role?x.shift.role.split(',').filter(Boolean):[],pr=roles[0]||'주방',rc=RC[pr]||'#9090A8';
    const isCf=x.status==='confirmed',wO=woC[x.id]||0,at=S.att[x.id],hasA=at&&at.actual_start;
    const sp=spanT(x.shift.start,x.shift.end),L=mPct(sp.s,_g),W=Math.max(.5,mPct(sp.e,_g)-L),isN=W<30;
    h+='<div data-empid="'+x.id+'" style="opacity:'+(isCf?'1':'.6')+';"><div style="display:flex;align-items:center;padding:2px 6px;cursor:pointer;">';
    h+='<div style="min-width:58px;font-size:.85rem;font-weight:700;color:'+(isCf?rc:rc+'bb')+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(x.emp.name)+(wO?'<span style="font-size:.6rem;color:'+CO+';">('+wO+')</span>':'')+'</div>';
    h+='<div style="flex:1;position:relative;height:32px;background:#1A1A30;border-radius:4px;overflow:hidden;">';
    if(isT&&nP!==null)h+='<div style="position:absolute;left:'+nP+'%;top:0;bottom:0;width:1px;background:#FFD70066;z-index:3;"></div>';
    h+='<div style="position:absolute;left:'+L+'%;width:'+W+'%;top:1px;bottom:1px;background:'+(hasA?rc+'18':isCf?rc+'40':rc+'18')+';border-left:3px solid '+(hasA?rc+'55':isCf?rc:rc+'88')+';border-radius:3px;'+(hasA?'border:1.5px dashed '+rc+'55;':isCf?'':'border:1px dashed '+rc+'66;')+'z-index:1;"></div>';
    if(hasA){const aS=opMin(at.actual_start);let aE=at.actual_end?opMin(at.actual_end):aS;if(at.actual_end&&aE<=aS)aE+=TLM;const aL=mPct(aS,_g),aW=Math.max(mPct(aE,_g)-aL,1),sc=ASC[at.actual_start_source||at.actual_end_source||'']||'#888';
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
  const allCf=w.length>0&&uc===0,anyCf=cf||allCf,_g=gRange(w);
  let h='<div style="padding:6px 8px;'+(allCf?'border:2px solid '+CK+';border-radius:12px;':'')+'">';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;padding-bottom:5px;'+(anyCf?'border-bottom:2px solid '+CK+';':'border-bottom:1px solid #2E2E52;')+'">';
  h+='<span style="font-size:1rem;font-weight:800;color:'+(anyCf?CK:'#FFF')+';">'+m+'/'+dd+' '+dow+(anyCf?' <span style="font-size:.6rem;color:'+CK+';">확정</span>':'')+'</span>';
  if(uc)h+='<span data-action="confirmAll" style="font-size:.75rem;padding:5px 12px;border-radius:6px;background:'+CK+'44;color:'+CK+';cursor:pointer;font-weight:700;border:1px solid '+CK+'66;">전체확정</span>';
  else if(w.length)h+='<span style="font-size:.7rem;padding:4px 10px;border-radius:6px;background:'+CK+'22;color:'+CK+';font-weight:700;">확정됨</span>';
  h+='</div>'+progBar(cc,uc,mt.length,w.length,off.length,tH)+'</div></div>';
  w.forEach(x=>{
    const roles=x.shift.role?x.shift.role.split(',').filter(Boolean):[];
    const sp=spanT(x.shift.start,x.shift.end),sP=mPct(sp.s,_g),wP=Math.max(1,mPct(sp.e,_g)-sP);
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
// === dashboard / multi views ===
function rDashboard(){
  const con=$('dashCon');if(!con)return;const d=dk(S.date),st=dayStats(d),today=dk(new Date()),ts=dayStats(today),logic=window.WorkScheduleManualLogic,entries=manualEntries();
  if(today!==d&&!S.wsc[today]&&!S.msc[today]&&!S.xsc[today])loadDayCache(today);
  const dashBriefing=logic&&logic.buildBriefingSections?logic.buildBriefingSections(entries,{schedule:{
    summary:d+' '+(DOW_KR[S.date.getDay()]||''),
    count:st.work.length,
    workSummary:st.work.length+'명 출근 / '+fmtH(st.hours)+'h',
    taskSummary:'할일·알람 · 입력 큐 '+intakeQueueCount()+'건',
    discountSummary:'할인/행사 확인 필요',
    newsSummary:'뉴스/월드컵 확인 필요',
    weatherSummary:WEATHER_LOCATION.name,
    manualSummary:'오늘 필요한 운영메뉴얼 '+(entries.length?entries[0].title:'대기')
  },intakeCount:intakeQueueCount()}):null;
  const focusEntries=entries.filter(item=>/배민|쿠팡|BBQ|쿠폰|기프티콘/.test(String(item.title||''))).slice(0,4);
  const manualHighlights=(focusEntries.length?focusEntries:entries).slice(0,4);
  let h='<div class="view-pad"><div class="summary-title"><div>'+d+' '+DOW_KR[S.date.getDay()]+' 대시보드</div><span>'+st.confirmed+'/'+st.work.length+' 확정</span></div>';
  h+='<div class="dash-grid">'+statCard(st.work.length+'명','근무','#E0E0EC')+statCard(fmtH(st.hours)+'h','총시간','#FFD700')+statCard(st.missing.length+'명','미입력','#9090A8')+statCard(st.off.length+'명','휴무','#E74C3C')+statCard(st.attStart+'건','실출근','#2ECC71')+statCard(st.attEnd+'건','실퇴근','#4ECDC4')+'</div>';
  if(dashBriefing){
    h+='<div class="summary-card dash-callout-card"><div class="summary-title"><div>브리핑</div><span>첫 화면 요약</span></div>';
    h+='<div class="dash-callout-copy">근무, 일정/할일/행사/뉴스/날씨, 오늘 필요한 운영메뉴얼을 한 화면에서 먼저 확인합니다.</div>';
    h+='<div class="dash-preview-grid">'+dashBriefing.sections.slice(0,7).map(section=>{const itemLabel=section.items&&section.items[0]?(section.items[0].title||section.items[0].summary||'항목 대기'):(section.emptyState||'항목 대기');return '<section class="briefing-section'+((section.count||0)===0?' is-empty':'')+'"><div class="briefing-section-head"><strong>'+esc(section.title)+'</strong><span>'+esc(section.count?section.count+'건':(section.emptyState||'대기'))+'</span></div><div class="briefing-section-body">'+esc(itemLabel)+'</div></section>';}).join('')+'</div>';
    h+='<div class="dash-link-row"><button type="button" class="dash-link-btn" data-go-tab="ops">운영메뉴얼 열기</button><button type="button" class="dash-link-btn" data-go-tab="day">날짜별 근무 보기</button><button type="button" class="dash-link-btn" data-go-std="1">근무 수정 요청</button></div></div>';
  }
  h+='<div class="summary-card dash-callout-card"><div class="summary-title"><div>운영메뉴얼</div><span>검색 · 카테고리</span></div>';
  h+='<div class="dash-callout-copy">직원용 한글 화면으로만 보여주고, 검색과 카테고리 탐색은 운영메뉴얼 탭에서 이어서 확인합니다.</div>';
  h+='<div class="dash-manual-preview">'+manualHighlights.map(item=>'<article class="dash-manual-item"><strong>'+esc(item.title||'운영메뉴얼')+'</strong><span>'+esc(item.summary||'안내를 확인합니다.')+'</span></article>').join('')+'</div>';
  h+='<div class="dash-link-row"><button type="button" class="dash-link-btn" data-go-tab="ops">검색/카테고리 열기</button><button type="button" class="dash-link-btn" data-go-tab="list">리스트 근무표 보기</button></div></div>';
  h+='<div class="summary-card"><div class="summary-title"><div>역할별 인원</div><span>선택일</span></div><div class="chip-row">'+roleChips(st.roles)+'</div></div>';
  h+='<div class="summary-card"><div class="summary-title"><div>확인 필요</div><span>미확정 '+st.unconfirmed+' / 미입력 '+st.missing.length+'</span></div><div class="chip-row">';
  h+=miniNames(st.work.filter(x=>x.status!=='confirmed'),'미확정 없음')+miniNames(st.missing,'미입력 없음')+'</div></div>';
  if(today!==d)h+='<div class="summary-card"><div class="summary-title"><div>오늘 요약</div><span>'+(S.xLoading[today]?'불러오는 중':today)+'</span></div><div class="chip-row"><span class="info-chip">근무 '+ts.work.length+'명</span><span class="info-chip">총 '+fmtH(ts.hours)+'h</span><span class="info-chip">휴무 '+ts.off.length+'명</span><span class="info-chip">미입력 '+ts.missing.length+'명</span><span class="info-chip">실출근 '+ts.attStart+'</span><span class="info-chip">실퇴근 '+ts.attEnd+'</span></div></div>';
  con.innerHTML=h+'</div>';
  con.querySelectorAll('[data-go-tab]').forEach(btn=>btn.addEventListener('click',()=>swTab(btn.dataset.goTab)));
  con.querySelectorAll('[data-go-std]').forEach(btn=>btn.addEventListener('click',()=>focusStdPanel()));
}
function rDay(){
  const con=$('dayCon');if(!con)return;const d=dk(S.date),st=dayStats(d);
  let h='<div class="view-pad"><div class="summary-card"><div class="summary-title"><div>'+d+' 날짜별</div><span>'+st.work.length+'명 '+fmtH(st.hours)+'h</span></div><div class="chip-row">'+roleChips(st.roles)+'<span class="info-chip">실출근 '+st.attStart+'</span><span class="info-chip">실퇴근 '+st.attEnd+'</span></div></div>';
  st.work.forEach(x=>{const r=(x.shift.role||'미지정').split(',')[0],c=RC[r]||CK;h+='<div class="compact-row" data-empid="'+x.id+'" style="border-left:3px solid '+c+';"><div class="name" style="color:'+c+';">'+esc(x.emp.name)+'</div><div class="time">'+x.shift.start+'-'+x.shift.end+'</div><div class="meta">'+fmtH(x.hours)+'h '+esc(x.shift.role||'미지정')+'</div>'+stBtn(x.id,x.status==='confirmed','.55')+'</div>';});
  st.missing.forEach(x=>{h+='<div class="compact-row" data-empid="'+x.id+'" style="border-left:3px solid #707088;"><div class="name" style="color:#9090A8;">'+esc(x.emp.name)+'</div><div class="time" style="color:#707088;">미입력</div><div class="meta">-</div><span data-action="confirmOff" data-oid="'+x.id+'" style="font-size:.55rem;padding:3px 6px;border-radius:4px;background:#E74C3C33;color:#E74C3C;font-weight:700;">휴확</span></div>';});
  st.off.forEach(x=>{h+='<div class="compact-row" data-empid="'+x.id+'" style="border-left:3px solid #E74C3C;opacity:.75;"><div class="name" style="color:#E74C3C;">'+esc(x.emp.name)+'</div><div class="time" style="color:#E74C3C;">휴무</div><div class="meta">-</div><span data-action="toggleOff" data-oid="'+x.id+'" style="font-size:.55rem;padding:3px 6px;border-radius:4px;background:#333;color:#9090A8;font-weight:700;">해제</span></div>';});
  con.innerHTML=h+'</div>';
}
function rPeople(){
  const con=$('peopleCon');if(!con)return;const mn=getMon(S.date),days=[];for(let i=0;i<7;i++){const d=new Date(mn);d.setDate(d.getDate()+i);days.push(dk(d));}
  const mk=monthKey(S.date);if(S.mKey!==mk&&!S.mLoading)loadMonth();
  let h='<div class="view-pad"><div class="summary-title"><div>인원별 주간</div><span>'+days[0]+' ~ '+days[6]+'</span></div><div class="people-grid">';
  empIds().forEach(id=>{let wd=0,hrs=0,off=0,miss=0,unc=0;days.forEach(k=>{if(isOff(id,k)){off++;return;}const sh=getShift(k,id);if(sh&&sh.start&&sh.end){wd++;hrs+=cH(sh.start,sh.end);if(gSt(k,id)!=='confirmed')unc++;}else miss++;});
    const at=attStats(days,id);
    h+='<div class="people-row" data-empid="'+id+'"><div class="p-name" style="color:'+(S.emp[id].color||'#E0E0EC')+';">'+esc(S.emp[id].name||id)+'</div><div class="p-cell">근무 '+wd+'</div><div class="p-cell">'+fmtH(hrs)+'h</div><div class="p-cell" style="color:#2ECC71;">실 '+at.days+'</div><div class="p-cell" style="color:'+(unc?'#9090A8':'#2ECC71')+';">미 '+(miss+unc)+'</div></div>';});
  const y=S.date.getFullYear(),m=S.date.getMonth(),last=new Date(y,m+1,0).getDate(),md=[];for(let d=1;d<=last;d++)md.push(y+'-'+pad(m+1)+'-'+pad(d));
  h+='</div><div class="summary-title" style="margin-top:10px;"><div>인원별 월간 출근기록</div><span>'+(S.mLoading?'불러오는 중':mk)+'</span></div><div class="people-grid">';
  empIds().forEach(id=>{const at=attStats(md,id);h+='<div class="people-row" data-empid="'+id+'"><div class="p-name" style="color:'+(S.emp[id].color||'#E0E0EC')+';">'+esc(S.emp[id].name||id)+'</div><div class="p-cell" style="color:#2ECC71;">출근 '+at.days+'</div><div class="p-cell">시작 '+at.start+'</div><div class="p-cell">종료 '+at.end+'</div><div class="p-cell">'+mk+'</div></div>';});
  con.innerHTML=h+'</div></div>';
}
async function loadMonth(force){
  const mk=monthKey(S.date);if(S.mLoading||(!force&&S.mKey===mk))return;S.mLoading=true;S.mKey=mk;renderAll(true);
  try{const y=S.date.getFullYear(),m=S.date.getMonth(),last=new Date(y,m+1,0).getDate(),ks=[],sp=[],tp=[],ap=[];
    for(let d=1;d<=last;d++){const k=y+'-'+pad(m+1)+'-'+pad(d);ks.push(k);sp.push(fbG(FW+'/overrides/'+k));tp.push(fbG(FW+'/status/'+k));ap.push(fbG(FW+'/attendance/'+k));}
    const[sr,tr,ar]=await Promise.all([Promise.all(sp),Promise.all(tp),Promise.all(ap)]);ks.forEach((k,i)=>{S.msc[k]=sr[i]||{};S.mst[k]=tr[i]||{};if(hasObj(ar[i]))S.ah[k]=ar[i];if(tr[i])Object.keys(tr[i]).forEach(e=>{const row=tr[i][e];row?S.sst[k+'_'+e]=(typeof row==='object'?(row.status||row.state||'auto'):row):delete S.sst[k+'_'+e];});});}
  catch(e){console.error('loadMonth',e);toast('월별 불러오기 실패');}
  S.mLoading=false;renderAll(true);
}
function rMonth(){
  const con=$('monthCon');if(!con)return;const mk=monthKey(S.date);if(S.mKey!==mk&&!S.mLoading)loadMonth();
  const y=S.date.getFullYear(),m=S.date.getMonth(),first=new Date(y,m,1),last=new Date(y,m+1,0).getDate(),sel=dk(S.date),today=dk(new Date());
  let h='<div class="view-pad"><div class="summary-title"><div>'+mk+' 월별</div><span>'+(S.mLoading?'불러오는 중':'근무/확정/휴무')+'</span></div><div class="month-grid">';
  ['월','화','수','목','금','토','일'].forEach(x=>{h+='<div class="month-dow">'+x+'</div>';});
  const padStart=(first.getDay()+6)%7;for(let i=0;i<padStart;i++)h+='<div></div>';
  for(let d=1;d<=last;d++){const k=y+'-'+pad(m+1)+'-'+pad(d),st=dayStats(k),cls='month-cell'+(k===sel?' sel':'')+(k===today?' today':'');
    h+='<div class="'+cls+'" data-dk="'+k+'"><div class="m-date">'+d+'</div><span class="m-line" style="color:#2ECC71;">근 '+st.work.length+' / 확 '+st.confirmed+'</span><span class="m-line" style="color:#4ECDC4;">실 '+st.attStart+'/'+st.attEnd+'</span><span class="m-line" style="color:#E74C3C;">휴 '+st.off.length+' / 미 '+st.missing.length+'</span></div>';}
  con.innerHTML=h+'</div></div>';con.querySelectorAll('[data-dk]').forEach(el=>{el.addEventListener('click',()=>{const p=el.dataset.dk.split('-');S.date=new Date(+p[0],+p[1]-1,+p[2]);onDC();});});
}
// === week / datestrip ===
function renderWeek(){
  if(!S.loaded)return;const mn=getMon(S.date),ek=empIds();$('weekGrid').innerHTML='';
  const dO={};ek.forEach(id=>{dO[id]=0;});
  for(let i=0;i<7;i++){const d=new Date(mn);d.setDate(d.getDate()+i);const k=dk(d);ek.forEach(e=>{if(!getShift(k,e))dO[e]++;});}
  $('weekOffs').innerHTML='';ek.forEach(e=>{const emp=S.emp[e];if(!emp)return;const oc=dO[e];if(!oc)return;const c=document.createElement('div');c.className='off-chip';c.innerHTML='<span style="color:'+CD+';">'+esc(emp.name)+' <span style="color:'+CO+';">휴'+oc+'</span></span>';$('weekOffs').appendChild(c);});
}
function renderDS(){
  const con=$('dateStrip');if(!con)return;const today=new Date();today.setHours(0,0,0,0);const ek=empIds(),selDk=dk(S.date),mn=getMon(S.date);
  let h='';['월','화','수','목','금','토','일'].forEach(d=>{h+='<div class="date-strip-hdr" style="position:sticky;top:0;background:#1A1A30;z-index:1;">'+d+'</div>';});
  for(let i=-7;i<56;i++){const d=new Date(mn);d.setDate(d.getDate()+i);const k=dk(d),dw=d.getDay(),isT=sameD(d,today),isSel=k===selDk,isP=d<today;
    let cC=0,aC=0;ek.forEach(e=>{if(getShift(k,e)){aC++;if(gSt(k,e)==='confirmed')cC++;}});
    let bC='#2E2E52';if(aC){bC=cC===aC?CK:cC?CK+'88':CD;}
    h+='<div class="date-strip-item'+(isP?' ds-past':'')+(isT?' ds-today':'')+(isSel?' ds-selected':'')+'" data-dk="'+k+'" style="'+(isSel?'':'border-color:'+bC+';')+'">';
    if(isT)h+='<div style="font-size:.4rem;color:#2ECC71;font-weight:700;line-height:1;">오늘</div>';
    h+='<div class="ds-date'+((dw===0||isH(d))?' sun':dw===6?' sat':'')+'">'+d.getDate()+'</div>';
    if(aC)h+='<div class="ds-count" style="color:'+(cC===aC?CK:CD)+';">'+aC+'명</div>';h+='</div>';}
  con.innerHTML=h;con.querySelectorAll('.date-strip-item').forEach(el=>{el.addEventListener('click',()=>{const p=el.dataset.dk.split('-');S.date=new Date(+p[0],+p[1]-1,+p[2]);onDC();});});
  const se=con.querySelector('[data-dk="'+selDk+'"]');if(se)setTimeout(()=>se.scrollIntoView({block:'center',behavior:'auto'}),10);
}
function loadJsonFromLocalStorage(key){
  try{return JSON.parse(localStorage.getItem(key)||'null');}catch(e){return null;}
}
function writeJsonToLocalStorage(key,value){
  try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(e){console.warn('localStorage write failed',key,e);return false;}
}
function manualJson(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch(e){return null;}}
const OPS_MANUAL_KEY='hynixops_ops_manual_entries_v1';
const OPS_MEMO_KEYS=['hynixops_ops_manual_pending_memos_v1','workschedule_hynix_ops_manual_memos_v1'];
function seedManualEntries(){
  const seed=window.WorkScheduleManualSeed;
  return Array.isArray(seed&&seed.entries)?seed.entries:[];
}
function manualArray(value){return Array.isArray(value)?value:(value&&typeof value==='object'?Object.keys(value).map(k=>Object.assign({id:k},value[k])):[]);}
function readManualEntries(){return manualArray(manualJson(OPS_MANUAL_KEY));}
function readManualMemos(){return OPS_MEMO_KEYS.flatMap(k=>manualArray(manualJson(k))).filter(item=>item&&typeof item==='object'&&String(item.body||item.text||item.memo||item.content||'').trim());}
function manualTagLabel(tag){const row=(window.WorkScheduleManualLogic?.TAGS||[]).find(x=>x[0]===tag);return row?row[1]:tag;}
function readIntakeQueue(){return manualArray(loadJsonFromLocalStorage(INTAKE_QUEUE_KEY)).filter(item=>item&&typeof item==='object');}
function writeIntakeQueue(items){return writeJsonToLocalStorage(INTAKE_QUEUE_KEY,(items||[]).slice(0,INTAKE_QUEUE_LIMIT));}
function uniqTextList(list){
  const out=[],seen=new Set();
  (list||[]).forEach(value=>{const text=plainText(value);const key=text.toLowerCase();if(text&&!seen.has(key)){seen.add(key);out.push(text);}});
  return out;
}
function candidateRawValue(value,depth){
  if(value==null)return value;
  if(depth>3)return'[omitted]';
  if(Array.isArray(value))return value.slice(0,20).map(item=>candidateRawValue(item,(depth||0)+1));
  if(typeof value==='object'){
    const out={};
    Object.keys(value).slice(0,80).forEach(key=>{
      if(/^(dataUrl|data_url|base64)$/i.test(key))out[key]='[local image omitted]';
      else out[key]=candidateRawValue(value[key],(depth||0)+1);
    });
    return out;
  }
  if(typeof value==='string'&&value.length>8000)return value.slice(0,8000);
  return value;
}
function buildOpsManualCandidate(envelope,rawInput,now){
  const hints=envelope.classificationHints||{},sourceEventId=plainText(envelope.id)||('site_'+now),actor=confirmActor();
  const categoryHints=uniqTextList([hints.category,envelope.category].concat(envelope.candidateDomains||[],hints.candidateDomains||[]));
  const candidateId='site_'+safeFbKey(sourceEventId);
  const candidate={id:candidateId,candidate_id:candidateId,schema_version:1,source_channel:'site',source_event_id:sourceEventId,captured_at_ms:Number(envelope.capturedAtMs)||now,enqueued_at_ms:now,text:envelope.text||'',title:envelope.title||'',body:envelope.body||'',url:envelope.url||'',category:hints.category||envelope.category||'',category_hints:categoryHints,tags:hints.tags||[],raw_payload:candidateRawValue(rawInput,0),classification_hints:Object.assign({},hints,{candidate_domains:hints.candidateDomains||envelope.candidateDomains||[]}),status:'pending',status_history:[{status:'pending',at_ms:now,source:'workschedule_web'}]};
  if(actor){candidate.actor=actor;candidate.status_history[0].actor=actor;}
  return candidate;
}
async function enqueueOpsManualCandidate(candidate){
  const url=OPS_MANUAL_CANDIDATE_URL+'/'+safeFbKey(candidate.id||candidate.source_event_id);
  if(PREVIEW_ONLY){recordDryRunWrite('PUT',url,candidate);return true;}
  try{
    const r=await fetch(url+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(candidate)});
    if(!r.ok)throw r.status;
    return true;
  }catch(e){
    console.warn('ops manual candidate enqueue failed',e);
    return false;
  }
}
function storeIntakeLocalRecord(record){
  const next=[record].concat(readIntakeQueue()).slice(0,INTAKE_QUEUE_LIMIT);
  writeIntakeQueue(next);
  S.intake.items=next;
  S.intake.loaded=true;
  S.intake.lastLoadMs=Date.now();
  return next;
}
async function queueIntakeItem(item){
  const logic=window.WorkScheduleManualLogic;if(!logic)return null;
  const rawInput=item&&item.payload!=null?item.payload:item,now=Date.now();
  const envelope=logic.buildInputEnvelope(rawInput,{sourceType:item&&item.sourceType||item&&item.source_type||item&&item.kind||'text',sourceLabel:item&&item.sourceLabel||'',sourceOrigin:item&&item.sourceOrigin||'workschedule_web',targetContext:'ops_manual_candidate'});
  const candidate=buildOpsManualCandidate(envelope,rawInput,now),ok=await enqueueOpsManualCandidate(candidate);
  const localRecord=Object.assign({},envelope,{queueState:ok?'submitted':'pending local backup',queueTarget:ok?'ops_manual_candidates':'local_backup',queueName:'ops_manual_candidate',queuedAtMs:now,queuePosition:(readIntakeQueue().length||0)+1,candidateId:candidate.id,candidateStatus:candidate.status,status:ok?'pending':'pending local backup',localBackup:!ok});
  if(!ok)localRecord.localBackupReason='candidate enqueue failed';
  storeIntakeLocalRecord(localRecord);
  S.intake.lastError=ok?'':'입력 등록 실패';
  return localRecord;
}
function queueItemLabel(item){
  if(!item)return'입력';
  if(item.sourceLabel)return item.sourceLabel;
  if(window.WorkScheduleManualLogic?.intakeLabel&&item.sourceType)return window.WorkScheduleManualLogic.intakeLabel(item.sourceType);
  if(item.sourceType)return item.sourceType;
  return item.title||'입력';
}
function intakeQueueCount(){return readIntakeQueue().length;}
function queuedManualEntries(){
  const logic=window.WorkScheduleManualLogic;
  if(!logic)return[];
  return readIntakeQueue().filter(item=>item.localBackup||item.queueState==='pending local backup').map(item=>logic.inputEnvelopeToManualMemo(item,{sourceType:item.sourceType||'text'})).filter(Boolean);
}
function manualEntries(){
  const logic=window.WorkScheduleManualLogic;
  if(!logic)return [];
  const remote=S.opsManual||{};
  const localEntries=readManualEntries();
  const remoteEntries=[].concat(remote.entries||[]);
  const fallbackEntries=(!localEntries.length&&!remoteEntries.length)?seedManualEntries():[];
  return logic.mergeManualFromMemo([].concat(localEntries,fallbackEntries,remoteEntries),[].concat(readManualMemos(),remote.memos||[],queuedManualEntries()));
}
function manualChip(label,active,attr,value){
  return '<button type="button" class="ops-filter-chip'+(active?' active':'')+'" '+attr+'="'+esc(value)+'">'+esc(label)+'</button>';
}
function intakeSourceLabel(value){return (window.WorkScheduleManualLogic&&window.WorkScheduleManualLogic.classifyIntakeEnvelope?window.WorkScheduleManualLogic.classifyIntakeEnvelope({sourceType:value}).categoryLabel:null)||String(value||'입력');}
function intakeFormState(){
  return{
    sourceType:$('intakeSource')?.value||S.intake.draftSource||'text',
    text:$('intakeText')?.value||'',
    url:$('intakeUrl')?.value||''
  };
}
function intakeDraftHasContent(){
  const s=intakeFormState();
  return !!String(s.text||'').trim()||!!String(s.url||'').trim();
}
function intakeFileInput(){return $('intakeFile');}
function intakeQueueStatusText(){
  const items=readIntakeQueue();
  if(!items.length)return'대기 없음';
  const localBackups=items.filter(item=>item.localBackup||item.queueState==='pending local backup').length;
  return (localBackups?localBackups+'건 임시 보관':items.length+'건 최근 등록')+' · 최신 '+fmtTs(items[0].queuedAtMs||items[0].capturedAtMs||items[0].createdAtMs||0);
}
function renderIntakeQueue(){
  const list=$('intakeQueueList'),status=$('intakeStatus');if(!list||!status)return;
  const items=readIntakeQueue();S.intake.items=items;S.intake.loaded=true;S.intake.lastLoadMs=Date.now();
  status.textContent=intakeQueueStatusText();status.className='intake-status'+(items.length?' ready':'');
  if(!items.length){list.innerHTML='<div class="intake-empty">대기 항목이 없습니다.</div>';return;}
  list.innerHTML=items.slice(0,6).map(item=>{
    const logic=window.WorkScheduleManualLogic||{};
    const memo=logic.inputEnvelopeToManualMemo?logic.inputEnvelopeToManualMemo(item,{sourceType:item.sourceType||'text'}):null;
    const cls=item.classificationHints||{};
    const attachCount=(item.attachments||[]).length;
    const candidates=(item.candidateDomains||cls.candidateDomains||[]).slice(0,4).map(key=>logic.categoryLabel?logic.categoryLabel(key):key);
    const tagBits=[logic.intakeLabel?logic.intakeLabel(item.sourceType):item.sourceLabel||item.sourceType,cls.categoryLabel||item.categoryLabel||'',attachCount?('첨부 '+attachCount):'',item.localBackup?'임시 보관':'등록됨'].filter(Boolean);
    return '<article class="intake-item">'+
      '<div class="intake-item-head"><strong>'+esc(item.title||queueItemLabel(item))+'</strong><span>'+esc(fmtTs(item.queuedAtMs||item.capturedAtMs||0))+'</span></div>'+
      '<div class="intake-item-meta">'+tagBits.slice(0,4).map(x=>'<span class="intake-pill">'+esc(x)+'</span>').join('')+'</div>'+
      (candidates.length?'<div class="intake-candidates"><span class="intake-candidate-label">분류 후보</span>'+candidates.map(x=>'<span class="intake-domain">'+esc(x)+'</span>').join('')+'</div>':'')+
      '<div class="intake-item-body">'+esc(item.summary||item.body||memo?.summary||'')+'</div>'+
    '</article>';
  }).join('');
}
function renderIntakePanel(){
  renderIntakeQueue();
  const source=$('intakeSource');if(source&&source.value!==(S.intake.draftSource||'text'))source.value=S.intake.draftSource||'text';
}
function setIntakeSource(value){
  S.intake.draftSource=value||'text';
  const source=$('intakeSource');if(source)source.value=S.intake.draftSource;
}
async function fileToDataUrl(file){
  return await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||''));
    reader.onerror=()=>reject(reader.error||new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}
async function queueIntakeFromForm(reason){
  const state=intakeFormState();
  if(!String(state.text||state.url||'').trim()){toast('입력 내용을 넣어주세요');return false;}
  const payload={sourceType:state.sourceType,text:state.text,url:state.url,sourceOrigin:'workschedule_web',reason:reason||'form_submit'};
  const envelope=await queueIntakeItem(payload);
  if(!envelope)return false;
  toast(envelope.localBackup?'임시 보관됨':'입력 등록됨');
  renderIntakePanel();
  return true;
}
async function queueIntakeFiles(files,reason){
  const list=Array.from(files||[]).filter(Boolean);
  if(!list.length)return false;
  const added=[];
  for(const file of list){
    const dataUrl=await fileToDataUrl(file);
    const envelope=await queueIntakeItem({sourceType:'image',sourceLabel:'이미지',sourceOrigin:'workschedule_web',payload:{title:file.name||'이미지',text:file.name||'',note:reason||'file_upload',attachments:[{name:file.name||'image',type:'image',mime:file.type||'image/*',size:file.size||0,dataUrl}]}});
    if(envelope)added.push(envelope);
  }
  if(added.length){toast(added.some(item=>item.localBackup)?added.length+'건 임시 보관됨':added.length+'건 이미지 등록됨');renderIntakePanel();return true;}
  return false;
}
function rOpsManual(){
  const con=$('opsCon');if(!con)return;
  const wasFocused=document.activeElement&&document.activeElement.id==='opsSearch',caret=wasFocused?document.activeElement.selectionStart:null;
  const logic=window.WorkScheduleManualLogic,all=manualEntries();
  const cat=S.sec.opsCat||'all',q=S.sec.opsQ||'';
  const filtered=logic?logic.filterManualEntries(all,{category:cat,query:q}):all;
  const cats=['all'].concat((logic?.CATEGORY_ORDER||[]).filter(c=>all.some(x=>x.category===c)));
  const catChips=cats.map(c=>manualChip(c==='all'?'전체':(logic?.categoryLabel(c)||c),cat===c,'data-ops-cat',c)).join('');
  const cards=filtered.length?filtered.map(item=>{
    const safe=logic?.publicManualCardModel?logic.publicManualCardModel(item,{sourceType:item.sourceType||item.source_type||'manual'}):item;
    const conflicts=(item.conflicts||[]).length?'<div class="ops-conflict">확인 필요: '+esc((item.conflicts||[]).join(' / '))+'</div>':'';
    const bodyText=String(safe.body||safe.summary||'').split('\n').map(x=>x.trim()).filter(Boolean).slice(0,4).join('\n');
    const actions=(safe.actions||[]).slice(0,3).join(' · ')||(safe.summary||'');
    const cautions=(safe.cautions||[]).slice(0,2).join(' · ')||(safe.summary||'');
    const refs=(safe.sourceUrls||[]).slice(0,3).map((url,index)=>{
      const label='참고 '+(index+1);
      return '<a class="ops-ref-link" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>';
    }).join('');
    const more=refs?'<details class="ops-manual-more"><summary>참고</summary><div class="ops-manual-more-body">'+refs+'</div></details>':'';
    return '<article class="ops-manual-card" data-category="'+esc(safe.category||'etc')+'">'+
      '<div class="ops-manual-card-head"><h3>'+esc(safe.title||'운영메뉴얼')+'</h3><span class="ops-cat">'+esc(safe.displayCategoryLabel||safe.categoryLabel||logic?.categoryLabel(safe.category)||'기타')+'</span></div>'+
      '<p class="ops-summary">'+esc(safe.summary||'')+'</p>'+
      '<div class="ops-section ops-body"><span>본문</span><p>'+esc(bodyText||safe.summary||'')+'</p></div>'+
      '<div class="ops-section"><span>체크</span><p>'+esc(actions)+'</p></div>'+
      '<div class="ops-section caution"><span>주의</span><p>'+esc(cautions)+'</p></div>'+
      more+
      conflicts+
    '</article>';
  }).join(''):'<div class="ops-empty">조건에 맞는 운영메뉴얼이 없습니다.</div>';
  con.innerHTML='<div class="ops-manual-view">'+
    '<div class="ops-manual-head"><div class="ops-manual-title"><strong>운영메뉴얼</strong><span class="ops-manual-count">'+filtered.length+' / '+all.length+'</span></div>'+
    '<input class="ops-search" id="opsSearch" type="search" placeholder="내용 검색" value="'+esc(q)+'">'+
    '<div class="ops-chip-row">'+catChips+'</div></div>'+
    '<div class="ops-manual-list">'+cards+'</div></div>';
  const input=$('opsSearch');if(input){
    input.addEventListener('input',e=>{S.sec.opsQ=e.target.value;rOpsManual();});
    if(wasFocused){input.focus();if(caret!==null)input.setSelectionRange(caret,caret);}
  }
  con.querySelectorAll('[data-ops-cat]').forEach(btn=>btn.addEventListener('click',()=>{S.sec.opsCat=btn.dataset.opsCat;rOpsManual();}));
}
function rIntakePanel(){
  const source=$('intakeSource'),text=$('intakeText'),url=$('intakeUrl'),status=$('intakeStatus');
  if(source&&source.value!==(S.intake.draftSource||'text'))source.value=S.intake.draftSource||'text';
  if(status){status.textContent=intakeQueueStatusText();status.className='intake-status'+(readIntakeQueue().length?' ready':'');}
  if(text&&!text.dataset.bound){
    text.dataset.bound='1';
    text.addEventListener('paste',async e=>{
      const items=Array.from(e.clipboardData?.items||[]);
      const fileItem=items.find(item=>item.kind==='file'&&item.type.indexOf('image/')===0);
      if(fileItem){
        e.preventDefault();
        const file=fileItem.getAsFile();
        if(file)await queueIntakeFiles([file],'paste_image');
        return;
      }
      const pasted=(e.clipboardData?.getData('text/plain')||'').trim();
      if(pasted){
        setTimeout(()=>{if(!text.value.trim())text.value=pasted;else text.value=text.value.trim()+'\n'+pasted;queueIntakeFromForm('paste_text');},0);
      }
    });
  }
  if(url&&!url.dataset.bound){
    url.dataset.bound='1';
    url.addEventListener('change',()=>{if(String(url.value||'').trim())queueIntakeFromForm('url_change');});
  }
  const drop=$('intakeDrop');
  if(drop&&!drop.dataset.bound){
    drop.dataset.bound='1';
    drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('dragover');});
    drop.addEventListener('dragleave',()=>drop.classList.remove('dragover'));
    drop.addEventListener('drop',async e=>{
      e.preventDefault();drop.classList.remove('dragover');
      const files=Array.from(e.dataTransfer?.files||[]).filter(file=>file.type.indexOf('image/')===0);
      if(files.length)await queueIntakeFiles(files,'drop');
    });
    drop.addEventListener('click',()=>intakeFileInput()?.click());
  }
  const fileInput=intakeFileInput();
  if(fileInput&&!fileInput.dataset.bound){
    fileInput.dataset.bound='1';
    fileInput.addEventListener('change',async e=>{if(e.target.files&&e.target.files.length)await queueIntakeFiles(e.target.files,'file_upload');e.target.value='';});
  }
  const sourceBtn=$('intakeSource');if(sourceBtn&&!sourceBtn.dataset.bound){
    sourceBtn.dataset.bound='1';
    sourceBtn.addEventListener('change',()=>setIntakeSource(sourceBtn.value));
  }
  if($('intakeFileBtn')&&!$('intakeFileBtn').dataset.bound){
    $('intakeFileBtn').dataset.bound='1';
    $('intakeFileBtn').addEventListener('click',()=>intakeFileInput()?.click());
  }
  if($('intakePasteBtn')&&!$('intakePasteBtn').dataset.bound){
    $('intakePasteBtn').dataset.bound='1';
    $('intakePasteBtn').addEventListener('click',async()=>{
      try{
        const items=await navigator.clipboard?.read?.();
        const imageItem=items&&items.find(item=>item.types.some(type=>type.indexOf('image/')===0));
        if(imageItem){
          const blob=await imageItem.getType(imageItem.types.find(type=>type.indexOf('image/')===0));
          await queueIntakeFiles([new File([blob],'clipboard.png',{type:blob.type||'image/png'})],'clipboard_image');
          return;
        }
      }catch(e){}
      if(text&&text.value.trim())await queueIntakeFromForm('paste_button');
    });
  }
  if($('intakeQueueBtn')&&!$('intakeQueueBtn').dataset.bound){
    $('intakeQueueBtn').dataset.bound='1';
    $('intakeQueueBtn').addEventListener('click',()=>queueIntakeFromForm('button'));
  }
  if(text&&!text.dataset.enterBound){
    text.dataset.enterBound='1';
    text.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();queueIntakeFromForm('textarea_submit');}});
  }
  if(url&&!url.dataset.enterBound){
    url.dataset.enterBound='1';
    url.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();queueIntakeFromForm('url_submit');}});
  }
  renderIntakeQueue();
}
function rTab(){({dashboard:rDashboard,day:rDay,people:rPeople,month:rMonth,timebar:rTimebar,list:rList,ops:rOpsManual}[S.tab]||rDashboard)();}
// === actions ===
function sSt(d,e,st){const k=d+'_'+e;st==='auto'?delete S.sst[k]:S.sst[k]=st;fbP(FW+'/status/'+d+'/'+e,st==='auto'?statusRow('auto',{state:'clear'}):statusRow(st));renderAll();}
function cfAll(){const d=dk(S.date),b={};empIds().forEach(id=>{const sh=getShift(d,id);if(sh&&sh.start&&!isOff(id,d)){S.sst[d+'_'+id]='confirmed';b[id]=statusRow('confirmed');}else if(!sh||!sh.start){if(!isOff(id,d)){if(!S.dof[id])S.dof[id]={};S.dof[id][d]=true;const row=offRowData();S.sc[id]=row;b[id]=statusRow('off');fbP(FW+'/overrides/'+d+'/'+id,row);}}});fbP(FW+'/status/'+d,b);S.cf[d]=true;fbP(FW+'/status/'+d+'/_date',statusRow('confirmed'));renderAll();}
function togOff(eid){const d=dk(S.date);if(!S.dof[eid])S.dof[eid]={};if(S.dof[eid][d]===true){delete S.dof[eid][d];const fx=gFix(eid,S.date),row=clearRow(S.emp[eid]?.role||'');S.sc[eid]=row;if(fx&&fx.start)S.sst[d+'_'+eid]='confirmed';fbP(FW+'/overrides/'+d+'/'+eid,row);fbP(FW+'/status/'+d+'/'+eid,statusRow(fx&&fx.start?'confirmed':'clear',{state:'clear'}));toast('휴무 해제');}else{S.dof[eid][d]=true;const row=offRowData();S.sc[eid]=row;S.sst[d+'_'+eid]='off';fbP(FW+'/overrides/'+d+'/'+eid,row);fbP(FW+'/status/'+d+'/'+eid,statusRow('off'));toast('휴무 지정');}renderAll();}
function cfOff(eid){const d=dk(S.date);if(!S.dof[eid])S.dof[eid]={};S.dof[eid][d]=true;const row=offRowData();S.sc[eid]=row;S.sst[d+'_'+eid]='off';fbP(FW+'/overrides/'+d+'/'+eid,row);fbP(FW+'/status/'+d+'/'+eid,statusRow('off'));toast('휴무 확정');renderAll();}
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
function bChips(){const c=$('shiftChips');c.innerHTML='';empIds().forEach(eid=>{const emp=S.emp[eid],ch=document.createElement('div');ch.className='emp-chip';if(eid===smE)ch.classList.add('selected');ch.innerHTML='<div class="chip-dot" style="background:'+(emp.color||'#9090A8')+'"></div>'+esc(emp.name);ch.addEventListener('click',()=>{smE=eid;c.querySelectorAll('.emp-chip').forEach(x=>x.classList.remove('selected'));ch.classList.add('selected');const raw=explicitShift(S.sc[eid]),ex=getShift(dk(S.date),eid);if(ex&&ex.start){sS(ex.start);sE(ex.end);smR=ex.role?ex.role.split(',').filter(Boolean):[];uRP();$('shiftDel').style.display=raw?'':'none';smEd=!!raw;}else{$('shiftDel').style.display='none';smEd=false;}});c.appendChild(ch);});}
function uRP(){document.querySelectorAll('#rolePills .role-pill').forEach(p=>{p.classList.toggle('selected',smR.includes(p.dataset.role));});}
async function saveQuickShift(){
  try{
    if(!smE){toast('직원을 선택해주세요');return false;}
    if(!smS||!smN){toast('시간을 선택해주세요');return false;}
    const d=dk(S.date),data={start:smS,end:smN,role:smR.join(',')};
    closeM($('shiftModal'));
    if(await commitDailySchedule(d,smE,'upsert_shift',data,{reload:'week'})){toast('원천 반영/출력 동기화됨');return true;}
    toast('저장 실패');
    return false;
  }catch(e){console.error('saveQuickShift',e);toast('저장 실패');return false;}
}
function setShiftPreset(start,end,saveNow){
  sS(start);
  sE(end);
  if(saveNow!==false&&smE&&smS&&smN)void saveQuickShift();
}
function openSh(eid){smE=eid||null;smR=[];smS=null;smN=null;smEd=false;bChips();
  const raw=eid?explicitShift(S.sc[eid]):null,sh=eid?getShift(dk(S.date),eid):null;
  if(eid&&sh&&sh.start){smR=sh.role?sh.role.split(',').filter(Boolean):[];smEd=!!raw;sS(sh.start);sE(sh.end);$('shiftDel').style.display=raw?'':'none';}
  else{$('selStart').selectedIndex=0;$('selEnd').selectedIndex=0;uG();$('shiftDel').style.display='none';}
  uRP();const m=S.date.getMonth()+1,dd=S.date.getDate();$('shiftTitle').textContent='근무 '+(smEd?'수정':'추가')+' - '+m+'/'+dd+' ('+DOW_KR[S.date.getDay()]+')';
  $('shiftFixed').style.display=eid?'':'none';$('shiftDayoff').style.display=eid?'':'none';
  const io=eid&&isOff(eid,dk(S.date));$('shiftDayoff').textContent=io?'휴무해제':'휴무지정';
  if(io){$('shiftDayoff').classList.remove('btn-danger');$('shiftDayoff').style.cssText='background:#333;color:#9090A8;font-size:.7rem;';}else{$('shiftDayoff').classList.add('btn-danger');$('shiftDayoff').style.cssText='font-size:.7rem;';}
  openM($('shiftModal'));
}
document.querySelectorAll('#rolePills .role-pill').forEach(p=>{p.addEventListener('click',()=>{const r=p.dataset.role,i=smR.indexOf(r);i>=0?smR.splice(i,1):smR.push(r);uRP();});});
document.querySelectorAll('#presets .preset-btn').forEach(b=>{b.addEventListener('click',()=>setShiftPreset(b.dataset.s,b.dataset.e,true));});
$('shiftSave').addEventListener('click',saveQuickShift);
$('shiftDel').addEventListener('click',async()=>{if(!smE)return;const d=dk(S.date);closeM($('shiftModal'));if(await commitDailySchedule(d,smE,'clear',{role:S.emp[smE]?.role||''},{reload:'week'})){toast('원천 반영/출력 동기화됨');}});
$('shiftFixed').addEventListener('click',async()=>{if(!smE||!smS||!smN){toast('시간을 선택해주세요');return;}const n=S.emp[smE]?.name;if(!n){toast('직원 오류');return;}const fixed={start:smS,end:smN,role:smR.join(','),kind:'fixed',type:'fixed'};closeM($('shiftModal'));if(await commitFixedSchedule(smE,fixed,{reload:'full'})){toast(n+' 고정근무 반영됨 · 원천 반영/출력 동기화됨');}else toast('저장 실패');});
$('shiftDayoff').addEventListener('click',()=>{if(!smE)return;const d=dk(S.date),io=isOff(smE,d);
  if(io){closeM($('shiftModal'));void commitDailySchedule(d,smE,'clear',{role:S.emp[smE]?.role||''},{reload:'week'}).then(ok=>{if(ok)toast('원천 반영/출력 동기화됨');else toast('저장 실패');});}
  else{closeM($('shiftModal'));void commitDailySchedule(d,smE,'off',null,{reload:'week'}).then(ok=>{if(ok)toast('원천 반영/출력 동기화됨');else toast('저장 실패');});}});
$('shiftCancel').addEventListener('click',()=>closeM($('shiftModal')));$('shiftClose').addEventListener('click',()=>closeM($('shiftModal')));
// === employee management ===
$('empMgrBtn').addEventListener('click',()=>{rEL();openM($('empModal'));});$('empClose').addEventListener('click',()=>closeM($('empModal')));
function rEL(){const l=$('empList');l.innerHTML='';const ek=empIds();if(!ek.length){l.innerHTML='<div style="padding:20px;text-align:center;color:#9090A8;">직원 없음</div>';return;}
  ek.forEach(id=>{const e=S.emp[id],it=document.createElement('div');it.className='emp-list-item';it.innerHTML='<div class="emp-dot" style="background:'+(e.color||'#9090A8')+'"></div><div class="emp-info"><div class="name">'+esc(e.name)+'</div><div class="detail">'+esc(e.phone||'-')+' | '+esc(e.role||'미지정')+' | '+(e.hourlyRate?e.hourlyRate.toLocaleString()+'원':'-')+'</div></div><div style="display:flex;gap:6px;"><button class="btn btn-sm" data-edit="'+id+'">수정</button><button class="btn btn-sm btn-danger" data-del="'+id+'">삭제</button></div>';l.appendChild(it);});
  l.querySelectorAll('[data-edit]').forEach(b=>{b.addEventListener('click',()=>oEE(b.dataset.edit));});
  l.querySelectorAll('[data-del]').forEach(b=>{b.addEventListener('click',async()=>{const id=b.dataset.del,cur=S.emp[id]||{};if(!confirm((cur.name||'')+' 삭제?'))return;const data=Object.assign({},cur,{disabled:true,active:false});if(await fbP(FW+'/employees/'+id,data)){S.emp[id]=data;rEL();renderAll();toast('삭제됨');}});});}
let eEid=null,selC=COLORS[0];
function bCP(){const cp=$('colorPicker');cp.innerHTML='';COLORS.forEach(c=>{const sw=document.createElement('div');sw.className='color-swatch'+(c===selC?' selected':'');sw.style.background=c;sw.addEventListener('click',()=>{selC=c;cp.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('selected'));sw.classList.add('selected');});cp.appendChild(sw);});}
function oEE(id){eEid=id;if(id&&S.emp[id]){const e=S.emp[id];$('empEditTitle').textContent='직원 수정';$('empName').value=e.name||'';$('empPhone').value=e.phone||'';$('empRole').value=e.role||'';$('empRate').value=e.hourlyRate||0;selC=e.color||COLORS[0];}else{eEid=null;$('empEditTitle').textContent='직원 추가';$('empName').value='';$('empPhone').value='';$('empRole').value='';$('empRate').value=0;selC=COLORS[0];}bCP();openM($('empEditModal'));}
$('addEmpBtn').addEventListener('click',()=>oEE(null));$('empEditClose').addEventListener('click',()=>closeM($('empEditModal')));$('empEditCancel').addEventListener('click',()=>closeM($('empEditModal')));
$('empEditSave').addEventListener('click',async()=>{const n=$('empName').value.trim();if(!n){toast('이름을 입력해주세요');return;}let id=eEid||'emp'+Date.now();const d={name:n,phone:$('empPhone').value.trim(),color:selC,role:$('empRole').value,hourlyRate:parseInt($('empRate').value)||0,active:true,disabled:false};closeM($('empEditModal'));S.emp[id]=d;rEL();renderAll();if(await fbP(FW+'/employees/'+id,d))toast('저장됨');else toast('저장 실패');});
// === dayoff modal ===
const doMod=$('dayoffModal');
function rDL(){const list=$('doList'),sel=$('doEmpSel');sel.innerHTML='';for(const e of empIds())sel.appendChild(new Option(S.emp[e].name,e));$('doDate').value=dk(S.date);
  const all=[];for(const e in S.dof){if(!empOn(S.emp[e]))continue;for(const k in S.dof[e])if(S.dof[e][k])all.push({e,d:k});}all.sort((a,b)=>a.d.localeCompare(b.d));
  if(!all.length){list.innerHTML='<div style="color:#707088;font-size:.8rem;padding:8px;">등록된 휴무 없음</div>';return;}
  let h='',last='';for(const x of all){if(x.d!==last){const d=new Date(x.d);h+='<div style="font-size:.75rem;color:#9090A8;margin-top:8px;margin-bottom:2px;">'+x.d+' ('+DOW_KR[d.getDay()]+')</div>';last=x.d;}
    const emp=S.emp[x.e];h+='<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:#1A1A30;border-radius:6px;margin-bottom:3px;"><span style="width:8px;height:8px;border-radius:50%;background:'+(emp?emp.color:'#9090A8')+';flex-shrink:0;"></span><span style="flex:1;font-size:.85rem;">'+(emp?esc(emp.name):esc(x.e))+'</span><button class="btn btn-sm" style="min-width:30px;min-height:26px;padding:2px 6px;font-size:.7rem;color:#E74C3C;border-color:#E74C3C55;" data-dodel="'+x.e+'|'+x.d+'">✕</button></div>';}
  list.innerHTML=h;list.querySelectorAll('[data-dodel]').forEach(b=>{b.addEventListener('click',async()=>{const[e,k]=b.dataset.dodel.split('|');if(S.dof[e])delete S.dof[e][k];const row=clearRow(S.emp[e]?.role||'');fbP(FW+'/overrides/'+k+'/'+e,row);fbP(FW+'/status/'+k+'/'+e,statusRow('clear',{state:'clear'}));if(k===dk(S.date)){S.sc[e]=row;renderAll();}rDL();});});}
function pBulk(text){const res=[],lines=text.split('\n').map(l=>l.trim()).filter(Boolean),yr=new Date().getFullYear(),dwM={'일':0,'월':1,'화':2,'수':3,'목':4,'금':5,'토':6};
  for(const line of lines){let mE=null,rest=line;for(const e of empIds()){const n=S.emp[e].name;if(line.startsWith(n)){mE=e;rest=line.slice(n.length).trim();break;}}if(!mE)continue;
    const dp=rest.match(/^([일월화수목금토])([,\s]+[일월화수목금토])*/);if(dp){const dws=rest.match(/[일월화수목금토]/g);if(dws){const m=getMon(new Date());dws.forEach(d=>{const t=dwM[d];if(t!==undefined){const dt=new Date(m);dt.setDate(dt.getDate()+(t===0?6:t-1));res.push({e:mE,d:dk(dt)});}});}continue;}
    const rM=rest.match(/(\d{1,2})[\/\-](\d{1,2})\s*[~\-]\s*(\d{1,2})[\/\-](\d{1,2})/);if(rM){let[,m1,d1,m2,d2]=rM.map(Number);const s=new Date(yr,m1-1,d1),e=new Date(yr,m2-1,d2);for(let d=new Date(s);d<=e;d.setDate(d.getDate()+1))res.push({e:mE,d:dk(d)});continue;}
    const iM=rest.match(/(\d{4})-(\d{1,2})-(\d{1,2})/g);if(iM){iM.forEach(ds=>{const[y,m,d]=ds.split('-').map(Number);res.push({e:mE,d:y+'-'+pad(m)+'-'+pad(d)});});continue;}
    const sD=rest.match(/(\d{1,2})[\/](\d{1,2})/g);if(sD){sD.forEach(ds=>{const[m,d]=ds.split('/').map(Number);res.push({e:mE,d:yr+'-'+pad(m)+'-'+pad(d)});});}}return res;}
$('dayoffMgrBtn').addEventListener('click',()=>{rDL();openM(doMod);});$('dayoffClose').addEventListener('click',()=>closeM(doMod));doMod.addEventListener('click',e=>{if(e.target===doMod)closeM(doMod);});
$('doAddBtn').addEventListener('click',async()=>{const e=$('doEmpSel').value,d=$('doDate').value;if(!e||!d)return;if(await commitDailySchedule(d,e,'off',null,{reload:'week'})){toast((S.emp[e]?.name||'')+' '+d+' 원천 반영/출력 동기화됨');rDL();}});
$('doBulkBtn').addEventListener('click',async()=>{const t=$('doBulk').value.trim();if(!t)return;const entries=pBulk(t);if(!entries.length){toast('인식된 휴무 없음');return;}for(const x of entries){await commitDailySchedule(x.d,x.e,'off',null,{reload:'week'});}$('doBulk').value='';toast(entries.length+'건 원천 반영/출력 동기화됨');rDL();if(entries.some(x=>x.d===dk(S.date)))renderAll();});
// === standard input events ===
$('stdOff').addEventListener('change',()=>{setStdDisabled();renderStdPreview();});
$('stdSave').addEventListener('click',saveStd);
$('stdDate').addEventListener('change',()=>{const v=$('stdDate').value;if(!v)return;const p=v.split('-');S.date=new Date(+p[0],+p[1]-1,+p[2]);renderStdPreview();onDC();});
$('stdEmp').addEventListener('change',()=>{const e=S.emp[$('stdEmp').value];if(e&&e.role&&['주방','차배달','오토바이'].includes(e.role))$('stdRole').value=e.role;renderStdPreview();});
['stdStart','stdEnd','stdRole'].forEach(id=>$(id)?.addEventListener('input',renderStdPreview));
// === confirmation panel events ===
$('confirmRefresh')?.addEventListener('click',loadConfirmQueue);
$('confirmList')?.addEventListener('click',e=>{const it=e.target.closest('[data-confirm-key]');if(!it)return;S.confirm.selected=it.dataset.confirmKey;S.confirm.renderedSelected='';rConfirmPanel();});
['confirmDate','confirmEmployee','confirmShift','confirmRole','confirmNote','confirmLive'].forEach(id=>$(id)?.addEventListener('input',renderConfirmPayloadPreview));
$('confirmAction')?.addEventListener('change',updateConfirmActionFields);
$('confirmSend')?.addEventListener('click',enqueueConfirmedScheduleRequest);
$('confirmReject')?.addEventListener('click',()=>decideConfirmPreview('rejected'));
$('confirmHold')?.addEventListener('click',()=>decideConfirmPreview('hold'));
$('workEditBtn')?.addEventListener('click',focusStdPanel);
// === nav ===
$('prevD').addEventListener('click',()=>{S.date.setDate(S.date.getDate()-1);onDC();});$('nextD').addEventListener('click',()=>{S.date.setDate(S.date.getDate()+1);onDC();});
$('prevW').addEventListener('click',()=>{S.date.setDate(S.date.getDate()-7);onDC();});$('nextW').addEventListener('click',()=>{S.date.setDate(S.date.getDate()+7);onDC();});
$('dateDisp').addEventListener('click',()=>openDP());
function showFlash(){const m=S.date.getMonth()+1,d=S.date.getDate();let el=document.getElementById('dateFlash');if(!el){el=document.createElement('div');el.id='dateFlash';el.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:2.5rem;font-weight:900;color:#fff;opacity:0;pointer-events:none;z-index:999;text-shadow:0 2px 12px #000a;transition:opacity .15s;';document.body.appendChild(el);}el.textContent=m+'/'+d+' '+DOW_KR[S.date.getDay()];el.style.opacity='.35';clearTimeout(el._t);el._t=setTimeout(()=>{el.style.opacity='0';},600);}
let _dc=0;
async function onDC(){const my=++_dc;showFlash();updD();if(S.sseS){try{S.sseS.close();}catch(e){}}conSS(S.gen);const d=dk(S.date);S.sc={};S.att={};genDO();autoFix(d);rTab();if(my!==_dc)return;
  try{const[scD,stD,atD]=await Promise.all([fbG(FW+'/overrides/'+d),fbG(FW+'/status/'+d),fbG(FW+'/attendance/'+d)]);if(my!==_dc)return;
    if(scD){S.sc=scD;}if(stD)Object.keys(stD).forEach(e=>{const row=stD[e];row?S.sst[d+'_'+e]=(typeof row==='object'?(row.status||row.state||'auto'):row):delete S.sst[d+'_'+e];});
    S.att=hasObj(atD)?atD:{};if(hasObj(S.att))S.ah[d]=S.att;autoFix(d);rTab();}catch(e){console.error('onDC',e);}if(my!==_dc)return;loadWk();}
function openDP(){const ov=$('dpOverlay'),list=$('dpList');const today=new Date();today.setHours(0,0,0,0);const selDk=dk(S.date),tDk=dk(today),ek=empIds();
  let h='<div class="dp-jump"><button data-action="jumpDate" data-days="-7">◀ 1주</button><button data-action="jumpDate" data-days="0">오늘</button><button data-action="jumpDate" data-days="7">1주 ▶</button></div>';
  for(let i=0;i<30;i++){const d=new Date(today);d.setDate(d.getDate()+i);const k=dk(d),dow=DOW_KR[d.getDay()],isT=k===tDk,isSel=k===selDk,m=d.getMonth()+1,dd=d.getDate();
    let wC=0,oC=0;ek.forEach(id=>{if(isOff(id,k))oC++;else{const s=getShift(k,id);if(s&&s.start)wC++;}});
    h+='<div class="'+(isT?'dp-item today':isSel?'dp-item selected':'dp-item')+'" data-dk="'+k+'"><span class="dp-dow" style="color:'+((d.getDay()===0||isH(d))?'#E74C3C':d.getDay()===6?'#45B7D1':'#9090A8')+';">'+dow+'</span><span class="dp-date">'+m+'/'+dd+'</span><span class="dp-summary">';
    if(wC)h+='<span style="color:#2ECC71;">'+wC+'명</span> ';if(oC)h+='<span style="color:#E74C3C;">휴'+oC+'</span>';if(isT)h+=' <span style="color:#FFD700;font-weight:700;">오늘</span>';h+='</span></div>';}
  list.innerHTML=h;ov.classList.add('open');
  list.onclick=function(e){const jb=e.target.closest('[data-action="jumpDate"]');if(jb){const d=parseInt(jb.dataset.days);if(!d)S.date=new Date();else S.date.setDate(S.date.getDate()+d);ov.classList.remove('open');onDC();return;}const it=e.target.closest('.dp-item');if(it&&it.dataset.dk){const p=it.dataset.dk.split('-');S.date=new Date(+p[0],+p[1]-1,+p[2]);ov.classList.remove('open');onDC();}};
  ov.addEventListener('click',e=>{if(e.target===ov)ov.classList.remove('open');},{once:true});}
// === delegation + tabs + swipe ===
function setupDel(){function h(e){const d=dk(S.date),tg=e.target.closest('[data-action]');if(tg){e.stopPropagation();const a=tg.dataset.action;if(a==='confirmAll')cfAll();else if(a==='status')sSt(d,tg.dataset.sid,tg.dataset.st);else if(a==='toggleOff')togOff(tg.dataset.oid);else if(a==='confirmOff')cfOff(tg.dataset.oid);return;}const r=e.target.closest('[data-empid]');if(r)openSh(r.dataset.empid);}['tbCon','lsCon','dayCon','peopleCon'].forEach(id=>$(id)?.addEventListener('click',h));}
function swTab(t){S.tab=t;document.querySelectorAll('.layout-tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===t));document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));$({dashboard:'pDashboard',day:'pDay',people:'pPeople',month:'pMonth',list:'pList',timebar:'pTimebar',ops:'pOps'}[t])?.classList.add('active');if(t==='month')loadMonth();rTab();}
document.querySelectorAll('.layout-tab').forEach(t=>{t.addEventListener('click',()=>swTab(t.dataset.tab));});
let swX=0,swY=0;$('tabContent').addEventListener('touchstart',e=>{swX=e.touches[0].clientX;swY=e.touches[0].clientY;},{passive:true});
$('tabContent').addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-swX,dy=e.changedTouches[0].clientY-swY;if(Math.abs(dx)<60||Math.abs(dy)>Math.abs(dx)*0.7)return;S.date.setDate(S.date.getDate()+(dx<0?1:-1));onDC();},{passive:true});
// === share ===
$('shareBtn').addEventListener('click',()=>queueCompositeShare('header_share'));
$('deliveryShareBtn')?.addEventListener('click',()=>queueCompositeShare('delivery_panel'));
$('urlBtn').addEventListener('click',()=>{if(navigator.clipboard)navigator.clipboard.writeText(location.href).then(()=>toast('공유 링크가 복사됨'));else{const a=document.createElement('textarea');a.value=location.href;document.body.appendChild(a);a.select();document.execCommand('copy');document.body.removeChild(a);toast('공유 링크가 복사됨');}});
// === collapsible + misc ===
(function(tId,aId,bId,def){const b=$(bId),a=$(aId);if(!b||!a||!$(tId))return;if(def){b.classList.add('open');a.classList.add('open');}$(tId).addEventListener('click',()=>{const o=b.classList.toggle('open');a.classList.toggle('open',o);S.sec[bId]=o;if(o&&bId==='weekBody')renderAll(true);});})('weekToggle','weekArrow','weekBody',false);
$('refreshBtn').addEventListener('click',()=>{toast('새로고침...');location.reload();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!document.body.classList.contains('auth-locked')){connectSSE();loadData();loadConfirmQueue();}});
[$('shiftModal'),$('empModal'),$('empEditModal')].forEach(m=>{if(m)m.addEventListener('click',e=>{if(e.target===m)closeM(m);});});
// === init ===
initAuthGate(()=>{
  bindSurfaceCollapse('deliveryPanel','.delivery-copy',false);
  bindSurfaceCollapse('intakePanel','.intake-head',true);
  bindSurfaceCollapse('stdPanel','.std-head',true);
  bindSurfaceCollapse('confirmPanel','.confirm-head',true);
  S.date=new Date();updD();bTS();setupDel();loadData();loadConfirmQueue();connectSSE();renderDeliveryPanel();queueDeliveryRender();
});
})();
