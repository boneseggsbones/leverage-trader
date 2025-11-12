import { User } from '../types';

const API_URL = 'http://localhost:4000/api';

export const fetchAllUsers = async (): Promise<User[]> => {
    const response = await fetch(`${API_URL}/users`);
    if (!response.ok) {
        throw new Error('Failed to fetch users');
    }
    return response.json();
};

export const fetchDashboardData = async (): Promise<any> => {
    const response = await fetch(`${API_URL}/dashboard`);
    if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
    }
    return response.json();
};

export const toggleWishlistItem = async (userId: number, itemId: number): Promise<User> => {
    const response = await fetch(`${API_URL}/wishlist/toggle`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, itemId }),
    });
    if (!response.ok) {
        throw new Error('Failed to toggle wishlist item');
    }
    return response.json();
};

export const fetchUser = async (id: number): Promise<User> => {
    const response = await fetch(`${API_URL}/users/${id}`);
    if (!response.ok) {
        throw new Error('Failed to fetch user');
    }
    return response.json();
};
