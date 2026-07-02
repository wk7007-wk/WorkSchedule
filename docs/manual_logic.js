(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.WorkScheduleManualLogic=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';

  const CATEGORY_ORDER=['work','chat','output','recipe','order','safety','etc'];
  const CATEGORIES={
    work:{label:'근무',keywords:['근무','근무표','스케줄','출근','퇴근','휴무','확정','시간','직원']},
    chat:{label:'채팅',keywords:['카카오','카톡','채팅','답변','운영방','전송','공유','브리핑','메시지']},
    output:{label:'출력',keywords:['하이닉스','사이트','이미지','png','브라우저','다운로드','출력','공유']},
    recipe:{label:'메뉴/레시피',keywords:['레시피','타이머','조리','메뉴','수량','재료','주의사항','치킨']},
    order:{label:'발주',keywords:['발주','주문','재고','입고','품절','수량','매입','거래처']},
    safety:{label:'확인/안전',keywords:['금지','삭제','초기화','확인','승인','주의','위험','보류','실행']},
    etc:{label:'기타',keywords:[]}
  };
  const TAGS=[
    ['schedule','근무표',['근무표','스케줄','휴무','출근','퇴근']],
    ['kakao','카카오',['카카오','카톡','운영방','공유','전송','답변']],
    ['manual','메뉴얼',['메뉴얼','매뉴얼','운영기준','운영 기준','정리']],
    ['memo','메모',['메모','기록','원문']],
    ['output','출력',['하이닉스','사이트','이미지','png','브라우저','다운로드','출력']],
    ['recipe','레시피',['레시피','타이머','조리','메뉴']],
    ['order','발주',['발주','주문','재고','입고']],
    ['safety','확인필요',['금지','삭제','초기화','확인','승인','보류','충돌']]
  ];
  const DEFAULT_MANUAL_ENTRIES=[
    {
      id:'default_schedule_source',
      category:'work',
      title:'근무표 기준',
      summary:'근무 변경과 안내는 WorkSchedule의 현재 데이터를 기준으로 판단한다.',
      body:'- 근무 변경은 WorkSchedule의 날짜별 근무, 휴무, 확정 상태를 먼저 확인한다.\n- 기존 근무가 있으면 새 내용으로 덮기 전에 변경점과 휴무 여부를 구분한다.',
      tags:['schedule','safety'],
      updatedAt:0
    },
    {
      id:'default_kakao_share',
      category:'chat',
      title:'카카오 공유 기준',
      summary:'공유는 사용자가 대상 방을 직접 확인한 뒤 진행한다.',
      body:'- 카카오톡 공유는 자동 발송하지 않고 브라우저 공유 메뉴 또는 PNG 파일로 사용자가 대상 방을 확인한다.\n- 답변 근거가 불확실하면 확인 필요 상태로 남기고 임의 실행하지 않는다.',
      tags:['kakao','safety'],
      updatedAt:0
    },
    {
      id:'default_memo_manual',
      category:'etc',
      title:'메모 정리 기준',
      summary:'메모 원문은 기본 화면에 노출하지 않고 운영 기준으로 다듬어 반영한다.',
      body:'- 새 메모는 기존 항목과 비교해 같은 주제는 합치고, 다른 주제는 별도 항목으로 분리한다.\n- 원문 표현을 그대로 복사하지 않고 판단 기준과 처리 방법 중심으로 정리한다.',
      tags:['manual','memo'],
      updatedAt:0
    },
    {
      id:'default_recipe_boundary',
      category:'recipe',
      title:'레시피 참조 범위',
      summary:'레시피 세부 원본과 카카오 답변용 요약은 분리한다.',
      body:'- 타이머, 수량, 절차 세부값은 레시피 원본 영역을 기준으로 둔다.\n- 운영메뉴얼에는 카카오봇 답변에 필요한 대표 안내와 주의사항만 정리한다.',
      tags:['recipe','kakao','manual'],
      updatedAt:0
    }
  ];

  function cleanText(value,limit){
    return String(value==null?'':value).replace(/\r/g,'\n').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim().slice(0,limit||4000);
  }
  function uniq(list){
    const out=[],seen=new Set();
    (list||[]).forEach(value=>{
      const text=cleanText(value,80);
      const key=text.toLowerCase();
      if(text&&!seen.has(key)){seen.add(key);out.push(text);}
    });
    return out;
  }
  function normalizeCategory(value,text){
    const key=String(value||'').trim();
    if(CATEGORIES[key])return key;
    const body=String(text||'').toLowerCase();
    let best='etc',score=0;
    CATEGORY_ORDER.forEach(cat=>{
      if(cat==='etc')return;
      const current=CATEGORIES[cat].keywords.reduce((sum,kw)=>sum+(body.includes(kw.toLowerCase())?1:0),0);
      if(current>score){score=current;best=cat;}
    });
    return best;
  }
  function categoryLabel(value){
    const key=CATEGORIES[value]?value:'etc';
    return CATEGORIES[key].label;
  }
  function splitTextUnits(value){
    const text=cleanText(value,4000);
    if(!text)return [];
    return text.split(/\n+|[.?!。！？]+/).map(part=>cleanText(part.replace(/^[-*•\d.)\s]+/,''),220)).filter(Boolean);
  }
  function tagsForText(text,category,tags){
    const body=String(text||'').toLowerCase();
    const found=(tags||[]).map(String);
    TAGS.forEach(([id,,keys])=>{
      if(keys.some(kw=>body.includes(kw.toLowerCase())))found.push(id);
    });
    if(category&&category!=='etc')found.push(category);
    return uniq(found).slice(0,8);
  }
  function titleFromText(text,category){
    const body=String(text||'');
    const tag=categoryLabel(category);
    if(/카카오|카톡|공유|전송/.test(body))return '카카오 공유 기준';
    if(/근무표|스케줄|휴무|출근|퇴근/.test(body))return '근무표 처리 기준';
    if(/레시피|타이머|조리|메뉴/.test(body))return '레시피 안내 기준';
    if(/발주|재고|주문|입고/.test(body))return '발주 처리 기준';
    if(/하이닉스|사이트|이미지|png|브라우저|다운로드|출력/.test(body.toLowerCase()))return '이미지 출력 기준';
    const first=splitTextUnits(body)[0]||tag+' 운영 기준';
    return cleanText(first.replace(/^(메모|요청|정리)\s*[:：-]?\s*/,'')||tag+' 운영 기준',36);
  }
  function rewriteOperationalLine(line,category){
    const text=cleanText(line,300);
    if(!text)return '';
    if(/카카오|카톡|공유|전송/.test(text)&&/자동|방|대상|확인|금지|하지/.test(text)){
      return '카카오톡 공유는 자동 발송하지 않고 사용자가 대상 방을 확인한다.';
    }
    if(/원문|메모|복사|그대로/.test(text)&&/보관|노출|복사|정리/.test(text)){
      return '메모 원문은 기본 화면에 노출하지 않고 운영 기준으로 다듬어 반영한다.';
    }
    if(/근무표|스케줄|휴무|출근|퇴근/.test(text)){
      return '근무표 변경은 기존 근무, 휴무, 확정 상태를 비교한 뒤 반영한다.';
    }
    if(/레시피|타이머|조리|메뉴/.test(text)){
      return '레시피 세부 원본은 전용 영역을 기준으로 두고 운영메뉴얼에는 안내용 요약만 둔다.';
    }
    if(/발주|재고|주문|입고/.test(text)){
      return '발주 관련 예외는 재고와 주문 단위를 확인한 뒤 처리 기준으로 정리한다.';
    }
    if(/하이닉스|사이트|이미지|png|브라우저|다운로드|출력/.test(text.toLowerCase())){
      return '근무표 출력은 하이닉스 사이트 화면과 카카오 전달용 PNG 이미지를 기준으로 한다.';
    }
    const normalized=text
      .replace(/해야함|해야 함|해야한다/g,'한다')
      .replace(/하면 안됨|하면 안 됨|하지말것|금지/g,'하지 않는다')
      .replace(/카톡/g,'카카오톡')
      .replace(/메뉴얼/g,'메뉴얼')
      .replace(/\s+/g,' ')
      .replace(/[~]+/g,' ')
      .trim();
    if(category==='safety'&&!/확인|하지 않는다|보류/.test(normalized))return normalized+' 여부를 확인한다.';
    return normalized;
  }
  function bodyFromMemo(text,category){
    const lines=uniq(splitTextUnits(text).map(line=>rewriteOperationalLine(line,category))).slice(0,5);
    if(!lines.length)lines.push('관련 상황을 확인한 뒤 기존 운영 기준과 맞춰 처리한다.');
    return lines.map(line=>'- '+line.replace(/^-\s*/,'')).join('\n');
  }
  function extractLines(body){
    return splitTextUnits(body).map(line=>line.replace(/^-\s*/,'')).filter(Boolean);
  }
  function summarize(body,category){
    const first=extractLines(body)[0];
    return cleanText(first||categoryLabel(category)+' 기준을 확인한다.',110);
  }
  function normalizeManualEntry(entry,options){
    const item=(entry&&typeof entry==='object')?entry:{body:entry};
    const sourceType=(options&&options.sourceType)||String(item.sourceType||item.source_type||'manual');
    const sourceId=cleanText(item.id||item.sourceMemoId||item.source_memo_id||item.requestId||item.request_id||'',120);
    const rawBody=cleanText(item.body||item.text||item.memo||item.content||item.summary||'',4000);
    const category=normalizeCategory(item.category||item.manual_category,rawBody+' '+(item.title||''));
    const title=cleanText(item.title||titleFromText(rawBody,category),80);
    const body=sourceType==='memo'?bodyFromMemo(rawBody,category):cleanText(rawBody,4000);
    const tags=tagsForText([title,body,rawBody].join(' '),category,Array.isArray(item.tags)?item.tags:String(item.tags||'').split(/[,\s]+/));
    const updatedAt=Number(item.updatedAt||item.updated_at_ms||item.createdAt||item.created_at_ms||0)||0;
    const normalized={
      id:cleanText(item.id||('manual_'+hashText(title+'|'+body)),140),
      category,
      categoryLabel:categoryLabel(category),
      title:title||titleFromText(body,category),
      summary:cleanText(item.summary||summarize(body,category),130),
      body,
      tags,
      status:cleanText(item.status||'',40),
      updatedAt,
      sourceIds:uniq([sourceId].concat(item.sourceIds||item.source_ids||[])),
      sourceTypes:uniq([sourceType].concat(item.sourceTypes||item.source_types||[])),
      sourceCount:Number(item.sourceCount||item.source_count||0)||1,
      conflicts:[]
    };
    if(!normalized.body)normalized.body=bodyFromMemo(normalized.title,category);
    normalized.summary=summarize(normalized.summary||normalized.body,category);
    return normalized;
  }
  function hashText(text){
    let h=2166136261;
    const value=String(text||'');
    for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}
    return (h>>>0).toString(36);
  }
  function scoreMatch(a,b){
    if(!a||!b)return 0;
    let score=a.category===b.category?3:0;
    const at=new Set(a.tags||[]),bt=new Set(b.tags||[]);
    bt.forEach(tag=>{if(at.has(tag))score+=1;});
    const aw=new Set(cleanText(a.title+' '+a.summary,200).split(/\s+/).filter(x=>x.length>1));
    cleanText(b.title+' '+b.summary,200).split(/\s+/).forEach(word=>{if(word.length>1&&aw.has(word))score+=1;});
    return score;
  }
  function mergeEntries(base,addition){
    const lines=uniq(extractLines(base.body).concat(extractLines(addition.body))).slice(0,7);
    const tags=uniq([].concat(base.tags||[],addition.tags||[])).slice(0,8);
    const sourceIds=uniq([].concat(base.sourceIds||[],addition.sourceIds||[]));
    const sourceTypes=uniq([].concat(base.sourceTypes||[],addition.sourceTypes||[]));
    const merged=Object.assign({},base,{
      title:base.title||addition.title,
      summary:summarize(lines.join('\n'),base.category),
      body:lines.map(line=>'- '+line.replace(/^-\s*/,'')).join('\n'),
      tags,
      updatedAt:Math.max(Number(base.updatedAt||0),Number(addition.updatedAt||0),Date.now()),
      sourceIds,
      sourceTypes,
      sourceCount:(Number(base.sourceCount||1)+Number(addition.sourceCount||1))
    });
    merged.conflicts=detectManualConflicts([merged]);
    return merged;
  }
  function conflictFlags(text){
    const body=String(text||'');
    return {
      autoSend:/자동.{0,8}(전송|발송|공유)|카카오.{0,8}자동/.test(body),
      manualSend:/직접.{0,8}(확인|선택)|자동.{0,8}(금지|하지 않|없)|공유 (메뉴|파일)|PNG/.test(body),
      deleteData:/삭제|초기화|데이터 삭제/.test(body),
      preserveData:/보존|유지|삭제하지|초기화하지|되돌리지/.test(body),
      rawVisible:/원문.{0,8}(노출|표시|보관)|그대로.{0,8}(복사|표시)/.test(body),
      rawHidden:/원문.{0,8}(노출하지|보관하지)|그대로.{0,8}복사하지|다듬어/.test(body)
    };
  }
  function detectManualConflicts(entries){
    const flags=(entries||[]).reduce((acc,item)=>{
      const f=conflictFlags([item.title,item.summary,item.body].join('\n'));
      Object.keys(f).forEach(k=>{acc[k]=acc[k]||f[k];});
      return acc;
    },{});
    const out=[];
    if(flags.autoSend&&flags.manualSend)out.push('카카오 공유의 자동 전송 여부가 서로 다릅니다.');
    if(flags.deleteData&&flags.preserveData)out.push('데이터 삭제/보존 기준이 함께 있어 확인이 필요합니다.');
    if(flags.rawVisible&&flags.rawHidden)out.push('메모 원문 노출 여부가 서로 다릅니다.');
    return out;
  }
  function sortEntries(entries){
    const order=new Map(CATEGORY_ORDER.map((id,index)=>[id,index]));
    return entries.slice().sort((a,b)=>{
      const c=(order.get(a.category)||99)-(order.get(b.category)||99);
      if(c)return c;
      return Number(b.updatedAt||0)-Number(a.updatedAt||0)||String(a.title).localeCompare(String(b.title),'ko');
    });
  }
  function mergeManualFromMemo(existingEntries,memos,options){
    const base=(existingEntries&&existingEntries.length?existingEntries:DEFAULT_MANUAL_ENTRIES).map(item=>normalizeManualEntry(item,{sourceType:'manual'}));
    const merged=base.slice();
    (memos||[]).map(item=>normalizeManualEntry(item,{sourceType:'memo'})).forEach(memo=>{
      let bestIndex=-1,bestScore=0;
      merged.forEach((entry,index)=>{const score=scoreMatch(entry,memo);if(score>bestScore){bestScore=score;bestIndex=index;}});
      if(bestIndex>=0&&bestScore>=4)merged[bestIndex]=mergeEntries(merged[bestIndex],memo);
      else merged.push(memo);
    });
    const globalConflicts=detectManualConflicts(merged);
    return sortEntries(merged).map(item=>Object.assign({},item,{conflicts:uniq([].concat(item.conflicts||[],globalConflicts))}));
  }
  function filterManualEntries(entries,filters){
    const f=filters||{},q=cleanText(f.query||'',80).toLowerCase(),cat=f.category||'all',tag=f.tag||'all';
    return (entries||[]).filter(item=>{
      if(cat!=='all'&&item.category!==cat)return false;
      if(tag!=='all'&&!(item.tags||[]).includes(tag))return false;
      if(q&&!([item.title,item.summary,item.body,(item.tags||[]).join(' ')].join(' ').toLowerCase().includes(q)))return false;
      return true;
    });
  }

  return {
    CATEGORIES,
    CATEGORY_ORDER,
    TAGS,
    DEFAULT_MANUAL_ENTRIES,
    cleanText,
    normalizeManualEntry,
    mergeManualFromMemo,
    detectManualConflicts,
    filterManualEntries,
    categoryLabel
  };
});
