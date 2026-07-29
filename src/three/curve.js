// ===================================================================================
// 월드 커브 — 동물의 숲의 "롤링 로그(rolling log)" 지평선
//
// 멀어질수록 지면이 아래로 휘어져, 마을이 작은 행성 위에 얹힌 것처럼 보인다.
// 동물의 숲이 실사풍 3D와 가장 다르게 느껴지는 지점이 바로 이 효과다.
// 지평선이 화면 안으로 끌려 들어와서 하늘과 땅이 한 화면에 같이 보인다.
//
// 구현 방식 — three 의 project_vertex 청크를 통째로 갈아 끼운다.
//   · 마을의 재질 대부분이 JSX 안에 인라인으로 흩어져 있어 재질마다 손댈 수가 없다.
//   · 청크를 바꾸면 표준 파이프라인을 쓰는 모든 메시에 한 번에 적용된다.
//     (drei 의 Sky·Stars 는 자체 셰이더라 영향을 받지 않는다 — 하늘은 휘면 안 되니 다행)
//
// 왜 gl_Position 만 건드리나 —
//   정점의 월드 좌표(vWorldPosition)와 법선은 그대로 두고 투영 직전에만 내린다.
//   그래서 조명·그림자 좌표 계산은 '휘지 않은' 원래 위치로 이뤄지고,
//   그 결과가 휘어진 화면 위에 그대로 얹힌다. 즉 그림자가 지면을 따라 같이 휜다.
//
// 그림자 맵 패스는 제외해야 한다 —
//   그림자 맵은 광원 시점에서 렌더되므로 여기서도 휘면 광원 기준으로 엉뚱하게 휘어
//   그림자가 물체에서 떨어져 나간다. MeshDepthMaterial 은 DEPTH_PACKING,
//   MeshDistanceMaterial 은 DISTANCE 를 define 으로 갖고 있어 그것으로 걸러낸다.
// ===================================================================================
import * as THREE from 'three'

/**
 * 휘어지는 정도. 카메라에서 d 만큼 떨어진 지점이 d² × CURVE_AMOUNT 만큼 내려간다.
 * 코트 길이가 13 남짓인 축척이라, 20 떨어진 곳이 0.6 정도 내려가는 값이 자연스럽다.
 */
export const CURVE_AMOUNT = 0.00050

/** 좌우로도 아주 살짝 떨어뜨려 화면 양끝이 둥글게 말린다 */
export const CURVE_SIDE = 0.00032

const patched = THREE.ShaderChunk.project_vertex.replace(
  'gl_Position = projectionMatrix * mvPosition;',
  `#if !defined( DEPTH_PACKING ) && !defined( DISTANCE )
     {
       float curveDepth = -mvPosition.z;
       mvPosition.y -= ${CURVE_AMOUNT.toFixed(6)} * curveDepth * curveDepth
                     + ${CURVE_SIDE.toFixed(6)} * mvPosition.x * mvPosition.x;
     }
   #endif
   gl_Position = projectionMatrix * mvPosition;`
)

if (patched === THREE.ShaderChunk.project_vertex) {
  // three 버전이 올라가면서 청크 내용이 바뀌면 조용히 실패하는 대신 알려 준다
  console.warn('[curve] project_vertex 청크를 찾지 못해 월드 커브가 적용되지 않았습니다.')
} else {
  THREE.ShaderChunk.project_vertex = patched
}
