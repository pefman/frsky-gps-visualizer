import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import type { CameraPreset, TelemetryFrame } from '../types'

interface FlightSceneProps {
  cameraPreset: CameraPreset
  currentFrame: TelemetryFrame | null
  frames: TelemetryFrame[]
}

interface SceneRefs {
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  renderer: THREE.WebGLRenderer
  trail: THREE.Line
  aircraftYaw: THREE.Group
  aircraftPitch: THREE.Group
  aircraftRoll: THREE.Group
}

function createAircraftModel(): THREE.Group {
  const aircraft = new THREE.Group()

  const fuselage = new THREE.Mesh(
    new THREE.BoxGeometry(6, 0.8, 0.9),
    new THREE.MeshStandardMaterial({ color: '#f97316', metalness: 0.1, roughness: 0.6 }),
  )
  const wing = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.12, 6.8),
    new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.15, roughness: 0.5 }),
  )
  const tailWing = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.12, 2.2),
    new THREE.MeshStandardMaterial({ color: '#155e75', metalness: 0.1, roughness: 0.5 }),
  )
  tailWing.position.set(-2.5, 0.3, 0)

  const verticalTail = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 1.1, 0.9),
    new THREE.MeshStandardMaterial({ color: '#155e75', metalness: 0.1, roughness: 0.5 }),
  )
  verticalTail.position.set(-2.6, 0.7, 0)

  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 20, 20),
    new THREE.MeshStandardMaterial({ color: '#38bdf8', transparent: true, opacity: 0.8 }),
  )
  canopy.scale.set(1.8, 0.8, 1)
  canopy.position.set(0.4, 0.55, 0)

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.45, 1.6, 18),
    new THREE.MeshStandardMaterial({ color: '#f97316', metalness: 0.1, roughness: 0.6 }),
  )
  nose.rotation.z = -Math.PI / 2
  nose.position.set(3.7, 0, 0)

  aircraft.add(fuselage, wing, tailWing, verticalTail, canopy, nose)
  return aircraft
}

function setCamera(camera: THREE.PerspectiveCamera, target: THREE.Vector3, preset: CameraPreset, frame: TelemetryFrame | null) {
  const heading = frame?.headingRad ?? Math.PI / 6
  const forward = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading))
  const right = new THREE.Vector3(-forward.z, 0, forward.x)

  if (preset === 'cockpit') {
    camera.position.copy(target).add(forward.clone().multiplyScalar(2.5)).add(new THREE.Vector3(0, 1.9, 0))
    camera.lookAt(target.clone().add(forward.multiplyScalar(32)).add(new THREE.Vector3(0, 4, 0)))
    return
  }

  if (preset === 'top') {
    camera.position.set(target.x, target.y + 76, target.z + 0.01)
    camera.lookAt(target)
    return
  }

  if (preset === 'orbit') {
    const orbitAngle = ((frame?.elapsedMs ?? 0) / 2200) % (Math.PI * 2)
    camera.position.copy(target)
    camera.position.add(new THREE.Vector3(Math.cos(orbitAngle) * 42, 20, Math.sin(orbitAngle) * 42))
    camera.lookAt(target)
    return
  }

  camera.position.copy(target)
  camera.position
    .add(forward.clone().multiplyScalar(-32))
    .add(right.multiplyScalar(8))
    .add(new THREE.Vector3(0, 12, 0))
  camera.lookAt(target)
}

export function FlightScene({ cameraPreset, currentFrame, frames }: FlightSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<SceneRefs | null>(null)

  useEffect(() => {
    const container = mountRef.current
    if (!container) {
      return undefined
    }

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#f7efe3')
    scene.fog = new THREE.Fog('#f7efe3', 80, 240)

    const camera = new THREE.PerspectiveCamera(48, container.clientWidth / container.clientHeight, 0.1, 1200)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.enabled = false

    const ambient = new THREE.HemisphereLight('#fff7ed', '#1e293b', 1.4)
    scene.add(ambient)

    const sun = new THREE.DirectionalLight('#ffffff', 2)
    sun.position.set(40, 50, 30)
    scene.add(sun)

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(140, 48),
      new THREE.MeshStandardMaterial({ color: '#efe2cd', roughness: 0.95, metalness: 0.02 }),
    )
    ground.rotation.x = -Math.PI / 2
    scene.add(ground)

    const grid = new THREE.GridHelper(180, 18, '#d97706', '#d6c2a8')
    grid.position.y = 0.02
    scene.add(grid)

    const originRing = new THREE.Mesh(
      new THREE.RingGeometry(6, 7.2, 48),
      new THREE.MeshBasicMaterial({ color: '#0369a1', side: THREE.DoubleSide }),
    )
    originRing.rotation.x = -Math.PI / 2
    originRing.position.y = 0.06
    scene.add(originRing)

    const aircraftYaw = new THREE.Group()
    const aircraftPitch = new THREE.Group()
    const aircraftRoll = new THREE.Group()
    aircraftYaw.add(aircraftPitch)
    aircraftPitch.add(aircraftRoll)
    aircraftRoll.add(createAircraftModel())
    scene.add(aircraftYaw)

    const trail = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 4, 0), new THREE.Vector3(0, 4, 0)]),
      new THREE.LineBasicMaterial({ color: '#0284c7' }),
    )
    scene.add(trail)

    const handleResize = () => {
      if (!mountRef.current) {
        return
      }

      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight)
    }

    window.addEventListener('resize', handleResize)

    sceneRef.current = {
      camera,
      controls,
      renderer,
      trail,
      aircraftYaw,
      aircraftPitch,
      aircraftRoll,
    }

    let animationFrameId = 0
    const renderLoop = () => {
      sceneRef.current?.controls.update()
      renderer.render(scene, camera)
      animationFrameId = requestAnimationFrame(renderLoop)
    }
    renderLoop()

    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animationFrameId)
      renderer.dispose()
      trail.geometry.dispose()
      ;(trail.material as THREE.Material).dispose()
      container.removeChild(renderer.domElement)
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    const refs = sceneRef.current
    if (!refs) {
      return
    }

    const step = Math.max(1, Math.ceil(frames.length / 900))
    const sampledPoints = frames
      .filter((_, index) => index % step === 0 || index === frames.length - 1)
      .map((frame) => new THREE.Vector3(frame.point.x, frame.point.y, frame.point.z))

    refs.trail.geometry.dispose()
    refs.trail.geometry = new THREE.BufferGeometry().setFromPoints(
      sampledPoints.length > 1 ? sampledPoints : [new THREE.Vector3(0, 4, 0), new THREE.Vector3(0, 4, 0)],
    )
  }, [frames])

  useEffect(() => {
    const refs = sceneRef.current
    if (!refs) {
      return
    }

    const fallbackFrame = {
      elapsedMs: 0,
      headingRad: 0,
      point: { x: 0, y: 4, z: 0 },
      pitchDeg: 0,
      rollDeg: 0,
    }
    const targetFrame = currentFrame ?? fallbackFrame

    refs.aircraftYaw.position.set(targetFrame.point.x, targetFrame.point.y, targetFrame.point.z)
    refs.aircraftYaw.rotation.y = -targetFrame.headingRad
    refs.aircraftPitch.rotation.z = THREE.MathUtils.degToRad(targetFrame.pitchDeg)
    refs.aircraftRoll.rotation.x = THREE.MathUtils.degToRad(-targetFrame.rollDeg)

    const lookTarget = new THREE.Vector3(targetFrame.point.x, targetFrame.point.y + 1.2, targetFrame.point.z)
    setCamera(refs.camera, lookTarget, cameraPreset, currentFrame)
  }, [cameraPreset, currentFrame])

  return <div className="scene-view" ref={mountRef} />
}