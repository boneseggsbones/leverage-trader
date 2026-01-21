import React, { useState, useEffect } from 'react';
import { Item } from '../types';

interface EditItemModalProps {
    show: boolean;
    onClose: () => void;
    onEditItem: (item: { name: string; description: string; image: File | null, estimatedMarketValueDollars: number, condition?: string }) => void;
    item: Item | null;
}

const CONDITION_GRADES = [
    { value: 'MINT', label: 'Mint (M)', description: 'Perfect, like new' },
    { value: 'NEAR_MINT', label: 'Near Mint (NM)', description: 'Almost perfect, minor wear' },
    { value: 'EXCELLENT', label: 'Excellent (EX)', description: 'Light wear, fully functional' },
    { value: 'VERY_GOOD', label: 'Very Good (VG)', description: 'Moderate wear, complete' },
    { value: 'GOOD', label: 'Good (G)', description: 'Notable wear, plays/works fine' },
    { value: 'FAIR', label: 'Fair (F)', description: 'Heavy wear, still functional' },
    { value: 'POOR', label: 'Poor (P)', description: 'Major issues, for parts/repair' },
    { value: 'GRADED', label: 'Professionally Graded', description: 'PSA/CGC/BGS etc.' },
];

const EditItemModal: React.FC<EditItemModalProps> = ({ show, onClose, onEditItem, item }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [image, setImage] = useState<File | null>(null);
    const [estimatedMarketValue, setEstimatedMarketValue] = useState<number>(0);
    const [condition, setCondition] = useState<string>('GOOD');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (item) {
            setName(item.name);
            setDescription((item as any).description || '');
            setEstimatedMarketValue((item as any).estimatedMarketValue ? (item as any).estimatedMarketValue / 100 : 0);
            setCondition((item as any).condition || 'GOOD');
        }
    }, [item]);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setImage(e.target.files[0]);
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

    return (
        <div className="fixed z-10 inset-0 overflow-y-auto">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div className="fixed inset-0 transition-opacity" aria-hidden="true">
                    <div className="absolute inset-0 bg-gray-500 dark:bg-gray-900 opacity-75"></div>
                </div>
                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                    <form onSubmit={handleSubmit}>
                        <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">Edit Item</h3>
                            <div className="mt-2">
                                <div className="mb-4">
                                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
                                    <input type="text" name="name" id="name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md" />
                                </div>
                                <div>
                                    <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                                    <textarea name="description" id="description" value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md"></textarea>
                                </div>
                                <div className="mt-4">
                                    <label htmlFor="image" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Image</label>
                                    <input type="file" name="image" id="image" onChange={handleImageChange} className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 dark:border-gray-600 dark:text-gray-300 rounded-md" />
                                </div>
                                <div className="mt-4">
                                    <label htmlFor="condition" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Condition</label>
                                    <select
                                        name="condition"
                                        id="condition"
                                        value={condition}
                                        onChange={(e) => setCondition(e.target.value)}
                                        className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md"
                                    >
                                        {CONDITION_GRADES.map((grade) => (
                                            <option key={grade.value} value={grade.value}>
                                                {grade.label} — {grade.description}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="mt-4">
                                    <label htmlFor="estimatedMarketValue" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Estimated Value (USD)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        name="estimatedMarketValue"
                                        id="estimatedMarketValue"
                                        value={estimatedMarketValue}
                                        onChange={(e) => setEstimatedMarketValue(parseFloat(e.target.value) || 0)}
                                        className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md"
                                        placeholder="0.00"
                                    />
                                    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
                                </div>
                            </div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                            <button type="submit" className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm">
                                Save
                            </button>
                            <button type="button" onClick={onClose} className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-600 text-base font-medium text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default EditItemModal;
