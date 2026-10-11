import { useMemo } from 'react'
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { layout2D } from '../../lib/graph'
import type { CfgBlock, CfgEdge } from '../../lib/types'
import { hex } from '../ui'

const MAX_NODES = 400
export interface CfgGraphProps { blocks: CfgBlock[]; edges: CfgEdge[]; highlight: Set<number>; selected: number | null; onSelect: (s: number) => void; theme: 'dark' | 'light' }

/** 2D control-flow graph built only from engine-reported blocks and edges. */
export default function CfgGraph({ blocks, edges, highlight, selected, onSelect, theme }: CfgGraphProps) {
  const { nodes, rfEdges, trimmed } = useMemo(() => {
    let bs = blocks, es = edges, trimmed = false
    if (blocks.length > MAX_NODES) {
      const keep = new Set(highlight)
      for (const e of edges) if (highlight.has(e.src) || highlight.has(e.dst)) { keep.add(e.src); keep.add(e.dst) }
      bs = blocks.filter((b) => keep.has(b.start)); es = edges.filter((e) => keep.has(e.src) && keep.has(e.dst)); trimmed = true
    }
    const pos = layout2D(bs, es)
    const nodes: Node[] = bs.map((b) => {
      const hi = highlight.has(b.start), sel = selected === b.start
      return {
        id: String(b.start), position: pos.get(b.start) ?? { x: 0, y: 0 }, draggable: false,
        ariaLabel: `Block ${hex(b.start)} to ${hex(b.end)}${hi ? ', evidence for focused finding' : ''}${b.unresolved_jump ? ', ends in unresolved dynamic jump' : ''}`,
        data: { label: `${hi ? '● ' : ''}${hex(b.start)}–${hex(b.end)}${b.unresolved_jump ? ' ⤳ dynamic' : ''}` },
        style: { fontFamily: 'var(--font-mono, monospace)', fontSize: 11, width: 170, padding: 6, background: 'rgb(var(--panel))', color: 'rgb(var(--text))',
          border: `${sel ? 3 : hi ? 2 : 1}px ${b.unresolved_jump ? 'dashed' : 'solid'} ${sel ? 'rgb(var(--cyan))' : hi ? 'rgb(var(--amber))' : 'rgb(var(--line))'}`, borderRadius: 3 },
      }
    })
    const rfEdges: Edge[] = es.map((e, i) => ({
      id: `${e.src}-${e.dst}-${i}`, source: String(e.src), target: String(e.dst), type: 'smoothstep',
      label: e.kind === 'jumpi_true' ? 'true' : e.kind === 'jumpi_false' ? 'false' : undefined,
      markerEnd: { type: MarkerType.ArrowClosed, color: 'rgb(143 160 192)' },
      style: { stroke: highlight.has(e.src) && highlight.has(e.dst) ? 'rgb(var(--amber))' : 'rgb(143 160 192)', strokeDasharray: e.kind === 'jumpi_false' ? '5 4' : undefined },
      labelStyle: { fontSize: 10, fill: 'rgb(143 160 192)' },
    }))
    return { nodes, rfEdges, trimmed }
  }, [blocks, edges, highlight, selected])
  return (
    <div>
      {trimmed && <p className="mb-2 text-xs text-amber">Graph shows only the focused finding's blocks and their neighbours ({blocks.length} blocks total). The text list lists all blocks.</p>}
      <div className="h-[520px] border border-line rounded-pane" role="group" aria-label="Control-flow graph. A text alternative follows.">
        <ReactFlow nodes={nodes} edges={rfEdges} fitView minZoom={0.05} nodesDraggable={false} nodesConnectable={false} colorMode={theme}
          onNodeClick={(_, n) => onSelect(Number(n.id))} proOptions={{ hideAttribution: true }}>
          <Background gap={28} /><Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  )
}
