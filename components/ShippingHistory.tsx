import React, { useState, useEffect } from 'react';
import './ShippingHistory.css';

interface ShipmentRecord {
    id: number;
    trade_id: string;
    carrier: string;
    service_level: string;
    amount_cents: number;
    label_url: string;
    tracking_number: string;
    status: string;
    created_at: string;
}

interface ShippingHistoryProps {
    userId: number;
    limit?: number;
}

const CARRIER_ICONS: Record<string, string> = {
    'USPS': '📫',
    'UPS': '📦',
    'FedEx': '✈️',
    'DHL': '🚀',
    'usps': '📫',
    'ups': '📦',
    'fedex': '✈️',
    'dhl_express': '🚀',
};

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
    'PENDING': { bg: 'bg-gray-100', text: 'text-gray-700', icon: '⏳' },
    'LABEL_CREATED': { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: '🏷️' },
    'IN_TRANSIT': { bg: 'bg-blue-100', text: 'text-blue-700', icon: '🚚' },
    'DELIVERED': { bg: 'bg-green-100', text: 'text-green-700', icon: '✅' },
    'EXCEPTION': { bg: 'bg-red-100', text: 'text-red-700', icon: '⚠️' },
};

export const ShippingHistory: React.FC<ShippingHistoryProps> = ({ userId, limit = 10 }) => {
    const [shipments, setShipments] = useState<ShipmentRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchShipments();
    }, [userId]);

    const fetchShipments = async () => {
        try {
            const response = await fetch(`/api/users/${userId}/shipments?limit=${limit}`);
            if (!response.ok) throw new Error('Failed to fetch shipments');
            const data = await response.json();
            setShipments(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="shipping-history-loading">
                <div className="loading-spinner"></div>
                <span>Loading shipping history...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="shipping-history-error">
                ⚠️ {error}
            </div>
        );
    }

    if (shipments.length === 0) {
        return (
            <div className="shipping-history-empty">
                <span className="empty-icon">📦</span>
                <p>No shipments yet</p>
                <span className="empty-note">Your shipping history will appear here</span>
            </div>
        );
    }

    return (
        <div className="shipping-history">
            <div className="shipping-history-header">
                <h3>📦 Shipping History</h3>
                <span className="shipment-count">{shipments.length} shipment{shipments.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="shipments-list">
                {shipments.map((shipment) => {
                    const carrierIcon = CARRIER_ICONS[shipment.carrier] || '📦';
                    const statusStyle = STATUS_STYLES[shipment.status] || STATUS_STYLES['PENDING'];
                    const date = new Date(shipment.created_at);

                    return (
                        <div key={shipment.id} className="shipment-card">
                            <div className="shipment-main">
                                <div className="carrier-section">
                                    <span className="carrier-icon">{carrierIcon}</span>
                                    <div className="carrier-info">
                                        <span className="carrier-name">{shipment.carrier}</span>
                                        <span className="service-level">{shipment.service_level}</span>
                                    </div>
                                </div>

                                <div className="tracking-section">
                                    <span className="tracking-label">Tracking</span>
                                    <code className="tracking-number">{shipment.tracking_number}</code>
                                </div>

                                <div className="status-section">
                                    <span className={`status-badge ${statusStyle.bg} ${statusStyle.text}`}>
                                        {statusStyle.icon} {shipment.status.replace(/_/g, ' ')}
                                    </span>
                                </div>

                                <div className="cost-section">
                                    <span className="cost">
                                        ${(shipment.amount_cents / 100).toFixed(2)}
                                    </span>
                                </div>
                            </div>

                            <div className="shipment-footer">
                                <span className="shipment-date">
                                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                                <div className="shipment-actions">
                                    <a
                                        href={shipment.label_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn-view-label"
                                    >
                                        📄 View Label
                                    </a>
                                    <a
                                        href={`https://www.google.com/search?q=${encodeURIComponent(`${shipment.carrier} tracking ${shipment.tracking_number}`)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn-track"
                                    >
                                        🔍 Track
                                    </a>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ShippingHistory;
