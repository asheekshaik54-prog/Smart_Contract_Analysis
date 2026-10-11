import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import { motionTokens } from '../../lib/motion'

/** Decorative scene. It is NOT connected to any scan and must never be presented as one. */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function Core({ reduced }: { reduced: boolean }) {
  const g = useRef<THREE.Group>(null)
  useFrame((_, dt) => { if (!reduced && g.current) { g.current.rotation.y += dt * 0.15; g.current.rotation.x += dt * 0.05 } })
  return (
    <group ref={g}>
      <mesh><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#1a2748" metalness={0.92} roughness={0.28} flatShading /></mesh>
      <mesh><icosahedronGeometry args={[1.32, 1]} /><meshBasicMaterial color="#3de0ff" wireframe transparent opacity={0.28} /></mesh>
      <mesh><octahedronGeometry args={[0.5, 0]} /><meshStandardMaterial color="#8b6cff" emissive="#8b6cff" emissiveIntensity={1.4} /></mesh>
    </group>
  )
}

const RINGS = [
  { r: 1.9, tilt: [1.1, 0.2], sp: 0.25, c: '#3de0ff' },
  { r: 2.4, tilt: [0.4, 0.9], sp: -0.18, c: '#8b6cff' },
  { r: 2.9, tilt: [1.4, -0.5], sp: 0.1, c: '#3de0ff' },
]
function Rings({ reduced }: { reduced: boolean }) {
  const refs = useRef<(THREE.Mesh | null)[]>([])
  useFrame((_, dt) => { if (!reduced) refs.current.forEach((m, i) => { if (m) m.rotation.z += dt * RINGS[i].sp }) })
  return <>{RINGS.map((c, i) => (
    <mesh key={i} ref={(m) => { refs.current[i] = m }} rotation={[c.tilt[0], c.tilt[1], 0]}>
      <torusGeometry args={[c.r, 0.012, 8, 160]} /><meshBasicMaterial color={c.c} transparent opacity={0.55} />
    </mesh>
  ))}</>
}

function Constellation({ reduced }: { reduced: boolean }) {
  const g = useRef<THREE.Group>(null)
  const inst = useRef<THREE.InstancedMesh>(null)
  const { pts, seg } = useMemo(() => {
    const r = rng(7), pts: THREE.Vector3[] = []
    for (let i = 0; i < 56; i++) {
      const u = r() * 2 - 1, th = r() * Math.PI * 2, rad = 2.2 + r() * 1.1, s = Math.sqrt(1 - u * u)
      pts.push(new THREE.Vector3(rad * s * Math.cos(th), rad * u * 0.8, rad * s * Math.sin(th)))
    }
    const seg: number[] = []
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++)
      if (pts[i].distanceTo(pts[j]) < 1.25) seg.push(pts[i].x, pts[i].y, pts[i].z, pts[j].x, pts[j].y, pts[j].z)
    return { pts, seg: new Float32Array(seg) }
  }, [])
  useEffect(() => {
    const m = inst.current; if (!m) return
    const d = new THREE.Object3D()
    pts.forEach((p, i) => { d.position.copy(p); d.updateMatrix(); m.setMatrixAt(i, d.matrix) })
    m.instanceMatrix.needsUpdate = true
  }, [pts])
  useFrame((_, dt) => { if (!reduced && g.current) g.current.rotation.y -= dt * 0.04 })
  return (
    <group ref={g}>
      <instancedMesh ref={inst} args={[undefined, undefined, pts.length]}><sphereGeometry args={[0.035, 8, 8]} /><meshBasicMaterial color="#e6edf8" /></instancedMesh>
      <lineSegments><bufferGeometry><bufferAttribute attach="attributes-position" args={[seg, 3]} /></bufferGeometry><lineBasicMaterial color="#3de0ff" transparent opacity={0.18} /></lineSegments>
    </group>
  )
}

function Beam({ reduced }: { reduced: boolean }) {
  const g = useRef<THREE.Group>(null)
  useFrame((_, dt) => { if (!reduced && g.current) g.current.rotation.y -= dt * 0.6 })
  return (
    <group ref={g}>
      <mesh position={[1.7, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.4, 0.025]} />
        <meshBasicMaterial color="#3de0ff" transparent opacity={0.7} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

function Dust() {
  const pos = useMemo(() => {
    const r = rng(3), a = new Float32Array(240 * 3)
    for (let i = 0; i < 240; i++) {
      const u = r() * 2 - 1, th = r() * Math.PI * 2, rad = 3.5 + r() * 3, s = Math.sqrt(1 - u * u)
      a.set([rad * s * Math.cos(th), rad * u, rad * s * Math.sin(th)], i * 3)
    }
    return a
  }, [])
  return <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[pos, 3]} /></bufferGeometry><pointsMaterial size={0.02} color="#8fa0c0" transparent opacity={0.6} sizeAttenuation depthWrite={false} /></points>
}

function Rig({ reduced }: { reduced: boolean }) {
  const camera = useThree((s) => s.camera)
  const target = useRef({ x: 0, y: 0 })
  useEffect(() => {
    if (reduced) return
    const on = (e: PointerEvent) => { target.current.x = (e.clientX / window.innerWidth - 0.5) * 2; target.current.y = (e.clientY / window.innerHeight - 0.5) * 2 }
    window.addEventListener('pointermove', on, { passive: true })
    return () => window.removeEventListener('pointermove', on)
  }, [reduced])
  useFrame(() => {
    if (reduced) return
    camera.position.x += (target.current.x * 0.6 - camera.position.x) * motionTokens.camera // limited range: +-0.6
    camera.position.y += (-target.current.y * 0.4 - camera.position.y) * motionTokens.camera
    camera.lookAt(0, 0, 0)
  })
  return null
}

function Stage({ reduced }: { reduced: boolean }) {
  const g = useRef<THREE.Group>(null)
  const wide = useThree((s) => s.size.width / s.size.height) > 1.1
  useEffect(() => { g.current?.scale.setScalar(reduced ? 1 : 0.6) }, [reduced])
  useFrame((_, dt) => { if (!reduced && g.current) g.current.scale.setScalar(THREE.MathUtils.damp(g.current.scale.x, 1, 3, dt)) })
  return (
    <group ref={g} position={wide ? [1.7, 0, 0] : [0, 1.3, 0]}>
      <Core reduced={reduced} /><Rings reduced={reduced} /><Constellation reduced={reduced} /><Beam reduced={reduced} />
    </group>
  )
}

export default function HeroScene({ reduced, onFail }: { reduced: boolean; onFail: () => void }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)
  const [dpr, setDpr] = useState<number>(Math.min(window.devicePixelRatio || 1, 1.5))
  useEffect(() => {
    const el = wrap.current; if (!el) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={wrap} className="absolute inset-0" aria-hidden="true">
      <Canvas
        dpr={dpr} frameloop={reduced ? 'demand' : visible ? 'always' : 'never'}
        camera={{ position: [0, 0, 6.4], fov: 42 }} gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onFail() })}
      >
        <PerformanceMonitor onDecline={() => setDpr(1)} />
        <ambientLight intensity={0.5} />
        <pointLight position={[4, 3, 4]} intensity={60} color="#3de0ff" />
        <pointLight position={[-4, -2, 3]} intensity={40} color="#8b6cff" />
        <directionalLight position={[2, 4, 2]} intensity={1.2} />
        <Rig reduced={reduced} />
        <Stage reduced={reduced} />
        <Dust />
      </Canvas>
    </div>
  )
}
