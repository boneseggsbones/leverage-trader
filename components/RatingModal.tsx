import React, { useState } from 'react';
import { Trade, TradeRating } from '../types';
import { useAuth } from '../context/AuthContext';

interface RatingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (formData: Omit<TradeRating, 'id' | 'tradeId' | 'raterId' | 'rateeId' | 'createdAt' | 'isRevealed'>) => void;
    trade: Trade;
    isSubmitting: boolean;
}

const StarRating: React.FC<{ count: number; value: number; onChange: (value: number) => void }> = ({ count, value, onChange }) => {
    return (
        <div className="flex items-center">
            {[...Array(count)].map((_, i) => {
                const ratingValue = i + 1;
                return (
                    <button
                        type="button"
                        key={i}
                        className={`text-3xl transition-colors ${ratingValue <= value ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-200'}`}
                        onClick={() => onChange(ratingValue)}
                    >
                        ★
                    </button>
                );
            })}
        </div>
    );
};


const RatingModal: React.FC<RatingModalProps> = ({ isOpen, onClose, onSubmit, trade, isSubmitting }) => {
    const { currentUser } = useAuth();
    const [overallScore, setOverallScore] = useState(0);
    const [itemAccuracyScore, setItemAccuracyScore] = useState(0);
    const [communicationScore, setCommunicationScore] = useState(0);
    const [shippingSpeedScore, setShippingSpeedScore] = useState(0);
    const [publicComment, setPublicComment] = useState('');
    const [privateFeedback, setPrivateFeedback] = useState('');

    if (!isOpen || !currentUser) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (overallScore === 0 || isSubmitting) return;
        onSubmit({
            overallScore,
            itemAccuracyScore,
            communicationScore,
            shippingSpeedScore,
            publicComment: publicComment.trim() || null,
            privateFeedback: privateFeedback.trim() || null,
        });
    };

    const isFormInvalid = overallScore === 0;

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center"
            onClick={onClose}
        >
            <div 
                className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl m-4 transform transition-all"
                onClick={e => e.stopPropagation()}
            >
                <form onSubmit={handleSubmit}>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Leave Feedback</h3>
                    <p className="text-sm text-slate-500 mb-6">Your feedback will be hidden until the other party leaves theirs.</p>

                    <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
                        <div className="flex justify-between items-center">
                            <label className="text-md font-medium text-gray-700">Overall Experience*</label>
                            <StarRating count={5} value={overallScore} onChange={setOverallScore} />
                        </div>
                        <div className="flex justify-between items-center">
                            <label className="text-md font-medium text-gray-700">Item Accuracy</label>
                            <StarRating count={5} value={itemAccuracyScore} onChange={setItemAccuracyScore} />
                        </div>
                        <div className="flex justify-between items-center">
                            <label className="text-md font-medium text-gray-700">Communication</label>
                            <StarRating count={5} value={communicationScore} onChange={setCommunicationScore} />
                        </div>
                        <div className="flex justify-between items-center">
                            <label className="text-md font-medium text-gray-700">Shipping Speed</label>
                            <StarRating count={5} value={shippingSpeedScore} onChange={setShippingSpeedScore} />
                        </div>

                        <div>
                            <label htmlFor="publicComment" className="block text-sm font-medium text-gray-700 mb-1">Public Comment (Optional)</label>
                             <textarea 
                                id="publicComment"
                                value={publicComment}
                                onChange={e => setPublicComment(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                                rows={3}
                                placeholder="Describe your experience. This will be visible on the user's profile."
                            />
                        </div>

                        <div>
                            <label htmlFor="privateFeedback" className="block text-sm font-medium text-gray-700 mb-1">Private Feedback (Optional)</label>
                             <textarea 
                                id="privateFeedback"
                                value={privateFeedback}
                                onChange={e => setPrivateFeedback(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                                rows={2}
                                placeholder="This feedback is only visible to Leverage moderators."
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-4 mt-8 pt-4 border-t border-gray-200">
                        <button 
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-md transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit"
                            disabled={isFormInvalid || isSubmitting}
                            className="px-6 py-2 text-sm font-semibold text-white rounded-md transition-colors shadow-sm bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? 'Submitting...' : 'Submit Rating'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default RatingModal;
