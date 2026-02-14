import { useRef, useEffect, useState, useCallback } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { select } from "d3-selection";
import { zoom as d3Zoom } from "d3-zoom";
import { drag as d3Drag } from "d3-drag";
import type { Person, Relationship } from "@shared/types";

const GROUP_COLORS: Record<string, string> = {
  sibling: "#F6C87A",
  parent: "#C9A0DC",
  child: "#C9A0DC",
  partner: "#F2919B",
  friend: "#82C99A",
  coworker: "#E8C94A",
  pet: "#F0A870",
  other: "#D4C0AE",
};

interface GraphNode extends SimulationNodeDatum {
  id: string;
  name: string;
  person: Person;
  color: string;
  radius: number;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  id: string;
  type: string;
  label: string;
}

interface Props {
  people: Person[];
  relationships: Relationship[];
  onSelectPerson: (id: string) => void;
}

export function PeopleGraph({ people, relationships, onSelectPerson }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<Simulation<GraphNode, GraphLink> | null>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [dimensions, setDimensions] = useState({ width: 768, height: 500 });

  // Responsive sizing
  useEffect(() => {
    const container = svgRef.current?.parentElement;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const w = entry.contentRect.width;
        setDimensions({
          width: w,
          height: Math.max(400, Math.min(600, w * 0.75)),
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Force simulation
  useEffect(() => {
    // Build a map of each person's primary relationship type (for coloring)
    const relTypeMap = new Map<string, string>();
    const connectionCount = new Map<string, number>();
    for (const r of relationships) {
      if (!relTypeMap.has(r.personId1)) relTypeMap.set(r.personId1, r.type);
      if (!relTypeMap.has(r.personId2)) relTypeMap.set(r.personId2, r.type);
      connectionCount.set(r.personId1, (connectionCount.get(r.personId1) ?? 0) + 1);
      connectionCount.set(r.personId2, (connectionCount.get(r.personId2) ?? 0) + 1);
    }

    const graphNodes: GraphNode[] = people.map((p) => ({
      id: p.id,
      name: p.name,
      person: p,
      color: GROUP_COLORS[relTypeMap.get(p.id) ?? "other"] ?? "#FEECD2",
      radius: Math.min(30, 16 + (connectionCount.get(p.id) ?? 0) * 3),
    }));

    const nodeIds = new Set(graphNodes.map((n) => n.id));

    const graphLinks: GraphLink[] = relationships
      .filter((r) => nodeIds.has(r.personId1) && nodeIds.has(r.personId2))
      .map((r) => ({
        id: r.id,
        source: r.personId1,
        target: r.personId2,
        type: r.type,
        label: r.label,
      }));

    const sim = forceSimulation<GraphNode>(graphNodes)
      .force(
        "link",
        forceLink<GraphNode, GraphLink>(graphLinks)
          .id((d) => d.id)
          .distance(120),
      )
      .force("charge", forceManyBody().strength(-300))
      .force("center", forceCenter(dimensions.width / 2, dimensions.height / 2))
      .force("collide", forceCollide(40))
      .on("tick", () => {
        setNodes([...graphNodes]);
        setLinks([...graphLinks]);
      });

    simRef.current = sim;

    return () => {
      sim.stop();
    };
  }, [people, relationships, dimensions.width, dimensions.height]);

  // Zoom & pan
  useEffect(() => {
    if (!svgRef.current) return;

    const svgEl = select(svgRef.current);
    const zoomBehavior = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => {
        setTransform({
          x: event.transform.x,
          y: event.transform.y,
          k: event.transform.k,
        });
      });

    svgEl.call(zoomBehavior);
    svgEl.on("dblclick.zoom", null);

    return () => {
      svgEl.on(".zoom", null);
    };
  }, []);

  // Node dragging
  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const sim = simRef.current;
    if (!sim) return;

    const dragBehavior = d3Drag<SVGGElement, GraphNode>()
      .clickDistance(4)
      .on("start", (event, d) => {
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    const nodeElements = select(svgRef.current)
      .selectAll<SVGGElement, GraphNode>(".graph-node");

    // Bind data to React-created DOM elements by matching order
    nodeElements.each(function (_, i) {
      select(this).datum(nodes[i]);
    });

    nodeElements.call(dragBehavior);
  }, [nodes]);

  const handleNodeClick = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      onSelectPerson(id);
    },
    [onSelectPerson],
  );

  if (people.length === 0) return null;

  if (people.length === 1) {
    return (
      <div className="people-graph-container">
        <div className="graph-single-node" onClick={() => onSelectPerson(people[0].id)}>
          <div className="graph-single-circle" />
          <span>{people[0].name}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="people-graph-container">
      <svg
        ref={svgRef}
        className="people-graph-svg"
        width={dimensions.width}
        height={dimensions.height}
      >
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {/* Links */}
          {links.map((link) => {
            const source = link.source as GraphNode;
            const target = link.target as GraphNode;
            if (source.x == null || source.y == null || target.x == null || target.y == null) return null;
            return (
              <line
                key={link.id}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke="#D4A56A"
                strokeWidth={2}
                strokeOpacity={0.7}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            if (node.x == null || node.y == null) return null;
            return (
              <g
                key={node.id}
                className="graph-node"
                transform={`translate(${node.x},${node.y})`}
                onClick={(e) => handleNodeClick(e, node.id)}
                style={{ cursor: "grab" }}
              >
                <circle r={node.radius} fill={node.color} stroke="#fff" strokeWidth={2} />
                <text
                  dy={node.radius + 14}
                  textAnchor="middle"
                  className="graph-node-label"
                >
                  {node.name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
