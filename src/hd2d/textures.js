// ===================================================================================
// 셔틀몬스터 HD-2D — 캔버스 → 3D 텍스처
//
// 지금까지 코드로 구워 온 도트 캔버스(바닥·오브젝트·캐릭터 시트)를 그대로
// three.js 텍스처로 올린다. 확대해도 뭉개지지 않도록 전부 NearestFilter.
// ===================================================================================
import * as THREE from 'three'
import { TILE, objectSprite } from '../pixel/tileset.js'
import { getSheet, lookKey, CW, CH } from '../pixel/sprites.js'

const cache = new Map()

/** 캔버스를 도트가 살아 있는 텍스처로 (같은 캔버스는 한 번만 올린다) */
export function texFromCanvas(canvas, key) {
  if (key && cache.has(key)) return cache.get(key)
  const t = new THREE.CanvasTexture(canvas)
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  t.generateMipmaps = false
  t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  if (key) cache.set(key, t)
  return t
}

/** 오브젝트(나무·건물·가구) 스프라이트 텍스처 + 월드 단위 크기 */
export function objectTexture(kind, theme, variant = 0) {
  const key = `obj|${kind}|${theme.id}|${variant}`
  if (cache.has(key)) return cache.get(key)
  const cv = objectSprite(kind, theme, variant)
  if (!cv) return null
  const t = texFromCanvas(cv, key)
  t.userData = { w: cv.width / TILE, h: cv.height / TILE }
  return t
}

/**
 * 캐릭터 시트 텍스처.
 * 한 사람당 시트는 하나지만, 방향·프레임이 제각각이라 인스턴스마다 복제해서
 * offset 만 따로 준다. (복제는 GPU 업로드를 다시 하지 않는다)
 */
const sheetBase = new Map()
export function actorTexture(look, gender) {
  const key = lookKey(look, gender)
  let base = sheetBase.get(key)
  if (!base) {
    base = texFromCanvas(getSheet(look, gender), `sheet|${key}`)
    sheetBase.set(key, base)
  }
  const t = base.clone()
  t.needsUpdate = true
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  t.generateMipmaps = false
  t.colorSpace = THREE.SRGBColorSpace
  t.repeat.set(1 / 4, 1 / 4)
  return t
}

/** 시트에서 (방향, 프레임) 칸을 고른다 */
export function setActorFrame(tex, dir, frame) {
  tex.offset.set(frame / 4, 1 - (dir + 1) / 4)
}

/** 캐릭터 한 칸의 월드 크기 */
export const ACTOR_W = CW / TILE
export const ACTOR_H = CH / TILE

export function clearTextureCache() {
  cache.forEach((t) => t.dispose?.())
  cache.clear()
  sheetBase.clear()
}
