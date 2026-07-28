// ===================================================================================
// 캐릭터 만들기 / 꾸미기 — 머리·얼굴·의상·라켓을 실시간 3D 미리보기로 고른다.
// ===================================================================================
import { useState, useRef, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import Character from '../three/Character.jsx'
import { useGame, defaultLook } from '../game/store.js'
import {
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, EYE_STYLES, CLOTH_COLORS,
  OUTFIT_STYLES, RACKET_MODELS, RACKET_COLORS, ACCESSORIES, LEVELS, LEVEL_COLOR,
} from '../game/constants.js'

function Turntable({ look, gender, spin }) {
  const g = useRef()
  useFrame((s, dt) => {
    if (g.current && spin) g.current.rotation.y += dt * 0.55
  })
  return (
    <group ref={g} position={[0, -0.75, 0]}>
      <Character look={look} gender={gender} anim="idle" seed={7} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[1.1, 28]} />
        <meshStandardMaterial color="#8fd67f" roughness={1} />
      </mesh>
    </group>
  )
}

function Preview({ look, gender }) {
  const [spin, setSpin] = useState(true)
  return (
    <div className="preview" onPointerDown={() => setSpin(false)}>
      <Canvas camera={{ position: [0, 0.6, 3.1], fov: 40 }} dpr={[1, 1.6]}>
        <hemisphereLight args={['#ffffff', '#7aa86a', 1.5]} />
        <directionalLight position={[3, 6, 4]} intensity={1.8} />
        <Turntable look={look} gender={gender} spin={spin} />
        <OrbitControls
          enablePan={false}
          minDistance={1.8}
          maxDistance={5}
          maxPolarAngle={Math.PI * 0.56}
          minPolarAngle={0.5}
          target={[0, 0.35, 0]}
        />
      </Canvas>
      <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center', fontSize: 12, color: '#5b6b4a' }}>
        끌어서 돌려보기 · 휠로 확대
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

function Options({ items, value, onPick, owned, coins, onBuy }) {
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
  const coins = useGame((s) => s.coins)
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
    const next = { ...look, ...p }
    setLookState(next)
    if (mode === 'edit') setLook('me', p)
  }
  const patchRacket = (p) => {
    const next = { ...look, racket: { ...look.racket, ...p } }
    setLookState(next)
    if (mode === 'edit') setLook('me', { racket: next.racket })
  }

  const pickGender = (g) => {
    setGender(g)
    if (mode === 'edit') setPlayerInfo('me', { gender: g })
    if (mode === 'create') patch({ hair: g === '여' ? 'ponytail' : 'short' })
  }

  const start = () => {
    if (!name.trim()) return alert('이름을 알려줘! 마을 주민들이 부를 이름이야 😊')
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
      <div className="ac-panel creator">
        <Preview look={look} gender={gender} />

        <div className="controls">
          <div className="ac-title">
            {mode === 'create' ? '🏝️ 셔틀빌리지에 온 걸 환영해!' : '✨ 내 모습 꾸미기'}
          </div>
          {mode === 'create' && (
            <div className="muted" style={{ marginTop: -6, marginBottom: 10 }}>
              여기는 배드민턴을 사랑하는 사람들이 모여 사는 마을이야.<br />
              먼저 네 모습부터 정해볼까?
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
                  className="ac-input"
                  placeholder="마을에서 불릴 이름"
                  value={name}
                  maxLength={10}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => mode === 'edit' && name.trim() && setPlayerInfo('me', { name: name.trim() })}
                />
                <div className="sect">성별</div>
                <div className="row">
                  {['남', '여'].map((g) => (
                    <button key={g} className={`ac-btn ${gender === g ? 'green' : ''}`} onClick={() => pickGender(g)}>
                      {g === '남' ? '👦 남자' : '👧 여자'}
                    </button>
                  ))}
                </div>
                <div className="sect">내 급수</div>
                <div className="row wrap">
                  {LEVELS.map((l) => (
                    <button
                      key={l}
                      className={`ac-btn sm ${level === l ? 'green' : ''}`}
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
                <div className="sect">키</div>
                <input
                  type="range" min="0.88" max="1.12" step="0.01"
                  value={look.height ?? 1}
                  onChange={(e) => patch({ height: Number(e.target.value) })}
                  style={{ width: '100%' }}
                />
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
                <div className="sect">하의 색</div>
                <Swatches colors={CLOTH_COLORS} value={look.bottom} onPick={(c) => patch({ bottom: c })} />
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
              </>
            )}
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            {mode === 'create' ? (
              <button className="ac-btn green wide" onClick={start}>
                🌱 이 모습으로 마을 생활 시작!
              </button>
            ) : (
              <button className="ac-btn green wide" onClick={onClose}>
                ✅ 다 꾸몄어!
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
