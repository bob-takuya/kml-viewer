import { useEffect, useState, useMemo, memo } from 'react'
import { useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { fetchMapTiles, calculateZoomLevel } from '../utils/mapTiles'
import { calculateBounds } from '../utils/coordinateTransform'

/**
 * 地図を地面に表示するコンポーネント
 */
export const MapGround = memo(function MapGround({ points, origin, visible = true }) {
  const [mapTexture, setMapTexture] = useState(null)
  const [mapBounds, setMapBounds] = useState(null)

  useEffect(() => {
    if (!points || points.length === 0 || !origin) return

    const loadMap = async () => {
      try {
        // ポイントの範囲を計算
        const bounds = calculateBounds(points)
        if (!bounds) return

        // 範囲を少し広げる（マージン10%）
        const latMargin = (bounds.maxLat - bounds.minLat) * 0.1
        const lngMargin = (bounds.maxLng - bounds.minLng) * 0.1

        const expandedBounds = {
          minLat: bounds.minLat - latMargin,
          maxLat: bounds.maxLat + latMargin,
          minLng: bounds.minLng - lngMargin,
          maxLng: bounds.maxLng + lngMargin
        }

        // 適切なズームレベルを計算
        const zoom = calculateZoomLevel(expandedBounds, 16) // 最大16タイル

        // 地図タイルを取得
        const { canvas, bounds: actualBounds } = await fetchMapTiles(expandedBounds, zoom)

        // Canvasからテクスチャを作成
        const texture = new THREE.CanvasTexture(canvas)
        texture.encoding = THREE.sRGBEncoding
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter

        setMapTexture(texture)
        setMapBounds(actualBounds)
      } catch (error) {
        console.error('地図の読み込みエラー:', error)
      }
    }

    loadMap()
  }, [points, origin])

  // 地図の3D空間での位置とサイズを計算
  const planeGeometry = useMemo(() => {
    if (!mapBounds || !origin) return null

    // 地図の中心座標
    const centerLat = (mapBounds.minLat + mapBounds.maxLat) / 2
    const centerLng = (mapBounds.minLng + mapBounds.maxLng) / 2

    // 地図のサイズ（メートル）
    const EARTH_RADIUS = 6378137
    const latRad = (centerLat * Math.PI) / 180

    const width = ((mapBounds.maxLng - mapBounds.minLng) * Math.PI / 180) * EARTH_RADIUS * Math.cos(latRad)
    const height = ((mapBounds.maxLat - mapBounds.minLat) * Math.PI / 180) * EARTH_RADIUS

    // 3D空間でのサイズ（originのスケールを適用）
    const planeWidth = width * origin.scale
    const planeHeight = height * origin.scale

    // 地図の中心のローカル座標
    const rotationRad = (origin.rotation * Math.PI) / 180

    const dx = ((centerLng - origin.lng) * Math.PI / 180) * EARTH_RADIUS * Math.cos((origin.lat * Math.PI) / 180)
    const dz = -((centerLat - origin.lat) * Math.PI / 180) * EARTH_RADIUS

    // 回転を適用
    const rotatedX = dx * Math.cos(rotationRad) - dz * Math.sin(rotationRad)
    const rotatedZ = dx * Math.sin(rotationRad) + dz * Math.cos(rotationRad)

    const centerX = origin.x + rotatedX * origin.scale
    const centerZ = origin.z + rotatedZ * origin.scale

    return {
      position: [centerX, 0.01, centerZ], // 地面より少し上
      size: [planeWidth, planeHeight],
      rotation: rotationRad
    }
  }, [mapBounds, origin])

  if (!visible || !mapTexture || !planeGeometry) {
    return null
  }

  return (
    <mesh
      position={planeGeometry.position}
      rotation={[-Math.PI / 2, 0, planeGeometry.rotation]} // 地面に水平に配置
      receiveShadow
    >
      <planeGeometry args={planeGeometry.size} />
      <meshStandardMaterial
        map={mapTexture}
        transparent
        opacity={0.8}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
})
