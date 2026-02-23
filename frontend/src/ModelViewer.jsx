import React, { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Html, ContactShadows, useGLTF, useAnimations } from '@react-three/drei'
import * as THREE from 'three'

const OPEN_EYE_COLOR = new THREE.Color('#6b4026')

function TeddyFitted({
  url = '/models/teddy.glb',
  isWaving = false,
  moveFeet = false,
  blinkEyes = false,
  moveLips = false,
  playNativeOnce = false,
  onAnimationFinished,
  scaleMultiplier = 1,
  viewportSize = { width: 1024, height: 768 }
}) {
  const { scene, animations } = useGLTF(url)
  const root = useRef()
  const { actions } = useAnimations(animations, root)
  const hasNativeAnimation = Array.isArray(animations) && animations.length > 0
  const finishedRef = useRef(false)
  const basePos = useRef(new THREE.Vector3(0, 1.1, 0))
  const armRefs = useRef({ left: null, right: null })
  const armBaseRot = useRef({ left: null, right: null })
  const legRefs = useRef({ left: null, right: null })
  const legBaseRot = useRef({ left: null, right: null })
  const footRefs = useRef({ left: null, right: null })
  const footBaseRot = useRef({ left: null, right: null })
  const eyeTargets = useRef([])
  const mouthRefs = useRef([])

  const viewportWidth = viewportSize?.width ?? 1024
  const viewportHeight = viewportSize?.height ?? 768

  useEffect(() => {
    if (!root.current) return
    const portrait = viewportHeight >= viewportWidth
    let fittedHeight
    let yOffset
    if (portrait) {
      const clampedWidth = THREE.MathUtils.clamp(viewportWidth, 320, 520)
      const widthFactor = (clampedWidth - 320) / 200
      fittedHeight = THREE.MathUtils.lerp(0.95, 1.4, widthFactor)
      yOffset = THREE.MathUtils.lerp(0.76, 0.92, widthFactor)
    } else {
      const clampedHeight = THREE.MathUtils.clamp(viewportHeight, 420, 820)
      const heightFactor = (clampedHeight - 420) / 400
      fittedHeight = THREE.MathUtils.lerp(1.2, 2.0, heightFactor)
      yOffset = THREE.MathUtils.lerp(0.84, 1.02, heightFactor)
    }
    fittedHeight *= scaleMultiplier
    const box = new THREE.Box3().setFromObject(root.current)
    const size = new THREE.Vector3(); const center = new THREE.Vector3()
    box.getSize(size); box.getCenter(center)
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const scale = fittedHeight / maxDim
    root.current.scale.setScalar(scale)
    root.current.position
      .sub(center.multiplyScalar(scale))
      .add(new THREE.Vector3(0, yOffset, 0))
    basePos.current.copy(root.current.position)
    mouthRefs.current = []
    eyeTargets.current = []
    root.current.traverse(obj => {
      if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = true }
      const name = (obj.name || '').toLowerCase()
      const matName = (obj.material?.name || '').toLowerCase()
      const matColor = obj.material?.color || null
      let isEyeLike = /(eye|eyelid|lid|pupil)/.test(name) || /(eye|eyelid|lid|pupil)/.test(matName)
      if (!isEyeLike && matColor) {
        const brightness = (matColor.r + matColor.g + matColor.b) / 3
        if (brightness < 0.18 || /mat_1/.test(matName)) {
          isEyeLike = true
        }
      }
      if (isEyeLike) {
        eyeTargets.current.push({
          node: obj,
          baseScale: obj.scale.clone(),
          baseColor: matColor ? matColor.clone() : null
        })
        return
      } else if (!footRefs.current.left && /left|l_/.test(name) && /(foot|ankle)/.test(name)) {
        footRefs.current.left = obj
        footBaseRot.current.left = obj.rotation.clone()
      } else if (!footRefs.current.right && /right|r_/.test(name) && /(foot|ankle)/.test(name)) {
        footRefs.current.right = obj
        footBaseRot.current.right = obj.rotation.clone()
      } else if (!armRefs.current.left && /left|l_/.test(name) && /(arm|hand)/.test(name)) {
        armRefs.current.left = obj
        armBaseRot.current.left = obj.rotation.clone()
      } else if (!armRefs.current.right && /right|r_/.test(name) && /(arm|hand)/.test(name)) {
        armRefs.current.right = obj
        armBaseRot.current.right = obj.rotation.clone()
      } else if (!legRefs.current.left && /left|l_/.test(name) && /(leg|thigh)/.test(name)) {
        legRefs.current.left = obj
        legBaseRot.current.left = obj.rotation.clone()
      } else if (!legRefs.current.right && /right|r_/.test(name) && /(leg|thigh)/.test(name)) {
        legRefs.current.right = obj
        legBaseRot.current.right = obj.rotation.clone()
      } else if (/(mouth|lip|jaw)/.test(name)) {
        mouthRefs.current.push({
          node: obj,
          basePos: obj.position.clone(),
          baseRot: obj.rotation.clone(),
          baseScale: obj.scale.clone(),
          isLower: /(lower|jaw|bottom)/.test(name)
        })
      }
    })
  }, [scaleMultiplier, viewportWidth, viewportHeight])

  useEffect(() => {
    if (!actions || !hasNativeAnimation) return
    finishedRef.current = false
    const cleanups = []
    Object.values(actions).forEach((action) => {
      if (!action) return
      action.reset().fadeIn(0.3).play()
      action.loop = playNativeOnce ? THREE.LoopOnce : THREE.LoopRepeat
      action.clampWhenFinished = !!playNativeOnce
      action.repetitions = playNativeOnce ? 1 : Infinity
      action.paused = !isWaving
      if (playNativeOnce && typeof onAnimationFinished === 'function') {
        const mixer = action.getMixer()
        const handleFinished = () => {
          if (finishedRef.current) return
          finishedRef.current = true
          onAnimationFinished()
        }
        mixer.addEventListener('finished', handleFinished)
        cleanups.push(() => mixer.removeEventListener('finished', handleFinished))
      }
      cleanups.push(() => action.stop())
    })
    return () => {
      cleanups.forEach((fn) => fn && fn())
    }
  }, [actions, hasNativeAnimation, playNativeOnce, onAnimationFinished])

  useEffect(() => {
    if (!actions || !hasNativeAnimation) return
    Object.values(actions).forEach((action) => {
      if (!action) return
      action.paused = !isWaving
    })
  }, [actions, hasNativeAnimation, isWaving])

  useFrame((state) => {
    if (!root.current) return
    if (hasNativeAnimation) return
    const t = state.clock.getElapsedTime()
    const sway = Math.sin(t * 0.6) * 0.35
    const bob = Math.sin(t * 1.2) * 0.12
    const feetFactor = moveFeet ? 1 : 0
    root.current.rotation.y = sway * 0.5
    root.current.rotation.x = Math.sin(t * 0.3) * 0.05
    root.current.position.set(
      basePos.current.x + Math.sin(t * 0.4) * 0.05,
      basePos.current.y + bob + Math.abs(Math.sin(t * 2.0)) * 0.04 * feetFactor,
      basePos.current.z
    )
    const waveFactor = isWaving ? 1 : 0
    const wave = Math.sin(t * 1.6) * 0.6 * waveFactor
    const lift = Math.sin(t * 2.0) * 0.3 * waveFactor
    const left = armRefs.current.left
    const right = armRefs.current.right
    if (left && armBaseRot.current.left) {
      left.rotation.x = armBaseRot.current.left.x + lift * 0.5
      left.rotation.z = armBaseRot.current.left.z + wave
    }
    if (right && armBaseRot.current.right) {
      right.rotation.x = armBaseRot.current.right.x - lift * 0.5
      right.rotation.z = armBaseRot.current.right.z - wave
    }
    const stride = Math.sin(t * 3.0) * 0.9 * feetFactor
    const toeLift = Math.sin(t * 3.0 + Math.PI / 2) * 0.4 * feetFactor
    const leftLeg = legRefs.current.left
    const rightLeg = legRefs.current.right
    if (leftLeg && legBaseRot.current.left) {
      leftLeg.rotation.x = legBaseRot.current.left.x + stride
    }
    if (rightLeg && legBaseRot.current.right) {
      rightLeg.rotation.x = legBaseRot.current.right.x - stride
    }
    const leftFoot = footRefs.current.left
    const rightFoot = footRefs.current.right
    if (leftFoot && footBaseRot.current.left) {
      leftFoot.rotation.x = footBaseRot.current.left.x + toeLift
      leftFoot.rotation.z = footBaseRot.current.left.z + Math.sin(t * 2.2) * 0.2 * feetFactor
    }
    if (rightFoot && footBaseRot.current.right) {
      rightFoot.rotation.x = footBaseRot.current.right.x - toeLift
      rightFoot.rotation.z = footBaseRot.current.right.z - Math.sin(t * 2.2) * 0.2 * feetFactor
    }
    const mouthPhase = moveLips ? (Math.sin(t * 2.4) + 1) / 2 : 0
    const mouthOpen = THREE.MathUtils.lerp(0, 1, mouthPhase)
    mouthRefs.current.forEach((entry) => {
      const { node, basePos, baseRot, baseScale, isLower } = entry
      if (!node || !basePos || !baseRot || !baseScale) return
      const dir = isLower ? 1 : -0.6
      const offset = mouthOpen * 0.18 * dir
      node.position.set(
        basePos.x,
        basePos.y - offset * 0.1,
        basePos.z
      )
      node.rotation.set(
        baseRot.x + offset * 0.4,
        baseRot.y,
        baseRot.z
      )
      node.scale.set(
        baseScale.x * (1 + mouthOpen * 0.05),
        baseScale.y * (1 - mouthOpen * 0.4),
        baseScale.z * (1 + mouthOpen * 0.05)
      )
    })
    const blinkFactor = blinkEyes ? (Math.sin(t * 2.8) + 1) / 2 : 0
    const eyeScale = THREE.MathUtils.lerp(1, 0.15, blinkFactor ** 4)
    const blinkColorFactor = blinkEyes ? Math.min(1, blinkFactor * 1.4) : 0
    eyeTargets.current.forEach(({ node, baseScale, baseColor }) => {
      if (!node || !baseScale) return
      node.scale.set(
        baseScale.x,
        baseScale.y * eyeScale,
        baseScale.z
      )
      if (node.material?.color) {
        node.material.color.copy(OPEN_EYE_COLOR)
        if (baseColor) {
          node.material.color.lerp(baseColor, blinkColorFactor)
        }
      }
    })
  })

  return <group ref={root} dispose={null}><primitive object={scene} /></group>
}

function FallbackModel() {
  return (<mesh scale={[1.2,1.2,1.2]} position={[0,1.1,0]}>
    <capsuleGeometry args={[0.6,1.2,16,32]} />
    <meshStandardMaterial color='#dde6ff' metalness={0.05} roughness={0.6} />
  </mesh>)
}

export default function ModelViewer({
  bgClass,
  modelUrl = '/models/teddy.glb',
  isWaving = false,
  moveFeet = false,
  blinkEyes = false,
  moveLips = false,
  playNativeOnce = false,
  onAnimationFinished,
  scaleMultiplier = 1,
  viewport = { width: 1024, height: 768 }
}) {
  const [hasModel, setHasModel] = useState(true)
  const wrapRef = useRef(null)
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof document === 'undefined') return true
    return document.visibilityState === 'visible'
  })
  const [canvasSize, setCanvasSize] = useState({
    width: viewport?.width ?? 1024,
    height: viewport?.height ?? 768
  })
  const stableCanvasSizeRef = useRef({
    width: viewport?.width ?? 1024,
    height: viewport?.height ?? 768
  })
  useGLTF.preload(modelUrl)

  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      const next = { width, height }
      const keyboardOpen = typeof document !== 'undefined' && document.body.classList.contains('keyboard-open')
      const isTouchDevice = typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(hover:none) and (pointer:coarse)').matches

      // On mobile Safari, keyboard-open shrinks layout height and causes a visual "zoom" jump.
      // While keyboard is open, keep the last stable canvas height.
      if (isTouchDevice && keyboardOpen && next.height < stableCanvasSizeRef.current.height) {
        setCanvasSize({
          width: next.width,
          height: stableCanvasSizeRef.current.height
        })
        return
      }

      stableCanvasSizeRef.current = next
      setCanvasSize(next)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let alive = true
    fetch(modelUrl, { method: 'HEAD' })
      .then(r => alive && setHasModel(r.ok))
      .catch(() => alive && setHasModel(false))
    return () => { alive = false }
  }, [modelUrl])
  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVis = () => setIsVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  return (
    <div className='canvasWrap' ref={wrapRef}>
      <Canvas
        className={`modelCanvas ${bgClass || ''}`}
        shadows
        camera={{ position: [0, 3, 10], fov: 60, near: 0.1, far: 100 }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace
        }}
        frameloop={isVisible ? 'always' : 'never'}
      >
        <ambientLight intensity={0.6} />
        <directionalLight
          castShadow
          intensity={1.1}
          position={[5, 6, 3]}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <Suspense fallback={<Html center>Modell wird geladen…</Html>}>
          {hasModel ? (
            <TeddyFitted
              key={modelUrl}
              url={modelUrl}
              isWaving={isWaving}
              moveFeet={moveFeet}
              blinkEyes={blinkEyes}
              moveLips={moveLips}
              playNativeOnce={playNativeOnce}
              onAnimationFinished={onAnimationFinished}
              scaleMultiplier={scaleMultiplier}
              viewportSize={canvasSize}
            />
          ) : (
            <FallbackModel />
          )}
        </Suspense>
        <ContactShadows position={[0, 0, 0]} opacity={0.35} scale={10} blur={2.5} far={4} />
        <OrbitControls enableDamping={false} autoRotate={false} minDistance={3} maxDistance={14} target={[0, 1.1, 0]} />
      </Canvas>
    </div>
  )
}
