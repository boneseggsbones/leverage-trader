import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';

interface UserMenuDropdownProps {
    onClose: () => void;
}

// Fix: Replaced JSX.Element with React.ReactNode to resolve "Cannot find namespace 'JSX'" error.
const MenuItem: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; hasSeparator?: boolean }> = ({ icon, label, onClick, hasSeparator }) => (
    <>
        {hasSeparator && <div className="h-px bg-gray-100 my-2"></div>}
        <button
            onClick={onClick}
            className="w-full flex items-center gap-4 px-4 py-3 text-gray-700 text-sm hover:bg-gray-50 rounded-lg text-left"
        >
            <div className="w-5 h-5">{icon}</div>
            <span>{label}</span>
        </button>
    </>
);

const UserMenuDropdown: React.FC<UserMenuDropdownProps> = ({ onClose }) => {
    const { currentUser, logout } = useAuth();
    const { navigateTo } = useNavigation();

    const handleNavigate = (page: 'profile' | 'wishlist' | 'trade-history') => {
        if (page === 'profile' && currentUser) {
             navigateTo(page, { userId: currentUser.id });
        } else {
            navigateTo(page);
        }
        onClose();
    };

    const handleLogout = () => {
        logout();
        onClose();
    };
    
    const ProfileIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
    const WishlistIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>;
    const HistoryIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
    const LogoutIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>;


    return (
        <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 p-2 z-30">
            <MenuItem icon={<ProfileIcon />} label="Profile" onClick={() => handleNavigate('profile')} />
            <MenuItem icon={<WishlistIcon />} label="Wishlist" onClick={() => handleNavigate('wishlist')} />
            <MenuItem icon={<HistoryIcon />} label="Trade History" onClick={() => handleNavigate('trade-history')} />
            <MenuItem icon={<LogoutIcon />} label="Log out" onClick={handleLogout} hasSeparator />
        </div>
    );
};

export default UserMenuDropdown;
