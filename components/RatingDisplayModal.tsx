import React from 'react';
import { Trade, TradeRating, User } from '../types';

interface RatingDisplayModalProps {
    isOpen: boolean;
    onClose: () => void;
    ratings: TradeRating[];
    trade: Trade | null;
    currentUser: User | null;
    otherUser: User | null;
}

const StarDisplay: React.FC<{ value: number }> = ({ value }) => {
    return (
        <div className="flex items-center text-xl">
            {[...Array(5)].map((_, i) => (
                <span key={i} className={i < value ? 'text-yellow-400' : 'text-gray-300'}>★</span>
            ))}
        </div>
    );
};

const RatingCard: React.FC<{ title: string; rating: TradeRating | undefined }> = ({ title, rating }) => {
    return (
        <div className="flex-1 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
            <h4 className="font-bold text-lg text-gray-800 dark:text-white mb-4">{title}</h4>
            {rating ? (
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <span className="font-medium text-gray-700 dark:text-gray-300">Overall:</span>
                        <StarDisplay value={rating.overallScore} />
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="font-medium text-gray-700 dark:text-gray-300">Item Accuracy:</span>
                        <StarDisplay value={rating.itemAccuracyScore} />
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="font-medium text-gray-700 dark:text-gray-300">Communication:</span>
                        <StarDisplay value={rating.communicationScore} />
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="font-medium text-gray-700 dark:text-gray-300">Shipping Speed:</span>
                        <StarDisplay value={rating.shippingSpeedScore} />
                    </div>
                    {rating.publicComment && (
                        <div className="pt-2">
                            <p className="font-medium text-gray-700 dark:text-gray-300 text-sm">Public Comment:</p>
                            <p className="text-gray-600 dark:text-gray-400 italic mt-1 text-sm bg-white dark:bg-gray-600 p-2 rounded-md">"{rating.publicComment}"</p>
                        </div>
                    )}
                </div>
            ) : (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">No rating was submitted.</p>
            )}
        </div>
    );
};

const RatingDisplayModal: React.FC<RatingDisplayModalProps> = ({ isOpen, onClose, ratings, trade, currentUser, otherUser }) => {
    if (!isOpen || !trade || !currentUser || !otherUser) return null;

    const myRating = ratings.find(r => r.raterId === currentUser.id);
    const theirRating = ratings.find(r => r.raterId === otherUser.id);

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-3xl m-4 transform transition-all"
                onClick={e => e.stopPropagation()}
            >
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Trade Feedback</h3>
                <p className="text-sm text-slate-500 dark:text-gray-400 mb-6">Ratings for your trade with {otherUser.name}.</p>

                <div className="flex flex-col md:flex-row gap-4">
                    <RatingCard title={`Your rating of ${otherUser.name}`} rating={myRating} />
                    <RatingCard title={`${otherUser.name}'s rating of you`} rating={theirRating} />
                </div>

                <div className="flex justify-end mt-8">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 text-sm font-semibold text-white rounded-md transition-colors shadow-sm bg-blue-600 hover:bg-blue-700"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RatingDisplayModal;
