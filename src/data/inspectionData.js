// ===================================================================================
// KNK 품질 검증 — 검사기 종류 및 "PBA 출하검사 순서도" 데이터
// 출처: 1. PBA 출하 CHECK LIST (R1.0) — [PBA 출하검사 순서도] / [최종 check Sheet] 시트
// (대표 승인용 시안. 실제 규격/조치는 상기 사내 문서를 기준으로 함)
// ===================================================================================

export const COMPANY = {
  nameKo: '케이엔케이',
  nameEn: 'KNK',
  system: 'KNK 품질 검증 시스템',
  slogan: 'Quality Verification & AS Support',
};

// 검사기 종류 (검사기명은 성적서 표기에 사용)
export const INSPECTION_TYPES = [
  { id: 'PBA', label: 'PBA 검사기', machine: 'PBA 검사기', icon: 'fa-microchip', desc: '기판 조립·기능 출하검사' },
  { id: 'FUNCTION', label: '기능 검사기', machine: '기능 검사기', icon: 'fa-gears', desc: '종합 기능 동작 검사' },
  { id: 'LNA', label: 'LNA 검사기', machine: 'LNA 검사기', icon: 'fa-tower-broadcast', desc: '이득·잡음 특성(계측기 Cal)' },
  { id: 'VSWR', label: 'VSWR 검사기', machine: 'VSWR 검사기', icon: 'fa-wave-square', desc: '정재파비 특성(계측기 Cal)' },
  { id: 'WATERPROOF', label: '방수 검사기', machine: '방수 검사기', icon: 'fa-droplet', desc: '방수 시험(마스터 Cal)' },
  { id: 'MIC', label: '마이크(MIC) 검사기', machine: 'MIC 검사기', icon: 'fa-microphone', desc: 'MIC Rubber(음샘) 검사' },
];

// ---------------------------------------------------------------------------------
// [PBA 출하검사 순서도] 기반 공통 검증 흐름
// 각 단계: 공정(질문) → "아니요" 시 순서도 상의 조치사항 안내
// ---------------------------------------------------------------------------------
const COMMON_FLOW = [
  {
    id: 'fw',
    no: 2,
    title: 'FW · PATTERN 다운로드',
    question: '각 모델에 맞는 FW · PATTERN이 적합하게 다운로드 되었는가?',
    spec: '도면 REV(리비전)와 FW/PATTERN 버전이 일치할 것',
    action: {
      grade: 'FW 다운로드 불량',
      steps: [
        'CPU Format 후 FW 재설치 (기존 데이터 꼬임 해소)',
        'USB 교체 및 재결합, 통신 케이블 단선·포트 인식 확인',
        '메인보드 공급 전압 상태 확인 및 필요 시 교체',
      ],
      ref: 'PBA 출하검사 순서도 No.3',
    },
  },
  {
    id: 'io',
    no: 4,
    title: 'I/O · Key 테스트',
    question: 'I/O 테스트 및 각종 Key 테스트에서 기구 조립·동작 상태가 정상인가?',
    spec: '모든 버튼 클릭감 · LED 점등 · 센서 반응 정상',
    action: {
      grade: 'I/O·동작 불량',
      steps: [
        'Sol 순서 확인 및 수정 (CH1 메인실린더 / CH2 진공 / CH3 마킹 / CH4~ 추가 Sol)',
        '케이블 연결 상태 확인 및 수정, 피복 벗겨짐·씹힘 여부 육안 전수 조사',
        'PCB·젠더보드 조립 상태 확인 후 볼트 누락부 체결',
        '기구 조립·설계도면 확인, 기구적 간섭 발생부 수정',
      ],
      ref: 'PBA 출하검사 순서도 No.5~6',
    },
  },
  {
    id: 'seat',
    no: 7,
    title: '시료 안착 · 인주 테스트',
    question: '시료 안착 및 인주 테스트에서 제품 파손·부품 간섭이 없는가?',
    spec: '안착 시 핀 휨·마킹 손상 없음 / C클립·IC칩·본드도포부 인주 간섭 없을 것',
    action: {
      grade: '안착·간섭 불량',
      steps: [
        '제품 테이블 각인(모델명·REV) 확인',
        '전달받은 시료 기준으로 최종 제품 도면과 REV 비교',
        '설계 도면 확인 및 수정, 간섭 부위 수정',
      ],
      ref: 'PBA 출하검사 순서도 No.8',
    },
  },
  {
    id: 'setup',
    no: 9,
    title: '검사기 기능 Set up · Calibration',
    question: '모델별 추가 기능 셋업 및 Calibration(보정)이 완료되었는가?',
    spec: '마킹 Sol·오토진공·안전센서·홀센서 세팅 완료 / 마스터 시료로 영점 보정',
    action: {
      grade: '셋업·보정 불량',
      steps: [
        '젠더보드 점퍼 상태 확인, 옵션보드 조립 상태 확인',
        '케이블(I2C) 연결 상태 및 PCB·컨텍 상태 확인',
        '작업지도서와 조립 상태 비교 후 지도서 기준으로 수정',
      ],
      ref: 'PBA 출하검사 순서도 No.10',
    },
  },
  {
    id: 'comm',
    no: 11,
    title: '시리얼 통신 · USB 인식',
    question: '검사기–PC 시리얼 통신 및 USB 인식이 정상인가?',
    spec: '히든키(Down+Left) 입력 후 LCD 우측 상단 인식 표시 확인',
    action: {
      grade: '통신 불량',
      steps: [
        '통신칩 장착 여부 및 방향 확인 (보드·통신칩의 굵은 흰색 줄 위치 일치)',
        '시리얼 케이블 상태 확인',
        '통신칩 불량 가능성 → 교체 후 연결 재시도',
      ],
      ref: 'PBA 출하검사 순서도 No.12',
    },
  },
  {
    id: 'detect',
    no: 13,
    title: '검사기 동작 · 검출력(Open/Short)',
    question: '검사기 동작 및 검출력(Open/Short) 확인 결과가 규격 이내인가?',
    spec: 'Open 0 < X < 150000(15000 고정) / Short 0 < X < 10',
    action: {
      grade: '검출력 불량',
      steps: [
        '젠더·옵션보드, 케이블(I2C), PCB 조립 상태 확인',
        '핀 블록 컨텍·스토퍼 높이·사용 핀 규격·기구 간섭 상태 확인',
        '불량 원인 분석 후 회로·설계팀 담당자에게 공유 및 해결',
      ],
      ref: 'PBA 출하검사 순서도 No.14~15',
    },
  },
  {
    id: 'repeat',
    no: 16,
    title: '반복성 Data 측정 · 분석',
    question: '반복성 측정(기본 40회) 및 데이터 분석 결과 산포가 안정적인가?',
    spec: '10~50회 반복 측정 / 가성 불량 2NG 이상 시 재측정',
    action: {
      grade: '반복성 불안정',
      steps: [
        '가성 불량 2NG 이상 시 재반복성 측정 진행',
        '지그 오염·환경 노이즈에 의한 오판정 여부 구분',
        '불량 내용을 각 담당자에게 공유 후 재검증 진행',
      ],
      ref: 'PBA 출하검사 순서도 No.17~18',
    },
  },
  {
    id: 'photo',
    no: 19,
    title: '검사기 사진 · 영상 촬영',
    question: '검사기 내·외부, LCD 화면, 동작 동영상 등 검증 자료를 촬영하였는가?',
    spec: '전/후/상면·핀블록 상·하·호기 라벨 / LCD(FW·DATA LOG·마킹 ST) / 동작 동영상',
    action: {
      grade: '검증자료 누락',
      steps: [
        '외부(전면·후면·상부·핀블록·라벨) 및 내부 사진 재촬영',
        'LCD 화면(FW 정보·DATA LOG·마킹 포함) 캡쳐',
        '제품 안착~마킹 완료 동작 동영상 촬영 (1호기 기준)',
      ],
      ref: 'PBA 출하검사 순서도 No.19 / 검증자료(사진)',
    },
  },
  {
    id: 'report',
    no: 20,
    title: '출하 성적서 작성',
    question: '검출력 기록 및 Check Sheet·검증자료 작성이 완료되었는가?',
    spec: '검사 결과값 빠짐없이 기록 / 담당자 서명 완료',
    action: {
      grade: '성적서 미비',
      steps: [
        '검사기 검출력 기록 및 누락 항목 기입',
        'Check Sheet · 검증자료(사진) 작성 완료',
        '검사 담당자 서명 확인',
      ],
      ref: 'PBA 출하검사 순서도 No.20',
    },
  },
  {
    id: 'upload',
    no: 21,
    title: 'Data · 사진 업로드 / 시리얼 등록',
    question: 'work 서버에 자료를 정리하고 시리얼 등록 후 출하 스티커를 부착하였는가?',
    spec: 'work 서버 폴더별 자료 정리 / 시스템에 시리얼 등록',
    action: {
      grade: '업로드 미완료',
      steps: [
        'work 서버의 각 폴더에 Data·사진 자료 정리',
        '합격 제품 시리얼 번호를 시스템(서버)에 등록',
        '출하 스티커 부착 확인',
      ],
      ref: 'PBA 출하검사 순서도 No.21',
    },
  },
];

// ---------------------------------------------------------------------------------
// 검사기 종류별 추가 검증 (순서도 No.9 부연설명 기준)
// ---------------------------------------------------------------------------------
const TYPE_SPECIFIC = {
  LNA: [
    {
      id: 'lna_cal',
      no: 9,
      title: '계측기 파형 Calibration · 캡쳐',
      question: '마스터 시료로 Calibration 후 파형 캡쳐(Reset+Enter)를 진행하였는가?',
      spec: '메뉴 2→5→Calibration→Set default(필수)→제품 안착 후 Cal→SAVE / 파형 캡쳐 필수',
      action: {
        grade: 'RF 보정 불량',
        steps: [
          'Set default 후 마스터 시료로 재보정 진행',
          '계측기 파형 캡쳐(Reset+Enter) 누락 여부 확인',
          '규격 재이탈 시 부적합 처리 및 설계팀 통보',
        ],
        ref: 'PBA 출하검사 순서도 No.9 (계측기 검사기)',
      },
    },
  ],
  VSWR: [
    {
      id: 'vswr_cal',
      no: 9,
      title: '계측기 파형 Calibration · 캡쳐',
      question: '마스터 시료로 Calibration 후 파형 캡쳐(Reset+Enter)를 진행하였는가?',
      spec: '메뉴 2→5→Calibration→Set default(필수)→제품 안착 후 Cal→SAVE / 파형 캡쳐 필수',
      action: {
        grade: 'RF 보정 불량',
        steps: [
          'Set default 후 마스터 시료로 재보정 진행',
          '계측기 파형 캡쳐(Reset+Enter) 누락 여부 확인',
          '규격 재이탈 시 부적합 처리 및 설계팀 통보',
        ],
        ref: 'PBA 출하검사 순서도 No.9 (계측기 검사기)',
      },
    },
  ],
  WATERPROOF: [
    {
      id: 'wp_cal',
      no: 9,
      title: '방수 검사기 마스터 Calibration',
      question: '방수 검사기를 마스터 시료로 Calibration(Set default 필수) 하였는가?',
      spec: '메뉴 2→5→Calibration→Set default(필수)→제품 안착 후 Cal→SAVE',
      action: {
        grade: '방수 보정 불량',
        steps: [
          'Set default 후 마스터 시료로 재보정 진행',
          '실링(가스켓) 상태 확인 및 누수 부위 재작업',
          '반복 누수 시 사출·구조 불량 여부 설계팀 통보',
        ],
        ref: 'PBA 출하검사 순서도 No.9 (방수 검사기)',
      },
    },
  ],
  MIC: [
    {
      id: 'mic_rubber',
      no: 9,
      title: 'MIC Rubber(음샘) 적용 확인',
      question: '검사기에 MIC Rubber(음샘)가 적용되어 있는가?',
      spec: '검사기에 MIC Rubber(음샘) 적용되어 있을 것',
      action: {
        grade: 'MIC Rubber 미적용',
        steps: [
          'MIC Rubber(음샘) 적용 유무 재확인',
          '미적용 시 Rubber 장착 후 재검사',
        ],
        ref: '최종 check Sheet — MIC RUBBER 확인',
      },
    },
  ],
};

// 검사기 종류에 따른 전체 순서도 스텝 생성
// (기능 셋업 단계 뒤에 종류별 추가 항목 삽입)
export function buildSteps(typeId) {
  const specific = TYPE_SPECIFIC[typeId] || [];
  if (specific.length === 0) return [...COMMON_FLOW];
  const setupIdx = COMMON_FLOW.findIndex((s) => s.id === 'setup');
  return [
    ...COMMON_FLOW.slice(0, setupIdx + 1),
    ...specific,
    ...COMMON_FLOW.slice(setupIdx + 1),
  ];
}
