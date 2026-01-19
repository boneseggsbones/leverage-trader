/**
 * Edit Profile Modal
 * Allows users to edit their profile information
 */

import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { useAuth } from '../context/AuthContext';

interface EditProfileModalProps {
    show: boolean;
    onClose: () => void;
    user: User;
    onSave: (updatedUser: User) => void;
}

const EditProfileModal: React.FC<EditProfileModalProps> = ({
    show,
    onClose,
    user,
    onSave,
}) => {
    const [name, setName] = useState(user.name);
    // Combine city and state into single location field
    const [location, setLocation] = useState(
        [user.city, user.state].filter(Boolean).join(', ') || ''
    );
    const [aboutMe, setAboutMe] = useState(user.aboutMe || '');
    const [saving, setSaving] = useState(false);
    const [fetchingLocation, setFetchingLocation] = useState(false);
    const [locationVerified, setLocationVerified] = useState(false);
    const [suggestions, setSuggestions] = useState<{ display: string; city: string; state: string }[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Ref to skip autocomplete search after verified selection
    const skipNextSearch = useRef(false);

    useEffect(() => {
        if (show) {
            setName(user.name);
            setLocation([user.city, user.state].filter(Boolean).join(', ') || '');
            setAboutMe(user.aboutMe || '');
            setError(null);
            setLocationVerified(!!user.city); // Consider existing locations as verified
            setSuggestions([]);
        }
    }, [show, user]);

    // Auto-detect and resolve zip codes
    useEffect(() => {
        const trimmed = location.trim();
        const zipMatch = trimmed.match(/^\d{5}$/);
        if (!zipMatch) return;

        const zipCode = zipMatch[0];
        let cancelled = false;

        const lookupZip = async () => {
            try {
                setFetchingLocation(true);
                // Use Nominatim to look up US zip code
                const res = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&postalcode=${zipCode}&country=US&addressdetails=1&limit=1`,
                    { headers: { 'Accept-Language': 'en' } }
                );

                if (!res.ok || cancelled) return;

                const data = await res.json();
                if (data.length > 0 && !cancelled) {
                    const address = data[0].address;
                    const city = address.city || address.town || address.village || address.county || '';
                    const state = address.state || '';
                    if (city || state) {
                        skipNextSearch.current = true;
                        setLocation([city, state].filter(Boolean).join(', '));
                        setLocationVerified(true);
                        setSuggestions([]);
                    }
                }
            } catch (err) {
                console.error('Zip code lookup failed:', err);
            } finally {
                if (!cancelled) setFetchingLocation(false);
            }
        };

        // Debounce to avoid too many requests
        const timer = setTimeout(lookupZip, 500);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [location]);

    // Autocomplete search for city/state
    useEffect(() => {
        // Skip search if we just set a verified location
        if (skipNextSearch.current) {
            skipNextSearch.current = false;
            return;
        }

        const trimmed = location.trim();
        // Don't search if it looks like a zip code or too short
        if (/^\d{5}$/.test(trimmed) || trimmed.length < 3) {
            setSuggestions([]);
            return;
        }

        // Reset verified if user is typing
        setLocationVerified(false);

        let cancelled = false;

        const searchLocations = async () => {
            try {
                const res = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&countrycodes=us&addressdetails=1&limit=5`,
                    { headers: { 'Accept-Language': 'en' } }
                );

                if (!res.ok || cancelled) return;

                const data = await res.json();
                if (!cancelled) {
                    const results = data
                        .filter((r: any) => r.address?.state)
                        .map((r: any) => {
                            const city = r.address.city || r.address.town || r.address.village || r.address.county || r.name || '';
                            const state = r.address.state || '';
                            return {
                                display: [city, state].filter(Boolean).join(', '),
                                city,
                                state,
                            };
                        })
                        // Remove duplicates
                        .filter((r: any, i: number, arr: any[]) =>
                            arr.findIndex(x => x.display === r.display) === i
                        );
                    setSuggestions(results);
                }
            } catch (err) {
                console.error('Location search failed:', err);
            }
        };

        const timer = setTimeout(searchLocations, 400);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [location]);

    const handleUseCurrentLocation = async () => {
        if (!navigator.geolocation) {
            setError('Geolocation is not supported by your browser');
            return;
        }

        setFetchingLocation(true);
        setError(null);

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    // Use free reverse geocoding API (Nominatim/OpenStreetMap)
                    const { latitude, longitude } = position.coords;
                    const res = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
                        { headers: { 'Accept-Language': 'en' } }
                    );

                    if (!res.ok) throw new Error('Failed to get location');

                    const data = await res.json();
                    const address = data.address;

                    // Get city (can be city, town, village, or county)
                    const detectedCity = address.city || address.town || address.village || address.county || '';
                    // Get state
                    const detectedState = address.state || '';

                    skipNextSearch.current = true;
                    setLocation(`${detectedCity}, ${detectedState}`.replace(/^, |, $/g, ''));
                    setLocationVerified(true);
                    setSuggestions([]);
                } catch (err) {
                    console.error('Reverse geocoding failed:', err);
                    setError('Could not determine your location');
                } finally {
                    setFetchingLocation(false);
                }
            },
            (err) => {
                console.error('Geolocation error:', err);
                setError(err.code === 1 ? 'Location access denied' : 'Could not get your location');
                setFetchingLocation(false);
            },
            { enableHighAccuracy: false, timeout: 10000 }
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            setError('Name is required');
            return;
        }

        setSaving(true);
        setError(null);

        try {
            const res = await fetch(`http://localhost:4000/api/users/${user.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    location: location.trim(),
                    aboutMe: aboutMe.trim(),
                }),
            });

            if (!res.ok) {
                throw new Error('Failed to update profile');
            }

            const updatedUser = await res.json();
            onSave(updatedUser);
            onClose();
        } catch (err) {
            console.error('Failed to save profile:', err);
            setError('Failed to save. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                        ✏️ Edit Profile
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        ✕
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                        </div>
                    )}

                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Display Name *
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Your display name"
                            required
                        />
                    </div>

                    {/* Location */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Location
                            </label>
                            <button
                                type="button"
                                onClick={handleUseCurrentLocation}
                                disabled={fetchingLocation}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 disabled:opacity-50"
                            >
                                {fetchingLocation ? (
                                    <>
                                        <div className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                                        Detecting...
                                    </>
                                ) : (
                                    <>📍 Use Current Location</>
                                )}
                            </button>
                        </div>
                        <div className="relative">
                            <div className="relative">
                                <input
                                    type="text"
                                    value={location}
                                    onChange={(e) => {
                                        setLocation(e.target.value);
                                        setShowSuggestions(true);
                                    }}
                                    onFocus={() => setShowSuggestions(true)}
                                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                    className={`w-full px-4 py-2 pr-10 border rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${locationVerified
                                        ? 'border-green-400 dark:border-green-500'
                                        : 'border-gray-300 dark:border-gray-600'
                                        }`}
                                    placeholder="City, State or Zip Code"
                                />
                                {/* Verification checkmark */}
                                {locationVerified && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                )}
                                {fetchingLocation && !locationVerified && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                                    </div>
                                )}
                            </div>

                            {/* Suggestions dropdown */}
                            {showSuggestions && suggestions.length > 0 && (
                                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                    {suggestions.map((s, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-600 transition-colors first:rounded-t-lg last:rounded-b-lg"
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                skipNextSearch.current = true;
                                                setLocation(s.display);
                                                setLocationVerified(true);
                                                setSuggestions([]);
                                                setShowSuggestions(false);
                                            }}
                                        >
                                            <span className="flex items-center gap-2">
                                                <span className="text-gray-400">📍</span>
                                                {s.display}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        {locationVerified && (
                            <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                                ✓ Location verified
                            </p>
                        )}
                    </div>

                    {/* About Me */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            About Me
                        </label>
                        <textarea
                            value={aboutMe}
                            onChange={(e) => setAboutMe(e.target.value)}
                            rows={3}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                            placeholder="Tell other traders about yourself..."
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {saving ? (
                                <span className="flex items-center justify-center gap-2">
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Saving...
                                </span>
                            ) : (
                                'Save Changes'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EditProfileModal;
