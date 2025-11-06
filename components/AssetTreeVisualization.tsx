
import React, { useMemo } from 'react';
import ReactFlow, { MiniMap, Controls, Background, Node, Edge, Position } from 'reactflow';
import 'reactflow/dist/style.css';
import { Trade, Item } from '../types';
import { formatCurrency } from '../utils/currency';

interface AssetTreeVisualizationProps {
    trades: Trade[];
    userId: string;
    allItems: Map<string, Item>;
}

const ItemNode = ({ data }: { data: any }) => (
    <div style={{ background: '#fff', border: '1px solid #ddd', padding: 10, borderRadius: 5 }}>
        <div style={{ fontWeight: 'bold' }}>{data.label}</div>
        <div style={{ fontSize: 12, color: '#555' }}>{formatCurrency(data.value)}</div>
    </div>
);

const TradeNode = ({ data }: { data: any }) => (
    <div style={{ background: '#f0f0f0', border: '1px solid #ccc', padding: 10, borderRadius: 5 }}>
        <div style={{ fontWeight: 'bold' }}>{data.label}</div>
    </div>
);

const nodeTypes = {
    item: ItemNode,
    trade: TradeNode,
};

const transformTradesToGraph = (trades: Trade[], userId: string, allItems: Map<string, Item>): { nodes: Node[], edges: Edge[] } => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const itemNodeMap = new Map<string, string>();
    let y = 0;

    // Create initial nodes for all items
    allItems.forEach(item => {
        if (item.ownerId === userId) {
            const nodeId = `item-${item.id}`;
            nodes.push({
                id: nodeId,
                data: { label: item.name, value: item.estimatedMarketValue },
                position: { x: 0, y: y },
                type: 'item',
                sourcePosition: Position.Right,
                targetPosition: Position.Left,
            });
            itemNodeMap.set(item.id, nodeId);
            y += 100;
        }
    });

    let x = 300;
    trades.forEach(trade => {
        const tradeId = `trade-${trade.id}`;
        const otherParty = trade.proposerId === userId ? allItems.get(trade.receiverItemIds[0])?.ownerId : trade.proposerId;
        nodes.push({
            id: tradeId,
            data: { label: `Trade with ${otherParty}` },
            position: { x: x, y: y / 2 },
            type: 'trade',
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
        });

        const itemsGiven = trade.proposerId === userId ? trade.proposerItemIds : trade.receiverItemIds;
        const itemsReceived = trade.proposerId === userId ? trade.receiverItemIds : trade.proposerItemIds;

        itemsGiven.forEach(itemId => {
            const itemNodeId = itemNodeMap.get(itemId);
            if (itemNodeId) {
                edges.push({ id: `${itemNodeId}-${tradeId}`, source: itemNodeId, target: tradeId, animated: true, style: { stroke: '#f6ad55' } });
            }
        });

        itemsReceived.forEach(itemId => {
            const itemNodeId = `item-${itemId}`;
            if (!itemNodeMap.has(itemId)) {
                const item = allItems.get(itemId);
                if (item) {
                    nodes.push({
                        id: itemNodeId,
                        data: { label: item.name, value: item.estimatedMarketValue },
                        position: { x: x + 300, y: y / 2 },
                        type: 'item',
                        sourcePosition: Position.Right,
                        targetPosition: Position.Left,
                    });
                    itemNodeMap.set(itemId, itemNodeId);
                }
            }
            edges.push({ id: `${tradeId}-${itemNodeId}`, source: tradeId, target: itemNodeId, animated: true, style: { stroke: '#48bb78' } });
        });
        x += 300;
    });

    return { nodes, edges };
};

const AssetTreeVisualization: React.FC<AssetTreeVisualizationProps> = ({ trades, userId, allItems }) => {
    const { nodes, edges } = useMemo(() => transformTradesToGraph(trades, userId, allItems), [trades, userId, allItems]);

    return (
        <div style={{ height: 500 }}>
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView>
                <MiniMap />
                <Controls />
                <Background />
            </ReactFlow>
        </div>
    );
};

export default AssetTreeVisualization;
