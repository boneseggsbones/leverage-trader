
import React from 'react';
import { Handle, Position } from 'reactflow';
import { formatCurrency } from '../../utils/currency';

const TradeEventNode = ({ data }: { data: any }) => {
    const surplusColor = data.surplus > 0 ? 'bg-green-500' : data.surplus < 0 ? 'bg-red-500' : 'bg-gray-500';
    const vrsColor = data.vrs > 0 ? 'text-green-500' : data.vrs < 0 ? 'text-red-500' : 'text-gray-500';

    return (
        <div className={`w-48 h-48 rounded-full flex flex-col items-center justify-center text-white ${surplusColor}`}>
            <Handle type="target" position={Position.Left} />
            <div className="text-lg font-bold">{formatCurrency(data.surplus)}</div>
            <div className={`text-sm ${vrsColor}`}>{data.vrs > 0 ? `+${data.vrs}` : data.vrs} VRS</div>
            {data.vrs === -10 && <div className="text-red-200 text-xs mt-1">Warning!</div>}
            <div className="text-xs mt-2">{new Date(data.date).toLocaleDateString()}</div>
            <Handle type="source" position={Position.Right} />
        </div>
    );
};

export default TradeEventNode;
