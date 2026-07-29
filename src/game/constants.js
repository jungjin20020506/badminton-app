// ===================================================================================
// 셔틀빌리지 — 게임 데이터 정의
// 급수(A~D조·N조)와 자동매칭 민감도는 기존 배드민턴 매칭 앱의 체계를 그대로 계승한다.
// ===================================================================================

/** 급수 — 콕스타(COCKSTAR)와 동일한 7단계 체계 */
export const LEVELS = ['S조', 'A조', 'B조', 'C조', 'D조', 'E조', 'N조']

/** 정렬용 순서 — 콕스타 LEVEL_ORDER 그대로 */
export const LEVEL_ORDER = { S조: 1, A조: 2, B조: 3, C조: 4, D조: 5, E조: 6, N조: 7, 미설정: 8 }

/** 밸런스 계산용 급수 환산값 (작을수록 상급자). N조는 알 수 없으므로 중간값 */
export const LEVEL_VALUE = { S조: 1, A조: 2, B조: 3, C조: 4, D조: 5, E조: 6, N조: 4, 미설정: 4 }

/** 실력 계수 (경기 시뮬레이션용) */
export const LEVEL_POWER = { S조: 1.12, A조: 1.0, B조: 0.84, C조: 0.68, D조: 0.54, E조: 0.42, N조: 0.62, 미설정: 0.62 }

export const LEVEL_COLOR = {
  S조: '#38bdf8',
  A조: '#ef4444',
  B조: '#f97316',
  C조: '#f59e0b',
  D조: '#10b981',
  E조: '#3b82f6',
  N조: '#a1a1aa',
  미설정: '#a1a1aa',
}

export const PLAYERS_PER_MATCH = 4

/** 초레어템 가격 — 분야마다 딱 하나, 9,999코인 */
export const ULTRA_PRICE = 9999

/** 자동매칭 민감도 — 기존 앱과 동일한 4단계 */
export const SENSITIVITIES = [
  { key: 'low', label: '낮음', offset: -60, short: '회전율 우선', desc: '기다리지 않고 바로 경기를 만듭니다.' },
  { key: 'normal', label: '보통', offset: -25, short: '균형 (추천)', desc: '공평함과 다양성을 적절히 맞춥니다.' },
  { key: 'high', label: '높음', offset: 0, short: '다양성 우선', desc: '최대한 안 친 사람과 만나도록 매칭합니다.' },
  { key: 'max', label: '최고', offset: 12, short: '다양성 최대', desc: '더 좋은 조합을 위해 깐깐하게 고릅니다.' },
]

// -----------------------------------------------------------------------------------
// 캐릭터 커스터마이즈
// -----------------------------------------------------------------------------------

export const SKIN_TONES = [
  { id: 's1', color: '#ffe0c4' },
  { id: 's2', color: '#fdd0ae' },
  { id: 's3', color: '#f6bd93' },
  { id: 's4', color: '#e8a877' },
  { id: 's5', color: '#d1905f' },
  { id: 's6', color: '#b0714a' },
  { id: 's7', color: '#8a5535' },
  { id: 's8', color: '#5f3a24' },
]

export const HAIR_STYLES = [
  { id: 'short', label: '숏컷', price: 0 },
  { id: 'bob', label: '단발', price: 0 },
  { id: 'buzz', label: '스포츠컷', price: 0 },
  { id: 'sidepart', label: '가르마', price: 0 },
  { id: 'ponytail', label: '포니테일', price: 480 },
  { id: 'twintail', label: '트윈테일', price: 620 },
  { id: 'bun', label: '똥머리', price: 520 },
  { id: 'pixie', label: '픽시컷', price: 540 },
  { id: 'twoblock', label: '투블럭', price: 680 },
  { id: 'spiky', label: '스파이키', price: 700 },
  { id: 'slick', label: '올백', price: 720 },
  { id: 'long', label: '롱헤어', price: 760 },
  { id: 'hime', label: '히메컷', price: 880 },
  { id: 'braid', label: '땋은머리', price: 950 },
  { id: 'wave', label: '웨이브', price: 900 },
  { id: 'curly', label: '곱슬', price: 1000 },
  { id: 'afro', label: '아프로', price: 1200 },
  { id: 'mohawk', label: '모히칸', price: 1100 },
]

/** 하의 — 종목 특성상 반바지/스커트/긴바지를 나눈다 */
export const BOTTOM_STYLES = [
  { id: 'shorts', label: '반바지', price: 0 },
  { id: 'skirt', label: '스커트', price: 0 },
  { id: 'long', label: '긴바지', price: 0 },
  { id: 'leggings', label: '레깅스', price: 420 },
  { id: 'skirtLayer', label: '레이어드 스커트', price: 760 },
]

export const SHOE_STYLES = [
  { id: 'basic', label: '기본화', price: 0 },
  { id: 'stripe', label: '스트라이프', price: 300 },
  { id: 'high', label: '하이탑', price: 620 },
  { id: 'pro', label: '프로 코트화', price: 950 },
]

export const HAIR_COLORS = [
  '#2b1d16', '#4a2f1e', '#7b4b26', '#a9673a', '#d69f52', '#f2d49b',
  '#e8e8e8', '#9aa4b2', '#e05a7a', '#c04ad6', '#4a7fe0', '#3fbf9b',
]

export const EYE_STYLES = [
  { id: 'dot', label: '동글눈', price: 0 },
  { id: 'oval', label: '큰눈', price: 0 },
  { id: 'happy', label: '웃는눈', price: 0 },
  { id: 'sharp', label: '날카로운눈', price: 300 },
  { id: 'sparkle', label: '반짝눈', price: 450 },
  { id: 'sleepy', label: '졸린눈', price: 300 },
]

export const CLOTH_COLORS = [
  '#ffffff', '#1f2937', '#ef4444', '#f97316', '#f59e0b', '#facc15',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#f472b6', '#94a3b8',
]

export const OUTFIT_STYLES = [
  { id: 'tee', label: '기본 티셔츠', price: 0 },
  { id: 'vneck', label: '브이넥', price: 0 },
  { id: 'raglan', label: '라글란 유니폼', price: 400 },
  { id: 'stripe', label: '스트라이프', price: 550 },
  { id: 'polo', label: '폴로셔츠', price: 600 },
  { id: 'sleeveless', label: '나시', price: 650 },
  { id: 'zipup', label: '집업 트레이닝', price: 700 },
  { id: 'number', label: '등번호 유니폼', price: 820 },
  { id: 'sash', label: '사선 배색', price: 880 },
  { id: 'hoodie', label: '후드 집업', price: 1100 },
  { id: 'club', label: '클럽 저지', price: 1400 },
  {
    id: 'heroSuit', label: '✨ 여명의 갑주', price: ULTRA_PRICE, ultra: true,
    desc: '가장자리가 금빛으로 흐르는 갑주',
  },
]

export const RACKET_MODELS = [
  { id: 'classic', label: '클래식', price: 0, desc: '무난한 밸런스형', bonus: {} },
  { id: 'power', label: '헤비스매시', price: 900, desc: '스매시 +3', bonus: { power: 3 } },
  { id: 'speed', label: '라이트스피드', price: 900, desc: '스피드 +3', bonus: { speed: 3 } },
  { id: 'iso', label: '아이소메트릭', price: 1200, desc: '기술 +3', bonus: { technique: 3 } },
  { id: 'nano', label: '나노 슬림', price: 1500, desc: '스피드 +2 기술 +2', bonus: { speed: 2, technique: 2 } },
  { id: 'retro', label: '레트로 우드', price: 1800, desc: '체력 +4 (묵직하다)', bonus: { stamina: 4 } },
  { id: 'pro', label: '프로 카본', price: 2400, desc: '전 스탯 +2', bonus: { power: 2, technique: 2, speed: 2, stamina: 2, sense: 2 } },
  { id: 'neon', label: '네온 글로우', price: 3200, desc: '전 스탯 +3 · 밤에 빛난다', bonus: { power: 3, technique: 3, speed: 3, stamina: 3, sense: 3 } },
  {
    id: 'excalibur', label: '⚔️ 엑스칼리버', price: ULTRA_PRICE, ultra: true,
    desc: '전 스탯 +6 · 스트링이 빛나고 궤적이 남는다',
    bonus: { power: 6, technique: 6, speed: 6, stamina: 6, sense: 6 },
  },
]

/** 그립 감는 방식 — 라켓 손잡이 무늬 */
export const GRIP_WRAPS = [
  { id: 'plain', label: '민무늬', price: 0 },
  { id: 'spiral', label: '나선', price: 250 },
  { id: 'twotone', label: '투톤', price: 400 },
]

export const RACKET_COLORS = [
  '#ffffff', '#111827', '#ef4444', '#f97316', '#facc15', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#c0c0c0', '#d4af37',
]

/**
 * 초레어템 — 분야마다 딱 하나. 9,999코인.
 * 히어로처럼 보이도록 펄럭임·빛·반짝임 효과가 붙는다.
 * 지금은 관리자 계정으로 접속했을 때만 상점에 나타난다. (ultra: true)
 */
/** 망토 — 새 부위 */
export const CAPES = [
  { id: 'noCape', label: '없음', price: 0 },
  {
    id: 'heroCape', label: '🦸 여명의 망토', price: ULTRA_PRICE, ultra: true,
    desc: '걸을 때마다 바람에 펄럭이고 빛의 잔상이 남는다',
  },
]

/** 탈것 — 새 부위. 발밑에 떠올라 함께 움직인다 */
export const MOUNTS = [
  { id: 'noMount', label: '없음', price: 0 },
  {
    id: 'shuttleBoard', label: '🛹 셔틀보드', price: ULTRA_PRICE, ultra: true,
    desc: '발밑에 떠올라 빛의 궤적을 남기는 보드',
  },
]

export const ACCESSORIES = [
  { id: 'none', label: '없음', price: 0 },
  { id: 'wristband', label: '손목밴드', price: 200 },
  { id: 'headband', label: '헤어밴드', price: 250 },
  { id: 'hairpin', label: '머리핀', price: 350 },
  { id: 'cap', label: '캡모자', price: 500 },
  { id: 'visor', label: '썬바이저', price: 600 },
  { id: 'towel', label: '목수건', price: 700 },
  { id: 'glasses', label: '스포츠 고글', price: 800 },
  { id: 'mask', label: '마스크', price: 500 },
  { id: 'crown', label: '챔피언 왕관', price: 3000 },
  {
    id: 'heroHelm', label: '⚡ 여명의 투구', price: ULTRA_PRICE, ultra: true,
    desc: '양옆에 빛의 날개가 돋은 투구',
  },
]

export const STAT_KEYS = [
  { key: 'power', label: '스매시', icon: '💥', desc: '강한 공격으로 점수를 딴다' },
  { key: 'technique', label: '기술', icon: '🎯', desc: '드롭·헤어핀 정확도' },
  { key: 'speed', label: '스피드', icon: '⚡', desc: '코트 커버 범위' },
  { key: 'stamina', label: '체력', icon: '🔋', desc: '긴 랠리에서 버틴다' },
  { key: 'sense', label: '센스', icon: '🧠', desc: '결정적인 순간의 운' },
]

// -----------------------------------------------------------------------------------
// 마당 꾸미기 (상점 · 배치형)
// -----------------------------------------------------------------------------------

export const DECORS = [
  { id: 'tree_a', label: '벚나무', price: 300, kind: 'sakura', pos: [-13, -9] },
  { id: 'tree_b', label: '단풍나무', price: 300, kind: 'maple', pos: [13, -9] },
  { id: 'flowerbed', label: '꽃밭', price: 220, kind: 'flowerbed', pos: [-9, 11] },
  { id: 'lamp', label: '가로등', price: 450, kind: 'lamp', pos: [9, 11] },
  { id: 'vending', label: '음료 자판기', price: 800, kind: 'vending', pos: [-15, 3] },
  { id: 'parasol', label: '파라솔 테이블', price: 950, kind: 'parasol', pos: [15, 3] },
  { id: 'fountain', label: '분수대', price: 1800, kind: 'fountain', pos: [0, 15] },
  { id: 'scoreboard', label: '대형 전광판', price: 1500, kind: 'scoreboard', pos: [0, -15] },
  { id: 'doghouse', label: '강아지 집', price: 1200, kind: 'doghouse', pos: [-15, -3] },
  { id: 'shuttlepile', label: '셔틀콕 더미', price: 350, kind: 'shuttlepile', pos: [15, -3] },
]

export const COURT_SKINS = [
  { id: 'green', label: '클래식 그린', price: 0, floor: '#2f7d55', inner: '#3b8f63' },
  { id: 'blue', label: '인터내셔널 블루', price: 600, floor: '#1f5f9e', inner: '#2a74bb' },
  { id: 'wood', label: '우드 체육관', price: 900, floor: '#b98a4e', inner: '#c99a5e' },
  { id: 'purple', label: '나이트 퍼플', price: 1400, floor: '#4c2f74', inner: '#5d3a8c' },
]

// -----------------------------------------------------------------------------------
// 육성 / 보상
// -----------------------------------------------------------------------------------

// -----------------------------------------------------------------------------------
// 성장 — 승패는 기록하지 않는다.
// 실제 클럽에서 관리자가 매 경기 승패를 물어보고 누르는 건 불가능하기 때문에,
// 이 게임의 모든 성장 지표는 「얼마나 뛰었고 누구와 뛰었는가」로만 이뤄진다.
// -----------------------------------------------------------------------------------

export const TITLES = [
  { id: 'rookie', label: '🐣 새내기', cond: () => true },
  { id: 'ten', label: '🏸 10경기 클럽', cond: (s) => s.career.games >= 10 },
  { id: 'social', label: '💛 마당발', cond: (s) => s.career.partners >= 8 },
  { id: 'regular', label: '📅 개근왕', cond: (s) => (s.streak?.count || 0) >= 7 },
  { id: 'dex', label: '📖 도감 수집가', cond: (s) => s.career.partners >= 20 },
  { id: 'rich', label: '💰 코인 부자', cond: (s) => s.career.earned >= 3000 },
  { id: 'host', label: '🏡 클럽 매니저', cond: (s) => s.career.matchesHosted >= 20 },
  { id: 'star', label: '⭐ 마을의 별', cond: (s) => s.me.lv >= 10 },
]

/** 오늘의 미션 — track 은 today 안의 필드 이름 */
export const DAILY_QUESTS = [
  { id: 'play3', label: '오늘 3경기 뛰기', icon: '🏸', target: 3, coin: 180, exp: 60, track: 'games' },
  { id: 'newpartner', label: '처음 만나는 사람과 경기', icon: '📖', target: 1, coin: 240, exp: 90, track: 'newPartners' },
  { id: 'host5', label: '마을에서 5판 진행하기', icon: '🏟️', target: 5, coin: 220, exp: 80, track: 'matches' },
  { id: 'talk3', label: '주민 3명과 이야기하기', icon: '💬', target: 3, coin: 160, exp: 50, track: 'talks' },
]

/**
 * 체육관 배지 — 포켓몬의 그 배지 케이스.
 * 전부 「참여·수집·꾸준함」으로만 얻는다. 이긴 판 수는 조건에 없다.
 */
export const BADGES = [
  { id: 'b_first', icon: '🏸', label: '첫걸음 배지', desc: '첫 경기를 뛰었다', hint: '경기 1판', cond: (s) => s.career.games >= 1 },
  { id: 'b_ten', icon: '🔟', label: '열 판 배지', desc: '10경기를 뛰었다', hint: '경기 10판', cond: (s) => s.career.games >= 10 },
  { id: 'b_friend', icon: '💛', label: '마당발 배지', desc: '10명과 함께 뛰었다', hint: '도감 10명', cond: (s) => s.career.partners >= 10 },
  { id: 'b_dex', icon: '📖', label: '도감 배지', desc: '도감에 25명을 등록했다', hint: '도감 25명', cond: (s) => s.career.partners >= 25 },
  { id: 'b_streak', icon: '📅', label: '개근 배지', desc: '7일 연속 마을에 왔다', hint: '연속 출석 7일', cond: (s) => (s.streak?.count || 0) >= 7 },
  { id: 'b_lift', icon: '🪶', label: '리프팅 배지', desc: '셔틀 리프팅 30개', hint: '리프팅 30개', cond: (s) => (s.bestLift || 0) >= 30 },
  { id: 'b_host', icon: '🏟️', label: '운영 배지', desc: '마을에서 50판이 열렸다', hint: '마을 경기 50판', cond: (s) => s.career.matchesHosted >= 50 },
  { id: 'b_level', icon: '⭐', label: '베테랑 배지', desc: 'Lv.15 를 달성했다', hint: 'Lv.15', cond: (s) => s.me.lv >= 15 },
]

/** 이야기의 장(章) — 실제로 뛴 경기 수로 열린다 */
export const CHAPTERS = [
  { n: 1, need: 0, label: '셔틀타운에 오다', desc: '마을에 도착해 첫 경기방에 들어갔다.' },
  { n: 2, need: 5, label: '라이벌', desc: '자꾸 같은 코트에 서는 사람이 눈에 들어온다.' },
  { n: 3, need: 20, label: '배지 도전', desc: '관장에게 실력을 인정받을 때가 됐다.' },
  { n: 4, need: 50, label: '소문난 마을', desc: '셔틀타운이 근처에 소문나기 시작했다.' },
  { n: 5, need: 120, label: '전설의 셔틀타운', desc: '이제 이 마을을 모르는 사람이 없다.' },
]

/** 초레어템 목록 (분야 무관) */
export const ULTRA_IDS = ['heroCape', 'shuttleBoard', 'heroHelm', 'heroSuit', 'excalibur']

/** 이 사람이 초레어템을 하나라도 걸치고 있는가 — 오라 효과를 켤지 결정한다 */
export function hasUltra(look) {
  if (!look) return false
  return (
    look.cape === 'heroCape' ||
    look.mount === 'shuttleBoard' ||
    look.acc === 'heroHelm' ||
    look.outfit === 'heroSuit' ||
    look.racket?.model === 'excalibur'
  )
}

/** 지금 받을 수 있는(달성했지만 아직 안 받은) 미션 목록 */
export function readyQuests(today = {}, quests = {}) {
  return DAILY_QUESTS.filter((q) => (today[q.track] || 0) >= q.target && !quests[q.id]?.claimed)
}

export const chapterOf = (games) => {
  let cur = CHAPTERS[0]
  for (const c of CHAPTERS) if ((games || 0) >= c.need) cur = c
  const next = CHAPTERS.find((c) => c.n === cur.n + 1) || null
  return { ...cur, next }
}

/** 레벨업 필요 경험치 */
export const expToNext = (lv) => Math.round(120 * Math.pow(1.18, lv - 1))

// -----------------------------------------------------------------------------------
// 기본 명단 (기존 클럽 명단 계승)
// -----------------------------------------------------------------------------------

export const ROSTER_SEED = [
  { name: '정형진', level: 'A조', gender: '남' }, { name: '나채빈', level: 'A조', gender: '여' },
  { name: '오미리', level: 'A조', gender: '여' }, { name: '윤지혜', level: 'B조', gender: '여' },
  { name: '이정문', level: 'A조', gender: '남' }, { name: '고지선', level: 'C조', gender: '여' },
  { name: '공태호', level: 'C조', gender: '남' }, { name: '권지수', level: 'C조', gender: '여' },
  { name: '김다은', level: 'C조', gender: '여' }, { name: '김도현', level: 'B조', gender: '남' },
  { name: '김동균', level: 'B조', gender: '남' }, { name: '김민경', level: 'A조', gender: '여' },
  { name: '김민수', level: 'A조', gender: '남' }, { name: '김시내', level: 'B조', gender: '여' },
  { name: '김이령', level: 'B조', gender: '여' }, { name: '김재환', level: 'A조', gender: '남' },
  { name: '김호진', level: 'C조', gender: '남' }, { name: '김환교', level: 'B조', gender: '남' },
  { name: '도현석', level: 'A조', gender: '남' }, { name: '박민재', level: 'B조', gender: '남' },
  { name: '박소현', level: 'B조', gender: '여' }, { name: '박영인', level: 'B조', gender: '남' },
  { name: '박은진', level: 'B조', gender: '여' }, { name: '박지훈', level: 'C조', gender: '남' },
  { name: '박현규', level: 'A조', gender: '남' }, { name: '방승환', level: 'B조', gender: '남' },
  { name: '서소망', level: 'A조', gender: '여' }, { name: '서한일', level: 'A조', gender: '남' },
  { name: '손선의', level: 'A조', gender: '여' }, { name: '신환종', level: 'A조', gender: '남' },
  { name: '심예린', level: 'A조', gender: '여' }, { name: '윤다혜', level: 'A조', gender: '여' },
  { name: '윤주혁', level: 'B조', gender: '남' }, { name: '이동준', level: 'C조', gender: '남' },
  { name: '이미연', level: 'B조', gender: '여' }, { name: '이슬', level: 'B조', gender: '여' },
  { name: '이윤성', level: 'C조', gender: '남' }, { name: '인치원', level: 'A조', gender: '남' },
  { name: '임다혜', level: 'A조', gender: '여' }, { name: '장호성', level: 'B조', gender: '남' },
  { name: '정상운', level: 'B조', gender: '남' }, { name: '정훈성', level: 'A조', gender: '남' },
  { name: '조현빈', level: 'C조', gender: '남' }, { name: '조현철', level: 'B조', gender: '남' },
  { name: '주재운', level: 'A조', gender: '남' }, { name: '진서원', level: 'B조', gender: '여' },
  { name: '최나라', level: 'C조', gender: '여' }, { name: '한승찬', level: 'B조', gender: '남' },
  { name: '한영록', level: 'A조', gender: '남' },
]

/** 마을 주민 대사 (친밀도에 따라 달라짐) */
export const CHATTER = {
  low: ['안녕하세요!', '오늘 코트 좋네요~', '한 게임 해요!', '몸 좀 풀고 올게요.'],
  mid: ['어! 또 만났네요 😊', '아까 그 스매시 좋던데요?', '다음 판 같이 뛸래요?', '물 한 잔 하실래요?'],
  high: ['오늘도 왔네요! 기다렸어요 💛', '역시 우리 호흡이 최고예요!', '끝나고 치맥 어때요?', '제 파트너는 당신뿐 ✨'],
}
