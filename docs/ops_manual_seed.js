(function(root){
  root.WorkScheduleManualSeed = {
    source: 'codex_seed_20260704',
    entries: [
      {
        id: 'seed_manual_input_principles',
        category: 'customer_support',
        title: '새 내용 알려주는 방법',
        summary: '새로 들어온 내용은 한 문장으로 먼저 알리고, 같은 주제는 묶어서 전달한다.',
        body: '- 새 내용은 한 문장으로 먼저 알린다.\n- 같은 주제는 묶고, 다른 주제는 나눠 적는다.\n- 직원이 바로 볼 수 있게 표현을 다듬는다.',
        tags: ['customer_support', 'manual', 'new_content'],
        status: 'active',
        updatedAt: 1783123201000
      },
      {
        id: 'seed_work_schedule_boundary',
        category: 'work',
        title: '근무 변경 요청 방법',
        summary: '근무 변경은 현재 근무를 먼저 확인한 뒤 날짜와 시간을 함께 적는다.',
        body: '- 날짜와 직원을 함께 적어서 변경 요청을 남긴다.\n- 이미 정해진 근무는 먼저 확인하고, 바꾸려는 시간도 같이 적는다.\n- 휴무가 섞이면 근무와 휴무를 분리해서 적는다.',
        tags: ['work', 'schedule', 'request'],
        status: 'active',
        updatedAt: 1783123202000
      },
      {
        id: 'seed_discount_briefing_same_day',
        category: 'discount',
        title: '행사 안내 기준',
        summary: '행사 소식은 적용 기간과 대상, 예외를 짧게 적는다.',
        body: '- 행사명만 쓰지 말고 적용 기간과 대상도 함께 적는다.\n- 시작과 끝나는 시각, 예외, 재안내 필요 여부를 같이 적는다.\n- 확정이 애매하면 보류로 적는다.',
        tags: ['discount', 'event', 'safety'],
        status: 'active',
        updatedAt: 1783123203000
      },
      {
        id: 'seed_delivery_lookup_rules',
        category: 'delivery',
        title: '배달정보 확인 기준',
        summary: '주소와 호수, 비밀번호는 확인된 최신 정보만 적는다.',
        body: '- 주소, 건물명, 호수, 비밀번호를 나눠서 확인한다.\n- 필요한 정보만 짧게 적고, 헷갈리면 확인 경로를 먼저 찾는다.\n- 추측해서 적지 않는다.',
        tags: ['delivery', 'address', 'password', 'group_only'],
        status: 'active',
        updatedAt: 1783123204000
      },
      {
        id: 'seed_task_alarm_rules',
        category: 'task',
        title: '할일/알림 등록 방법',
        summary: '할일은 해야 할 일, 마감, 반복 여부를 함께 적는다.',
        body: '- 해야 할 일과 마감 시간을 한 줄로 적는다.\n- 알림이 필요하면 반복 여부와 시간을 함께 적는다.\n- 담당자가 있으면 같이 적는다.',
        tags: ['task', 'alarm', 'todo'],
        status: 'active',
        updatedAt: 1783123205000
      },
      {
        id: 'manual_baemin_customer_menu_change',
        category: 'platform_help',
        title: '배민 주문 메뉴 변경 안내',
        summary: '배달의민족 주문은 앱 상태를 먼저 보고, 안 되면 취소와 재주문으로 안내한다.',
        body: '- 주문이 들어갔는지 먼저 확인한다.\n- 앱에서 변경이나 취소가 가능한 상태인지 본다.\n- 어렵다면 취소 후 재주문 또는 고객센터/가맹점 확인으로 안내한다.',
        tags: ['platform_help', 'baemin', 'order_change'],
        status: 'active',
        updatedAt: 1783123206000,
        sourceUrls: [
          'https://help.naver.com/service/30026/contents/20534?lang=ko',
          'https://ceo.baemin.com/guide/4268',
          'https://ceo.baemin.com/guide/4266'
        ]
      },
      {
        id: 'manual_coupangeats_customer_menu_change',
        category: 'platform_help',
        title: '쿠팡이츠 주문 메뉴 변경 안내',
        summary: '쿠팡이츠는 주문 수락 전후 상태를 먼저 보고, 수정이 어렵다면 취소와 매장 확인으로 안내한다.',
        body: '- 주문 수락 전이면 거절이나 취소 가능 여부를 먼저 본다.\n- 주문 수락 후에는 직접 수정보다 취소 가능 여부와 매장 확인을 우선한다.\n- 품절이 있으면 품절 전환 가능 여부를 함께 확인한다.',
        tags: ['platform_help', 'coupang_eats', 'order_change'],
        status: 'active',
        updatedAt: 1783123207000,
        sourceUrls: [
          'https://partners.coupangeats.com/start-guide/step-3/3530/',
          'https://partners.coupangeats.com/start-guide/step-2/4075/'
        ]
      },
      {
        id: 'manual_bbq_app_order_change',
        category: 'platform_help',
        title: 'BBQ 앱 주문 변경 안내',
        summary: 'BBQ 앱 주문은 완료 전후 상태를 먼저 보고, 완료 후 변경은 콜센터 확인으로 안내한다.',
        body: '- 주문 완료 전이면 앱 상태를 먼저 확인한다.\n- 주문 완료 후 변경이나 취소는 공식 안내에 따라 콜센터 확인으로 안내한다.\n- 제품 구성이나 가격이 달라질 수 있으니 화면과 실제 주문을 함께 본다.',
        tags: ['platform_help', 'bbq', 'order_change'],
        status: 'active',
        updatedAt: 1783123208000,
        sourceUrls: [
          'https://bbq.co.kr/mypage/guide'
        ]
      },
      {
        id: 'manual_bbq_gifticon_menu_change',
        category: 'coupon',
        title: 'BBQ 쿠폰 사용 안내',
        summary: '쿠폰은 먼저 등록하고, 장바구니에서 사용 가능 여부를 확인한다.',
        body: '- 쿠폰을 먼저 등록한다.\n- 장바구니에서 메뉴 변경과 사용 가능 여부를 확인한다.\n- 금액 조건이 있으면 주문 화면 기준으로 확인한다.',
        tags: ['coupon', 'bbq', 'gifticon'],
        status: 'active',
        updatedAt: 1783123209000,
        sourceUrls: [
          'https://bbq.co.kr/mypage/guide',
          'https://cstarinfo.tistory.com/entry/%EB%B9%84%EB%B9%84%ED%81%90-BBQ-%EA%B8%B0%ED%94%84%ED%8B%B0%EC%BD%98-%EC%96%B4%ED%94%8C-%EC%A3%BC%EB%AC%B8-%EB%B0%A9%EB%B2%95-%EB%A9%94%EB%89%B4-%EB%B3%80%EA%B2%BD-%ED%99%A9%EA%B8%88%EC%98%AC%EB%A6%AC%EB%B8%8C-%ED%99%A9%EC%98%AC-%EB%B0%98%EB%B0%98'
        ]
      },
      {
        id: 'manual_platform_menu_change_staff_reply',
        category: 'customer_support',
        title: '주문 변경 응대 기준',
        summary: '메뉴 변경 문의는 플랫폼 상태를 먼저 보고, 취소와 재주문으로 안내한다.',
        body: '- 메뉴 변경을 물으면 먼저 주문 상태를 확인한다.\n- 직접 수정이 어렵다면 취소, 재주문, 고객센터 또는 매장 확인으로 안내한다.\n- 애매하면 확인 경로를 짧게 남긴다.',
        tags: ['customer_support', 'platform_help', 'order_change'],
        status: 'active',
        updatedAt: 1783123210000,
        sourceUrls: [
          'https://help.naver.com/service/30026/contents/20534?lang=ko',
          'https://ceo.baemin.com/guide/4268',
          'https://partners.coupangeats.com/start-guide/step-3/3530/',
          'https://bbq.co.kr/mypage/guide'
        ]
      }
    ]
  };
})(typeof window !== 'undefined' ? window : globalThis);
