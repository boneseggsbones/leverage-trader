
import React from 'react';
import { formatCurrency } from '../../utils/currency';
import { Trade, Item } from '../../types';

const GraphInspectorPanel = ({ selectedNodeData, trades, userId, allItems }: { selectedNodeData: any, trades: Trade[], userId: string, allItems: Map<string, Item> }) => {
    if (!selectedNodeData) {
        const totalNetSurplus = trades.reduce((acc, trade) => {
            const wasProposer = trade.proposerId === userId;
            const itemsGiven = wasProposer ? trade.proposerItemIds : trade.receiverItemIds;
            const itemsReceived = wasProposer ? trade.receiverItemIds : trade.proposerItemIds;
            const cashGiven = wasProposer ? trade.proposerCash : trade.receiverCash;
            const cashReceived = wasProposer ? trade.receiverCash : trade.proposerCash;

            const valueGiven = itemsGiven.reduce((acc, itemId) => acc + (allItems.get(itemId)?.estimatedMarketValue || 0), 0) + cashGiven;
            const valueReceived = itemsReceived.reduce((acc, itemId) => acc + (allItems.get(itemId)?.estimatedMarketValue || 0), 0) + cashReceived;

            return acc + (valueReceived - valueGiven);
        }, 0);

        const bestTrade = trades.reduce((max, trade) => {
            const wasProposer = trade.proposerId === userId;
            const itemsGiven = wasProposer ? trade.proposerItemIds : trade.receiverItemIds;
            const itemsReceived = wasProposer ? trade.receiverItemIds : trade.proposerItemIds;
            const cashGiven = wasProposer ? trade.proposerCash : trade.receiverCash;
            const cashReceived = wasProposer ? trade.receiverCash : trade.proposerCash;

            const valueGiven = itemsGiven.reduce((acc, itemId) => acc + (allItems.get(itemId)?.estimatedMarketValue || 0), 0) + cashGiven;
            const valueReceived = itemsReceived.reduce((acc, itemId) => acc + (allItems.get(itemId)?.estimatedMarketValue || 0), 0) + cashReceived;
            
            const netSurplusChange = valueReceived - valueGiven;

            return netSurplusChange > max ? netSurplusChange : max;
        }, 0);

        return (
            <div className="p-4 bg-gray-100 h-full">
                <h3 className="font-bold text-lg">Journey Statistics</h3>
                <p>Total Net Surplus: {formatCurrency(totalNetSurplus)}</p>
                <p>Best Trade: +{formatCurrency(bestTrade)}</p>
            </div>
        );
    }

    const { surplus, vrs, date, tradeId, label, value, isRoot, isCurrent } = selectedNodeData;

    return (
        <div className="p-4 bg-gray-100 h-full">
            {tradeId ? (
                <div>
                    <h3 className="font-bold text-lg">Trade Details</h3>
                    <p>Date: {new Date(date).toLocaleDateString()}</p>
                    <p>Net Surplus: {formatCurrency(surplus)}</p>
                    <p>VRS Change: {vrs}</p>
                    <a href={`/trade-history#${tradeId}`} className="text-blue-500 hover:underline">View Trade</a>
                </div>
            ) : (
                <div>
                    <h3 className="font-bold text-lg">Asset Details</h3>
                    <p>Name: {label}</p>
                    <p>Value: {formatCurrency(value)}</p>
                    <p>Status: {isCurrent ? 'Current' : 'Traded Away'}</p>
                    {isRoot && <p>Initial Asset</p>}
                </div>
            )}
        </div>
    );
};

export default GraphInspectorPanel;
