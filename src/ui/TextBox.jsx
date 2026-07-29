// ===================================================================================
// 셔틀몬스터 — 대화창
//
// 포켓몬스터의 그 말풍선. 글자가 한 자씩 찍히고, 다 찍히면 ▼ 가 깜빡인다.
// 선택지는 오른쪽 위에 작은 창으로 뜬다. 위/아래로 고르고 Ⓐ 로 결정.
// ===================================================================================
import { useEffect, useRef, useState } from 'react'
import { useTalk } from '../pixel/talk.js'
import { drawBig, CW, CH } from '../pixel/sprites.js'

const SPEED = 26 // ms per char

function Face({ face }) {
  const ref = useRef(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv || !face) return
    const g = cv.getContext('2d')
    g.clearRect(0, 0, cv.width, cv.height)
    drawBig(g, face.look, face.gender, 0, 0, 0, 0, 1)
  }, [face])
  if (!face) return null
  return <canvas ref={ref} width={CW} height={CH} className="talk-face" />
}

export default function TextBox() {
  const open = useTalk((s) => s.open)
  const who = useTalk((s) => s.who)
  const face = useTalk((s) => s.face)
  const full = useTalk((s) => s.full)
  const seq = useTalk((s) => s.seq)
  const choices = useTalk((s) => s.choices)
  const cursor = useTalk((s) => s.cursor)
  const advance = useTalk((s) => s.advance)
  const choose = useTalk((s) => s.choose)
  const [shown, setShown] = useState(0)

  // 타자기
  useEffect(() => {
    if (!open) return
    setShown(0)
    if (!full) return
    let i = 0
    const id = setInterval(() => {
      i += 1
      setShown(i)
      if (i >= full.length) clearInterval(id)
    }, SPEED)
    return () => clearInterval(id)
  }, [seq, full, open])

  if (!open) return null
  const typing = shown < full.length

  const onTap = () => {
    if (typing) return setShown(full.length)
    if (!choices) advance()
  }

  return (
    <div className="talk-layer">
      {choices && !typing && (
        <div className="pk-win talk-choices">
          {choices.map((c, i) => (
            <button
              key={i}
              className={`talk-choice ${i === cursor ? 'on' : ''}`}
              onClick={(e) => { e.stopPropagation(); choose(i) }}
            >
              <i>▶</i>
              {c.label}
            </button>
          ))}
        </div>
      )}

      <div className="pk-win talk-box" onClick={onTap}>
        {who && <div className="talk-name">{who}</div>}
        <div className="talk-body">
          <Face face={face} />
          <p className="talk-text">
            {full.slice(0, shown)}
            <span className="talk-caret" style={{ opacity: typing ? 1 : 0 }} />
          </p>
        </div>
        {!typing && !choices && <span className="talk-next">▼</span>}
      </div>
    </div>
  )
}
