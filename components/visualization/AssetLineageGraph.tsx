
import React, { useState, useEffect, useMemo } from 'react';
import ReactFlow, { MiniMap, Controls, Background, Node, Edge } from 'reactflow';
import dagre from 'dagre';
import { Trade, Item } from '../../types';
import { transformTradesToGraph } from '../../src/utils/tradeGraphTransformer';
import AssetNode from './AssetNode';
import TradeEventNode from './TradeEventNode';

const nodeTypes = {
    asset: AssetNode,
    tradeEvent: TradeEventNode,
};

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: 'LR', ranksep: 150, nodesep: 100 });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: 150, height: 100 });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    nodes.forEach((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        node.position = {
            x: nodeWithPosition.x - 150 / 2,
            y: nodeWithPosition.y - 100 / 2,
        };

        return node;
    });

    return { nodes, edges };
};

interface AssetLineageGraphProps {
    trades: Trade[];
    userId: string;
    allItems: Map<string, Item>;
    onNodeClick: (data: any) => void;
}

const AssetLineageGraph: React.FC<AssetLineageGraphProps> = ({ trades, userId, allItems, onNodeClick }) => {
    const { nodes: initialNodes, edges: initialEdges } = useMemo(() => transformTradesToGraph(trades, userId, allItems), [trades, userId, allItems]);
    const { nodes, edges } = getLayoutedElements(initialNodes, initialEdges);

    return (
        <ReactFlow
            nodes={nodes}
            edges={initialEdges.map(edge => ({
                ...edge,
                type: 'smoothstep',
                animated: true,
            }))}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => onNodeClick(node.data)}
            fitView
        >
            <Controls />
            <MiniMap />
            <Background />
        </ReactFlow>
    );
};

export default AssetLineageGraph;
