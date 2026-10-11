import { useEffect, useMemo, useRef, type ElementRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { layout3D } from '../../lib/graph'
import type { CfgBlock, CfgEdge } from '../../lib/types'

export interface EvidenceSceneProps {
  blocks: CfgBlock[]; edges: CfgEdge[]; highlight: Set<number>; selected: number | null
  onSelect: (start: number | null) => void; isolate: boolean; resetKey: number; reduced: boolean; onFail: () => void
}

/** Renders ONLY blocks/edges present in the engine's CFG output. Edges absent from the engine are never drawn. */
export default function EvidenceScene({ blocks, edges, highlight, selected, onSelect, isolate, resetKey, reduced, onFail }: EvidenceSceneProps) {
  const pos = useMemo(() => layout3D(blocks, edges), [blocks, edges])
  const shown = useMemo(() => (isolate && highlight.size ? blocks.filter((b) => highlight.has(b.start)) : blocks), [blocks, highlight, isolate])
  const shownSet = useMemo(() => new Set(shown.map((b) => b.start)), [shown])
  const geo = useMemo(() => ({ sphere: new THREE.SphereGeometry(0.09, 16, 12), oct: new THREE.OctahedronGeometry(0.12, 0) }), [])
  const mats = useMemo(() => ({
    base: new THREE.MeshStandardMaterial({ color: '#5b7bd5', metalness: 0.6, roughness: 0.4 }),
    hi: new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ffb347', emissiveIntensity: 0.7 }),
    sel: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#3de0ff', emissiveIntensity: 1 }),
  }), [])
  useEffect(() => () => { Object.values(geo).forEach((g) => g.dispose()); Object.values(mats).forEach((m) => m.dispose()) }, [geo, mats])

  const lines = useMemo(() => {
    const n: number[] = [], h: number[] = []
    for (const e of edges) {
      const a = pos.get(e.src), b = pos.get(e.dst)
      if (!a || !b || !shownSet.has(e.src) || !shownSet.has(e.dst)) continue
      ;(highlight.has(e.src) && highlight.has(e.dst) ? h : n).push(...a, ...b)
    }
    return { n: new Float32Array(n), h: new Float32Array(h) }
  }, [edges, pos, shownSet, highlight])

  const extent = useMemo(() => Math.max(3, ...[...pos.values()].map((p) => Math.abs(p[0]))) , [pos])
  const ctl = useRef<ElementRef<typeof OrbitControls>>(null)
  useEffect(() => { ctl.current?.reset() }, [resetKey])
  useEffect(() => {
    if (selected == null || !ctl.current) return
    const p = pos.get(selected); if (!p) return
    ctl.current.target.set(...p); ctl.current.update()
  }, [selected, pos])

  return (
    <Canvas key={blocks.length} dpr={[1, 1.5]} camera={{ position: [0, 1.5, extent * 1.6 + 2], fov: 45 }}
      gl={{ alpha: true, antialias: true }} onPointerMissed={() => onSelect(null)}
      onCreated={({ gl }) => gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onFail() })}>
      <ambientLight intensity={0.8} /><pointLight position={[5, 5, 5]} intensity={60} color="#3de0ff" /><pointLight position={[-5, -3, 4]} intensity={30} color="#8b6cff" />
      <OrbitControls ref={ctl} makeDefault enableDamping={!reduced} dampingFactor={0.1} />
      {lines.n.length > 0 && <lineSegments><bufferGeometry><bufferAttribute attach="attributes-position" args={[lines.n, 3]} /></bufferGeometry><lineBasicMaterial color="#5b7bd5" transparent opacity={0.45} /></lineSegments>}
      {lines.h.length > 0 && <lineSegments><bufferGeometry><bufferAttribute attach="attributes-position" args={[lines.h, 3]} /></bufferGeometry><lineBasicMaterial color="#ffb347" /></lineSegments>}
      {shown.map((b) => {
        const p = pos.get(b.start); if (!p) return null
        const isSel = selected === b.start, isHi = highlight.has(b.start)
        return (
          <mesh key={b.start} position={p} geometry={b.unresolved_jump ? geo.oct : geo.sphere} material={isSel ? mats.sel : isHi ? mats.hi : mats.base}
            scale={isSel ? 1.8 : isHi ? 1.4 : 1}
            onClick={(e) => { e.stopPropagation(); onSelect(b.start) }}
            onPointerOver={() => { document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }} />
        )
      })}
    </Canvas>
  )
}
