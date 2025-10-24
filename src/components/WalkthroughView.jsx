import { useRef, useMemo, memo, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { InfoCard } from './InfoCard'
import { InstancedMarkers } from './InstancedMarkers'
import { latLngToLocal } from '../utils/coordinateTransform'
import { Frustum, Matrix4 } from 'three'

/**
 * ウォークスルーモードのコンポーネント
 * カメラ位置に応じて近くのポイントの情報を表示
 */
export const WalkthroughView = memo(function WalkthroughView({ points, origin, onPointClick }) {
  const groupRef = useRef()
  const { camera } = useThree()
  const [visibleIndices, setVisibleIndices] = useState(new Set())
  const frustum = useMemo(() => new Frustum(), [])
  const projectionMatrix = useMemo(() => new Matrix4(), [])

  // 各ポイントの3D座標を計算
  const pointsData = useMemo(() => {
    if (!points || !origin) return []

    return points.map((point) => {
      const position = latLngToLocal(point.lat, point.lng, origin)
      return {
        ...point,
        position: [position.x, 0, position.z]
      }
    })
  }, [points, origin])

  // マーカーの位置リスト（インスタンシング用）
  const markerPositions = useMemo(() => {
    return pointsData.map(data => data.position)
  }, [pointsData])

  // フラスタムカリング: 視野内のカードだけを特定
  useFrame(() => {
    if (pointsData.length === 0) return

    projectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(projectionMatrix)

    const newVisibleIndices = new Set()

    pointsData.forEach((data, index) => {
      const cardPos = [data.position[0], 1.6, data.position[2]]
      const distanceToCamera = camera.position.distanceTo({
        x: cardPos[0],
        y: cardPos[1],
        z: cardPos[2]
      })

      const inFrustum = frustum.containsPoint({
        x: cardPos[0],
        y: cardPos[1],
        z: cardPos[2]
      })

      // ウォークスルーモードは近距離のみ表示
      if (inFrustum && distanceToCamera < 30) {
        newVisibleIndices.add(index)
      }
    })

    if (newVisibleIndices.size !== visibleIndices.size ||
        ![...newVisibleIndices].every(i => visibleIndices.has(i))) {
      setVisibleIndices(newVisibleIndices)
    }
  })

  return (
    <group ref={groupRef}>
      {/* インスタンシングマーカー */}
      <InstancedMarkers
        positions={markerPositions}
        color="#00ff88"
        height={1.5}
      />

      {/* 可視カードのみレンダリング */}
      {pointsData.map((pointData, index) => {
        if (!visibleIndices.has(index)) return null;

        return (
          <group key={pointData.id} position={pointData.position}>
            {/* 情報カード（目線の高さに配置） */}
            <group position={[0, 1.6, 0]}>
              <InfoCard
                point={pointData}
                onClick={onPointClick}
                mode="walk"
              />
            </group>
          </group>
        )
      })}
    </group>
  )
})
