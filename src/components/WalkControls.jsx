import { useRef, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import * as THREE from 'three'

/**
 * ウォークスルーモード用のカメラコントロール
 * WASDキーで移動、マウスで視点変更
 */
export function WalkControls({ enabled = true }) {
  const { camera, gl } = useThree()
  const controlsRef = useRef()

  const moveState = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    speed: 0.1
  })

  const velocity = useRef(new THREE.Vector3())
  const direction = useRef(new THREE.Vector3())

  // キーボードイベントのハンドラー
  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          moveState.current.forward = true
          break
        case 'KeyS':
        case 'ArrowDown':
          moveState.current.backward = true
          break
        case 'KeyA':
        case 'ArrowLeft':
          moveState.current.left = true
          break
        case 'KeyD':
        case 'ArrowRight':
          moveState.current.right = true
          break
      }
    }

    const handleKeyUp = (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          moveState.current.forward = false
          break
        case 'KeyS':
        case 'ArrowDown':
          moveState.current.backward = false
          break
        case 'KeyA':
        case 'ArrowLeft':
          moveState.current.left = false
          break
        case 'KeyD':
        case 'ArrowRight':
          moveState.current.right = false
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
    }
  }, [enabled])

  // カメラを目線の高さに設定
  useEffect(() => {
    if (enabled) {
      camera.position.y = 1.6 // 目線の高さ
    }
  }, [enabled, camera])

  // 移動処理
  useFrame(() => {
    if (!enabled || !controlsRef.current) return

    const state = moveState.current

    // 移動方向をリセット
    direction.current.set(0, 0, 0)

    // 前後左右の移動
    if (state.forward) direction.current.z -= 1
    if (state.backward) direction.current.z += 1
    if (state.left) direction.current.x -= 1
    if (state.right) direction.current.x += 1

    // 移動方向を正規化
    if (direction.current.length() > 0) {
      direction.current.normalize()
    }

    // カメラの向きに合わせて移動方向を回転
    const euler = new THREE.Euler(0, 0, 0, 'YXZ')
    euler.setFromQuaternion(camera.quaternion)
    euler.x = 0 // 上下方向の回転は無視（水平移動のみ）

    const rotationQuaternion = new THREE.Quaternion()
    rotationQuaternion.setFromEuler(euler)

    direction.current.applyQuaternion(rotationQuaternion)

    // 速度を適用
    velocity.current.x = direction.current.x * state.speed
    velocity.current.z = direction.current.z * state.speed

    // カメラを移動
    camera.position.x += velocity.current.x
    camera.position.z += velocity.current.z

    // Y座標は固定（目線の高さを維持）
    camera.position.y = 1.6
  })

  if (!enabled) return null

  return (
    <PointerLockControls
      ref={controlsRef}
      args={[camera, gl.domElement]}
      makeDefault
    />
  )
}
