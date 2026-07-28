// ===================================================================================
// 재질 시스템 — 캐릭터가 "게임 렌더"처럼 보이게 만드는 핵심
//
//  ① 림 라이트(rim light) : 실루엣 가장자리가 빛나서 배경에서 캐릭터가 딱 떠 보인다.
//                           3D 게임 캐릭터가 또렷해 보이는 이유의 절반이 이것이다.
//  ② 워프 라이팅(wrap)    : 그림자 경계를 부드럽게 감싸 피부·천이 딱딱해 보이지 않게.
//  ③ 바람(wind)           : 잔디·나뭇잎이 흔들려 화면이 살아 있게.
//
// three 기본 재질의 셰이더에 코드를 끼워 넣는 방식(onBeforeCompile)이라
// 그림자·환경광·톤매핑 같은 기존 기능을 그대로 쓰면서 표현만 얹는다.
// ===================================================================================
import * as THREE from 'three'

/** 바람·물결 등 시간 기반 효과가 공유하는 값 */
export const timeUniform = { value: 0 }

// -----------------------------------------------------------------------------------
// 림 라이트 + 워프 라이팅 주입
// -----------------------------------------------------------------------------------
function injectRim(shader, { rimColor, rimPower, rimIntensity, wrap }) {
  shader.uniforms.uRimColor = { value: new THREE.Color(rimColor) }
  shader.uniforms.uRimPower = { value: rimPower }
  shader.uniforms.uRimIntensity = { value: rimIntensity }
  shader.uniforms.uWrap = { value: wrap }

  // ── 워프 라이팅: 빛이 닿는 각도를 살짝 넓혀 그림자 경계를 부드럽게 만든다
  if (wrap > 0) {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_physical_pars_fragment>',
      `#include <lights_physical_pars_fragment>
       uniform float uWrap;`
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec3 irradiance = dotNL * directLight.color;',
      `float wrapNL = clamp((dotNL + uWrap) / (1.0 + uWrap), 0.0, 1.0);
       vec3 irradiance = wrapNL * directLight.color;`
    )
  }

  // ── 림 라이트: 시선과 표면이 이루는 각이 클수록(=가장자리일수록) 밝게
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    `#include <common>
     uniform vec3 uRimColor;
     uniform float uRimPower;
     uniform float uRimIntensity;`
  )
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <dithering_fragment>',
    `#include <dithering_fragment>
     {
       vec3 viewDirRim = normalize(vViewPosition);
       float rim = 1.0 - saturate(dot(viewDirRim, normal));
       rim = pow(rim, uRimPower) * uRimIntensity;
       gl_FragColor.rgb += uRimColor * rim;
     }`
  )
}

const matCache = new Map()

/**
 * 캐릭터용 재질. 같은 설정이면 인스턴스를 재사용해서 드로우콜 상태 변경을 줄인다.
 * @param {object} o color, roughness, metalness, rimColor, rimPower, rimIntensity, wrap ...
 */
export function charMaterial(o = {}) {
  const {
    color = '#ffffff',
    roughness = 0.85,
    metalness = 0,
    rimColor = '#ffffff',
    rimPower = 2.6,
    rimIntensity = 0.34,
    wrap = 0.45,
    envMapIntensity = 0.85,
    map = null,
    transparent = false,
    opacity = 1,
    side = THREE.FrontSide,
    emissive = '#000000',
    emissiveIntensity = 0,
    flatShading = false,
  } = o

  const key = [color, roughness, metalness, rimColor, rimPower, rimIntensity, wrap,
    envMapIntensity, map?.uuid || '-', transparent, opacity, side, emissive, emissiveIntensity, flatShading].join('|')
  if (matCache.has(key)) return matCache.get(key)

  const m = new THREE.MeshStandardMaterial({
    color, roughness, metalness, map, transparent, opacity, side,
    emissive, emissiveIntensity, flatShading, envMapIntensity,
  })
  m.onBeforeCompile = (shader) => injectRim(shader, { rimColor, rimPower, rimIntensity, wrap })
  // 주입된 셰이더끼리만 프로그램을 공유하도록 캐시 키를 구분해 준다
  m.customProgramCacheKey = () => `rim-${rimPower}-${rimIntensity}-${wrap}-${!!map}-${flatShading}`
  matCache.set(key, m)
  return m
}

/** 피부 — 살짝 따뜻한 림 + 넓은 워프로 부드럽게 */
export const skinMaterial = (color) =>
  charMaterial({ color, roughness: 0.72, rimColor: '#ffd0b0', rimPower: 2.3, rimIntensity: 0.38, wrap: 0.62, envMapIntensity: 0.7 })

/** 천 — 광택 적고 림 약하게 */
export const clothMaterial = (color, map) =>
  charMaterial({ color, map, roughness: 0.92, rimColor: '#ffffff', rimPower: 3.0, rimIntensity: 0.3, wrap: 0.4 })

/** 머리카락 — 하이라이트가 도는 느낌 */
export const hairMaterial = (color) =>
  charMaterial({ color, roughness: 0.55, metalness: 0.05, rimColor: '#ffffff', rimPower: 2.0, rimIntensity: 0.5, wrap: 0.35, envMapIntensity: 1.1 })

/** 광택 재질 (라켓 프레임·신발 등) */
export const glossMaterial = (color) =>
  charMaterial({ color, roughness: 0.32, metalness: 0.25, rimColor: '#ffffff', rimPower: 2.2, rimIntensity: 0.45, wrap: 0.3, envMapIntensity: 1.4 })

/** 눈동자 — 반사가 도는 진한 재질 */
export const eyeMaterial = (color = '#1d1a1f') =>
  charMaterial({ color, roughness: 0.18, metalness: 0.1, rimColor: '#9fd4ff', rimPower: 1.6, rimIntensity: 0.5, wrap: 0.2, envMapIntensity: 1.8 })

// -----------------------------------------------------------------------------------
// 바람에 흔들리는 재질 (잔디·나뭇잎)
// -----------------------------------------------------------------------------------
const windCache = new Map()

/**
 * @param {object} o color, map, strength(흔들림 크기), instanced(인스턴싱 여부)
 */
export function windMaterial(o = {}) {
  const { color = '#5faf52', map = null, strength = 0.16, instanced = true, roughness = 1 } = o
  const key = [color, map?.uuid || '-', strength, instanced, roughness].join('|')
  if (windCache.has(key)) return windCache.get(key)

  const m = new THREE.MeshStandardMaterial({ color, map, roughness })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform
    shader.uniforms.uWind = { value: strength }
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       uniform float uTime;
       uniform float uWind;`
    )
    // 위쪽 정점일수록 크게 흔들린다 (뿌리는 고정)
    const offsetExpr = instanced
      ? 'instanceMatrix[3][0] * 0.9 + instanceMatrix[3][2] * 0.7'
      : '0.0'
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       {
         float phase = uTime * 1.5 + ${offsetExpr};
         float sway = (sin(phase) + sin(phase * 2.3) * 0.4) * uWind;
         float h = max(transformed.y, 0.0);
         transformed.x += sway * h;
         transformed.z += sway * h * 0.45;
       }`
    )
    injectRim(shader, { rimColor: '#dfffcf', rimPower: 3.2, rimIntensity: 0.22, wrap: 0.5 })
  }
  m.customProgramCacheKey = () => `wind-${instanced}-${!!map}`
  windCache.set(key, m)
  return m
}
