// ===================================================================================
// KNK 품질 검증 — 검사기 종류 및 출하검사 순서도 데이터
// (본 데이터는 대표 승인용 시안 데모입니다. 실제 규격/조치 매뉴얼은 품질팀 문서 기준으로 대체)
// ===================================================================================

export const COMPANY = {
  nameKo: '케이엔케이',
  nameEn: 'KNK',
  system: 'KNK 품질 검증 시스템',
  slogan: 'Quality Verification & AS Support',
};

// 검사기 종류
export const INSPECTION_TYPES = [
  { id: 'PBA', label: 'PBA 조립검사', icon: 'fa-microchip', desc: '기판 조립 및 기능 출하검사' },
  { id: 'LNA', label: 'LNA (저잡음증폭기)', icon: 'fa-tower-broadcast', desc: '이득·잡음지수 특성 검사' },
  { id: 'ILLUM', label: '조도(照度) 검사', icon: 'fa-lightbulb', desc: 'LED 광량/조도 규격 검사' },
  { id: 'WATERPROOF', label: '방수 검사', icon: 'fa-droplet', desc: 'IPX 방수 등급 시험' },
  { id: 'FUNCTION', label: '기능(Function) 검사', icon: 'fa-gears', desc: '종합 기능 동작 검사' },
];

// 공통(PBA 출하검사 순서도) 질문
const COMMON_STEPS = [
  {
    id: 'jig',
    title: '검사 설비·지그(JIG) 상태 점검',
    question: '검사 설비 및 지그(JIG)의 상태가 정상이며 교정(Calibration) 유효기간 이내인가?',
    spec: '지그 접점 저항 규격 이내 / 교정필증 유효',
    action: {
      grade: '설비 이상',
      steps: [
        '설비 담당자에게 즉시 통보하고 해당 지그 사용 중지',
        '지그 접점 청소 및 교정(Calibration) 재수행',
        '이상 지속 시 예비 지그로 교체 후 재점검',
      ],
      ref: '검사기 점검 Check List — 설비 점검 항목',
    },
  },
  {
    id: 'fw',
    title: 'FW PATTERN 적합성',
    question: '해당 모델에 맞는 FW PATTERN(펌웨어)이 적합하게 로딩되었는가?',
    spec: 'FW 관리대장의 최신 승인 버전과 일치',
    action: {
      grade: '펌웨어 부적합',
      steps: [
        'FW 관리대장에서 모델별 정식 승인 버전 확인',
        '정품 FW를 재다운로드하여 재로딩',
        '버전(체크섬) 확인 후 재검사 진행',
      ],
      ref: 'PBA 출하 CHECK LIST — FW 항목',
    },
  },
  {
    id: 'io',
    title: 'I/O 테스트',
    question: 'I/O 테스트(입·출력 신호)에 이상이 없는가?',
    spec: '전 채널 신호 정상 / 통신 응답 정상',
    action: {
      grade: 'I/O 불량',
      steps: [
        '커넥터 체결 상태 및 납땜(솔더링) 상태 재확인',
        '불량 확인 시 수리(재작업) 의뢰 후 전수 재검사',
        '반복 불량 발생 시 부적합 처리 및 이력 등록',
      ],
      ref: 'PBA 출하 CHECK LIST — I/O 테스트',
    },
  },
  {
    id: 'power',
    title: '전원부 측정',
    question: '전원부 전압·전류 측정값이 규격 범위 이내인가?',
    spec: '정격 전압 ±5% 이내 / 소비전류 규격 이내',
    action: {
      grade: '전원부 부적합',
      steps: [
        '파워 서플라이 및 레귤레이터 출력 점검',
        '규격 이탈 부품 교체 후 재측정',
        '측정값 성적서 기록 및 규격 이탈 시 부적합 판정',
      ],
      ref: 'PBA 출하 CHECK LIST — 전원부',
    },
  },
  {
    id: 'visual',
    title: '외관 검사',
    question: '외관(스크래치, 납땜, 부품 실장) 상태가 양호한가?',
    spec: '외관 불량 없음 / 실장 누락·틀어짐 없음',
    action: {
      grade: '외관 불량',
      steps: [
        '외관 불량품 격리(홀드) 후 불량 부위 촬영·기록',
        '재작업 가능 시 수리 의뢰, 불가 시 폐기 판정',
        '재작업 완료품 재검사 후 이력 등록',
      ],
      ref: 'PBA 출하 CHECK LIST — 외관 검사',
    },
  },
];

// 검사기 종류별 추가 특성 질문
const TYPE_SPECIFIC = {
  LNA: [
    {
      id: 'lna_gain',
      title: '이득(Gain)·잡음지수(NF) 특성',
      question: 'LNA 이득(Gain) 및 잡음지수(NF) 측정값이 규격 범위 이내인가?',
      spec: 'Gain 규격 ±편차 이내 / NF 상한 이내',
      action: {
        grade: 'RF 특성 부적합',
        steps: [
          '측정 장비(스펙트럼/네트워크 분석기) 캘리브레이션 재수행',
          '편차 발생 시 매칭 회로/능동소자 점검',
          '규격 재이탈 시 부적합 처리 및 설계팀 통보',
        ],
        ref: 'LNA 특성 검사 기준',
      },
    },
  ],
  ILLUM: [
    {
      id: 'illum_lux',
      title: '조도(Lux) 측정',
      question: '조도(Lux) 측정값이 기준 규격 범위 이내이며 색편차가 정상인가?',
      spec: '기준 조도 ±10% 이내 / 색좌표 규격 이내',
      action: {
        grade: '조도 부적합',
        steps: [
          '광원(LED) 모듈 및 조도 센서 상태 점검',
          '규격 미달 모듈 교체 후 재측정',
          '색편차 발생 시 Bin 등급 확인 및 부적합 처리',
        ],
        ref: '조도 검사 기준',
      },
    },
  ],
  WATERPROOF: [
    {
      id: 'wp_ipx',
      title: '방수(IPX) 시험',
      question: '방수(IPX) 시험을 규정 조건에서 통과하였는가? (누수 없음)',
      spec: 'IPX 등급 조건 만족 / 내부 누수 없음',
      action: {
        grade: '방수 부적합',
        steps: [
          '실링(가스켓)·방수 테이프 체결 상태 확인',
          '누수 부위 재작업(실링 재시공) 후 재시험',
          '반복 누수 시 사출/구조 불량 여부 설계팀 통보',
        ],
        ref: '방수 시험 기준(IPX)',
      },
    },
  ],
};

// 마무리 공통 질문
const FINAL_STEPS = [
  {
    id: 'label',
    title: '라벨·시리얼 부착',
    question: '라벨 및 시리얼(S/N) 번호가 정확히 부착되고 이력이 등록되었는가?',
    spec: '라벨 정보 일치 / 시리얼 이력 시스템 등록',
    action: {
      grade: '표시(라벨) 불량',
      steps: [
        '라벨 정보(모델/S/N) 오류 시 재발행·재부착',
        '이력관리 시스템 등록 여부 재확인',
      ],
      ref: 'PBA 출하 CHECK LIST — 라벨/시리얼',
    },
  },
  {
    id: 'report',
    title: '검사 성적서 작성',
    question: '검사 성적서(Inspection Report)가 누락 없이 작성·서명되었는가?',
    spec: '전 항목 기입 / 검사자 서명 완료',
    action: {
      grade: '문서 미비',
      steps: [
        '성적서 누락 항목 기입 및 측정값 확인',
        '검사자 서명 및 품질 책임자 승인 확인',
      ],
      ref: '검사 Check Sheet(품질팀)',
    },
  },
];

// 검사기 종류에 따른 전체 순서도 스텝 생성
export function buildSteps(typeId) {
  const specific = TYPE_SPECIFIC[typeId] || [];
  return [...COMMON_STEPS, ...specific, ...FINAL_STEPS];
}
