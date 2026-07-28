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

export const TITLES = [
  { id: 'rookie', label: '🐣 새내기', cond: (s) => true },
  { id: 'ten', label: '🏸 10경기 클럽', cond: (s) => s.career.games >= 10 },
  { id: 'winner', label: '🔥 승리의 아이콘', cond: (s) => s.career.wins >= 10 },
  { id: 'social', label: '💛 마당발', cond: (s) => s.career.partners >= 8 },
  { id: 'rich', label: '💰 코인 부자', cond: (s) => s.career.earned >= 3000 },
  { id: 'host', label: '🏡 클럽 매니저', cond: (s) => s.career.matchesHosted >= 20 },
  { id: 'star', label: '⭐ 마을의 별', cond: (s) => s.me.lv >= 10 },
]

export const DAILY_QUESTS = [
  { id: 'play3', label: '오늘 3경기 뛰기', target: 3, coin: 180, exp: 60, track: 'todayGames' },
  { id: 'win2', label: '2승 달성하기', target: 2, coin: 260, exp: 90, track: 'todayWins' },
  { id: 'newpartner', label: '새로운 파트너와 경기', target: 1, coin: 200, exp: 70, track: 'newPartners' },
  { id: 'host5', label: '경기 5판 진행하기', target: 5, coin: 220, exp: 80, track: 'todayMatches' },
]

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
