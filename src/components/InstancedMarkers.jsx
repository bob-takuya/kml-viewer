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
export function InstancedMarkers({ positions, color = '#ff6b6b', height = 2, selectedIndex = -1 }) {
  const circleRef = useRef()
  const cylinderRef = useRef()
  const sphereRef = useRef()
  const dummy = useMemo(() => new Object3D(), [])
  const colorObj = useMemo(() => new Color(color), [color])
  const selectedColorObj = useMemo(() => new Color('#ffff00'), []) // 黄色

  useEffect(() => {
    if (!positions || positions.length === 0) return

    // 底部の円盤
    for (let i = 0; i < positions.length; i++) {
      dummy.position.set(positions[i][0], 0.05, positions[i][2])
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      dummy.updateMatrix()
      circleRef.current.setMatrixAt(i, dummy.matrix)
      circleRef.current.setColorAt(i, i === selectedIndex ? selectedColorObj : colorObj)
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
      cylinderRef.current.setColorAt(i, i === selectedIndex ? selectedColorObj : colorObj)
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
      sphereRef.current.setColorAt(i, i === selectedIndex ? selectedColorObj : colorObj)
    }
    sphereRef.current.instanceMatrix.needsUpdate = true
    if (sphereRef.current.instanceColor) {
      sphereRef.current.instanceColor.needsUpdate = true
    }
  }, [positions, height, colorObj, selectedColorObj, selectedIndex, dummy])

  if (!positions || positions.length === 0) return null

  return (
    <group>
      {/* 底部の円盤 */}
      <instancedMesh
        ref={circleRef}
        args={[circleGeometry, null, positions.length]}
      >
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.5}
        />
      </instancedMesh>

      {/* 柱 */}
      <instancedMesh
        ref={cylinderRef}
        args={[cylinderGeometry, null, positions.length]}
      >
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.4}
        />
      </instancedMesh>

      {/* 頂部の球体 */}
      <instancedMesh
        ref={sphereRef}
        args={[sphereGeometry, null, positions.length]}
      >
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.8}
        />
      </instancedMesh>

      {/* ポイントライト（個別に配置） - 控えめに */}
      {positions.map((pos, i) => (
        <pointLight
          key={i}
          position={[pos[0], height, pos[2]]}
          color={color}
          intensity={0.8}
          distance={3}
        />
      ))}
    </group>
  )
}
