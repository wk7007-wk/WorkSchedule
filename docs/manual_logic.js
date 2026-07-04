(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.WorkScheduleManualLogic=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';

  const CATEGORY_ORDER=['work','manual','customer_support','platform_help','chat','recipe','delivery','task','discount','weather','news','regulation','order','output','safety','etc'];
  const CATEGORIES={
    work:{label:'근무',keywords:['근무','근무표','스케줄','출근','퇴근','휴무','확정','시간','직원']},
    manual:{label:'운영메뉴얼',keywords:['메뉴얼','매뉴얼','운영기준','운영 기준','편입','색인','원문','정리']},
    customer_support:{label:'고객안내',keywords:['고객센터','고객 센터','문의','상담','안내','취소','변경']},
    platform_help:{label:'플랫폼안내',keywords:['플랫폼','배민','배달의민족','쿠팡이츠','BBQ','앱 상태','주문 상태']},
    chat:{label:'카카오/대화',keywords:['카카오','카톡','채팅','답변','운영방','전송','공유','브리핑','메시지']},
    recipe:{label:'레시피/타이머',keywords:['레시피','타이머','조리','메뉴','수량','재료','주의사항','치킨']},
    delivery:{label:'배달정보',keywords:['배달','주소','건물명','호수','비번','비밀번호','group_only','group only','도착']},
    task:{label:'할일/알람',keywords:['할일','할 일','알람','예약','투두','todo','마감','리마인드','기한']},
    discount:{label:'할인/행사',keywords:['할인','행사','프로모션','특가','쿠폰','이벤트','증정']},
    weather:{label:'날씨',keywords:['날씨','기상','비','눈','폭염','기온','강수']},
    news:{label:'뉴스',keywords:['뉴스','속보','하이닉스뉴스','월드컵','경기일정','일정', '보도']},
    regulation:{label:'규정',keywords:['규정','일반음식점','법','행정','신고','허가','출처','갱신일','요약']},
    order:{label:'발주',keywords:['발주','주문','재고','입고','품절','수량','매입','거래처']},
    output:{label:'출력',keywords:['하이닉스','사이트','이미지','png','브라우저','다운로드','출력','공유']},
    safety:{label:'확인/안전',keywords:['금지','삭제','초기화','확인','승인','주의','위험','보류','실행']},
    etc:{label:'기타',keywords:[]}
  };
  const TAGS=[
    ['schedule','근무표',['근무표','스케줄','휴무','출근','퇴근']],
    ['manual','메뉴얼',['메뉴얼','매뉴얼','운영기준','운영 기준','편입','정리']],
    ['customer_support','고객안내',['고객센터','고객 센터','문의','상담','안내','취소','변경']],
    ['platform_help','플랫폼안내',['플랫폼','배민','배달의민족','쿠팡이츠','BBQ','앱 상태','주문 상태']],
    ['kakao','카카오',['카카오','카톡','운영방','공유','전송','답변']],
    ['memo','메모',['메모','기록','원문']],
    ['text','텍스트',['텍스트','문자','본문','문장','노트']],
    ['url','URL',['url','링크','주소','웹']],
    ['image','이미지',['이미지','사진','붙여넣기','드래그','업로드','파일']],
    ['cli','CLI',['cli','codex','codex_ops','터미널']],
    ['timer','타이머',['타이머','알람','예약','시간']],
    ['site','사이트',['사이트','웹','페이지','브라우저']],
    ['delivery','배달정보',['배달','주소','건물명','비번','비밀번호','group_only','group only']],
    ['task','할일',['할일','할 일','todo','리마인드','마감','기한']],
    ['discount','할인행사',['할인','행사','이벤트','프로모션','쿠폰']],
    ['weather','날씨',['날씨','기상','비','눈','폭염','기온']],
    ['news','뉴스',['뉴스','속보','월드컵','경기','보도']],
    ['regulation','규정',['규정','일반음식점','법','허가','신고','요약','출처','갱신일']],
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
      id:'default_intake_envelope',
      category:'manual',
      title:'통합 입력층 계약',
      summary:'텍스트, URL, 이미지, 카카오 대화, CLI, 타이머앱, 사이트 입력은 즉시 큐용 envelope로 만든다.',
      body:'- 입력 원문은 즉시 Codex CLI 또는 codex_ops 요청 큐에 넣을 envelope로 변환한다.\n- 리소스, 모델, MCP 필요 여부, 카테고리, 태그, 반영 방식은 CLI가 최종 판단한다.\n- 대기는 하지 않고 큐에 먼저 쌓고, 나중에 분석과 반영을 분리한다.',
      tags:['cli','text','url','image','kakao','timer','site','manual'],
      updatedAt:0
    },
    {
      id:'default_briefing_contract',
      category:'manual',
      title:'브리핑 탭 기준',
      summary:'브리핑은 일정, 알람, 할인/행사, 뉴스, 날씨, 근무, 오늘 필요한 메뉴얼을 함께 요약한다.',
      body:'- 브리핑 탭은 오늘 필요한 작업과 확인 항목을 한 번에 읽을 수 있어야 한다.\n- 사이트 상세, 카카오 요약, 근무표 이미지 출력 기준은 짧은 문장으로 구분해 둔다.\n- 카카오봇 답변이 필요한 메뉴얼은 색인 가능한 항목으로 유지한다.',
      tags:['manual','schedule','task','discount','weather','news','work','kakao'],
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
  const FIREBASE_MANUAL_ENTRY_KEYS=['entries','manual_entries','manualEntries','items','records'];
  const FIREBASE_MANUAL_MEMO_KEYS=['memos','memo_entries','memoEntries','pending_memos','pendingMemos','memo_candidates','memoCandidates'];
  const FIREBASE_MANUAL_ROOT_KEYS=['latest','current','snapshot','data'];
  const FIREBASE_MANUAL_META_KEYS=new Set(['created_at','created_at_ms','updated_at','updated_at_ms','version','schema','schema_version','source','status','meta','metadata','history']);

  function cleanText(value,limit){
    return String(value==null?'':value).replace(/\r/g,'\n').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim().slice(0,limit||4000);
  }
  function isPlainObject(value){
    return value&&typeof value==='object'&&!Array.isArray(value);
  }
  function looksLikeManualRow(value){
    if(!isPlainObject(value))return false;
    return ['body','text','memo','content','summary','title','manual_category','category'].some(key=>value[key]!=null);
  }
  function manualRowsFromValue(value){
    if(Array.isArray(value))return value;
    if(isPlainObject(value)){
      return Object.keys(value)
        .filter(key=>!FIREBASE_MANUAL_META_KEYS.has(key))
        .map(key=>{
          const row=value[key];
          return isPlainObject(row)?Object.assign({id:key},row):{id:key,body:row};
        })
        .filter(looksLikeManualRow);
    }
    return cleanText(value,4000)?[{body:value}]:[];
  }
  function hasManualContainers(value){
    if(!isPlainObject(value))return false;
    return FIREBASE_MANUAL_ENTRY_KEYS.concat(FIREBASE_MANUAL_MEMO_KEYS).some(key=>value[key]!=null);
  }
  function pickFirebaseManualRoot(payload){
    if(!isPlainObject(payload))return {};
    if(hasManualContainers(payload)||looksLikeManualRow(payload))return payload;
    for(const key of FIREBASE_MANUAL_ROOT_KEYS){
      if(isPlainObject(payload[key])&&(hasManualContainers(payload[key])||looksLikeManualRow(payload[key])||manualRowsFromValue(payload[key]).length))return payload[key];
    }
    return payload;
  }
  function collectFirebaseRows(root,keys){
    return keys.flatMap(key=>manualRowsFromValue(root&&root[key]));
  }
  function firebaseManualSources(payload,options){
    const root=pickFirebaseManualRoot(payload);
    let entries=collectFirebaseRows(root,FIREBASE_MANUAL_ENTRY_KEYS);
    let memos=collectFirebaseRows(root,FIREBASE_MANUAL_MEMO_KEYS);
    if(!entries.length&&!memos.length&&isPlainObject(root)){
      entries=manualRowsFromValue(root);
    }
    const sourcePath=cleanText(options&&options.sourcePath,160)||'/packhelper/ops_manual';
    const decorate=(rows,sourceType)=>rows.map(row=>{
      const item=isPlainObject(row)?Object.assign({},row):{body:row};
      if(!item.sourceType&&!item.source_type)item.sourceType=sourceType;
      if(!item.source_path)item.source_path=sourcePath;
      return item;
    });
    return {
      sourcePath,
      entries:decorate(entries,'firebase_manual'),
      memos:decorate(memos,'memo'),
      rawEntryCount:entries.length,
      rawMemoCount:memos.length
    };
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
  function candidateDomainsForText(text,sourceType,category){
    const body=String(text||'').toLowerCase();
    const scores={};
    function bump(cat,score){
      if(!cat||cat==='etc'||!score)return;
      scores[cat]=(scores[cat]||0)+score;
    }
    Object.keys(CATEGORIES).forEach(cat=>{
      if(cat==='etc')return;
      const score=(CATEGORIES[cat].keywords||[]).reduce((sum,kw)=>sum+(body.includes(String(kw||'').toLowerCase())?1:0),0);
      if(score)bump(cat,score);
    });
    const source=String(sourceType||'').trim().toLowerCase();
    if(source==='image'||source==='site'||source==='url')bump('output',2);
    if(source==='kakao')bump('chat',3);
    if(source==='cli')bump('manual',2);
    if(source==='timer')bump('task',2);
    if(source==='manual')bump('manual',2);
    if(category&&category!=='etc')bump(category,4);
    return Object.entries(scores)
      .sort((a,b)=>b[1]-a[1]||CATEGORY_ORDER.indexOf(a[0])-CATEGORY_ORDER.indexOf(b[0]))
      .map(([cat])=>cat)
      .filter((cat,index,self)=>self.indexOf(cat)===index)
      .slice(0,6);
  }
  function titleFromText(text,category){
    const body=String(text||'');
    const tag=categoryLabel(category);
    if(/카카오|카톡|공유|전송/.test(body))return '카카오 공유 기준';
    if(/근무표|스케줄|휴무|출근|퇴근/.test(body))return '근무표 처리 기준';
    if(/레시피|타이머|조리|메뉴/.test(body))return '레시피 안내 기준';
    if(/배달|주소|건물명|비번|비밀번호|group_only/.test(body.toLowerCase()))return '배달정보 기준';
    if(/할일|할 일|알람|예약|마감|리마인드/.test(body))return '할일/알람 기준';
    if(/할인|행사|프로모션|이벤트|쿠폰/.test(body))return '할인/행사 기준';
    if(/날씨|기상|비|눈|폭염|기온/.test(body))return '날씨 확인 기준';
    if(/뉴스|월드컵|경기|보도/.test(body))return '뉴스 확인 기준';
    if(/규정|일반음식점|허가|신고|출처|갱신일/.test(body))return '규정 요약 기준';
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
    if(/배달|주소|건물명|비번|비밀번호|group_only/.test(text.toLowerCase())){
      return '배달정보는 주소, 건물명, 비밀번호처럼 group_only 항목과 일반 안내를 분리한다.';
    }
    if(/할일|할 일|알람|예약|마감|리마인드/.test(text)){
      return '할일과 알람, 예약은 마감 시간과 실행 조건을 함께 적는다.';
    }
    if(/할인|행사|프로모션|이벤트|쿠폰/.test(text)){
      return '할인행사 정보는 적용 기간, 대상, 예외를 함께 적는다.';
    }
    if(/날씨|기상|비|눈|폭염|기온/.test(text)){
      return '날씨 정보는 확인일과 지역을 함께 두고 최신성 여부를 표시한다.';
    }
    if(/뉴스|월드컵|경기|보도/.test(text)){
      return '뉴스와 경기 일정은 확인일, 출처, 요약을 함께 남긴다.';
    }
    if(/규정|일반음식점|허가|신고|출처|갱신일/.test(text)){
      return '일반음식점 규정은 MCP 조회 후 요약, 출처, 갱신일을 함께 남긴다.';
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
  function searchIndexForEntry(entry){
    return cleanText([
      entry.title,
      entry.summary,
      entry.body,
      entry.categoryLabel,
      (entry.tags||[]).join(' '),
      (entry.sourceIds||[]).join(' '),
      (entry.sourceTypes||[]).join(' '),
      (entry.sourceUrls||[]).join(' ')
    ].join(' '),800);
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
      sourceUrls:uniq([].concat(item.sourceUrls||item.source_urls||item.sourceUrl||item.source_url||[])),
      source_urls:uniq([].concat(item.sourceUrls||item.source_urls||item.sourceUrl||item.source_url||[])),
      sourceCount:Number(item.sourceCount||item.source_count||0)||1,
      searchIndex:'',
      conflicts:[]
    };
    if(!normalized.body)normalized.body=bodyFromMemo(normalized.title,category);
    normalized.summary=summarize(normalized.summary||normalized.body,category);
    normalized.searchIndex=searchIndexForEntry(normalized);
    return normalized;
  }
  const INTAKE_SOURCE_LABELS={text:'텍스트',url:'URL',image:'이미지',kakao:'카카오',cli:'CLI',timer:'타이머앱',site:'사이트',manual:'메뉴얼',default:'입력'};
  const INTAKE_SOURCE_ORDER=['text','url','image','kakao','cli','timer','site','manual'];
  function normalizeIntakeSource(value){
    const key=String(value||'').trim().toLowerCase();
    if(!key)return'default';
    if(INTAKE_SOURCE_ORDER.includes(key))return key;
    if(/url|link|uri/.test(key))return'url';
    if(/image|img|photo|screenshot|파일|붙여넣기|드래그/.test(key))return'image';
    if(/kakao|kkt|chat|conversation|대화|카톡/.test(key))return'kakao';
    if(/cli|codex|ops|terminal|터미널/.test(key))return'cli';
    if(/timer|alarm|todo|reservation|예약|알람/.test(key))return'timer';
    if(/site|web|browser|웹|사이트/.test(key))return'site';
    if(/manual|memo|note|메모/.test(key))return'manual';
    return'text';
  }
  function intakeLabel(sourceType){
    return INTAKE_SOURCE_LABELS[normalizeIntakeSource(sourceType)]||INTAKE_SOURCE_LABELS.default;
  }
  function plainString(value){
    if(value==null)return'';
    if(typeof value==='string')return cleanText(value,4000);
    if(Array.isArray(value))return value.map(item=>plainString(item)).filter(Boolean).join('\n');
    if(isPlainObject(value)){
      if(value.text!=null)return plainString(value.text);
      if(value.body!=null)return plainString(value.body);
      if(value.content!=null)return plainString(value.content);
    }
    return cleanText(value,4000);
  }
  function attachmentFromInput(item){
    if(!item)return null;
    const file=isPlainObject(item)?(item.file||item):item;
    const name=cleanText(file.name||file.filename||file.title||'',180);
    const mime=cleanText(file.type||file.mimeType||file.mime||'',80);
    const size=Number(file.size||0)||0;
    const kind=String(file.kind||file.mediaKind||'').toLowerCase();
    const dataUrl=cleanText(file.dataUrl||file.data_url||file.preview||'',1200);
    const type=kind||(/image\//.test(mime)?'image':'file');
    return {type,name,mime,size,dataUrl};
  }
  function attachPreviewText(attachments){
    return (attachments||[]).map(att=>{
      const name=att.name||att.mime||att.type||'파일';
      const size=att.size?Math.round(att.size/1024)+'KB':'';
      return '['+att.type+'] '+name+(size?' '+size:'');
    }).join('\n');
  }
  function bodyFromIntakeEnvelope(envelope){
    const lines=[];
    if(envelope.text)lines.push(envelope.text);
    if(envelope.url)lines.push('URL: '+envelope.url);
    if(envelope.attachments&&envelope.attachments.length)lines.push(attachPreviewText(envelope.attachments));
    if(envelope.note)lines.push('note: '+envelope.note);
    return lines.filter(Boolean).join('\n');
  }
  function classifyIntakeEnvelope(envelope){
    const item=envelope||{};
    const raw=[item.text,item.url,item.note,(item.attachments||[]).map(att=>att.name||att.mime||att.type||'').join(' '),item.sourceLabel,item.sourceType].join(' ');
    let category=normalizeCategory(item.category||item.manual_category,raw);
    if(category==='etc'){
      if(item.sourceType==='kakao')category='chat';
      else if(item.sourceType==='image'||item.sourceType==='site'||item.sourceType==='url')category='output';
      else if(item.sourceType==='timer')category='task';
      else if(item.sourceType==='cli'||item.sourceType==='manual')category='manual';
    }
    const tags=tagsForText(raw,category,[].concat(item.tags||[]));
    const candidateDomains=candidateDomainsForText(raw,item.sourceType,category);
    return {category,tags,candidateDomains,categoryLabel:categoryLabel(category)};
  }
  function buildInputEnvelope(input,options){
    const sourceType=normalizeIntakeSource(options&&options.sourceType||input&&input.sourceType||input&&input.source_type||input&&input.kind||input&&input.type||'text');
    const text=plainString(input&&input.text!=null?input.text:input&&input.body!=null?input.body:input&&input.memo!=null?input.memo:input&&input.content!=null?input.content:input&&input.note!=null?input.note:input);
    const url=cleanText((input&&input.url)!=null?input.url:input&&input.href!=null?input.href:'',2000);
    const attachments=[].concat(input&&input.attachments?input.attachments:[],input&&input.file?input.file:[],input&&input.files?input.files:[]).filter(Boolean).map(attachmentFromInput).filter(Boolean);
    const sourceLabel=cleanText((options&&options.sourceLabel)||input&&input.sourceLabel||input&&input.label||intakeLabel(sourceType),120);
    const classification=classifyIntakeEnvelope({sourceType,text,url,attachments,note:plainString(input&&input.note),category:itemCategory(input),tags:itemTags(input)});
    const capturedAtMs=Number((options&&options.capturedAtMs)||input&&input.capturedAtMs||Date.now())||Date.now();
    const envelope={
      id:cleanText((input&&input.id)||options&&options.id||'intake_'+hashText([sourceType,text,url,attachPreviewText(attachments),capturedAtMs].join('|')),160),
      requestType:'codex_ops_intake',
      queueTarget:'codex_ops',
      queueState:'queued',
      origin:'workschedule_web',
      sourceType,
      sourceLabel,
      text,
      url,
      attachments,
      note:plainString(input&&input.note),
      title:cleanText((input&&input.title)||titleFromText(text||url||attachPreviewText(attachments),classification.category),80),
      summary:cleanText((input&&input.summary)||summarize(text||url||attachPreviewText(attachments),classification.category),130),
      body:cleanText(bodyFromIntakeEnvelope({text,url,attachments,note:plainString(input&&input.note)}),4000),
      capturedAtMs,
      capturedAtIso:new Date(capturedAtMs).toISOString(),
      decisionRequired:{resource:true,model:true,needsMcp:true,category:true,tags:true,reflectionMethod:true},
      decision:null,
      classificationHints:classification,
      candidateDomains:classification.candidateDomains||[],
      sourceHints:{
        sourceType,
        sourceLabel,
        sourceKind:sourceType,
        sourceOrigin:cleanText((options&&options.sourceOrigin)||input&&input.sourceOrigin||'direct_input',80)
      },
      targetContext:cleanText((options&&options.targetContext)||input&&input.targetContext||'codex_ops',80),
      searchIndex:''
    };
    envelope.searchIndex=searchIndexForEntry({
      title:envelope.title,
      summary:envelope.summary,
      body:envelope.body,
      categoryLabel:classification.categoryLabel,
      tags:[sourceType].concat(classification.tags||[]),
      sourceIds:[envelope.id],
      sourceTypes:['intake',sourceType]
    });
    return envelope;
  }
  function itemCategory(item){
    return cleanText(item&&item.category||item&&item.manual_category||'',40);
  }
  function itemTags(item){
    return Array.isArray(item&&item.tags)?item.tags:String(item&&item.tags||'').split(/[,\s]+/).filter(Boolean);
  }
  function inputEnvelopeToManualMemo(input,options){
    const envelope=isPlainObject(input)&&input.requestType==='codex_ops_intake'?input:buildInputEnvelope(input,options);
    const classification=envelope.classificationHints||classifyIntakeEnvelope(envelope);
    return normalizeManualEntry({
      id:envelope.id,
      title:envelope.title,
      summary:envelope.summary,
      body:envelope.body,
      category:classification.category,
      tags:[].concat(envelope.tags||[],classification.tags||[],envelope.sourceType?['input_'+envelope.sourceType]:[]),
      sourceType:'intake',
      sourceIds:[envelope.id],
      sourceTypes:['intake',envelope.sourceType],
      updatedAt:envelope.capturedAtMs,
      status:envelope.queueState,
      sourcePath:envelope.sourceHints&&envelope.sourceHints.sourceOrigin?envelope.sourceHints.sourceOrigin:'direct_input'
    },{sourceType:'intake'});
  }
  function sectionForCategory(entries,category,title,summary){
    const list=(entries||[]).filter(item=>item.category===category).slice(0,4);
    return {
      key:category,
      title:title||categoryLabel(category),
      summary:summary||'',
      count:list.length,
      items:list,
      emptyState:list.length?'':(title||categoryLabel(category))+' 항목 대기',
      pendingCount:list.length?0:1
    };
  }
  function buildBriefingSections(entries,options){
    const all=(entries||[]).map(item=>normalizeManualEntry(item,{sourceType:item&&item.sourceType||item&&item.source_type||'manual'}));
    const byCategory={};
    all.forEach(item=>{if(!byCategory[item.category])byCategory[item.category]=[];byCategory[item.category].push(item);});
    const top=Object.keys(byCategory).sort((a,b)=>(byCategory[b].length-byCategory[a].length)||((CATEGORY_ORDER.indexOf(a)===-1?99:CATEGORY_ORDER.indexOf(a))-(CATEGORY_ORDER.indexOf(b)===-1?99:CATEGORY_ORDER.indexOf(b))));
    const schedule=options&&options.schedule||{};
    const sectionSummary={
      work:'근무 '+cleanText(schedule.workSummary||'',60),
      task:'할일/알람 '+cleanText(schedule.taskSummary||'',60),
      discount:'할인/행사 '+cleanText(schedule.discountSummary||'',60),
      news:'뉴스 '+cleanText(schedule.newsSummary||'',60),
      weather:'날씨 '+cleanText(schedule.weatherSummary||'',60),
      manual:'오늘 필요한 메뉴얼 '+cleanText(schedule.manualSummary||'',60)
    };
    const sections=[
      {key:'schedule',title:'일정',summary:cleanText(schedule.summary||'',120),count:Number(schedule.count||0)||0,items:[],emptyState:Number(schedule.count||0)?'':'일정 대기',pendingCount:Number(schedule.count||0)?0:1},
      sectionForCategory(all,'task','할일/알람',sectionSummary.task),
      sectionForCategory(all,'discount','할인/행사',sectionSummary.discount),
      sectionForCategory(all,'news','뉴스',sectionSummary.news),
      sectionForCategory(all,'weather','날씨',sectionSummary.weather),
      sectionForCategory(all,'work','근무',sectionSummary.work),
      sectionForCategory(all,'manual','오늘 필요한 메뉴얼',sectionSummary.manual),
      sectionForCategory(all,'recipe','레시피/타이머','카카오봇이 참고할 레시피와 타이머 기준'),
      sectionForCategory(all,'delivery','배달정보','주소, 건물명, 비번처럼 group_only가 필요한 정보'),
      sectionForCategory(all,'regulation','규정','일반음식점 규정은 MCP 조회 후 요약/출처/갱신일을 붙인다')
    ];
    const indexable=all.map(item=>Object.assign({},item,{searchIndex:searchIndexForEntry(item)}));
    return {
      summary:cleanText(schedule.summary||top.slice(0,3).map(key=>categoryLabel(key)+' '+(byCategory[key][0]&&byCategory[key][0].title||'')).join(' · ')||'브리핑 항목을 확인한다.',160),
      sections,
      topCategories:top,
      indexable,
      needsManual:sectionForCategory(all,'manual','오늘 필요한 메뉴얼'),
      counts:Object.keys(byCategory).reduce((acc,key)=>{acc[key]=byCategory[key].length;return acc;},{}),
      pendingCount:all.filter(item=>String(item.status||'').toLowerCase()==='queued').length,
      schedule:options&&options.schedule||{},
      intakeCount:Number(options&&options.intakeCount||0)||0
    };
  }
  function normalizeFirebaseManualPayload(payload,options){
    const sources=firebaseManualSources(payload,options);
    return Object.assign({},sources,{
      entries:sources.entries.map(item=>normalizeManualEntry(item,{sourceType:item.sourceType||item.source_type||'firebase_manual'})),
      memos:sources.memos.map(item=>normalizeManualEntry(item,{sourceType:item.sourceType||item.source_type||'memo'}))
    });
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
    const sourceUrls=uniq([].concat(base.sourceUrls||[],addition.sourceUrls||[]));
    const merged=Object.assign({},base,{
      title:base.title||addition.title,
      summary:summarize(lines.join('\n'),base.category),
      body:lines.map(line=>'- '+line.replace(/^-\s*/,'')).join('\n'),
      tags,
      updatedAt:Math.max(Number(base.updatedAt||0),Number(addition.updatedAt||0),Date.now()),
      sourceIds,
      sourceTypes,
      sourceUrls,
      source_urls:sourceUrls,
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
    const base=(existingEntries&&existingEntries.length?existingEntries:DEFAULT_MANUAL_ENTRIES).map(item=>normalizeManualEntry(item,{sourceType:item&&item.sourceType||item&&item.source_type||'manual'}));
    const merged=base.slice();
    (memos||[]).map(item=>normalizeManualEntry(item,{sourceType:item&&item.sourceType||item&&item.source_type||'memo'})).forEach(memo=>{
      let bestIndex=-1,bestScore=0;
      merged.forEach((entry,index)=>{const score=scoreMatch(entry,memo);if(score>bestScore){bestScore=score;bestIndex=index;}});
      if(bestIndex>=0&&bestScore>=4)merged[bestIndex]=mergeEntries(merged[bestIndex],memo);
      else merged.push(memo);
    });
    const globalConflicts=detectManualConflicts(merged);
    return sortEntries(merged).map(item=>Object.assign({},item,{conflicts:uniq([].concat(item.conflicts||[],globalConflicts))}));
  }
  function mergeManualFromFirebasePayload(existingEntries,memos,payload,options){
    const sources=firebaseManualSources(payload,options);
    return mergeManualFromMemo([].concat(existingEntries||[],sources.entries),[].concat(memos||[],sources.memos),options);
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
    buildInputEnvelope,
    classifyIntakeEnvelope,
    inputEnvelopeToManualMemo,
    buildBriefingSections,
    normalizeFirebaseManualPayload,
    mergeManualFromFirebasePayload,
    mergeManualFromMemo,
    detectManualConflicts,
    filterManualEntries,
    categoryLabel,
    candidateDomainsForText
  };
});
