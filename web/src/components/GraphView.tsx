import { useEffect, useRef } from 'react';
import cytoscape, { type Core } from 'cytoscape';
import type { Graph } from '../api';
import { LABEL_COLORS } from './common';

const SHAPES: Record<string, string> = { Suspect: 'ellipse', Crime: 'diamond', Location: 'round-rectangle', Evidence: 'triangle', Officer: 'hexagon' };
const PALETTE = ['#f2a93b', '#3fa7d6', '#e5484d', '#4cc38a', '#a78bfa', '#f472b6', '#2dd4bf', '#facc15', '#fb923c', '#94a3b8'];

interface Props {
  graph: Graph;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  highlight?: string[];                       // node ids to emphasise (e.g. a shortest path)
  groups?: Record<string, number>;            // node id -> group index (communities): colours nodes by group
  sizes?: Record<string, number>;             // node id -> 0..1 (centrality): scales node size
  height?: number | string;
  linear?: boolean;                           // lay `highlight` out left-to-right (a path)
}

export default function GraphView({ graph, selected, onSelect, highlight, groups, sizes, height = 520, linear }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const cy = useRef<Core | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    if (!box.current) return;
    const hi = new Set(highlight || []);
    const hiEdges = new Set<string>();
    if (highlight && highlight.length > 1) for (let i = 1; i < highlight.length; i++) hiEdges.add([highlight[i - 1], highlight[i]].sort().join('|'));
    const c = cytoscape({
      container: box.current,
      elements: [
        ...graph.nodes.map((n) => ({ data: {
          id: n.id, label: `${n.id}\n${n.caption ?? ''}`, kind: n.label,
          color: groups && groups[n.id] !== undefined ? PALETTE[groups[n.id] % PALETTE.length] : LABEL_COLORS[n.label] || '#888',
          shape: SHAPES[n.label] || 'ellipse', size: 22 + 26 * (sizes?.[n.id] ?? 0),
        }, classes: hi.has(n.id) ? 'hi' : highlight?.length ? 'dim' : '' })),
        ...graph.edges.map((e, i) => ({ data: { id: `e${i}`, source: e.source, target: e.target, label: e.type },
          classes: hiEdges.has([e.source, e.target].sort().join('|')) ? 'hi' : highlight?.length ? 'dim' : '' })),
      ],
      style: [
        { selector: 'node', style: { 'background-color': 'data(color)', shape: 'data(shape)' as any, width: 'data(size)', height: 'data(size)',
          label: 'data(label)', color: '#cbd5e1', 'font-size': 9, 'text-wrap': 'wrap', 'text-valign': 'bottom', 'text-margin-y': 4,
          'border-width': 1.5, 'border-color': '#0b1220', 'text-outline-color': '#0b1220', 'text-outline-width': 2 } },
        { selector: 'edge', style: { width: 1.3, 'line-color': '#475569', 'target-arrow-color': '#475569', 'target-arrow-shape': 'triangle',
          'arrow-scale': 0.7, 'curve-style': 'bezier', label: 'data(label)', 'font-size': 7, color: '#94a3b8', 'text-rotation': 'autorotate',
          'text-outline-color': '#0b1220', 'text-outline-width': 2 } },
        { selector: 'node:selected', style: { 'border-color': '#f8fafc', 'border-width': 3 } },
        { selector: 'edge.hi', style: { 'line-color': '#f2a93b', 'target-arrow-color': '#f2a93b', width: 3 } },
        { selector: 'node.hi', style: { 'border-color': '#f2a93b', 'border-width': 3 } },
        { selector: '.dim', style: { opacity: 0.25 } },
      ],
      layout: linear && highlight
        ? { name: 'preset', padding: 40, positions: (n: any) => { const i = highlight.indexOf(n.id()); return { x: i * 150, y: i % 2 ? 50 : 0 }; } } as any
        : { name: 'cose', animate: false, padding: 30, nodeRepulsion: () => 9000, idealEdgeLength: () => 70 } as any,
      wheelSensitivity: 0.3,
      minZoom: 0.15,
      maxZoom: 3,
    });
    c.on('tap', 'node', (ev) => select.current?.(ev.target.id()));
    c.on('tap', (ev) => { if (ev.target === c) select.current?.(null); });
    cy.current = c;
    c.fit(undefined, 40);
    if (c.zoom() > 1.6) { c.zoom(1.6); c.center(); }
    return () => { c.destroy(); cy.current = null; };
  }, [graph, highlight, groups, sizes, linear]);

  useEffect(() => {
    const c = cy.current;
    if (!c) return;
    c.nodes().unselect();
    if (selected) c.getElementById(selected).select();
  }, [selected, graph]);

  const zoom = (f: number) => { const c = cy.current; if (c) c.zoom({ level: c.zoom() * f, renderedPosition: { x: c.width() / 2, y: c.height() / 2 } }); };
  return (
    <div className="graph" style={{ height }}>
      <div ref={box} className="graph-canvas" aria-label="Interactive investigation graph" role="img" />
      <div className="graph-tools">
        <button className="btn btn-sm" onClick={() => zoom(1.25)} title="Zoom in" aria-label="Zoom in">+</button>
        <button className="btn btn-sm" onClick={() => zoom(0.8)} title="Zoom out" aria-label="Zoom out">−</button>
        <button className="btn btn-sm" onClick={() => cy.current?.fit(undefined, 30)} title="Fit to view">Fit</button>
        <button className="btn btn-sm" onClick={() => cy.current?.layout({ name: 'cose', animate: false, padding: 30 } as any).run()} title="Re-run layout">Layout</button>
      </div>
      <div className="graph-meta">{graph.nodes.length} nodes · {graph.edges.length} relationships</div>
    </div>
  );
}

export function Legend() {
  return (
    <div className="legend">
      {Object.entries(LABEL_COLORS).map(([l, c]) => <span key={l}><i style={{ background: c }} className={`shape-${SHAPES[l]}`} />{l}</span>)}
    </div>
  );
}
