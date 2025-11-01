import React from 'react';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    children: React.ReactNode;
    confirmButtonText?: string;
    confirmButtonClass?: string;
    cancelButtonText?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ 
    isOpen, 
    onClose, 
    onConfirm, 
    title, 
    children,
    confirmButtonText = 'Confirm',
    confirmButtonClass = 'bg-red-600 hover:bg-red-700',
    cancelButtonText = 'Cancel'
}) => {
    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center"
            onClick={onClose} // Close on backdrop click
        >
            <div 
                className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md m-4 transform transition-all"
                onClick={e => e.stopPropagation()} // Prevent modal close when clicking inside
            >
                <h3 className="text-lg font-bold text-slate-800 mb-4">{title}</h3>
                <div className="text-slate-600 mb-6">
                    {children}
                </div>
                <div className="flex justify-end gap-4">
                    <button 
                        onClick={onClose}
                        className="px-6 py-2 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-md transition-colors"
                    >
                        {cancelButtonText}
                    </button>
                    <button 
                        onClick={onConfirm}
                        className={`px-6 py-2 text-sm font-semibold text-white rounded-md transition-colors shadow-sm ${confirmButtonClass}`}
                    >
                        {confirmButtonText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;