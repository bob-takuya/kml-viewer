import { useRef, useMemo, useEffect } from 'react'
import { InstancedMesh, Object3D, Color } from 'three'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

// 共有ジオメトリ（より細く小さく）
const circleGeometry = new THREE.CircleGeometry(0.15, 12)
const cylinderGeometry = new THREE.CylinderGeometry(0.08, 0.08, 1, 12) // 高さは後で調整
const sphereGeometry = new THREE.SphereGeometry(0.15, 12, 12)

/**
 * インスタンシングを使った高性能マーカー
 */
export function InstancedMarkers({ positions, colors, height = 2, selectedIndex = -1 }) {
  const circleRef = useRef()
  const cylinderRef = useRef()
  const sphereRef = useRef()
  const dummy = useMemo(() => new Object3D(), [])
  const selectedColorObj = useMemo(() => new Color('#ffff00'), []) // 黄色

  // colorsが配列の場合は各マーカーごとの色、文字列の場合は全マーカー同じ色
  const colorArray = useMemo(() => {
    if (!colors) return null
    if (Array.isArray(colors)) {
      return colors.map(c => new Color(c))
    }
    return new Color(colors)
  }, [colors])

  useEffect(() => {
    if (!positions || positions.length === 0) return

    // 底部の円盤
    for (let i = 0; i < positions.length; i++) {
      dummy.position.set(positions[i][0], 0.05, positions[i][2])
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      dummy.updateMatrix()
      circleRef.current.setMatrixAt(i, dummy.matrix)

      // 色を設定（選択中は黄色、それ以外は個別色）
      const instanceColor = i === selectedIndex
        ? selectedColorObj
        : (Array.isArray(colorArray) ? colorArray[i] : colorArray)
      circleRef.current.setColorAt(i, instanceColor)
    }
    circleRef.current.instanceMatrix.needsUpdate = true
    if (circleRef.current.instanceColor) {
      circleRef.current.instanceColor.needsUpdate = true
    }

    // 柱
    for (let i = 0; i < positions.length; i++) {
      dummy.position.set(positions[i][0], height / 2, positions[i][2])
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, height, 1) // 高さをスケーリング
      dummy.updateMatrix()
      cylinderRef.current.setMatrixAt(i, dummy.matrix)

      const instanceColor = i === selectedIndex
        ? selectedColorObj
        : (Array.isArray(colorArray) ? colorArray[i] : colorArray)
      cylinderRef.current.setColorAt(i, instanceColor)
    }
    cylinderRef.current.instanceMatrix.needsUpdate = true
    if (cylinderRef.current.instanceColor) {
      cylinderRef.current.instanceColor.needsUpdate = true
    }

    // 頂部の球体
    for (let i = 0; i < positions.length; i++) {
      dummy.position.set(positions[i][0], height, positions[i][2])
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      sphereRef.current.setMatrixAt(i, dummy.matrix)

      const instanceColor = i === selectedIndex
        ? selectedColorObj
        : (Array.isArray(colorArray) ? colorArray[i] : colorArray)
      sphereRef.current.setColorAt(i, instanceColor)
    }
    sphereRef.current.instanceMatrix.needsUpdate = true
    if (sphereRef.current.instanceColor) {
      sphereRef.current.instanceColor.needsUpdate = true
    }
  }, [positions, height, colorArray, selectedColorObj, selectedIndex, dummy])

  if (!positions || positions.length === 0) return null

  return (
    <group>
      {/* 底部の円盤 */}
      <instancedMesh
        ref={circleRef}
        args={[circleGeometry, null, positions.length]}
      >
        <meshStandardMaterial
          color="#ffffff" // 白を基準色として設定（頂点色と乗算される）
          emissive="#ffffff" // 自己発光を白に設定
          emissiveIntensity={0.3} // 発光強度を抑える
          vertexColors // 個別の色を有効化
        />
      </instancedMesh>

      {/* 柱 */}
      <instancedMesh
        ref={cylinderRef}
        args={[cylinderGeometry, null, positions.length]}
      >
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={0.2}
          vertexColors
        />
      </instancedMesh>

      {/* 頂部の球体 */}
      <instancedMesh
        ref={sphereRef}
        args={[sphereGeometry, null, positions.length]}
      >
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={0.5}
          vertexColors
        />
      </instancedMesh>

      {/* ポイントライト（個別に配置） - 控えめに */}
      {positions.map((pos, i) => {
        const lightColor = Array.isArray(colorArray) ? colorArray[i] : colorArray
        return (
          <pointLight
            key={i}
            position={[pos[0], height, pos[2]]}
            color={lightColor || '#0288d1'} // デフォルト: RGB(2, 136, 209)
            intensity={0.8}
            distance={3}
          />
        )
      })}
    </group>
  )
}
