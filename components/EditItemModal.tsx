import React, { useState, useEffect } from 'react';
import { Item } from '../types';

interface EditItemModalProps {
    show: boolean;
    onClose: () => void;
    onEditItem: (item: { name: string; description: string; image: File | null, estimatedMarketValueDollars: number, condition?: string }) => void;
    item: Item | null;
}

const CONDITION_GRADES = [
    { value: 'MINT', label: 'Mint', icon: '💎', description: 'Perfect, like new' },
    { value: 'NEAR_MINT', label: 'Near Mint', icon: '✨', description: 'Almost perfect, minor wear' },
    { value: 'EXCELLENT', label: 'Excellent', icon: '⭐', description: 'Light wear, fully functional' },
    { value: 'VERY_GOOD', label: 'Very Good', icon: '👍', description: 'Moderate wear, complete' },
    { value: 'GOOD', label: 'Good', icon: '👌', description: 'Notable wear, plays/works fine' },
    { value: 'FAIR', label: 'Fair', icon: '🔧', description: 'Heavy wear, still functional' },
    { value: 'POOR', label: 'Poor', icon: '⚠️', description: 'Major issues, for parts/repair' },
    { value: 'GRADED', label: 'Graded', icon: '🏆', description: 'Professionally certified' },
];

const EditItemModal: React.FC<EditItemModalProps> = ({ show, onClose, onEditItem, item }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [image, setImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [estimatedMarketValue, setEstimatedMarketValue] = useState<number>(0);
    const [condition, setCondition] = useState<string>('GOOD');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (item) {
            setName(item.name);
            setDescription((item as any).description || '');
            setEstimatedMarketValue((item as any).estimatedMarketValue ? (item as any).estimatedMarketValue / 100 : 0);
            setCondition((item as any).condition || 'GOOD');
            // Set image preview if item has an image
            if ((item as any).imageUrl) {
                setImagePreview((item as any).imageUrl);
            }
        }
    }, [item]);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImage(file);
            // Create preview URL
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (estimatedMarketValue < 0) {
            setError('Estimated value must be 0 or greater');
            return;
        }
        onEditItem({ name, description, image, estimatedMarketValueDollars: estimatedMarketValue, condition });
    };

    if (!show) {
        return null;
    }

    const selectedCondition = CONDITION_GRADES.find(g => g.value === condition);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="relative bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900 px-6 pt-6 pb-6">
                    <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-all">✕</button>

                    <div className="flex flex-col items-center text-center">
                        {/* Image Preview */}
                        <div className="relative group mb-4">
                            <div className="w-24 h-24 rounded-2xl overflow-hidden bg-slate-700 shadow-xl ring-2 ring-white/10 flex items-center justify-center">
                                {imagePreview ? (
                                    <img src={imagePreview} alt={name} className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-4xl">📦</span>
                                )}
                            </div>
                            {/* Upload overlay */}
                            <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 rounded-2xl cursor-pointer transition-opacity">
                                <span className="text-white text-xs font-medium">Change</span>
                                <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                            </label>
                        </div>

                        <h2 className="text-white text-xl font-semibold">Edit Item</h2>
                        <p className="text-white/60 text-sm mt-1">Update your item details</p>
                    </div>
                </div>

                {/* Form Content */}
                <form onSubmit={handleSubmit}>
                    <div className="p-6 space-y-5">
                        {/* Name Field */}
                        <div>
                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                placeholder="Item name"
                            />
                        </div>

                        {/* Description Field */}
                        <div>
                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Description</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={2}
                                className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                                placeholder="Add a description..."
                            />
                        </div>

                        {/* Condition Selector */}
                        <div>
                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Condition</label>
                            <div className="relative">
                                <select
                                    value={condition}
                                    onChange={(e) => setCondition(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all appearance-none cursor-pointer"
                                >
                                    {CONDITION_GRADES.map((grade) => (
                                        <option key={grade.value} value={grade.value}>
                                            {grade.icon} {grade.label} — {grade.description}
                                        </option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>
                            {selectedCondition && (
                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                    <span>{selectedCondition.icon}</span>
                                    <span>{selectedCondition.description}</span>
                                </p>
                            )}
                        </div>

                        {/* Value Field */}
                        <div>
                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Estimated Value</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-medium">$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={estimatedMarketValue || ''}
                                    onChange={(e) => setEstimatedMarketValue(parseFloat(e.target.value) || 0)}
                                    className="w-full pl-8 pr-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                    placeholder="0.00"
                                />
                            </div>
                            {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="px-6 pb-6 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 px-4 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium hover:from-blue-600 hover:to-blue-700 shadow-lg shadow-blue-500/25 transition-all"
                        >
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EditItemModal;
