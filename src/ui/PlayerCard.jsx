// ===================================================================================
// 선수 카드 — 매칭 화면의 핵심 부품
//
// 한눈에 읽혀야 하는 정보 4가지를 각각 다른 채널로 표현한다.
//   급수   → 왼쪽 색 띠 + 글자 (색만 봐도 구분)
//   이름   → 가장 크게
//   게임 수 → 점(pip)으로 시각화 (숫자보다 비교가 빠르다)
//   대기시간 → 오른쪽 숫자 + 오래 기다렸으면 색이 바뀜
// ===================================================================================
import { memo, useMemo } from 'react'
import { LEVEL_COLOR } from '../game/constants.js'
import { avatarUrl } from './avatar.js'

const waitMin = (p) => Math.max(0, Math.floor((Date.now() - (p.waitSince || Date.now())) / 60000))

/** 오늘 경기 수를 점으로 — 5개 넘으면 숫자로 */
function Pips({ n }) {
  if (n > 5) return <span className="pips-num">{n}판</span>
  return (
    <span className="pips">
      {[0, 1, 2, 3, 4].map((i) => (
        <i key={i} className={i < n ? 'on' : ''} />
      ))}
    </span>
  )
}

function PlayerCardBase({
  player,
  selected = false,
  order = null,      // 선택 순번
  onClick,
  compact = false,   // 코트 슬롯용 작은 카드
  showWait = true,
  dim = false,
  fresh = false,     // 나와 아직 안 친 사람
}) {
  const avatar = useMemo(() => avatarUrl(player.look, player.gender, 96), [player.look, player.gender])
  const mins = waitMin(player)
  const color = LEVEL_COLOR[player.level] || '#a1a1aa'
  const long = mins >= 15

  if (compact) {
    return (
      <button className={`pslot ${selected ? 'sel' : ''} ${dim ? 'dim' : ''}`} onClick={onClick} style={{ '--lv': color }}>
        <img src={avatar} alt="" />
        <div className="pslot-txt">
          <b>{player.name}</b>
          <span>{player.level[0]}</span>
        </div>
      </button>
    )
  }

  return (
    <button
      className={`pcard2 ${selected ? 'sel' : ''} ${dim ? 'dim' : ''}`}
      onClick={onClick}
      style={{ '--lv': color }}
    >
      <span className="lvbar">{player.level[0]}</span>
      <img className="face" src={avatar} alt="" />
      <div className="info">
        <div className="line1">
          <b>{player.name}</b>
          {player.isMe && <em className="me">나</em>}
          {player.gender === '여' ? <em className="f">여</em> : <em className="m">남</em>}
        </div>
        <div className="line2">
          <Pips n={player.todayGames || 0} />
          {fresh && <em className="fresh">첫 대결</em>}
        </div>
      </div>
      {showWait && <span className={`wait ${long ? 'long' : ''}`}>{mins}<i>분</i></span>}
      {selected && <span className="check">{order != null ? order + 1 : '✓'}</span>}
    </button>
  )
}

export default memo(PlayerCardBase)
