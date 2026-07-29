// ===================================================================================
// 셔틀몬스터 — 트레이너 만들기 / 꾸미기
// 도트 캐릭터를 크게 확대해서 보여 준다. 사방으로 돌려 보고 걷는 모습도 볼 수 있다.
// ===================================================================================
import { useState, useRef, useEffect } from 'react'
import { drawBig } from '../pixel/sprites.js'
import { useGame, defaultLook } from '../game/store.js'
import {
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, EYE_STYLES, CLOTH_COLORS,
  OUTFIT_STYLES, RACKET_MODELS, RACKET_COLORS, ACCESSORIES, LEVELS, LEVEL_COLOR,
  BOTTOM_STYLES, SHOE_STYLES, GRIP_WRAPS,
} from '../game/constants.js'

const DIR_LABEL = ['정면', '뒤', '왼쪽', '오른쪽']

function Preview({ look, gender }) {
  const ref = useRef(null)
  const [dir, setDir] = useState(0)
  const [walk, setWalk] = useState(true)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const g = cv.getContext('2d')
    let raf = 0
    let t = 0
    let last = performance.now()
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      t += (now - last) / 1000
      last = now
      const frame = walk ? [1, 0, 3, 0][Math.floor(t * 5) % 4] : 0
      g.imageSmoothingEnabled = false
      g.clearRect(0, 0, cv.width, cv.height)
      // 발밑 잔디판
      g.fillStyle = '#5cc45c'
      g.fillRect(0, cv.height - 26, cv.width, 26)
      g.fillStyle = '#4fb352'
      for (let i = 0; i < cv.width; i += 9) g.fillRect(i + (i % 18 ? 3 : 0), cv.height - 20, 3, 3)
      const scale = Math.floor(cv.height / 30)
      drawBig(g, look, gender, dir, frame, Math.round((cv.width - 16 * scale) / 2), cv.height - 24 * scale - 12, scale)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [look, gender, dir, walk])

  return (
    <div className="cc-preview">
      <canvas ref={ref} width={160} height={190} className="cc-canvas" />
      <div className="cc-preview-tools">
        <button className="pk-btn sm" onClick={() => setDir((d) => (d + 1) % 4)}>🔄 {DIR_LABEL[dir]}</button>
        <button className={`pk-btn sm ${walk ? 'primary' : ''}`} onClick={() => setWalk((v) => !v)}>
          {walk ? '🚶 걷는 중' : '🧍 서 있기'}
        </button>
      </div>
    </div>
  )
}

function Swatches({ colors, value, onPick }) {
  return (
    <div className="swatches">
      {colors.map((c) => (
        <button
          key={c}
          className={`sw ${value === c ? 'on' : ''}`}
          style={{ background: c }}
          onClick={() => onPick(c)}
          aria-label={c}
        />
      ))}
    </div>
  )
}

function Options({ items, value, onPick, owned, onBuy }) {
  return (
    <div className="opt-grid">
      {items.map((it) => {
        const locked = owned && !owned[it.id]
        return (
          <button
            key={it.id}
            className={`opt ${value === it.id ? 'on' : ''} ${locked ? 'locked' : ''}`}
            onClick={() => (locked ? onBuy?.(it) : onPick(it.id))}
          >
            {it.label}
            {locked && <span className="price">🔒 {it.price}🪙</span>}
            {!locked && it.desc && <span className="price">{it.desc}</span>}
          </button>
        )
      })}
    </div>
  )
}

export default function CharacterCreator({ mode = 'create', onClose }) {
  const createMe = useGame((s) => s.createMe)
  const me = useGame((s) => s.players.me)
  const setLook = useGame((s) => s.setLook)
  const setPlayerInfo = useGame((s) => s.setPlayerInfo)
  const owned = useGame((s) => s.owned)
  const buy = useGame((s) => s.buy)

  const [tab, setTab] = useState('basic')
  const [name, setName] = useState(me?.name || '')
  const [gender, setGender] = useState(me?.gender || '남')
  const [level, setLevel] = useState(me?.level || 'C조')
  const [look, setLookState] = useState(me?.look || defaultLook('남'))

  useEffect(() => {
    if (mode === 'edit' && me) setLookState(me.look)
  }, [mode, me])

  const patch = (p) => {
    setLookState((prev) => ({ ...prev, ...p }))
    if (mode === 'edit') setLook('me', p)
  }
  const patchRacket = (p) => {
    setLookState((prev) => {
      const next = { ...prev, racket: { ...prev.racket, ...p } }
      if (mode === 'edit') setLook('me', { racket: next.racket })
      return next
    })
  }

  const pickGender = (g) => {
    setGender(g)
    if (mode === 'edit') setPlayerInfo('me', { gender: g })
    if (mode === 'create') patch({ hair: g === '여' ? 'ponytail' : 'short', bottomStyle: g === '여' ? 'skirt' : 'shorts' })
  }

  const start = () => {
    if (!name.trim()) return alert('이름을 알려 줘! 마을 사람들이 부를 이름이야 😊')
    createMe({ name: name.trim(), gender, level, look })
  }

  const TABS = [
    ['basic', '🙋 기본'],
    ['face', '😊 얼굴'],
    ['hair', '💇 머리'],
    ['cloth', '👕 옷'],
    ['racket', '🏸 라켓'],
  ]

  return (
    <div className="overlay">
      <div className="pk-win creator">
        <Preview look={look} gender={gender} />

        <div className="controls">
          <div className="pk-title">
            {mode === 'create' ? '🏸 셔틀몬스터의 세계에 온 걸 환영해!' : '✨ 내 모습 꾸미기'}
          </div>
          {mode === 'create' && (
            <div className="muted" style={{ marginTop: -4, marginBottom: 10 }}>
              여기는 배드민턴 트레이너들이 모여 사는 셔틀타운이야.<br />
              먼저 네 모습부터 정해 볼까?
            </div>
          )}

          <div className="tabs">
            {TABS.map(([k, l]) => (
              <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </div>

          <div className="body">
            {tab === 'basic' && (
              <>
                <div className="sect">이름</div>
                <input
                  className="pk-input"
                  placeholder="마을에서 불릴 이름"
                  value={name}
                  maxLength={10}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => mode === 'edit' && name.trim() && setPlayerInfo('me', { name: name.trim() })}
                />
                <div className="sect">성별</div>
                <div className="row">
                  {['남', '여'].map((g) => (
                    <button key={g} className={`pk-btn ${gender === g ? 'primary' : ''}`} onClick={() => pickGender(g)}>
                      {g === '남' ? '👦 남자' : '👧 여자'}
                    </button>
                  ))}
                </div>
                <div className="sect">내 급수</div>
                <div className="row wrap">
                  {LEVELS.map((l) => (
                    <button
                      key={l}
                      className={`pk-btn sm ${level === l ? 'primary' : ''}`}
                      onClick={() => {
                        setLevel(l)
                        if (mode === 'edit') setPlayerInfo('me', { level: l })
                      }}
                      style={level === l ? {} : { color: LEVEL_COLOR[l] }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <div className="muted" style={{ marginTop: 8 }}>
                  급수는 자동 매칭에서 팀 밸런스를 맞출 때 쓰여. 나중에 언제든 바꿀 수 있어!
                </div>
              </>
            )}

            {tab === 'face' && (
              <>
                <div className="sect">피부톤</div>
                <div className="swatches">
                  {SKIN_TONES.map((s) => (
                    <button
                      key={s.id}
                      className={`sw ${look.skin === s.id ? 'on' : ''}`}
                      style={{ background: s.color }}
                      onClick={() => patch({ skin: s.id })}
                    />
                  ))}
                </div>
                <div className="sect">눈매</div>
                <Options
                  items={EYE_STYLES}
                  value={look.eyes}
                  onPick={(v) => patch({ eyes: v })}
                  owned={mode === 'edit' ? owned : null}
                  onBuy={(it) => buy(it)}
                />
              </>
            )}

            {tab === 'hair' && (
              <>
                <div className="sect">머리 모양</div>
                <Options
                  items={HAIR_STYLES}
                  value={look.hair}
                  onPick={(v) => patch({ hair: v })}
                  owned={mode === 'edit' ? owned : null}
                  onBuy={(it) => buy(it)}
                />
                <div className="sect">머리 색</div>
                <Swatches colors={HAIR_COLORS} value={look.hairColor} onPick={(c) => patch({ hairColor: c })} />
              </>
            )}

            {tab === 'cloth' && (
              <>
                <div className="sect">유니폼</div>
                <Options
                  items={OUTFIT_STYLES}
                  value={look.outfit}
                  onPick={(v) => patch({ outfit: v })}
                  owned={mode === 'edit' ? owned : null}
                  onBuy={(it) => buy(it)}
                />
                <div className="sect">상의 색</div>
                <Swatches colors={CLOTH_COLORS} value={look.top} onPick={(c) => patch({ top: c })} />
                <div className="sect">하의</div>
                <Options
                  items={BOTTOM_STYLES}
                  value={look.bottomStyle || (gender === '여' ? 'skirt' : 'shorts')}
                  onPick={(v) => patch({ bottomStyle: v })}
                  owned={mode === 'edit' ? owned : null}
                  onBuy={(it) => buy(it)}
                />
                <div className="sect">하의 색</div>
                <Swatches colors={CLOTH_COLORS} value={look.bottom} onPick={(c) => patch({ bottom: c })} />
                <div className="sect">신발</div>
                <Options
                  items={SHOE_STYLES}
                  value={look.shoeStyle || 'basic'}
                  onPick={(v) => patch({ shoeStyle: v })}
                  owned={mode === 'edit' ? owned : null}
                  onBuy={(it) => buy(it)}
                />
                <div className="sect">신발 색</div>
                <Swatches colors={CLOTH_COLORS} value={look.shoes} onPick={(c) => patch({ shoes: c })} />
                <div className="sect">액세서리</div>
                <Options
                  items={ACCESSORIES}
                  value={look.acc}
                  onPick={(v) => patch({ acc: v })}
                  owned={mode === 'edit' ? owned : null}
                  onBuy={(it) => buy(it)}
                />
              </>
            )}

            {tab === 'racket' && (
              <>
                <div className="sect">라켓 모델</div>
                <Options
                  items={RACKET_MODELS}
                  value={look.racket.model}
                  onPick={(v) => patchRacket({ model: v })}
                  owned={mode === 'edit' ? owned : null}
                  onBuy={(it) => buy(it)}
                />
                <div className="sect">프레임 색</div>
                <Swatches colors={RACKET_COLORS} value={look.racket.frame} onPick={(c) => patchRacket({ frame: c })} />
                <div className="sect">스트링 색</div>
                <Swatches colors={RACKET_COLORS} value={look.racket.string} onPick={(c) => patchRacket({ string: c })} />
                <div className="sect">그립 색</div>
                <Swatches colors={RACKET_COLORS} value={look.racket.grip} onPick={(c) => patchRacket({ grip: c })} />
                <div className="sect">그립 감기</div>
                <Options
                  items={GRIP_WRAPS}
                  value={look.racket.wrap || 'plain'}
                  onPick={(v) => patchRacket({ wrap: v })}
                  owned={mode === 'edit' ? owned : null}
                  onBuy={(it) => buy(it)}
                />
              </>
            )}
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            {mode === 'create' ? (
              <button className="pk-btn primary wide" onClick={start}>
                🌱 이 모습으로 모험 시작!
              </button>
            ) : (
              <button className="pk-btn primary wide" onClick={onClose}>
                ✅ 다 꾸몄어!
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
