import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  orbitPolylineAu,
  planetPositionAu,
  PLANET_NAMES,
  type PlanetIndex,
} from './orbits.ts'

/** Ecliptic (x,y in plane, z north) → Three.js: Y up = north ecliptic pole. */
function auToThree(v: { x: number; y: number; z: number }): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.z, v.y)
}

const PLANET_COLORS = [
  0xb0b0b0, 0xe8c47c, 0x6b93d6, 0xc86432, 0xd4a574, 0xf0e68c, 0x7fd4d4, 0x4169e1,
] as const

export type SolarVis = {
  dispose: () => void
  setSize: () => void
}

/**
 * WebGL solar system: Sun, planet markers, Keplerian orbit rings, OrbitControls.
 * `getJd` is read each frame so the scrubber / playback stay in sync.
 */
export function createSolarVis(
  container: HTMLElement,
  getJd: () => number,
): SolarVis {
  const AU = 3.2
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x07080c)

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000)
  camera.position.set(0, 95, 112)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.minDistance = 8
  controls.maxDistance = 400
  controls.target.set(0, 0, 0)

  scene.add(new THREE.AmbientLight(0xa8b4d8, 0.52))
  const hemi = new THREE.HemisphereLight(0xc8d4ff, 0x1a1c24, 0.55)
  scene.add(hemi)
  const sunLight = new THREE.PointLight(0xfff2dd, 6, 0, 2)
  sunLight.position.set(0, 0, 0)
  scene.add(sunLight)

  /**
   * Sun mesh is symbolic only: at our AU scale (~3.2 world units/AU), Mercury can sit
   * near ~1 world unit from the origin, so a large “realistic” Sun radius would swallow
   * inner planets. Keep the photosphere small; glow suggests corona without blocking orbits.
   */
  const sunCoreR = 0.42
  const sunGeom = new THREE.SphereGeometry(sunCoreR, 32, 32)
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffdd88 })
  const sunMesh = new THREE.Mesh(sunGeom, sunMat)
  scene.add(sunMesh)

  const glowGeom = new THREE.SphereGeometry(sunCoreR * 2.4, 24, 24)
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xffaa44,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  })
  const glowMesh = new THREE.Mesh(glowGeom, glowMat)
  glowMesh.renderOrder = -1
  scene.add(glowMesh)

  const planetMeshes: THREE.Mesh[] = []
  const baseR = 0.16
  for (let i = 0; i < PLANET_NAMES.length; i++) {
    const g = new THREE.SphereGeometry(baseR * (1 + i * 0.06), 20, 20)
    const hex = PLANET_COLORS[i] ?? 0xffffff
    const col = new THREE.Color(hex)
    const m = new THREE.MeshStandardMaterial({
      color: col,
      roughness: 0.78,
      metalness: 0.06,
      emissive: col.clone().multiplyScalar(0.2),
      emissiveIntensity: 0.62,
    })
    const mesh = new THREE.Mesh(g, m)
    scene.add(mesh)
    planetMeshes.push(mesh)
  }

  const orbitMat = new THREE.LineBasicMaterial({
    color: 0x3a3f52,
    transparent: true,
    opacity: 0.55,
  })
  const orbitGeoms: THREE.BufferGeometry[] = []
  for (let i = 0; i < PLANET_NAMES.length; i++) {
    const pts = orbitPolylineAu(i as PlanetIndex, 96).map((p) => auToThree(p).multiplyScalar(AU))
    const geom = new THREE.BufferGeometry().setFromPoints(pts)
    orbitGeoms.push(geom)
    scene.add(new THREE.LineLoop(geom, orbitMat))
  }

  let raf = 0
  const loop = () => {
    raf = requestAnimationFrame(loop)
    const jd = getJd()
    for (let i = 0; i < planetMeshes.length; i++) {
      const p = planetPositionAu(jd, i as PlanetIndex)
      planetMeshes[i]!.position.copy(auToThree(p).multiplyScalar(AU))
    }
    controls.update()
    renderer.render(scene, camera)
  }
  loop()

  const ro = new ResizeObserver(() => setSize())
  ro.observe(container)

  function setSize(): void {
    const w = container.clientWidth
    const h = Math.max(280, Math.min(520, Math.round(w * 0.55)))
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  setSize()

  return {
    setSize,
    dispose: () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      scene.remove(sunMesh)
      scene.remove(glowMesh)
      sunGeom.dispose()
      sunMat.dispose()
      glowGeom.dispose()
      glowMat.dispose()
      for (const mesh of planetMeshes) {
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
      }
      for (const g of orbitGeoms) g.dispose()
      orbitMat.dispose()
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement)
      }
    },
  }
}
