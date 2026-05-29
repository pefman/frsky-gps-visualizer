import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import { findFrameIndexAtTime } from '../lib/playback'
import type { TelemetryFrame } from '../types'

interface FlightSceneProps {
  currentFrame: TelemetryFrame | null
  frames: TelemetryFrame[]
  showTrail: boolean
  showPathTrail: boolean
  onToggleShowTrail: () => void
  onToggleShowPathTrail: () => void
  motionSmoothing: number
}

interface SceneRefs {
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  trail: THREE.Line
  trailGlow: THREE.Line
  ground: THREE.Mesh
  grid: THREE.GridHelper
  originRing: THREE.Mesh
  aircraftYaw: THREE.Group
  aircraftPitch: THREE.Group
  aircraftRoll: THREE.Group
  pathTrail: THREE.Line
  pathTrailGlow: THREE.Line
}

const PILOT_CAMERA_DISTANCE = 5
const PILOT_CAMERA_HEIGHT = 2
const PILOT_LOOK_LIFT = 0.9
const PILOT_CAMERA_BASE_FOV = 48
const SEGMENT_LENGTH_M = 10
const AIRCRAFT_MARKER_RADIUS = 0.36
const BASE_AIRCRAFT_WINGSPAN_M = 6.9
const TARGET_AIRCRAFT_WINGSPAN_M = 1.5
const AIRCRAFT_MODEL_SCALE = TARGET_AIRCRAFT_WINGSPAN_M / BASE_AIRCRAFT_WINGSPAN_M
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
  const delta = Math.atan2(Math.sin(end - start), Math.cos(end - start))
  return start + delta * amount
}

function createAircraftModel(): THREE.Group {
  const aircraft = new THREE.Group()

  const paintWhite = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.52, metalness: 0.08 })
  const paintRed = new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.46, metalness: 0.14 })
  const carbonDark = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.58, metalness: 0.2 })

  const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 4.9, 9, 18), paintWhite)
  fuselage.rotation.z = Math.PI / 2

  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.43, 24, 24),
    new THREE.MeshStandardMaterial({ color: '#7dd3fc', transparent: true, opacity: 0.74, roughness: 0.12, metalness: 0.08 }),
  )
  canopy.scale.set(1.42, 0.65, 1)
  canopy.position.set(0.64, 0.42, 0)

  const engineCowling = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.36, 1.02, 20), paintRed)
  engineCowling.rotation.z = Math.PI / 2
  engineCowling.position.set(2.74, 0, 0)

  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.58, 20), paintWhite)
  spinner.rotation.z = -Math.PI / 2
  spinner.position.set(3.55, 0, 0)

  const propHub = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.14, 14), carbonDark)
  propHub.rotation.z = Math.PI / 2
  propHub.position.set(3.24, 0, 0)

  const propDisk = new THREE.Mesh(
    new THREE.CircleGeometry(0.96, 36),
    new THREE.MeshStandardMaterial({ color: '#9ca3af', transparent: true, opacity: 0.17, side: THREE.DoubleSide }),
  )
  propDisk.rotation.y = Math.PI / 2
  propDisk.position.set(3.22, 0, 0)

  const wingCenter = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.14, 1.2), paintRed)
  wingCenter.position.set(0.28, -0.03, 0)

  const wingLeft = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.13, 0.8), paintWhite)
  wingLeft.rotation.y = Math.PI / 2
  wingLeft.rotation.z = THREE.MathUtils.degToRad(2.2)
  wingLeft.position.set(0.27, -0.03, 1.99)

  const wingRight = wingLeft.clone()
  wingRight.rotation.z = THREE.MathUtils.degToRad(-2.2)
  wingRight.position.z = -1.99

  const wingTipLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.62, 12), paintRed)
  wingTipLeft.rotation.x = Math.PI / 2
  wingTipLeft.rotation.z = THREE.MathUtils.degToRad(90)
  wingTipLeft.position.set(0.28, -0.03, 3.35)

  const wingTipRight = wingTipLeft.clone()
  wingTipRight.position.z = -3.35

  const horizontalStab = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.09, 2.18), paintWhite)
  horizontalStab.position.set(-2.22, 0.24, 0)

  const elevatorAccent = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 2.0), paintRed)
  elevatorAccent.position.set(-2.6, 0.23, 0)

  const verticalStab = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.02, 0.8), paintWhite)
  verticalStab.position.set(-2.56, 0.72, 0)

  const rudderAccent = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.86, 0.22), paintRed)
  rudderAccent.position.set(-2.62, 0.72, 0)

  const leftGearLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.84, 10), carbonDark)
  leftGearLeg.position.set(0.76, -0.49, 0.46)
  leftGearLeg.rotation.z = THREE.MathUtils.degToRad(-12)

  const rightGearLeg = leftGearLeg.clone()
  rightGearLeg.position.z = -0.46
  rightGearLeg.rotation.z = THREE.MathUtils.degToRad(12)

  const leftWheelPant = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), paintRed)
  leftWheelPant.scale.set(1.45, 0.8, 1)
  leftWheelPant.position.set(0.9, -0.86, 0.6)

  const rightWheelPant = leftWheelPant.clone()
  rightWheelPant.position.z = -0.6

  const tailWheel = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), carbonDark)
  tailWheel.position.set(-2.88, -0.28, 0)

  const fuselageStripe = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 0.82), paintRed)
  fuselageStripe.position.set(0.95, 0.07, 0)

  aircraft.add(
    fuselage,
    canopy,
    engineCowling,
    spinner,
    propHub,
    propDisk,
    wingCenter,
    wingLeft,
    wingRight,
    wingTipLeft,
    wingTipRight,
    horizontalStab,
    elevatorAccent,
    verticalStab,
    rudderAccent,
    leftGearLeg,
    rightGearLeg,
    leftWheelPant,
    rightWheelPant,
    tailWheel,
    fuselageStripe,
  )

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(AIRCRAFT_MARKER_RADIUS, 18, 18),
    new THREE.MeshStandardMaterial({ color: '#fde047', emissive: '#f59e0b', emissiveIntensity: 0.55 }),
  )
  marker.position.set(0.26, 0.26, 0)
  aircraft.add(marker)

  // Normalize this stylized model to the target real-world wingspan.
  aircraft.scale.setScalar(AIRCRAFT_MODEL_SCALE)

  return aircraft
}

function getAircraftWorldPoint(frame: { point: { x: number; y: number; z: number } }): THREE.Vector3 {
  return new THREE.Vector3(frame.point.x, frame.point.y, frame.point.z)
}

function getGroundWorldPoint(frame: { point: { x: number; y: number; z: number } }, groundY: number): THREE.Vector3 {
  return new THREE.Vector3(frame.point.x, groundY, frame.point.z)
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

function buildDistanceSegment(
  frames: TelemetryFrame[],
  currentElapsedMs: number,
  startPoint: THREE.Vector3,
  maxDistanceM: number,
  direction: 'past' | 'future',
  headingRad: number,
): THREE.Vector3[] {
  if (frames.length === 0) {
    return [startPoint.clone(), startPoint.clone().add(new THREE.Vector3(0, 0.01, 0))]
  }

  const frameIndex = clamp(findFrameIndexAtTime(frames, currentElapsedMs), 0, frames.length - 1)
  const points = [startPoint.clone()]
  let remainingDistance = Math.max(0, maxDistanceM)
  let anchorPoint = startPoint.clone()

  if (direction === 'past') {
    for (let index = frameIndex; index > 0 && remainingDistance > 0; index -= 1) {
      const candidatePoint = getAircraftWorldPoint(frames[index - 1])
      const segmentDistance = anchorPoint.distanceTo(candidatePoint)
      if (segmentDistance < 1e-6) {
        continue
      }

      if (segmentDistance >= remainingDistance) {
        const cutoffPoint = anchorPoint.clone().lerp(candidatePoint, remainingDistance / segmentDistance)
        points.push(cutoffPoint)
        remainingDistance = 0
        break
      }

      points.push(candidatePoint)
      remainingDistance -= segmentDistance
      anchorPoint = candidatePoint
    }

    const ordered = points.reverse()
    if (ordered.length > 1) {
      return ordered
    }

    const fallback = ordered[0].clone().add(new THREE.Vector3(-Math.cos(headingRad), 0, -Math.sin(headingRad)).multiplyScalar(maxDistanceM))
    return [ordered[0], fallback]
  }

  for (let index = frameIndex + 1; index < frames.length && remainingDistance > 0; index += 1) {
    const candidatePoint = getAircraftWorldPoint(frames[index])
    const segmentDistance = anchorPoint.distanceTo(candidatePoint)
    if (segmentDistance < 1e-6) {
      continue
    }

    if (segmentDistance >= remainingDistance) {
      const cutoffPoint = anchorPoint.clone().lerp(candidatePoint, remainingDistance / segmentDistance)
      points.push(cutoffPoint)
      remainingDistance = 0
      break
    }

    points.push(candidatePoint)
    remainingDistance -= segmentDistance
    anchorPoint = candidatePoint
  }

  if (points.length > 1) {
    return points
  }

  const fallback = points[0].clone().add(new THREE.Vector3(Math.cos(headingRad), 0, Math.sin(headingRad)).multiplyScalar(maxDistanceM))
  return [points[0], fallback]
}

export function FlightScene({
  currentFrame,
  frames,
  showTrail,
  showPathTrail,
  onToggleShowTrail,
  onToggleShowPathTrail,
  motionSmoothing,
}: FlightSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<SceneRefs | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const attitudeTrim = useMemo(() => computeAttitudeTrim(frames), [frames])
  const currentFrameRef = useRef<TelemetryFrame | null>(null)
  const framesRef = useRef<TelemetryFrame[]>([])
  const groundLevelYRef = useRef(0)
  const motionSmoothingRef = useRef(0)
  const cameraFovRef = useRef(PILOT_CAMERA_BASE_FOV)
  const attitudeTrimRef = useRef<{ rollDeg: number; pitchDeg: number }>({ rollDeg: 0, pitchDeg: 0 })
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

    const camera = new THREE.PerspectiveCamera(PILOT_CAMERA_BASE_FOV, container.clientWidth / container.clientHeight, 0.1, 1200)
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
      new THREE.LineBasicMaterial({ color: '#fb923c', transparent: true, opacity: 0.98, toneMapped: false }),
    )
    trail.visible = showTrail
    scene.add(trail)

    const trailGlow = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)]),
      new THREE.LineBasicMaterial({
        color: '#fdba74',
        transparent: true,
        opacity: 0.52,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    trailGlow.visible = showTrail
    scene.add(trailGlow)

    const pathTrail = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)]),
      new THREE.LineBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.98, toneMapped: false }),
    )
    pathTrail.visible = showPathTrail
    scene.add(pathTrail)

    const pathTrailGlow = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)]),
      new THREE.LineBasicMaterial({
        color: '#67e8f9',
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    pathTrailGlow.visible = showPathTrail
    scene.add(pathTrailGlow)

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
      trailGlow,
      ground,
      grid,
      originRing,
      aircraftYaw,
      aircraftPitch,
      aircraftRoll,
      pathTrail,
      pathTrailGlow,
    }

    let animationFrameId = 0
    let previousRenderTimestamp = 0
    const fallbackFrame = {
      elapsedMs: 0,
      headingRad: 0,
      point: { x: 0, y: 0, z: 0 },
      speedKmh: 0,
      pitchDeg: 0,
      rollDeg: 0,
    }

    const renderLoop = (timestamp: number) => {
      const targetFrame = currentFrameRef.current ?? fallbackFrame
      const startFrame = framesRef.current[0] ?? fallbackFrame
      const aircraftPoint = getAircraftWorldPoint(targetFrame)
      const smoothingAmount = clamp(motionSmoothingRef.current, 0, 1)

      if (!smoothedMotionRef.current || smoothingAmount === 0) {
        smoothedMotionRef.current = {
          point: aircraftPoint.clone(),
          headingRad: targetFrame.headingRad,
          pitchDeg: targetFrame.pitchDeg,
          rollDeg: targetFrame.rollDeg,
        }
      } else {
        const deltaSeconds = previousRenderTimestamp === 0 ? 1 / 60 : Math.min((timestamp - previousRenderTimestamp) / 1000, 0.1)
        const responsePerSecond = lerp(24, 3.5, smoothingAmount)
        const response = 1 - Math.exp(-responsePerSecond * deltaSeconds)

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

      previousRenderTimestamp = timestamp

      const smoothedPoint = smoothedMotionRef.current.point
      const smoothedHeading = smoothedMotionRef.current.headingRad
      const smoothedPitchDeg = smoothedMotionRef.current.pitchDeg - attitudeTrimRef.current.pitchDeg
      const smoothedRollDeg = smoothedMotionRef.current.rollDeg - attitudeTrimRef.current.rollDeg
      const bankRadians = THREE.MathUtils.degToRad(-smoothedRollDeg)
      const pitchRadians = THREE.MathUtils.degToRad(smoothedPitchDeg)
      const startPoint = getGroundWorldPoint(startFrame, groundLevelYRef.current)
      const up = new THREE.Vector3(0, 1, 0)
      const cameraPosition = getPilotCameraPosition(startPoint, startFrame.headingRad ?? targetFrame.headingRad)
      const lookTarget = smoothedPoint.clone().add(up.clone().multiplyScalar(PILOT_LOOK_LIFT))
      const cameraToTargetDistance = cameraPosition.distanceTo(lookTarget)

      const segmentFrames = framesRef.current
      const currentElapsedMs = typeof targetFrame.elapsedMs === 'number' ? targetFrame.elapsedMs : 0
      const pathPoints = buildDistanceSegment(segmentFrames, currentElapsedMs, smoothedPoint, SEGMENT_LENGTH_M, 'past', smoothedHeading)
      const trailPoints = buildDistanceSegment(segmentFrames, currentElapsedMs, smoothedPoint, SEGMENT_LENGTH_M, 'future', smoothedHeading)

      pathTrail.geometry.dispose()
      pathTrail.geometry = new THREE.BufferGeometry().setFromPoints(pathPoints)
      pathTrailGlow.geometry.dispose()
      pathTrailGlow.geometry = new THREE.BufferGeometry().setFromPoints(pathPoints)
      trail.geometry.dispose()
      trail.geometry = new THREE.BufferGeometry().setFromPoints(trailPoints)
      trailGlow.geometry.dispose()
      trailGlow.geometry = new THREE.BufferGeometry().setFromPoints(trailPoints)

      // Auto-zoom adjusts field of view by target distance to keep the aircraft legible.
      const autoZoomBaseFov = clamp(64 - cameraToTargetDistance * 0.1, 22, 62)
      const speedBoost = clamp((Math.abs(targetFrame.speedKmh) - 80) * 0.05, 0, 10)
      const bankBoost = clamp(Math.abs(smoothedRollDeg) * 0.045, 0, 6)
      const pitchBoost = clamp(Math.abs(smoothedPitchDeg) * 0.025, 0, 4)
      const dynamicTargetFov = autoZoomBaseFov + speedBoost + bankBoost + pitchBoost
      const targetFov = clamp(dynamicTargetFov, 12, 68)
      cameraFovRef.current = lerp(cameraFovRef.current, targetFov, 0.12)
      if (Math.abs(camera.fov - cameraFovRef.current) > 0.01) {
        camera.fov = cameraFovRef.current
        camera.updateProjectionMatrix()
      }

      aircraftYaw.position.copy(smoothedPoint)
      aircraftYaw.rotation.y = -smoothedHeading
      aircraftPitch.rotation.z = pitchRadians + Math.min(Math.abs(bankRadians) * 0.14, THREE.MathUtils.degToRad(5))
      aircraftRoll.rotation.x = bankRadians * 1.15

      camera.position.copy(cameraPosition)
      camera.up.copy(up)
      camera.lookAt(lookTarget)

      renderer.render(scene, camera)
      animationFrameId = requestAnimationFrame(renderLoop)
    }
    animationFrameId = requestAnimationFrame(renderLoop)

    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animationFrameId)
      clouds.dispose()
      renderer.dispose()
      trail.geometry.dispose()
      trailGlow.geometry.dispose()
      pathTrail.geometry.dispose()
      pathTrailGlow.geometry.dispose()
      ;(trail.material as THREE.Material).dispose()
      ;(trailGlow.material as THREE.Material).dispose()
      ;(pathTrail.material as THREE.Material).dispose()
      ;(pathTrailGlow.material as THREE.Material).dispose()
      container.removeChild(renderer.domElement)
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    const refs = sceneRef.current
    if (!refs) {
      return
    }

    const groundLevelY = frames[0]?.point.y ?? 0
    groundLevelYRef.current = groundLevelY
    refs.ground.position.y = groundLevelY
    refs.grid.position.y = groundLevelY + 0.02
    refs.originRing.position.y = groundLevelY + 0.06

    refs.trail.geometry.dispose()
    refs.trail.geometry = new THREE.BufferGeometry().setFromPoints(
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)],
    )
    refs.trailGlow.geometry.dispose()
    refs.trailGlow.geometry = new THREE.BufferGeometry().setFromPoints(
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)],
    )
    refs.pathTrail.geometry.dispose()
    refs.pathTrail.geometry = new THREE.BufferGeometry().setFromPoints(
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)],
    )
    refs.pathTrailGlow.geometry.dispose()
    refs.pathTrailGlow.geometry = new THREE.BufferGeometry().setFromPoints(
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)],
    )
    smoothedMotionRef.current = null
  }, [frames])

  useEffect(() => {
    const refs = sceneRef.current
    if (!refs) {
      return
    }

    refs.trail.visible = showTrail
    refs.trailGlow.visible = showTrail
  }, [showTrail])

  useEffect(() => {
    const refs = sceneRef.current
    if (!refs) {
      return
    }

    refs.pathTrail.visible = showPathTrail
    refs.pathTrailGlow.visible = showPathTrail
  }, [showPathTrail])

  useEffect(() => {
    currentFrameRef.current = currentFrame
    framesRef.current = frames
    motionSmoothingRef.current = motionSmoothing
    attitudeTrimRef.current = attitudeTrim
  }, [attitudeTrim.pitchDeg, attitudeTrim.rollDeg, currentFrame, frames, motionSmoothing])

  useEffect(() => {
    const updateFullscreenState = () => {
      const container = mountRef.current
      setIsFullscreen(Boolean(container && document.fullscreenElement === container))
    }

    document.addEventListener('fullscreenchange', updateFullscreenState)
    updateFullscreenState()

    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreenState)
    }
  }, [])

  async function handleToggleFullscreen() {
    const container = mountRef.current
    if (!container) {
      return
    }

    if (document.fullscreenElement === container) {
      await document.exitFullscreen()
      return
    }

    await container.requestFullscreen()
  }

  return (
    <div className="scene-view relative" ref={mountRef}>
      <div className="absolute right-2 top-2 z-10 flex gap-1.5">
        <button
          type="button"
          className={`btn btn-xs ${showTrail ? 'btn-primary' : 'btn-outline'}`}
          onClick={onToggleShowTrail}
          title="Toggle 10 meter forward trail"
        >
          Trail
        </button>
        <button
          type="button"
          className={`btn btn-xs ${showPathTrail ? 'btn-primary' : 'btn-outline'}`}
          onClick={onToggleShowPathTrail}
          title="Toggle 10 meter path trail"
        >
          Path
        </button>
        <span className="rounded-box border border-base-300 bg-base-100/85 px-2 py-1 text-[11px] font-semibold text-base-content/80">
          Autozoom
        </span>
        <button
          type="button"
          className={`btn btn-xs ${isFullscreen ? 'btn-primary' : 'btn-outline'}`}
          onClick={handleToggleFullscreen}
          title="Toggle fullscreen viewport"
        >
          Fullscreen
        </button>
      </div>
    </div>
  )
}