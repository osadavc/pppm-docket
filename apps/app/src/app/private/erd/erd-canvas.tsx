"use client";

import dagre from "@dagrejs/dagre";
import {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "next-themes";
import { useMemo } from "react";

export type ErdColumn = {
  name: string;
  type: string;
  primaryKey: boolean;
  notNull: boolean;
  unique: boolean;
  references: { table: string; column: string } | null;
};

export type ErdTable = { name: string; columns: ErdColumn[] };

type TableNode = Node<{ table: ErdTable }, "table">;

const NODE_WIDTH = 300;
const HEADER_HEIGHT = 34;
const ROW_HEIGHT = 24;

function TableCard({ data }: NodeProps<TableNode>) {
  const { table } = data;
  return (
    <div
      className="rounded-md border border-border bg-card font-mono text-[11px] text-card-foreground shadow-sm"
      style={{ width: NODE_WIDTH }}
    >
      <div
        className="flex items-center rounded-t-md border-b border-border bg-muted px-3 font-semibold text-xs"
        style={{ height: HEADER_HEIGHT }}
      >
        {table.name}
      </div>
      {table.columns.map((col) => (
        <div
          key={col.name}
          className="relative flex items-center gap-2 px-3"
          style={{ height: ROW_HEIGHT }}
        >
          <Handle
            type="target"
            id={`${col.name}-in`}
            position={Position.Left}
            className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-muted-foreground"
          />
          <span className="w-6 shrink-0 text-[9px] font-semibold text-muted-foreground">
            {col.primaryKey ? "PK" : col.references ? "FK" : col.unique ? "UQ" : ""}
          </span>
          <span className={col.primaryKey ? "font-semibold" : undefined}>
            {col.name}
          </span>
          <span className="ml-auto truncate text-muted-foreground">
            {col.type}
            {col.notNull ? "" : "?"}
          </span>
          <Handle
            type="source"
            id={`${col.name}-out`}
            position={Position.Right}
            className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-muted-foreground"
          />
        </div>
      ))}
    </div>
  );
}

const nodeTypes = { table: TableCard };

function buildGraph(tables: ErdTable[]) {
  // Edges run from the referenced table (left) into the FK column of the
  // dependent table (right), so the layout reads parent → child.
  const edges: Edge[] = tables.flatMap((table) =>
    table.columns
      .filter((col) => col.references)
      .map((col) => ({
        id: `${table.name}.${col.name}`,
        source: col.references!.table,
        sourceHandle: `${col.references!.column}-out`,
        target: table.name,
        targetHandle: `${col.name}-in`,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        style: { strokeWidth: 1.25 },
      })),
  );

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 50, ranksep: 220 });
  g.setDefaultEdgeLabel(() => ({}));

  const heightOf = (t: ErdTable) => HEADER_HEIGHT + t.columns.length * ROW_HEIGHT;
  for (const t of tables) {
    g.setNode(t.name, { width: NODE_WIDTH, height: heightOf(t) });
  }
  for (const e of edges) {
    if (e.source !== e.target) g.setEdge(e.source, e.target);
  }
  dagre.layout(g);

  const nodes: TableNode[] = tables.map((t) => {
    const { x, y } = g.node(t.name);
    return {
      id: t.name,
      type: "table",
      position: { x: x - NODE_WIDTH / 2, y: y - heightOf(t) / 2 },
      data: { table: t },
    };
  });

  return { nodes, edges };
}

export function ErdCanvas({ tables }: { tables: ErdTable[] }) {
  const { resolvedTheme } = useTheme();
  const { nodes, edges } = useMemo(() => buildGraph(tables), [tables]);

  return (
    <div className="fixed inset-0 bg-background">
      <ReactFlow
        defaultNodes={nodes}
        defaultEdges={edges}
        nodeTypes={nodeTypes}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        fitView
        minZoom={0.05}
        maxZoom={2}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}
