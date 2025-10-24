import { memo, useState, useEffect } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { getCachedImage, fetchAndCacheImage } from '../utils/imageCache'
import { perfLogger } from '../utils/perfLogger'
import './InfoCard.css'

// 共有ジオメトリ（パフォーマンス最適化のため1度だけ作成）
const sharedGeometries = {
  circle: new THREE.CircleGeometry(0.3, 16),
  sphere: new THREE.SphereGeometry(0.3, 16, 16),
  cylinder_2: new THREE.CylinderGeometry(0.15, 0.15, 2, 16),
  cylinder_1_5: new THREE.CylinderGeometry(0.15, 0.15, 1.5, 16)
}

/**
 * 情報カードコンポーネント
 * 3D空間上に配置されるHTML要素
 */
export const InfoCard = memo(function InfoCard({ point, onClick, mode = 'bird', distanceFromCamera, isSelected = false }) {
  const [cachedImageUrl, setCachedImageUrl] = useState(null)
  const [imageError, setImageError] = useState(false)

  // 画像をキャッシュから読み込む（キュー管理で自動的に制限）
  useEffect(() => {
    if (!point.imageUrl) return

    let mounted = true

    async function loadImage() {
      try {
        // まずキャッシュを確認
        const cached = await getCachedImage(point.imageUrl)
        if (mounted && cached) {
          setCachedImageUrl(cached)
          return
        }

        // キャッシュになければフェッチしてキャッシュ（キューイングで自動制御）
        const dataUrl = await fetchAndCacheImage(point.imageUrl)
        if (mounted && dataUrl) {
          setCachedImageUrl(dataUrl)
        } else if (mounted) {
          setImageError(true)
        }
      } catch (error) {
        console.warn('[InfoCard] Image load error:', point.imageUrl, error)
        if (mounted) setImageError(true)
      }
    }

    loadImage()

    return () => {
      mounted = false
    }
  }, [point.imageUrl])

  const handleClick = (e) => {
    perfLogger.start(`カードクリック: ${point.name}`)
    e.stopPropagation()
    if (onClick) {
      onClick(point)
    }
    perfLogger.end(`カードクリック: ${point.name}`)
  }

  // 選択状態に応じて不透明度とz-indexを調整
  const opacity = isSelected ? 1 : 0.5
  const zIndex = isSelected ? 1000 : 0

  return (
    <Html
      position={[0, 0, 0]}
      center
      distanceFactor={2.5}
      zIndexRange={[zIndex, zIndex]}
      transform
      sprite
      style={{
        opacity,
        pointerEvents: 'auto',
        willChange: 'opacity, transform'
      }}
    >
      <div className={`info-card ${mode}`} onClick={handleClick}>
        <h3 className="info-card-title">{point.name}</h3>
        {point.description && (
          <p className="info-card-description">{point.description}</p>
        )}
        {point.imageUrl && !imageError && cachedImageUrl && (
          <img
            src={cachedImageUrl}
            alt={point.name}
            className="info-card-image"
            onError={() => setImageError(true)}
          />
        )}
      </div>
    </Html>
  )
}, (prevProps, nextProps) => {
  // isSelectedとpoint.idが変わった場合のみ再レンダリング
  return prevProps.isSelected === nextProps.isSelected &&
         prevProps.point.id === nextProps.point.id &&
         prevProps.mode === nextProps.mode &&
         prevProps.onClick === nextProps.onClick
})

/**
 * マーカー（球体または円柱）コンポーネント
 */
export const Marker = memo(function Marker({ color = '#ff6b6b', height = 2 }) {
  // 共有ジオメトリを選択（パフォーマンス最適化）
  const cylinderGeometry = height === 1.5 ? sharedGeometries.cylinder_1_5 : sharedGeometries.cylinder_2

  return (
    <group>
      {/* 底部の円盤 */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={sharedGeometries.circle}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>

      {/* 柱 */}
      <mesh position={[0, height / 2, 0]} geometry={cylinderGeometry}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>

      {/* 頂部の球体 */}
      <mesh position={[0, height, 0]} geometry={sharedGeometries.sphere}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
      </mesh>

      {/* 光るエフェクト */}
      <pointLight position={[0, height, 0]} color={color} intensity={2} distance={5} />
    </group>
  )
})

/**
 * マーカーと情報カードを結ぶ線
 */
export const ConnectionLine = memo(function ConnectionLine({ start, end, color = '#ffffff' }) {
  return (
    <line>
      <bufferGeometry attach="geometry">
        <bufferAttribute
          attach="attributes-position"
          count={2}
          array={new Float32Array([...start, ...end])}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial attach="material" color={color} opacity={0.5} transparent />
    </line>
  )
})
