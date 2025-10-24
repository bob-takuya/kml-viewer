import { useRef, useMemo, memo, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { InfoCard } from './InfoCard'
import { InstancedMarkers } from './InstancedMarkers'
import { latLngToLocal } from '../utils/coordinateTransform'
import { perfLogger } from '../utils/perfLogger'
import { Frustum, Matrix4 } from 'three'

/**
 * メモ化された接続線コンポーネント
 * 選択状態が変わった時のみ再レンダリング
 */
const MemoizedLine = memo(function MemoizedLine({ start, end, isSelected }) {
  return (
    <Line
      points={[start, end]}
      color={isSelected ? "#ffff00" : "#00ffff"}
      lineWidth={isSelected ? 4 : 2}
      opacity={isSelected ? 1 : 0.7}
      transparent
    />
  )
}, (prevProps, nextProps) => {
  // isSelectedが変わった場合のみ再レンダリング
  return prevProps.isSelected === nextProps.isSelected &&
         prevProps.start === nextProps.start &&
         prevProps.end === nextProps.end
})

/**
 * メモ化されたカードとラインのグループ
 * 選択状態が変わった時のみ再レンダリング
 */
const MemoizedCardGroup = memo(function MemoizedCardGroup({
  pointData,
  isSelected,
  onPointClick,
  mode
}) {
  return (
    <group>
      {/* 接続線 */}
      <MemoizedLine
        start={pointData.lineStart}
        end={pointData.lineEnd}
        isSelected={isSelected}
      />

      {/* 情報カード */}
      <group position={pointData.cardPos}>
        <InfoCard
          point={pointData}
          onClick={onPointClick}
          mode={mode}
          isSelected={isSelected}
        />
      </group>
    </group>
  )
}, (prevProps, nextProps) => {
  // isSelectedとpointDataが変わった場合のみ再レンダリング
  return prevProps.isSelected === nextProps.isSelected &&
         prevProps.pointData === nextProps.pointData &&
         prevProps.onPointClick === nextProps.onPointClick &&
         prevProps.mode === nextProps.mode
})

/**
 * 鳥瞰モードのコンポーネント
 * ポイントとその周囲に配置された情報カードを表示
 */
export const BirdEyeView = memo(function BirdEyeView({ points, origin, onPointClick, selectedPointId }) {
  const { camera } = useThree()
  const [visibleIndices, setVisibleIndices] = useState(new Set())
  const frustum = useMemo(() => new Frustum(), [])
  const projectionMatrix = useMemo(() => new Matrix4(), [])
  const frameCountRef = useRef(0)

  // 各ポイントの3D座標とカード配置位置を計算
  const pointsData = useMemo(() => {
    perfLogger.start('カード配置計算')
    if (!points || !origin) return []

    // 黄金角を使用した配置（力学シミュレーション不要）
    // 黄金角配置は自然に重ならないため、追加の最適化は不要
    const positions = points.map((point, index) => {
      const position = latLngToLocal(point.lat, point.lng, origin)
      const angle = (index * 137.5 * Math.PI) / 180
      const distance = 0.8 + (index % 3) * 0.3 // 距離: 0.8〜1.4m

      return {
        ...point,
        markerPos: [position.x, 0, position.z],
        cardX: position.x + Math.cos(angle) * distance,
        cardZ: position.z + Math.sin(angle) * distance,
        cardY: 2.5 + (index % 4) * 1 // 高さ: 2.5〜5.5m
      }
    })

    // 最終的な位置データを返す
    const result = positions.map((data) => ({
      ...data,
      cardPos: [data.cardX, data.cardY, data.cardZ],
      lineStart: [data.markerPos[0], 0.8, data.markerPos[2]], // 線の開始位置（マーカー高さ1.2に合わせて調整）
      lineEnd: [data.cardX, data.cardY, data.cardZ]
    }))

    perfLogger.end('カード配置計算', `${result.length}個`)
    return result
  }, [points, origin])

  // マーカーの位置リスト（インスタンシング用）
  const markerPositions = useMemo(() => {
    return pointsData.map(data => data.markerPos)
  }, [pointsData])

  // 選択されたポイントのインデックスを取得
  const selectedIndex = useMemo(() => {
    if (!selectedPointId) return -1
    return pointsData.findIndex(data => data.id === selectedPointId)
  }, [selectedPointId, pointsData])

  // フラスタムカリング: 視野内のカードだけを特定
  // 最適化: 毎フレームではなく3フレームに1回実行
  useFrame(() => {
    if (pointsData.length === 0) return

    frameCountRef.current++

    // 3フレームに1回だけfrustum cullingを実行（パフォーマンス最適化）
    if (frameCountRef.current % 3 !== 0) return

    // フラスタムを更新
    projectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(projectionMatrix)

    const newVisibleIndices = new Set()

    // 各カードが視野内かチェック（距離による簡易カリングも追加）
    pointsData.forEach((data, index) => {
      const cardPos = data.cardPos
      const distanceToCamera = camera.position.distanceTo({
        x: cardPos[0],
        y: cardPos[1],
        z: cardPos[2]
      })

      // 視野内 かつ 一定距離内のカードだけ表示
      const inFrustum = frustum.containsPoint({
        x: cardPos[0],
        y: cardPos[1],
        z: cardPos[2]
      })

      if (inFrustum && distanceToCamera < 40) {
        newVisibleIndices.add(index)
      }
    })

    // 変更があった場合のみステート更新
    const stateChanged = newVisibleIndices.size !== visibleIndices.size ||
        ![...newVisibleIndices].every(i => visibleIndices.has(i))

    if (stateChanged) {
      setVisibleIndices(newVisibleIndices)
    }
  })

  return (
    <group>
      {/* インスタンシングマーカー - より低く */}
      <InstancedMarkers
        positions={markerPositions}
        color="#ff3366"
        height={1.2}
        selectedIndex={selectedIndex}
      />

      {/* クリック可能な透明球体（各マーカーに配置） */}
      {pointsData.map((pointData, index) => (
        <mesh
          key={`clickable-${pointData.id || index}`}
          position={[pointData.markerPos[0], 0.6, pointData.markerPos[2]]}
          onClick={(e) => {
            e.stopPropagation()
            onPointClick(pointData)
          }}
          renderOrder={-1}
        >
          <sphereGeometry args={[0.3, 8, 8]} />
          <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
        </mesh>
      ))}

      {/* 可視範囲内のカードを表示 */}
      {visibleIndices.size > 0 && Array.from(visibleIndices).map((index) => {
        const pointData = pointsData[index]
        if (!pointData) return null

        const isSelected = pointData.id === selectedPointId

        return (
          <group key={pointData.id || index}>
            <MemoizedCardGroup
              pointData={pointData}
              isSelected={isSelected}
              onPointClick={onPointClick}
              mode="bird"
            />
          </group>
        )
      })}
    </group>
  )
})
