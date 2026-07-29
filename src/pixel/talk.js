// ===================================================================================
// 셔틀몬스터 — 대화 진행기
//
// 포켓몬스터의 그 말풍선: 글자가 한 자씩 타닥타닥 찍히고, ▼ 가 깜빡이고,
// Ⓐ 를 누르면 다음 줄. 선택지가 나오면 위/아래로 고르고 Ⓐ 로 결정한다.
//
// 대사는 「단계(step)의 줄」이다.
//   { say: '텍스트' }                     한 줄 말하기
//   { ask: '텍스트', choices: [...] }     물어보고 고르게 하기
//   { do: () => {...} }                   조용히 무언가 실행
//   { end: true }                         여기서 대화 끝
// 선택지는 { label, then: [단계...] | () => [단계...] , close: true }
// ===================================================================================
import { create } from 'zustand'

export const useTalk = create((set, get) => ({
  open: false,
  who: '',        // 말하는 사람 이름 (없으면 이름표를 안 띄운다)
  face: null,     // 말하는 사람 얼굴(스프라이트 정보) — { look, gender }
  full: '',       // 이번 줄 전체 문장
  choices: null,  // [{ label }]
  cursor: 0,      // 선택지 커서
  queue: [],
  seq: 0,         // 줄이 바뀔 때마다 증가 — 타자기 효과 초기화용

  /** 대화 시작 */
  start: (who, steps, face = null) => {
    set({ open: true, who, face, queue: [...steps], choices: null, cursor: 0, full: '' })
    get()._next()
  },

  _next: () => {
    const q = [...get().queue]
    while (q.length) {
      const step = q.shift()
      if (!step) continue
      if (step.end) { set({ queue: [] }); get().close(); return }
      if (step.do) { step.do(); continue }
      if (step.say != null) {
        set({ full: String(step.say), choices: null, cursor: 0, queue: q, seq: get().seq + 1 })
        return
      }
      if (step.ask != null) {
        set({
          full: String(step.ask),
          choices: step.choices || [],
          cursor: 0,
          queue: q,
          seq: get().seq + 1,
        })
        return
      }
    }
    set({ queue: [] })
    get().close()
  },

  /** Ⓐ — 다음 줄로 */
  advance: () => {
    const s = get()
    if (!s.open) return
    if (s.choices) return // 선택지는 choose 로만 넘어간다
    s._next()
  },

  moveCursor: (d) => {
    const s = get()
    if (!s.choices?.length) return
    set({ cursor: (s.cursor + d + s.choices.length) % s.choices.length })
  },

  /** 선택지 결정 */
  choose: (i) => {
    const s = get()
    const c = s.choices?.[i ?? s.cursor]
    if (!c) return
    set({ choices: null })
    if (c.close) { get().close(); c.run?.(); return }
    c.run?.()
    const then = typeof c.then === 'function' ? c.then() : c.then
    if (then?.length) set({ queue: [...then, ...s.queue] })
    get()._next()
  },

  close: () => set({ open: false, who: '', face: null, full: '', choices: null, queue: [], cursor: 0 }),
}))

/** 대화 중인가 (엔진이 이걸 보고 이동을 멈춘다) */
export const isTalking = () => useTalk.getState().open
