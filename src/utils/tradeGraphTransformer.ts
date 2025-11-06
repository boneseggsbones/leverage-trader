
import { Trade, Item } from '../../types';
import { Node, Edge } from 'reactflow';

export const transformTradesToGraph = (trades: Trade[], currentUserId: string, allItems: Map<string, Item>): { nodes: Node[], edges: Edge[] } => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const assetLineageTracker = new Map<string, string>();

    // Sort trades chronologically
    const sortedTrades = trades.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    sortedTrades.forEach(trade => {
        const wasProposer = trade.proposerId === currentUserId;
        // These surplus and vrs change properties do not exist on the trade object.
        // I will calculate them manually.
        const itemsGiven = wasProposer ? trade.proposerItemIds : trade.receiverItemIds;
        const itemsReceived = wasProposer ? trade.receiverItemIds : trade.proposerItemIds;
        const cashGiven = wasProposer ? trade.proposerCash : trade.receiverCash;
        const cashReceived = wasProposer ? trade.receiverCash : trade.proposerCash;

        const valueGiven = itemsGiven.reduce((acc, itemId) => acc + (allItems.get(itemId)?.estimatedMarketValue || 0), 0) + cashGiven;
        const valueReceived = itemsReceived.reduce((acc, itemId) => acc + (allItems.get(itemId)?.estimatedMarketValue || 0), 0) + cashReceived;

        const netSurplusChange = valueReceived - valueGiven;
        
        // This is a placeholder for VRS change calculation.
        const vrsChange = 0;


        const tradeNodeId = `trade-${trade.id}`;
        nodes.push({
            id: tradeNodeId,
            data: { surplus: netSurplusChange, vrs: vrsChange, date: trade.updatedAt, tradeId: trade.id },
            position: { x: 0, y: 0 }, // Position will be calculated by layout
            type: 'tradeEvent',
        });

        itemsGiven.forEach(itemId => {
            const previousNodeId = assetLineageTracker.get(itemId);
            if (previousNodeId) {
                const previousNode = nodes.find(n => n.id === previousNodeId);
                if (previousNode) {
                    previousNode.data.isCurrent = false;
                }
                edges.push({ id: `${previousNodeId}-${tradeNodeId}`, source: previousNodeId, target: tradeNodeId });
            } else {
                const rootNodeId = `root-${itemId}-${trade.id}`;
                const item = allItems.get(itemId);
                if (item) {
                    nodes.push({
                        id: rootNodeId,
                        data: { label: item.name, value: item.estimatedMarketValue, isRoot: true, isCurrent: false, imageUrl: item.imageUrl },
                        position: { x: 0, y: 0 },
                        type: 'asset',
                    });
                    edges.push({ id: `${rootNodeId}-${tradeNodeId}`, source: rootNodeId, target: tradeNodeId });
                    assetLineageTracker.set(itemId, rootNodeId);
                }
            }
        });

        itemsReceived.forEach(itemId => {
            const newNodeId = `asset-${itemId}-${trade.id}`;
            const item = allItems.get(itemId);
            if (item) {
                nodes.push({
                    id: newNodeId,
                    data: { label: item.name, value: item.estimatedMarketValue, isRoot: false, isCurrent: true, imageUrl: item.imageUrl },
                    position: { x: 0, y: 0 },
                    type: 'asset',
                });
                edges.push({ id: `${tradeNodeId}-${newNodeId}`, source: tradeNodeId, target: newNodeId });
                assetLineageTracker.set(itemId, newNodeId);
            }
        });
    });

    return { nodes, edges };
};
