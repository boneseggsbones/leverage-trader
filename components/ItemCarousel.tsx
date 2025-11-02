import React from 'react';

interface ItemCarouselProps {
    title: string;
    children: React.ReactNode;
}

const ItemCarousel: React.FC<ItemCarouselProps> = ({ title, children }) => {
    const items = React.Children.toArray(children).filter(Boolean);

    return (
        <section>
            <h2 className="text-2xl font-bold text-gray-800 mb-4">{title}</h2>
            {items.length > 0 ? (
                <div className="flex space-x-6 overflow-x-auto pb-4 -mb-4">
                    {items.map((child, index) => (
                        <div key={index} className="flex-shrink-0 w-64">
                            {child}
                        </div>
                    ))}
                </div>
            ) : (
                 <div className="text-center py-10 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-gray-500">No items to display in this category.</p>
                </div>
            )}
        </section>
    );
};

export default ItemCarousel;
