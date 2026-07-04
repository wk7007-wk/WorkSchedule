(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.WorkScheduleAuthStdLogic=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';

  const DEFAULT_TARGET_PATHS=['/workschedule_v2/overrides','/workschedule_v2/status'];

  function cleanText(value,limit){
    return String(value==null?'':value).replace(/\r/g,'\n').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim().slice(0,limit||4000);
  }

  function safeKey(value){
    return cleanText(value,200).replace(/[.#$\[\]\/\s]+/g,'_').replace(/^_+|_+$/g,'').slice(0,180)||'item';
  }

  function distanceMeters(lat1,lng1,lat2,lng2){
    const R=6371000,to=x=>x*Math.PI/180,la1=to(lat1),la2=to(lat2),dl=to(lat2-lat1),dn=to(lng2-lng1),q=Math.sin(dl/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dn/2)**2;
    return 2*R*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));
  }

  function verifyGpsPosition(position,auth){
    const cfg=auth||{};
    if(typeof cfg.storeLat!=='number'||typeof cfg.storeLng!=='number')return{error:'매장 GPS 기준 설정 필요'};
    const coords=position&&position.coords?position.coords:position||{};
    const lat=Number(coords.latitude);
    const lng=Number(coords.longitude);
    if(!Number.isFinite(lat)||!Number.isFinite(lng))return{error:'GPS 위치를 확인할 수 없습니다'};
    const radius=Number(cfg.radiusM)||150;
    const distance=distanceMeters(lat,lng,cfg.storeLat,cfg.storeLng);
    if(distance>radius)return{error:'매장 반경 밖입니다 ('+Math.round(distance)+'m)',distanceM:distance,radiusM:radius};
    return{factor:'gps',distanceM:distance,radiusM:radius};
  }

  async function verifyPinText(pin,auth,hashFn){
    const cfg=auth||{};
    const text=cleanText(pin,200);
    if(!cfg.pinSha256)return{error:'PIN 해시 설정 필요'};
    if(!text)return{error:'PIN을 입력해주세요'};
    const dig=typeof hashFn==='function'?await hashFn(text):text;
    if(dig!==cfg.pinSha256)return{error:'PIN이 맞지 않습니다'};
    return{ok:true};
  }

  function authFactorLabel(f){
    return f==='device'?'등록 단말':f==='gps'?'GPS':f==='debug'?'개발 GPS 우회':f==='ip'?'허용 IP':'factor';
  }

  function authStatusRows(auth,device){
    const cfg=auth||{};
    const rows=[
      {label:'PIN',value:cfg.pinSha256?'설정됨':'미설정'},
      {label:'위치',value:(typeof cfg.storeLat==='number'&&typeof cfg.storeLng==='number')?('매장 좌표 · 반경 '+Math.round(Number(cfg.radiusM)||150)+'m'):'미설정'},
      {label:'단말',value:device&&device.token?'저장됨':'미설정'}
    ];
    return rows;
  }

  function buildStdWriteRequest(input,options){
    const data=input||{};
    const nowMs=Number(options&&options.nowMs)||Date.now();
    const actor=cleanText(options&&options.actor,120)||'workschedule_web';
    const date=cleanText(data.date,20);
    const employee=cleanText(data.employee,120);
    const employeeId=cleanText(data.employee_id,120);
    const action=cleanText(data.action,20)||'upsert_shift';
    const note=cleanText(data.note,500);
    const targetPaths=Array.isArray(options&&options.targetPaths)&&options.targetPaths.length?options.targetPaths.slice():DEFAULT_TARGET_PATHS.slice();
    if(!date)return{error:'날짜를 입력해주세요'};
    if(!employee)return{error:'직원을 입력해주세요'};
    if(!['upsert_shift','off','clear'].includes(action))return{error:'저장 종류를 확인해주세요'};
    const reqId='confirmed_schedule_write_request_std_'+safeKey(date+'_'+employee+'_'+action)+'_'+nowMs;
    const payload={
      request_id:reqId,
      request_type:'confirmed_schedule_write_request',
      source:'workschedule_web_standard_panel',
      source_event_id:'standard_panel_'+safeKey(date+'_'+employee),
      actor:actor,
      date:date,
      employee:employee,
      employee_id:employeeId||employee,
      action:action,
      confirmed_at_ms:nowMs,
      queued_at_ms:nowMs,
      dry_run:true,
      execute_live_write:false,
      dry_run_result:{
        ok:true,
        source:'workschedule_web_standard_panel',
        generated_from_standard_panel:true,
        target_paths:targetPaths.slice(),
        reviewed_at_ms:nowMs,
        reviewed_by:actor
      },
      target_paths:targetPaths.slice(),
      adapter_allowed_targets:targetPaths.slice(),
      write_scope:'standard_panel',
      confirmed_via:'workschedule_web_standard_panel',
      confirmation_state:'draft'
    };
    if(note)payload.note=note;
    if(action==='upsert_shift'){
      const start=cleanText(data.start,8);
      const end=cleanText(data.end,8);
      if(!start||!end)return{error:'근무 시간을 입력해주세요'};
      payload.shift=start+'-'+end;
      payload.start=start;
      payload.end=end;
      if(cleanText(data.role,80))payload.role=cleanText(data.role,80);
    }else if(action==='off'){
      payload.off=true;
    }else if(action==='clear'){
      payload.clear=true;
    }
    return payload;
  }

  function summarizeStdRequest(payload){
    if(!payload||payload.error)return payload&&payload.error?payload.error:'요청 없음';
    if(payload.action==='off')return payload.date+' · '+payload.employee+' · 휴무 요청';
    if(payload.action==='clear')return payload.date+' · '+payload.employee+' · 해제 요청';
    return payload.date+' · '+payload.employee+' · '+(payload.shift||'근무 요청');
  }

  return {
    DEFAULT_TARGET_PATHS:DEFAULT_TARGET_PATHS,
    authFactorLabel:authFactorLabel,
    authStatusRows:authStatusRows,
    buildStdWriteRequest:buildStdWriteRequest,
    distanceMeters:distanceMeters,
    verifyGpsPosition:verifyGpsPosition,
    verifyPinText:verifyPinText,
    summarizeStdRequest:summarizeStdRequest
  };
});
