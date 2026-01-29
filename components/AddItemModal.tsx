import React, { useState, useRef } from 'react';

interface AddItemModalProps {
    show: boolean;
    onClose: () => void;
    onAddItem: (item: { name: string; description: string; image: File | null, condition: string, category: string }) => void;
}

const CONDITION_GRADES = [
    { value: 'MINT', label: 'Mint', emoji: '✨' },
    { value: 'NEAR_MINT', label: 'Near Mint', emoji: '🌟' },
    { value: 'EXCELLENT', label: 'Excellent', emoji: '👍' },
    { value: 'VERY_GOOD', label: 'Very Good', emoji: '👌' },
    { value: 'GOOD', label: 'Good', emoji: '✓' },
    { value: 'FAIR', label: 'Fair', emoji: '📦' },
    { value: 'POOR', label: 'Poor', emoji: '⚠️' },
    { value: 'GRADED', label: 'Graded', emoji: '🏆' },
];

const ITEM_CATEGORIES = [
    { value: 'tcg', label: 'Trading Cards', emoji: '🃏', color: 'from-violet-500 to-purple-600' },
    { value: 'sneakers', label: 'Sneakers', emoji: '👟', color: 'from-orange-500 to-red-500' },
    { value: 'video_games', label: 'Video Games', emoji: '🎮', color: 'from-emerald-500 to-teal-600' },
    { value: 'collectibles', label: 'Collectibles', emoji: '🏆', color: 'from-amber-500 to-yellow-500' },
    { value: 'other', label: 'Other', emoji: '📦', color: 'from-slate-500 to-gray-600' },
];

const AddItemModal: React.FC<AddItemModalProps> = ({ show, onClose, onAddItem }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [image, setImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [condition, setCondition] = useState<string>('GOOD');
    const [category, setCategory] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

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
        onAddItem({ name, description, image, condition, category });
        // Reset form
        setName('');
        setDescription('');
        setImage(null);
        setImagePreview(null);
        setCondition('GOOD');
        setCategory('');
    };

    const removeImage = () => {
        setImage(null);
        setImagePreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    if (!show) {
        return null;
    }

    return (
        <div className="fixed z-50 inset-0 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen p-4">
                {/* Backdrop */}
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

                {/* Modal */}
                <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                    <form onSubmit={handleSubmit}>
                        {/* Header */}
                        <div className="relative bg-gradient-to-br from-emerald-500 to-teal-600 px-6 pt-6 pb-8">
                            <button
                                type="button"
                                onClick={onClose}
                                className="absolute top-4 right-4 text-white/60 hover:text-white text-xl transition-colors"
                            >
                                ✕
                            </button>
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl backdrop-blur-sm">
                                    ✨
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white">Add New Item</h3>
                                    <p className="text-white/70 text-sm">Add something to your collection</p>
                                </div>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-5">
                            {/* Name Input */}
                            <div>
                                <label htmlFor="name" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                                    What is it?
                                </label>
                                <input
                                    type="text"
                                    name="name"
                                    id="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g., Charizard VMAX, Jordan 1 Retro..."
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-gray-700 border-0 rounded-xl text-slate-800 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 transition-all"
                                />
                            </div>

                            {/* Category Tiles */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                                    Category
                                </label>
                                <div className="grid grid-cols-5 gap-2">
                                    {ITEM_CATEGORIES.map((cat) => (
                                        <button
                                            key={cat.value}
                                            type="button"
                                            onClick={() => setCategory(cat.value)}
                                            className={`
                                                flex flex-col items-center justify-center p-3 rounded-xl transition-all
                                                ${category === cat.value
                                                    ? `bg-gradient-to-br ${cat.color} text-white shadow-lg scale-105`
                                                    : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-gray-600'
                                                }
                                            `}
                                        >
                                            <span className="text-xl mb-1">{cat.emoji}</span>
                                            <span className="text-[10px] font-medium leading-tight text-center">{cat.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Image Upload */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                                    Photo
                                </label>
                                {imagePreview ? (
                                    <div className="relative">
                                        <img
                                            src={imagePreview}
                                            alt="Preview"
                                            className="w-full h-32 object-cover rounded-xl"
                                        />
                                        <button
                                            type="button"
                                            onClick={removeImage}
                                            className="absolute top-2 right-2 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full h-24 border-2 border-dashed border-slate-300 dark:border-gray-600 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:border-emerald-500 hover:text-emerald-500 transition-colors"
                                    >
                                        <span className="text-2xl mb-1">📷</span>
                                        <span className="text-sm">Tap to add photo</span>
                                    </button>
                                )}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageChange}
                                    className="hidden"
                                />
                            </div>

                            {/* Condition Pills */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                                    Condition
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {CONDITION_GRADES.map((grade) => (
                                        <button
                                            key={grade.value}
                                            type="button"
                                            onClick={() => setCondition(grade.value)}
                                            className={`
                                                px-3 py-1.5 rounded-full text-sm font-medium transition-all
                                                ${condition === grade.value
                                                    ? 'bg-emerald-500 text-white shadow-md'
                                                    : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-gray-600'
                                                }
                                            `}
                                        >
                                            {grade.emoji} {grade.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Description (collapsed/optional) */}
                            <div>
                                <label htmlFor="description" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                                    Notes <span className="font-normal text-slate-400">(optional)</span>
                                </label>
                                <textarea
                                    name="description"
                                    id="description"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Any details about this item..."
                                    rows={2}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-gray-700 border-0 rounded-xl text-slate-800 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 transition-all resize-none"
                                />
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 pb-6 pt-2 flex gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-3 px-4 rounded-xl font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={!name.trim()}
                                className="flex-1 py-3 px-4 rounded-xl font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                                Add Item →
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default AddItemModal;
