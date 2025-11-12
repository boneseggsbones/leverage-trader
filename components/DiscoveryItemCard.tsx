
import React from 'react';
import { Item, User } from '../types.ts';
import { useNavigate } from 'react-router-dom';
import { formatCurrencyOptional } from '../utils/currency.ts';

interface DiscoveryItemCardProps {
    item: Item;
    owner: User;
    onClick: () => void;
    isWishlisted: boolean;
    onToggleWishlist: () => void;
}

const DiscoveryItemCard: React.FC<DiscoveryItemCardProps> = ({ item, owner, onClick, isWishlisted, onToggleWishlist }) => {
    const navigate = useNavigate();
    const imageUrl = item.imageUrl && item.imageUrl.startsWith('/') ? `http://localhost:4000${item.imageUrl}` : item.imageUrl;

    const handleOwnerClick = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent the main card click
        navigate(`/profile/${owner.id}`);
    };

    const handleWishlistClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleWishlist();
    };

    return (
        <div 
            onClick={onClick}
            className="w-full text-left bg-white rounded-lg overflow-hidden border border-gray-200 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer"
        >
            <div className="h-40 bg-gray-100 relative">
                <img src={imageUrl} alt={item.name} className="w-full h-full object-cover" />
                <button 
                    onClick={handleWishlistClick}
                    className="absolute top-2 right-2 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors"
                    aria-label="Add to wishlist"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill={isWishlisted ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                </button>
            </div>
            <div className="p-4">
                <h3 className="font-bold text-gray-800 truncate">{item.name}</h3>
                <p className="text-sm text-gray-500">{formatCurrencyOptional(item.estimatedMarketValue ?? null)}</p>
                
                <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs text-gray-400">Owner</p>
                    <button onClick={handleOwnerClick} className="w-full text-left">
                        <div className="flex justify-between items-center">
                            <p className="text-sm font-semibold text-gray-700 hover:underline">{owner.name}</p>
                            <div className="text-sm">
                                <span title="Reputation Score" className="font-semibold text-blue-600">{owner.valuationReputationScore}</span> 
                                <span className="text-blue-400"> Rep</span>
                            </div>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DiscoveryItemCard;