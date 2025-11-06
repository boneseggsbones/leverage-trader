
import React from 'react';
import { Handle, Position } from 'reactflow';
import { formatCurrency } from '../../utils/currency';

const AssetNode = ({ data }: { data: any }) => {
    const isCurrentClass = data.isCurrent ? 'ring-2 ring-blue-500' : 'opacity-60';
    const isRootClass = data.isRoot ? 'border-dashed' : '';

    return (
        <div className={`bg-white p-2 rounded-lg border ${isCurrentClass} ${isRootClass}`}>
            <Handle type="target" position={Position.Left} />
            <div className="flex items-center">
                <div className="w-12 h-12 mr-2">
                    <img src={data.imageUrl} alt={data.label} className="w-full h-full object-cover rounded-md" />
                </div>
                <div>
                    <div className="font-bold">{data.label}</div>
                    <div className="text-sm text-gray-500">{formatCurrency(data.value)}</div>
                </div>
            </div>
            {data.isRoot && <div className="text-xs text-center text-gray-500 mt-1">Initial</div>}
            <Handle type="source" position={Position.Right} />
        </div>
    );
};

export default AssetNode;
