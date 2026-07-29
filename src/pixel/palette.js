// ===================================================================================
// 셔틀몬스터 — 테마 팔레트
//
// 포켓몬스터가 그렇듯, 문을 열고 안으로 들어가면 화면 색이 통째로 바뀐다.
// 지도(맵)마다 테마를 하나씩 물려 두고, 맵이 바뀌는 순간
//   ① 타일이 그 테마 색으로 다시 그려지고
//   ② 말풍선·버튼·메뉴 같은 UI 색까지 CSS 변수로 함께 갈아탄다.
// ===================================================================================

/**
 * 테마 하나의 구성
 *  ground : 타일을 그릴 때 쓰는 색 (tileset.js 가 읽는다)
 *  ui     : 화면 UI 색 (CSS 변수로 나간다)
 *  label  : 맵에 들어갔을 때 화면 위에 뜨는 지역 이름표
 */
export const THEMES = {
  // ── 바깥 — 셔틀타운 (낮) ───────────────────────────────────────────────────────
  town: {
    id: 'town',
    ground: {
      // 형광 초록 대신 깊은 녹색 + 올리브 + 황록. 스타듀밸리의 그 땅 색.
      grass: ['#5b9c42', '#4e8b39', '#68a94a'],
      grassAlt: ['#7ea83c', '#8fae44'], // 볕에 마른 황록 얼룩
      grassDot: '#8fce62',
      grassDark: '#356c2c',
      dirt: ['#cda878', '#bc9663'],
      dirtDot: '#a87f4e',
      brick: ['#cfc7b4', '#bfb6a1'],
      brickLine: '#8f8778',
      sand: ['#e6cea0', '#d8bd8a'],
      water: ['#2f6fb8', '#4a92d8'],
      waterFoam: '#a8d8ff',
      leaf: '#3d8a3a',
      leafHi: '#5aa84c',
      leafLo: '#275f28',
      // 가을빛 액센트 — 노랑·주황·빨강 덤불에 쓴다
      leafAutumn: ['#d8a52c', '#c86a24', '#b8402c'],
      trunk: '#7b5230',
      trunkLo: '#553720',
      floor: ['#e8c890', '#dcb87c'],
      floorLine: '#c4a066',
      wall: '#f0e4d0',
      wallLo: '#c8b498',
      roof: '#e05c5c',
      roofLo: '#b84040',
      accent: '#3860c8',
    },
    ui: {
      frame: '#2a3550',
      frameLo: '#161c2c',
      face: '#f8f8f0',
      faceLo: '#d8dce8',
      text: '#20283c',
      textLo: '#5a6480',
      accent: '#3860c8',
      accentLo: '#20408c',
      shadow: 'rgba(20,26,44,.35)',
      sky: '#78c8f8',
    },
    label: '셔틀타운',
    sub: '배드민턴을 사랑하는 사람들의 마을',
  },

  // ── 셔틀마트 (포켓몬 프렌들리샵 자리) — 파랑 ────────────────────────────────────
  mart: {
    id: 'mart',
    ground: {
      grass: ['#6cc8d8', '#5cb8c8', '#7cd8e8'],
      grassDot: '#8ce0ec',
      grassDark: '#4098a8',
      dirt: ['#dfe8ee', '#cfdae2'],
      dirtDot: '#bccad4',
      brick: ['#e8f0f4', '#d8e4ea'],
      brickLine: '#b4c6d0',
      sand: ['#f0e0b0', '#e4d09c'],
      water: ['#3f86dc', '#5aa0f0'],
      waterFoam: '#a8d8ff',
      leaf: '#2f9a86',
      leafHi: '#49b89c',
      leafLo: '#1f6e60',
      trunk: '#7b5230',
      trunkLo: '#5c3c22',
      floor: ['#dceaf2', '#ccdce6'],
      floorLine: '#a8bece',
      wall: '#3c74b8',
      wallLo: '#2a548c',
      roof: '#2a548c',
      roofLo: '#1c3c68',
      accent: '#1668c0',
    },
    ui: {
      frame: '#123a68',
      frameLo: '#0a2244',
      face: '#f2f8fc',
      faceLo: '#d0e2f0',
      text: '#12304c',
      textLo: '#4a6c8c',
      accent: '#1668c0',
      accentLo: '#0d4a90',
      shadow: 'rgba(10,34,68,.35)',
      sky: '#2a548c',
    },
    label: '셔틀마트',
    sub: '없는 게 없는 배드민턴 용품점',
  },

  // ── 셔틀센터 (포켓몬센터 자리) — 분홍/크림 ──────────────────────────────────────
  center: {
    id: 'center',
    ground: {
      grass: ['#f4b8c8', '#e8a4b8', '#fcc8d8'],
      grassDot: '#ffd8e4',
      grassDark: '#d08498',
      dirt: ['#f8ece0', '#ecdcd0'],
      dirtDot: '#dcc8bc',
      brick: ['#fbf0e8', '#efe0d6'],
      brickLine: '#d8c4b8',
      sand: ['#f8e8c8', '#ecd8b4'],
      water: ['#68b0e8', '#88c8f4'],
      waterFoam: '#c8e8ff',
      leaf: '#4cae72',
      leafHi: '#68c88c',
      leafLo: '#348c56',
      trunk: '#8a5f3a',
      trunkLo: '#68452a',
      floor: ['#fdf2ea', '#f2e2d6'],
      floorLine: '#e0c8ba',
      wall: '#f8f0e8',
      wallLo: '#dcc8bc',
      roof: '#f06888',
      roofLo: '#c84868',
      accent: '#e05880',
    },
    ui: {
      frame: '#7a2c46',
      frameLo: '#521c30',
      face: '#fff6f8',
      faceLo: '#f4dae2',
      text: '#4a1e2c',
      textLo: '#8c6070',
      accent: '#e05880',
      accentLo: '#b83c60',
      shadow: 'rgba(82,28,48,.32)',
      sky: '#f06888',
    },
    label: '셔틀센터',
    sub: '지친 몸을 쉬어 가는 곳',
  },

  // ── 셔틀 체육관 (포켓몬 체육관 자리) — 남색 + 코트 ───────────────────────────────
  gym: {
    id: 'gym',
    ground: {
      grass: ['#3a4570', '#323c64', '#424e7c'],
      grassDot: '#4a5688',
      grassDark: '#262e50',
      dirt: ['#4a5480', '#3e4870'],
      dirtDot: '#5a6494',
      brick: ['#38406a', '#2e365c'],
      brickLine: '#242a48',
      sand: ['#c8a870', '#b89860'],
      water: ['#2a5a9c', '#3a70b8'],
      waterFoam: '#7ab0e8',
      leaf: '#2f7a56',
      leafHi: '#3f9a6c',
      leafLo: '#1f5a3e',
      trunk: '#6a4a2c',
      trunkLo: '#4a3220',
      floor: ['#c89a5c', '#b88a4c'],
      floorLine: '#a07840',
      wall: '#2c3458',
      wallLo: '#1c2240',
      roof: '#5c68a0',
      roofLo: '#3c4674',
      court: '#2f7d55',
      courtIn: '#3b8f63',
      courtLine: '#f4f4e8',
      accent: '#f0b429',
    },
    ui: {
      frame: '#1a2040',
      frameLo: '#0c1028',
      face: '#eef0fa',
      faceLo: '#ccd2e8',
      text: '#171c34',
      textLo: '#525a7c',
      accent: '#f0b429',
      accentLo: '#c08c10',
      shadow: 'rgba(12,16,40,.42)',
      sky: '#1c2240',
    },
    label: '셔틀 체육관',
    sub: '관장에게 도전하라',
  },

  // ── 내 집 — 나무/따뜻한 색 ─────────────────────────────────────────────────────
  home: {
    id: 'home',
    ground: {
      grass: ['#c8a070', '#b89060', '#d4b080'],
      grassDot: '#dcbc90',
      grassDark: '#9c7448',
      dirt: ['#d8b888', '#c8a878'],
      dirtDot: '#b89868',
      brick: ['#e8d0a8', '#d8c098'],
      brickLine: '#bca078',
      sand: ['#f0e0b0', '#e4d09c'],
      water: ['#3f86dc', '#5aa0f0'],
      waterFoam: '#a8d8ff',
      leaf: '#4cae72',
      leafHi: '#68c88c',
      leafLo: '#348c56',
      trunk: '#8a5f3a',
      trunkLo: '#68452a',
      floor: ['#dcb47c', '#cca468'],
      floorLine: '#b48c54',
      wall: '#f0dcc0',
      wallLo: '#d0b894',
      roof: '#c07048',
      roofLo: '#9c5434',
      accent: '#c8802c',
    },
    ui: {
      frame: '#4a3420',
      frameLo: '#2e2012',
      face: '#fdf4e2',
      faceLo: '#eadcc0',
      text: '#3a2a18',
      textLo: '#7a6448',
      accent: '#c8802c',
      accentLo: '#9c5c14',
      shadow: 'rgba(46,32,18,.32)',
      sky: '#c07048',
    },
    label: '내 방',
    sub: '오늘도 수고했어',
  },

  // ── 뽑기 코너 (게임 코너 자리) — 보라 네온 ──────────────────────────────────────
  arcade: {
    id: 'arcade',
    ground: {
      grass: ['#4a3878', '#403068', '#544084'],
      grassDot: '#64509c',
      grassDark: '#302456',
      dirt: ['#584484', '#4c3a74'],
      dirtDot: '#685094',
      brick: ['#40306c', '#382a60'],
      brickLine: '#2c2050',
      sand: ['#c8a870', '#b89860'],
      water: ['#6040c0', '#7c58e0'],
      waterFoam: '#b498ff',
      leaf: '#7a44b8',
      leafHi: '#9860d8',
      leafLo: '#5c308c',
      trunk: '#6a4a2c',
      trunkLo: '#4a3220',
      floor: ['#54407c', '#4a386e'],
      floorLine: '#3c2c5c',
      wall: '#382a60',
      wallLo: '#241a44',
      roof: '#8850d8',
      roofLo: '#6034a8',
      accent: '#ffcc33',
    },
    ui: {
      frame: '#241a44',
      frameLo: '#140e2c',
      face: '#f2ecff',
      faceLo: '#d4c8f0',
      text: '#241a44',
      textLo: '#5c4c88',
      accent: '#ffcc33',
      accentLo: '#d0a010',
      shadow: 'rgba(20,14,44,.42)',
      sky: '#241a44',
    },
    label: '뽑기 코너',
    sub: '오늘은 뭐가 나올까?',
  },
}

export const themeOf = (id) => THEMES[id] || THEMES.town

/** 바깥(마을)은 시간대에 따라 색이 살짝 물든다 — 아침/낮/노을/밤 */
export function daylightTint(hour) {
  if (hour < 5.2 || hour >= 20.2) return { color: '#1a2450', alpha: 0.46, name: '밤' }
  if (hour < 6.8) return { color: '#3a3a78', alpha: 0.26, name: '새벽' }
  if (hour < 8.2) return { color: '#ffb86c', alpha: 0.14, name: '아침' }
  if (hour < 16.8) return { color: '#ffffff', alpha: 0, name: '낮' }
  if (hour < 18.6) return { color: '#ffa04c', alpha: 0.16, name: '오후' }
  return { color: '#ff6a3c', alpha: 0.26, name: '노을' }
}

/**
 * 테마의 UI 색을 CSS 변수로 문서에 심는다.
 * 이 한 줄로 말풍선·버튼·메뉴·상태바가 전부 그 지역 색으로 갈아입는다.
 */
export function applyThemeToDom(themeId) {
  const t = themeOf(themeId)
  const r = document.documentElement
  const u = t.ui
  r.style.setProperty('--pk-frame', u.frame)
  r.style.setProperty('--pk-frame-lo', u.frameLo)
  r.style.setProperty('--pk-face', u.face)
  r.style.setProperty('--pk-face-lo', u.faceLo)
  r.style.setProperty('--pk-text', u.text)
  r.style.setProperty('--pk-text-lo', u.textLo)
  r.style.setProperty('--pk-accent', u.accent)
  r.style.setProperty('--pk-accent-lo', u.accentLo)
  r.style.setProperty('--pk-shadow', u.shadow)
  r.style.setProperty('--pk-sky', u.sky)
  r.dataset.theme = themeId
}
