import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import type { TelemetryFrame } from '../types'

interface FlightSceneProps {
  currentFrame: TelemetryFrame | null
  frames: TelemetryFrame[]
  showTrail: boolean
  motionSmoothing: number
}

interface SceneRefs {
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  trail: THREE.Line
  aircraftYaw: THREE.Group
  aircraftPitch: THREE.Group
  aircraftRoll: THREE.Group
}

const PILOT_CAMERA_DISTANCE = 5
const PILOT_CAMERA_HEIGHT = 1.8
const PILOT_LOOK_LIFT = 1.6
const AIRCRAFT_MARKER_RADIUS = 1.2
const TRIM_SPEED_THRESHOLD_KMH = 8
const TRIM_ALTITUDE_WINDOW_M = 1.2
const HIGH_CLOUD_LAYER_COUNT = 18

function createCloudField(): { group: THREE.Group; dispose: () => void } {
  const group = new THREE.Group()
  const cloudSheetGeometry = new THREE.CircleGeometry(1, 32)
  const cloudSheetMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.28,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  })

  for (let i = 0; i < HIGH_CLOUD_LAYER_COUNT; i += 1) {
    const cloudSheet = new THREE.Mesh(cloudSheetGeometry, cloudSheetMaterial)
    const angle = i * 0.73
    const radius = 520 + i * 36
    const cloudY = 180 + (i % 5) * 16
    const scale = 180 + (i % 6) * 38

    cloudSheet.position.set(Math.cos(angle) * radius, cloudY, Math.sin(angle) * radius)
    cloudSheet.rotation.x = -Math.PI / 2
    cloudSheet.rotation.z = angle * 0.35
    cloudSheet.scale.set(scale * 1.6, scale, 1)
    group.add(cloudSheet)
  }

  return {
    group,
    dispose: () => {
      cloudSheetGeometry.dispose()
      cloudSheetMaterial.dispose()
    },
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount
}

function lerpAngle(start: number, end: number, amount: number): number {
  const delta = ((end - start + Math.PI) % (Math.PI * 2)) - Math.PI
  return start + delta * amount
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
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(AIRCRAFT_MARKER_RADIUS, 18, 18),
    new THREE.MeshStandardMaterial({ color: '#fde047', emissive: '#f59e0b', emissiveIntensity: 0.55 }),
  )
  marker.position.set(0, 0.45, 0)
  aircraft.add(marker)
  return aircraft
}

function getAircraftWorldPoint(frame: { point: { x: number; y: number; z: number } }): THREE.Vector3 {
  return new THREE.Vector3(frame.point.x, frame.point.y, frame.point.z)
}

function getGroundWorldPoint(frame: { point: { x: number; y: number; z: number } }): THREE.Vector3 {
  return new THREE.Vector3(frame.point.x, 0, frame.point.z)
}

function getPilotCameraPosition(startPoint: THREE.Vector3, headingRad: number): THREE.Vector3 {
  const backVector = new THREE.Vector3(-Math.cos(headingRad), 0, -Math.sin(headingRad)).multiplyScalar(PILOT_CAMERA_DISTANCE)

  return startPoint.clone()
    .add(backVector)
    .add(new THREE.Vector3(0, PILOT_CAMERA_HEIGHT, 0))
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) * 0.5
  }

  return sorted[middle]
}

function computeAttitudeTrim(frames: TelemetryFrame[]): { rollDeg: number; pitchDeg: number } {
  if (frames.length === 0) {
    return { rollDeg: 0, pitchDeg: 0 }
  }

  const minAltitude = frames.reduce((current, frame) => Math.min(current, frame.altitudeM), Number.POSITIVE_INFINITY)
  const landedCandidates = frames.filter(
    (frame) => frame.altitudeM <= minAltitude + TRIM_ALTITUDE_WINDOW_M && frame.speedKmh < TRIM_SPEED_THRESHOLD_KMH,
  )

  const source = landedCandidates.length >= 12 ? landedCandidates : frames.slice(0, Math.min(80, frames.length))
  return {
    rollDeg: median(source.map((frame) => frame.rollDeg)),
    pitchDeg: median(source.map((frame) => frame.pitchDeg)),
  }
}

export function FlightScene({ currentFrame, frames, showTrail, motionSmoothing }: FlightSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<SceneRefs | null>(null)
  const attitudeTrim = useMemo(() => computeAttitudeTrim(frames), [frames])
  const smoothedMotionRef = useRef<{
    point: THREE.Vector3
    headingRad: number
    pitchDeg: number
    rollDeg: number
  } | null>(null)

  useEffect(() => {
    const container = mountRef.current
    if (!container) {
      return undefined
    }

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#7dc9ff')
    scene.fog = new THREE.Fog('#7dc9ff', 180, 520)

    const camera = new THREE.PerspectiveCamera(48, container.clientWidth / container.clientHeight, 0.1, 1200)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(renderer.domElement)

    const ambient = new THREE.HemisphereLight('#fff7ed', '#1e293b', 1.4)
    scene.add(ambient)

    const sun = new THREE.DirectionalLight('#ffffff', 2)
    sun.position.set(40, 50, 30)
    scene.add(sun)

    const skyFill = new THREE.DirectionalLight('#dbeafe', 0.7)
    skyFill.position.set(-70, 40, -30)
    scene.add(skyFill)

    const clouds = createCloudField()
    scene.add(clouds.group)

    const skybox = new THREE.Mesh(
      new THREE.BoxGeometry(2200, 2200, 2200),
      new THREE.MeshBasicMaterial({ color: '#87ceff', side: THREE.BackSide }),
    )
    scene.add(skybox)

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(140, 48),
      new THREE.MeshStandardMaterial({ color: '#3f9a42', roughness: 0.95, metalness: 0.02 }),
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
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)]),
      new THREE.LineBasicMaterial({ color: '#111111' }),
    )
    trail.visible = showTrail
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
      renderer,
      trail,
      aircraftYaw,
      aircraftPitch,
      aircraftRoll,
    }

    let animationFrameId = 0
    const renderLoop = () => {
      renderer.render(scene, camera)
      animationFrameId = requestAnimationFrame(renderLoop)
    }
    renderLoop()

    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animationFrameId)
      clouds.dispose()
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
      .map((frame) => getAircraftWorldPoint(frame))

    refs.trail.geometry.dispose()
    refs.trail.geometry = new THREE.BufferGeometry().setFromPoints(
      sampledPoints.length > 1 ? sampledPoints : [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)],
    )
    smoothedMotionRef.current = null
  }, [frames])

  useEffect(() => {
    const refs = sceneRef.current
    if (!refs) {
      return
    }

    refs.trail.visible = showTrail
  }, [showTrail])

  useEffect(() => {
    const refs = sceneRef.current
    if (!refs) {
      return
    }

    const fallbackFrame = {
      headingRad: 0,
      point: { x: 0, y: 0, z: 0 },
      pitchDeg: 0,
      rollDeg: 0,
    }
    const targetFrame = currentFrame ?? fallbackFrame
    const startFrame = frames[0] ?? fallbackFrame
    const aircraftPoint = getAircraftWorldPoint(targetFrame)
    const smoothingAmount = clamp(motionSmoothing, 0, 1)
    const response = smoothingAmount === 0 ? 1 : clamp(1 - smoothingAmount * 0.88, 0.06, 1)

    if (!smoothedMotionRef.current || smoothingAmount === 0) {
      smoothedMotionRef.current = {
        point: aircraftPoint.clone(),
        headingRad: targetFrame.headingRad,
        pitchDeg: targetFrame.pitchDeg,
        rollDeg: targetFrame.rollDeg,
      }
    } else {
      smoothedMotionRef.current.point.lerp(aircraftPoint, response)
      smoothedMotionRef.current.headingRad = lerpAngle(
        smoothedMotionRef.current.headingRad,
        targetFrame.headingRad,
        response,
      )
      smoothedMotionRef.current.pitchDeg = lerp(
        smoothedMotionRef.current.pitchDeg,
        targetFrame.pitchDeg,
        response,
      )
      smoothedMotionRef.current.rollDeg = lerpAngle(
        smoothedMotionRef.current.rollDeg,
        targetFrame.rollDeg,
        response,
      )
    }

    const smoothedPoint = smoothedMotionRef.current.point
    const smoothedHeading = smoothedMotionRef.current.headingRad
    const smoothedPitchDeg = smoothedMotionRef.current.pitchDeg - attitudeTrim.pitchDeg
    const smoothedRollDeg = smoothedMotionRef.current.rollDeg - attitudeTrim.rollDeg
    const bankRadians = THREE.MathUtils.degToRad(-smoothedRollDeg)
    const pitchRadians = THREE.MathUtils.degToRad(smoothedPitchDeg)
    const startPoint = getGroundWorldPoint(startFrame)
    const up = new THREE.Vector3(0, 1, 0)
    const cameraPosition = getPilotCameraPosition(startPoint, startFrame.headingRad ?? targetFrame.headingRad)
    const lookTarget = smoothedPoint.clone().add(up.clone().multiplyScalar(PILOT_LOOK_LIFT))

    refs.aircraftYaw.position.copy(smoothedPoint)
    refs.aircraftYaw.rotation.y = -smoothedHeading
    refs.aircraftPitch.rotation.z = pitchRadians + Math.min(Math.abs(bankRadians) * 0.14, THREE.MathUtils.degToRad(5))
    refs.aircraftRoll.rotation.x = bankRadians * 1.15

    refs.camera.position.copy(cameraPosition)
    refs.camera.up.copy(up)
    refs.camera.lookAt(lookTarget)
  }, [attitudeTrim.pitchDeg, attitudeTrim.rollDeg, currentFrame, frames, motionSmoothing])

  return <div className="scene-view" ref={mountRef} />
}