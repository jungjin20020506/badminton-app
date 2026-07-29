// ===================================================================================
// 셔틀몬스터 — 대사집
//
// NPC·간판·가구마다 어떤 이야기를 하고 무엇을 열어 주는지 여기 모아 둔다.
// 「말을 걸면 대화를 하다가 상점이 열린다」 는 흐름이 전부 여기서 만들어진다.
// ===================================================================================
import { useGame, isGod, canAfford } from '../game/store.js'
import { CHATTER, DAILY_QUESTS } from '../game/constants.js'
import { todayBoard } from '../game/social.js'

const S = () => useGame.getState()
/** 패널 열기 — 대화창은 닫고 화면 전체 패널을 띄운다 */
const openPanel = (p) => useGame.setState({ panel: p })

const nf = (n) => (n ?? 0).toLocaleString()

// -----------------------------------------------------------------------------------
// 마을 사람들
// -----------------------------------------------------------------------------------
const SCRIPTS = {
  // ── 오프닝 이야기 ────────────────────────────────────────────────────────────
  storyWake: () => {
    const name = S().players.me?.name || '트레이너'
    return [
      { say: '…아침 햇살이 눈을 찌른다.' },
      { say: `오늘은 ${name} 가 셔틀타운에서 맞는 첫날이다!` },
      { say: '가방에는 라켓 한 자루. 그거면 충분하다.' },
      { say: '아래쪽 문으로 나가 마을을 둘러보자.' },
    ]
  },

  storyKoko: () => {
    const name = S().players.me?.name || '트레이너'
    return [
      { say: '앗, 잠깐만요! 거기 새로 오신 분—!' },
      { say: `헉, 헉… 찾았다! ${name} 님 맞죠? 저는 마을 안내원 코코예요.` },
      { say: '오늘 마침 「셔틀 체육관」에 경기방이 여럿 열렸거든요!' },
      {
        ask: '경기방이 뭐냐고요?',
        choices: [
          {
            label: '응, 그게 뭐야?',
            then: [
              { say: '같은 시간 같은 체육관에 모인 사람들의 방이에요.' },
              { say: '방에 들어가면 누가 대기 중인지, 어느 코트에서 누가 뛰는지 다 보여요.' },
              { say: '내 차례가 오면 알려 주니까 코트만 딱 들어가면 돼요!' },
            ],
          },
          { label: '알고 있어', then: [{ say: '역시! 그럼 이야기가 빠르겠네요.' }] },
        ],
      },
      { say: '북쪽 큰 건물이 셔틀 체육관이에요. 문 위에 화살표를 띄워 뒀어요!' },
      { say: '관장님께 말을 걸면 오늘 열린 경기방을 보여 주실 거예요. 따라오세요!' },
    ]
  },

  storyLeader: () => [
    { say: '오, 코코가 말한 새 얼굴이 자네군!' },
    { say: '오늘 이 체육관에 열린 경기방을 보여 주지.' },
    { say: '마음에 드는 방을 골라 들어가면, 그때부터 자네도 우리 식구야.' },
    {
      ask: '경기방 목록을 볼까?',
      choices: [
        { label: '볼래요!', close: true, run: () => openPanel('rooms') },
        {
          label: '조금 이따가요',
          then: [
            { say: '그래, 마을을 좀 더 둘러보고 오게.' },
            { say: '준비되면 나한테 말을 걸거나, 저기 접수 데스크를 조사하면 돼.' },
          ],
        },
      ],
    },
  ],

  /** 체육관 접수 데스크 — 경기방 목록으로 가는 두 번째 문 */
  gymDesk: () => {
    const s = S()
    if (s.online?.status === 'room') {
      return [
        { say: `지금은 「${s.online.roomName}」 경기방에 들어와 있다.` },
        {
          ask: '무엇을 할까?',
          choices: [
            { label: '대진표를 본다', close: true, run: () => openPanel('match') },
            { label: '다른 경기방을 본다', close: true, run: () => openPanel('rooms') },
            { label: '그만둔다', then: [{ say: '데스크를 떠났다.' }] },
          ],
        },
      ]
    }
    return [
      { say: '경기방 접수 데스크다. 오늘 열린 방 목록이 붙어 있다.' },
      {
        ask: '경기방에 들어갈까?',
        choices: [
          { label: '경기방 목록을 본다', close: true, run: () => openPanel('rooms') },
          { label: '그만둔다', then: [{ say: '다음에 오자.' }] },
        ],
      },
    ]
  },

  // ── 안내원 코코 — 이 게임의 튜토리얼 담당 ─────────────────────────────────────
  koko: () => {
    const s = S()
    const name = s.players.me?.name || '트레이너'
    return [
      { say: `${name}! 셔틀타운에 온 걸 환영해!` },
      {
        ask: '무엇이 궁금해?',
        choices: [
          {
            label: '마을 안내',
            then: [
              { say: '북쪽 큰 건물이 「셔틀 체육관」이야. 관장님한테 말을 걸면 경기를 잡아 줘.' },
              { say: '서쪽 분홍 지붕은 「셔틀센터」. 쉬어 가고 우편도 받을 수 있어.' },
              { say: '동쪽 파란 지붕은 「셔틀마트」. 라켓이랑 옷을 파는 곳이지!' },
              { say: '남동쪽 보라색 건물은 「뽑기 코너」야. 코인이 남으면 한 번 돌려 봐 ✨' },
            ],
          },
          {
            label: '조작 방법',
            then: [
              { say: '왼쪽 십자키로 걷고, Ⓐ 버튼으로 말을 걸어.' },
              { say: 'Ⓑ 를 누른 채로 걸으면 달릴 수 있어. 급할 땐 써 봐!' },
              { say: '오른쪽 위 ☰ 를 누르면 메뉴가 열려. 명단·기록·설정이 다 거기 있어.' },
            ],
          },
          {
            label: '오늘 할 일',
            then: [
              { say: '오늘의 미션은 셔틀센터 접수원에게 물어보면 알려 줘!' },
              { say: `지금까지 오늘 ${s.today.games}경기 뛰었네. 새로 만난 사람은 ${s.today.newPartners}명!` },
            ],
          },
          { label: '아무것도 아니야', then: [{ say: '그래! 재밌게 놀다 가 🏸' }] },
        ],
      },
    ]
  },

  kid1: () => {
    const s = S()
    return [
      { say: '나도 언젠가 관장님을 이길 거야!' },
      { say: s.me.lv >= 5 ? `형/누나 Lv.${s.me.lv} 이지? 우와… 강해 보여!` : '형/누나는 몇 급이야? 나는 아직 N조야…' },
    ]
  },

  granny: () => [
    { say: '요즘 젊은 사람들은 스매시가 참 세더라고.' },
    { say: '나는 드롭샷이 전문이야. 살살 넘겨도 점수는 점수거든!' },
  ],

  coach: () => {
    const s = S()
    return [
      { say: '스탯을 올리면 경기에서 이길 확률이 올라가.' },
      {
        ask: '스탯 찍는 법 알려 줄까?',
        choices: [
          {
            label: '알려 줘',
            then: [
              { say: '☰ 메뉴 → 「나」 에서 남은 포인트를 원하는 스탯에 넣으면 돼.' },
              { say: s.me.statPoints > 0 ? `지금 ${s.me.statPoints} 포인트가 남아 있는데?` : '지금은 남은 포인트가 없네. 경기를 더 뛰어 봐!' },
            ],
          },
          { label: '알고 있어', then: [{ say: '역시! 그럼 코트에서 보자고.' }] },
        ],
      },
    ]
  },

  // ── 셔틀마트 ─────────────────────────────────────────────────────────────────
  clerk: () => {
    const s = S()
    return [
      { say: '어서 오세요! 셔틀마트입니다 🏸' },
      {
        ask: `무엇을 도와드릴까요? (보유 ${nf(s.coins)}🪙)`,
        choices: [
          { label: '물건을 살게요', close: true, run: () => openPanel('shop') },
          { label: '옷을 갈아입고 싶어요', close: true, run: () => openPanel('closet') },
          {
            label: '뽑기는 어디서 하나요?',
            then: [{ say: '뽑기 코너는 마을 남동쪽 보라색 건물이에요!' }, { say: '한 번에 300🪙 인데, 가끔 엄청난 게 나와요 ✨' }],
          },
          { label: '그냥 구경할게요', then: [{ say: '천천히 둘러보세요~' }] },
        ],
      },
    ]
  },

  shopper: () => [
    { say: '여기 라켓은 진짜 좋아요.' },
    { say: '「네온 글로우」는 밤에 빛난다던데… 언젠간 꼭 사고 말겠어.' },
  ],

  martShelf: () => [
    { say: '진열대에는 셔틀콕과 그립테이프가 잔뜩 쌓여 있다.' },
    { say: '…살 물건은 점원에게 말을 걸어야 한다.' },
  ],

  // ── 셔틀센터 ─────────────────────────────────────────────────────────────────
  nurse: () => {
    const s = S()
    const doneQuests = DAILY_QUESTS.filter((q) => (s.today[q.track] || 0) >= q.target && !s.quests[q.id]?.claimed).length
    return [
      { say: '셔틀센터에 오신 걸 환영합니다!' },
      {
        ask: '무엇을 도와드릴까요?',
        choices: [
          {
            label: '쉬어 갈게요',
            then: [
              { say: '네! 잠시 쉬면서 오늘 도장을 찍어 드릴게요.' },
              { do: () => useGame.setState({ showCheckIn: true }) },
              { end: true },
            ],
          },
          {
            label: `오늘의 미션${doneQuests ? ` (${doneQuests}개 완료!)` : ''}`,
            close: true,
            run: () => openPanel('quests'),
          },
          { label: '우편함을 볼게요', close: true, run: () => openPanel('mail') },
          { label: '괜찮아요', then: [{ say: '언제든 들러 주세요. 다녀오세요!' }] },
        ],
      },
    ]
  },

  resting: () => [
    { say: '하아… 오늘 다섯 판 뛰었더니 다리가 안 움직여.' },
    { say: '여기 소파 진짜 편해…' },
  ],

  centerPc: () => [
    { say: '셔틀넷 단말기다. 다른 마을 소식이 흘러나온다.' },
    {
      ask: '접속할까?',
      choices: [
        { label: '경기방에 들어간다', close: true, run: () => openPanel('rooms') },
        { label: '랭킹을 본다', close: true, run: () => openPanel('rank') },
        { label: '그만둔다', then: [{ say: '단말기를 껐다.' }] },
      ],
    },
  ],

  centerTable: () => [{ say: '테이블 위에 셔틀콕 통이 놓여 있다.' }, { say: '누군가 마시다 만 이온음료도 있다…' }],

  // ── 셔틀 체육관 ──────────────────────────────────────────────────────────────
  leader: () => {
    const s = S()
    const waiting = Object.values(s.players).filter((p) => p.status === 'waiting').length
    const playing = s.courts.filter((c) => c.status === 'playing').length
    const inRoom = s.online?.status === 'room'
    return [
      { say: '여어! 셔틀 체육관에 온 걸 환영하네.' },
      {
        say: inRoom
          ? `자네는 지금 「${s.online.roomName}」 방에 들어와 있지. 대기 ${waiting}명, 진행 중인 경기 ${playing}판이야.`
          : `아직 경기방에 안 들어갔군. 방에 들어가야 순번이 돌아온다네.`,
      },
      {
        ask: '무엇을 할까?',
        choices: [
          inRoom
            ? { label: '대진표를 본다', close: true, run: () => openPanel('match') }
            : { label: '경기방에 들어간다', close: true, run: () => openPanel('rooms') },
          { label: inRoom ? '다른 경기방을 본다' : '대진표를 본다', close: true, run: () => openPanel(inRoom ? 'rooms' : 'match') },
          {
            label: '자동 매칭을 돌린다',
            then: [
              { do: () => S().autoFill(false) },
              { say: waiting >= 4 ? '좋아, 코트로 들어가라고!' : '음… 아직 사람이 모자란 것 같은데?' },
            ],
          },
          { label: '아무것도 아니야', then: [{ say: '언제든 도전하러 오게!' }] },
        ],
      },
    ]
  },

  referee: () => [
    { say: '경기는 11점 또는 21점으로 설정할 수 있어요.' },
    { say: '설정은 ☰ 메뉴 → 설정에서 바꿀 수 있습니다.' },
  ],

  gymBoard: () => {
    const s = S()
    const b = todayBoard(s.players, s.bestLift)
    return [
      { say: '── 오늘의 전광판 ──' },
      { say: b.mvp ? `오늘 최다 출전은 ${b.mvp.name} 님! ${b.mvp.todayGames}경기를 뛰었다.` : '아직 오늘 뛴 사람이 없다.' },
      { say: b.closest ? `가장 친해진 사람은 ${b.closest.name} 님 (친밀도 ${b.closest.affinity}).` : '아직 친해진 사람이 없다.' },
      { say: `오늘 마을에서 ${s.today.matches}판이 열렸고, 나는 ${s.today.games}경기 뛰었다.` },
      { say: `도감에 오른 사람은 지금까지 ${s.career.partners}명.` },
    ]
  },

  gymLocker: () => [{ say: '사물함이다. 다른 사람 물건이 들어 있다.' }, { say: '…열어 보는 건 예의가 아니겠지.' }],

  // ── 내 방 ────────────────────────────────────────────────────────────────────
  bed: () => [
    {
      ask: '푹신한 침대다. 좀 쉴까?',
      choices: [
        {
          label: '잠깐 눕는다',
          then: [
            { do: () => { S().advanceTime(3); S().toast('푹 쉬었다! 몸이 개운해졌어 😴', 'good') } },
            { say: '…3시간이 흘렀다. 몸이 개운하다!' },
          ],
        },
        {
          label: '리포트를 쓴다 (저장)',
          then: [
            { say: '지금까지의 기록을 리포트에 적었다…' },
            { do: () => { S().setSetting({}); S().toast('💾 리포트를 저장했습니다!', 'good') } },
            { say: '저장했습니다!' },
          ],
        },
        { label: '그만둔다', then: [{ say: '지금은 잘 때가 아니야.' }] },
      ],
    },
  ],

  /** 풀숲에서 가끔 일어나는 일 */
  grassFind: () => {
    const r = Math.random()
    if (r < 0.45) {
      const coin = 30 + Math.floor(Math.random() * 60)
      return [
        { say: '풀숲을 헤치자 무언가 반짝인다…' },
        { do: () => { useGame.setState({ coins: S().coins + coin }); S().toast(`🪙 ${coin}코인을 주웠다!`, 'good') } },
        { say: `잃어버린 동전 ${coin}코인을 주웠다!` },
      ]
    }
    if (r < 0.75) {
      return [
        { say: '풀숲에서 셔틀콕이 하나 굴러 나왔다.' },
        { say: '누군가 스매시를 세게 쳤나 보다… 깃털이 다 상했다.' },
      ]
    }
    if (r < 0.92) {
      const b = S().bestLift || 0
      return [
        { say: '풀숲에 숨어 리프팅 연습을 해 볼까?' },
        { say: b ? `내 최고 기록은 ${b}개였지.` : '아직 제대로 해 본 적이 없다.' },
        {
          ask: '뽑기 코너에서 제대로 도전해 볼까?',
          choices: [
            { label: '하러 간다', close: true, run: () => openPanel('minigame') },
            { label: '나중에', then: [{ say: '…다음에 하자.' }] },
          ],
        },
      ]
    }
    return [{ say: '풀숲이 사각사각 흔들린다. 아무것도 없었다.' }]
  },

  closet: () => [
    { say: '옷장이다. 사 둔 옷들이 걸려 있다.' },
    {
      ask: '갈아입을까?',
      choices: [
        { label: '옷을 갈아입는다', close: true, run: () => openPanel('closet') },
        { label: '닫는다', then: [{ say: '옷장을 닫았다.' }] },
      ],
    },
  ],

  homePc: () => [
    { say: '내 PC다. 전원이 켜져 있다.' },
    {
      ask: '무엇을 볼까?',
      choices: [
        { label: '경기 기록', close: true, run: () => openPanel('record') },
        { label: '트로피 진열장', close: true, run: () => openPanel('trophy') },
        { label: '트레이너 카드', close: true, run: () => openPanel('me') },
        { label: '끈다', then: [{ say: 'PC를 껐다.' }] },
      ],
    },
  ],

  homeTv: () => {
    const lines = [
      '『오늘의 배드민턴』… 스매시 각도에 대한 특집이다.',
      '광고가 나온다. 「신제품 나노 슬림, 지금 셔틀마트에서!」',
      '뉴스다. 「셔틀타운 주민 수 증가… 코트 증설 검토」',
      '드라마 재방송이다. 주인공이 셔틀콕을 놓쳤다.',
    ]
    return [{ say: lines[Math.floor(Math.random() * lines.length)] }]
  },

  // ── 뽑기 코너 ────────────────────────────────────────────────────────────────
  arcadeClerk: () => {
    const s = S()
    return [
      { say: '어서 오세요, 뽑기 코너입니다!' },
      {
        ask: `오늘은 운이 좋아 보이는데요? (보유 ${nf(s.coins)}🪙)`,
        choices: [
          { label: '셔틀콕 뽑기 (300🪙)', close: true, run: () => openPanel('gacha') },
          { label: '리프팅 미니게임', close: true, run: () => openPanel('minigame') },
          { label: '셔틀 랠리 (주민과 함께)', close: true, run: () => openPanel('rally') },
          { label: '구경만 할게요', then: [{ say: '천천히 보세요~ 기계는 도망 안 갑니다!' }] },
        ],
      },
    ]
  },

  gachaMachine: () => [
    { say: '동그란 캡슐이 잔뜩 들어 있는 기계다.' },
    {
      ask: '한 번 돌려 볼까? (300🪙)',
      choices: [
        { label: '돌린다', close: true, run: () => openPanel('gacha') },
        { label: '그만둔다', then: [{ say: '…다음에 하자.' }] },
      ],
    },
  ],

  liftMachine: () => {
    const r = S().bestRally || 0
    return [
      { say: '「셔틀 리프팅 챌린지」 기계다.' },
      { say: r ? `옆에 랠리 기록판도 붙어 있다 — 내 최고는 ${r}회.` : '옆에 「둘이서 랠리」 안내문도 붙어 있다.' },
      {
        ask: '무엇을 할까?',
        choices: [
          { label: '리프팅에 도전한다', close: true, run: () => openPanel('minigame') },
          { label: '주민과 랠리를 친다', close: true, run: () => openPanel('rally') },
          { label: '그만둔다', then: [{ say: '자신 없을 땐 물러서는 것도 용기다.' }] },
        ],
      },
    ]
  },

  // ── 간판 · 소품 ──────────────────────────────────────────────────────────────
  sign_town: () => [{ say: '「셔틀타운 — 배드민턴을 사랑하는 사람들의 마을」' }, { say: '작은 글씨: 코트에서 뛰기 전에 꼭 몸을 푸세요!' }],
  sign_gym: () => [{ say: '「셔틀 체육관 — 관장 태호」' }, { say: '「도전자는 언제든 환영한다」' }],
  sign_center: () => [{ say: '「셔틀센터 — 지친 몸을 쉬어 가세요」' }, { say: '24시간 운영 · 이용료 무료' }],
  sign_mart: () => [{ say: '「셔틀마트 — 라켓부터 셔틀콕까지」' }, { say: '오늘의 추천: 나노 슬림!' }],
  sign_home: () => [{ say: '「우리 집」' }, { say: '문패에 내 이름이 적혀 있다.' }],
  sign_arcade: () => [{ say: '「뽑기 코너 — 오늘은 뭐가 나올까?」' }, { say: '작은 글씨: 과몰입 주의' }],

  vending: () => {
    const s = S()
    if (!canAfford(s, 60)) return [{ say: '자판기다. 이온음료 60🪙.' }, { say: '…코인이 모자란다.' }]
    return [
      {
        ask: '자판기다. 이온음료를 뽑을까? (60🪙)',
        choices: [
          {
            label: '뽑는다',
            then: [
              {
                do: () => {
                  if (!isGod(S())) useGame.setState({ coins: S().coins - 60 })
                  S().advanceTime(1)
                  S().toast('이온음료를 마셨다! 시원하다 🥤', 'good')
                },
              },
              { say: '꿀꺽꿀꺽… 시원하다! 힘이 나는 것 같다.' },
            ],
          },
          { label: '그만둔다', then: [{ say: '자판기 앞을 지나쳤다.' }] },
        ],
      },
    ]
  },

  scoreboard: () => {
    const s = S()
    const last = s.history[0]
    return [
      { say: '마을 광장의 대형 전광판이다.' },
      { say: last ? `최근 경기 — ${last.names[0]}·${last.names[1]} vs ${last.names[2]}·${last.names[3]}` : '아직 오늘 경기 기록이 없다.' },
    ]
  },
}

// -----------------------------------------------------------------------------------
// 마을 주민(선수 명단에서 걸어 나온 사람들)
// -----------------------------------------------------------------------------------
/** 오늘 이야기 나눈 사람 (미션용) — 같은 사람은 하루 한 번만 센다 */
const talkedToday = new Set()
function countTalk(id) {
  const key = `${new Date().toDateString()}:${id}`
  if (talkedToday.has(key)) return
  talkedToday.add(key)
  const s = S()
  useGame.setState({ today: { ...s.today, talks: (s.today.talks || 0) + 1 } })
}

function playerScript(id) {
  const s = S()
  const p = s.players[id]
  if (!p) return [{ say: '…아무도 없다.' }]
  countTalk(id)
  const chat = p.affinity >= 60 ? CHATTER.high : p.affinity >= 25 ? CHATTER.mid : CHATTER.low
  const line = chat[(p.name.length + p.todayGames) % chat.length]
  const hearts = '💛'.repeat(Math.floor(p.affinity / 20)) + '🤍'.repeat(Math.max(0, 5 - Math.floor(p.affinity / 20)))
  return [
    { say: line },
    {
      ask: `${p.name} · ${p.level} · 오늘 ${p.todayGames}경기`,
      choices: [
        { label: `친밀도 보기 ${hearts}`, then: [{ say: `${p.name} 와의 친밀도는 ${p.affinity} 야.` }, { say: p.affinity >= 60 ? '완전 단짝이네! 같이 뛰면 호흡이 척척 맞아.' : '같이 경기를 뛰면 더 친해질 수 있어.' }] },
        {
          label: p.status === 'resting' ? '대기석으로 부른다' : '잠깐 쉬라고 한다',
          then: [
            { do: () => S().toggleRest(id) },
            { say: p.status === 'resting' ? `${p.name} 이(가) 코트로 돌아갔다!` : `${p.name} 은(는) 잠깐 쉬기로 했다.` },
          ],
        },
        { label: '대진표를 본다', close: true, run: () => openPanel('match') },
        { label: '잘 있어', then: [{ say: '또 보자!' }] },
      ],
    },
  ]
}

/**
 * 대사 가져오기.
 *  - 'player:<id>' 는 마을 주민
 *  - 그 외는 위 SCRIPTS 표에서
 */
export function getScript(id) {
  if (!id) return null
  if (id.startsWith('player:')) return playerScript(id.slice(7))
  const fn = SCRIPTS[id]
  if (!fn) return [{ say: '…' }]
  return fn()
}
