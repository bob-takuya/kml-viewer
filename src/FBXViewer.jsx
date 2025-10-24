import { useRef, Suspense, useState, useEffect, useCallback } from 'react'
import { Canvas, useLoader, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Environment, Grid } from '@react-three/drei'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'
import * as THREE from 'three'
import { BirdEyeView } from './components/BirdEyeView'
import { WalkthroughView } from './components/WalkthroughView'
import { WalkControls } from './components/WalkControls'
import { UIControls } from './components/UIControls'
import { MapGround } from './components/MapGround'
import { createDefaultOrigin, autoConfigureOrigin } from './utils/coordinateTransform'
import { perfLogger } from './utils/perfLogger'

function Model({ url }) {
  const fbx = useLoader(FBXLoader, url)
  const meshRef = useRef()
  const { gl } = useThree()

  // モデルのサイズを計算してスケールを調整
  if (fbx) {
    const box = new THREE.Box3().setFromObject(fbx)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())

    // モデルを中心に配置
    fbx.position.x = -center.x
    fbx.position.y = -center.y
    fbx.position.z = -center.z

    // スケールを調整（最大の辺を基準に）
    const maxSize = Math.max(size.x, size.y, size.z)
    const scale = 5 / maxSize
    fbx.scale.set(scale, scale, scale)

    // マテリアルを修正してテクスチャを適切に表示
    fbx.traverse((child) => {
      if (child.isMesh) {
        // マテリアルが配列の場合も対応
        const materials = Array.isArray(child.material) ? child.material : [child.material]

        materials.forEach((material) => {
          if (material) {
            // テクスチャの設定を最適化
            const textures = [
              material.map,
              material.normalMap,
              material.roughnessMap,
              material.metalnessMap,
              material.aoMap,
              material.emissiveMap
            ].filter(Boolean)

            textures.forEach((texture) => {
              // sRGBエンコーディングを設定（カラーテクスチャのみ）
              if (texture === material.map || texture === material.emissiveMap) {
                texture.encoding = THREE.sRGBEncoding
              }

              // 異方性フィルタリングを最大値に設定（遠くからも鮮明に）
              texture.anisotropy = gl.capabilities.getMaxAnisotropy()

              // テクスチャフィルタリングの設定
              texture.minFilter = THREE.LinearMipMapLinearFilter
              texture.magFilter = THREE.LinearFilter

              // テクスチャを更新
              texture.needsUpdate = true
            })

            // 基本的なマテリアルプロパティを設定
            material.side = THREE.DoubleSide // 両面表示
            material.flatShading = false
            material.needsUpdate = true

            // 色が真っ黒の場合はデフォルト色を設定
            if (!material.color || (material.color.r === 0 && material.color.g === 0 && material.color.b === 0)) {
              material.color = new THREE.Color(0xcccccc)
            }
          }
        })

        // 影の設定
        child.castShadow = true
        child.receiveShadow = true
      }
    })
  }

  return <primitive ref={meshRef} object={fbx} />
}

// カメラアニメーション用コンポーネント
function CameraAnimator({ targetPoint, origin }) {
  const { camera, controls, gl } = useThree()
  const targetPos = useRef(null)
  const targetLookAt = useRef(null)
  const animating = useRef(false)
  const userInterrupted = useRef(false)

  useEffect(() => {
    if (targetPoint && origin) {
      perfLogger.start('カメラターゲット位置計算')

      // ターゲットポイントの位置（少し上）
      const pointPos = new THREE.Vector3(
        targetPoint.markerPos[0],
        targetPoint.markerPos[1] + 2,
        targetPoint.markerPos[2]
      )

      // 現在のカメラからターゲットへの方向ベクトルを計算
      const currentDirection = new THREE.Vector3()
      currentDirection.subVectors(pointPos, camera.position).normalize()

      // 現在の角度を維持しながら、ターゲットから一定距離離れた位置を計算
      const desiredDistance = 8 // ターゲットから8単位の距離
      targetPos.current = pointPos.clone().sub(currentDirection.multiplyScalar(desiredDistance))

      // カメラの注視点はターゲットポイント
      targetLookAt.current = pointPos.clone()

      animating.current = true
      userInterrupted.current = false

      // ユーザー入力イベントリスナーを追加
      const handleUserInput = () => {
        if (animating.current) {
          userInterrupted.current = true
        }
      }

      const canvas = gl.domElement
      canvas.addEventListener('mousedown', handleUserInput)
      canvas.addEventListener('wheel', handleUserInput)
      canvas.addEventListener('touchstart', handleUserInput)

      perfLogger.end('カメラターゲット位置計算')

      // クリーンアップ
      return () => {
        canvas.removeEventListener('mousedown', handleUserInput)
        canvas.removeEventListener('wheel', handleUserInput)
        canvas.removeEventListener('touchstart', handleUserInput)
      }
    }
  }, [targetPoint, origin, gl, camera])

  useFrame(() => {
    if (animating.current && targetPos.current && targetLookAt.current && controls) {
      // ユーザー入力による中断をチェック
      if (userInterrupted.current) {
        animating.current = false
        return
      }

      // カメラ位置を滑らかに移動（速めのイージング）
      camera.position.lerp(targetPos.current, 0.15)

      // OrbitControlsのターゲットを更新
      controls.target.lerp(targetLookAt.current, 0.15)
      controls.update()

      // 目標に十分近づいたらアニメーション終了（早めに切り上げ）
      const distanceToTarget = camera.position.distanceTo(targetPos.current)
      const distanceToLookAt = controls.target.distanceTo(targetLookAt.current)

      if (distanceToTarget < 0.5 && distanceToLookAt < 0.5) {
        animating.current = false
      }
    }
  })

  return null
}

export default function FBXViewer() {
  const [mode, setMode] = useState('bird') // 'bird' or 'walk'

  // テスト用のダミーデータ（デフォルトで表示）
  const dummyPoints = [
    {
      id: 'test-1',
      name: 'テストポイント1',
      description: 'これはテスト用のポイントです。3Dモデルの中心付近に配置されています。',
      lat: 35.7148,
      lng: 139.7967,
      imageUrl: null,
      color: '#0288d1' // Google My Mapsのデフォルト色
    },
    {
      id: 'test-2',
      name: 'テストポイント2',
      description: '2つ目のテストポイント。北側に配置されています。',
      lat: 35.7158,
      lng: 139.7967,
      imageUrl: null,
      color: '#0288d1'
    },
    {
      id: 'test-3',
      name: 'テストポイント3',
      description: '3つ目のテストポイント。東側に配置されています。',
      lat: 35.7148,
      lng: 139.7977,
      imageUrl: null,
      color: '#0288d1'
    },
    {
      id: 'test-4',
      name: 'テストポイント4',
      description: '4つ目のテストポイント。南西に配置されています。',
      lat: 35.7138,
      lng: 139.7957,
      imageUrl: null,
      color: '#0288d1'
    }
  ]

  const [points, setPoints] = useState(dummyPoints)
  const [origin, setOrigin] = useState({
    lat: 35.7148,
    lng: 139.7967,
    x: 0,
    z: 0,
    scale: 0.1, // スケール調整: 1メートル = 0.1単位
    rotation: 0
  })

  const handlePointsLoaded = (loadedPoints) => {
    setPoints(loadedPoints)
    // 自動的に基準点を設定
    const autoOrigin = autoConfigureOrigin(loadedPoints)
    setOrigin(autoOrigin)
  }

  const [selectedPoint, setSelectedPoint] = useState(null)

  const handlePointClick = useCallback((point) => {
    perfLogger.start('handlePointClick: State更新')
    setSelectedPoint(point)
    perfLogger.end('handlePointClick: State更新')
  }, [])

  const handleBackgroundClick = useCallback(() => {
    if (selectedPoint) {
      setSelectedPoint(null)
    }
  }, [selectedPoint])

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1a1a1a' }}>
      <Canvas
        dpr={[1, 2]}
        performance={{ min: 0.5 }}
        gl={{
          outputEncoding: THREE.sRGBEncoding,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
          antialias: false,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true
        }}
        frameloop="always"
      >
        {/* カメラ設定 */}
        {mode === 'bird' ? (
          <PerspectiveCamera makeDefault position={[15, 25, 15]} fov={60} near={0.01} far={10000} />
        ) : (
          <PerspectiveCamera makeDefault position={[0, 1.6, 5]} fov={75} near={0.01} far={10000} />
        )}

        {/* ライト - より明るく */}
        <ambientLight intensity={1.2} />
        <directionalLight position={[10, 10, 5]} intensity={1.5} castShadow />
        <directionalLight position={[-10, 10, -5]} intensity={1} />
        <directionalLight position={[0, 20, 0]} intensity={0.8} />
        <hemisphereLight intensity={0.6} groundColor="#444444" />
        <pointLight position={[0, 10, 0]} intensity={0.5} distance={50} />

        {/* 3Dモデル - 一時的に非表示 */}
        {/* <Suspense fallback={null}>
          <Model url="/Ikenohata.fbx" />
        </Suspense> */}

        {/* 背景クリック用の透明平面 */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.01, 0]}
          onClick={handleBackgroundClick}
        >
          <planeGeometry args={[1000, 1000]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>

        {/* グリッド */}
        <Grid
          args={[20, 20]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#6f6f6f"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#9d4b4b"
          fadeDistance={30}
          fadeStrength={1}
          followCamera={false}
          infiniteGrid={true}
        />

        {/* 地図を地面に表示 */}
        {points && points.length > 0 && (
          <MapGround points={points} origin={origin} visible={true} />
        )}

        {/* 環境光 */}
        <Environment preset="city" />

        {/* 表示モードに応じたコンポーネント */}
        {points && points.length > 0 && (
          <>
            {mode === 'bird' ? (
              <>
                <BirdEyeView
                  points={points}
                  origin={origin}
                  onPointClick={handlePointClick}
                  selectedPointId={selectedPoint?.id}
                />
                {/* カメラアニメーター */}
                <CameraAnimator targetPoint={selectedPoint} origin={origin} />
              </>
            ) : (
              <WalkthroughView
                points={points}
                origin={origin}
                onPointClick={handlePointClick}
              />
            )}
          </>
        )}

        {/* カメラコントロール */}
        {mode === 'bird' ? (
          <OrbitControls
            enableDamping={false}
            minDistance={1}
            maxDistance={100}
            makeDefault
          />
        ) : (
          <WalkControls enabled={true} />
        )}
      </Canvas>

      {/* UIコントロール */}
      <UIControls
        mode={mode}
        onModeChange={setMode}
        onPointsLoaded={handlePointsLoaded}
        origin={origin}
        onOriginChange={setOrigin}
        points={points}
      />
    </div>
  )
}
