import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import styles from './EbayImport.module.css';

interface EbayListing {
    itemId: string;
    sku: string;
    title: string;
    description: string;
    condition: string;
    price: number;
    quantity: number;
    imageUrls: string[];
    categoryId: string;
    categoryName: string;
    listingStatus: string;
    alreadyImported: boolean;
}

interface ImportResults {
    imported: number;
    skipped: number;
    errors: string[];
}

export default function EbayImport() {
    const { currentUser } = useAuth();
    const [status, setStatus] = useState<'loading' | 'disconnected' | 'connected' | 'fetching' | 'importing'>('loading');
    const [listings, setListings] = useState<EbayListing[]>([]);
    const [selectedListings, setSelectedListings] = useState<Set<string>>(new Set());
    const [importResults, setImportResults] = useState<ImportResults | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Check connection status on mount
    useEffect(() => {
        if (!currentUser?.id) return;

        checkConnectionStatus();
    }, [currentUser?.id]);

    const checkConnectionStatus = async () => {
        try {
            const res = await fetch(`http://localhost:4000/api/ebay/status?userId=${currentUser?.id}`, {
                credentials: 'include'
            });
            const data = await res.json();

            if (data.connected) {
                setStatus('connected');
                fetchListings();
            } else {
                setStatus('disconnected');
            }
        } catch (err: any) {
            setError(err.message);
            setStatus('disconnected');
        }
    };

    const initiateConnection = async () => {
        try {
            const res = await fetch(`http://localhost:4000/api/ebay/auth/url?userId=${currentUser?.id}`, {
                credentials: 'include'
            });
            const data = await res.json();

            if (data.authUrl) {
                // Redirect to eBay for authorization
                window.location.href = data.authUrl;
            }
        } catch (err: any) {
            setError(err.message);
        }
    };

    const fetchListings = async () => {
        setStatus('fetching');
        try {
            const res = await fetch(`http://localhost:4000/api/ebay/listings?userId=${currentUser?.id}`, {
                credentials: 'include'
            });
            const data = await res.json();

            if (data.listings) {
                setListings(data.listings);
                // Pre-select all non-imported listings
                const newSelected = new Set<string>();
                data.listings.forEach((l: EbayListing) => {
                    if (!l.alreadyImported) {
                        newSelected.add(l.itemId);
                    }
                });
                setSelectedListings(newSelected);
            }
            setStatus('connected');
        } catch (err: any) {
            setError(err.message);
            setStatus('connected');
        }
    };

    const toggleSelection = (itemId: string) => {
        const newSelected = new Set(selectedListings);
        if (newSelected.has(itemId)) {
            newSelected.delete(itemId);
        } else {
            newSelected.add(itemId);
        }
        setSelectedListings(newSelected);
    };

    const selectAll = () => {
        const newSelected = new Set<string>();
        listings.forEach(l => {
            if (!l.alreadyImported) {
                newSelected.add(l.itemId);
            }
        });
        setSelectedListings(newSelected);
    };

    const deselectAll = () => {
        setSelectedListings(new Set());
    };

    const importSelected = async () => {
        if (selectedListings.size === 0) return;

        setStatus('importing');
        setImportResults(null);

        const listingsToImport = listings.filter(l => selectedListings.has(l.itemId));

        try {
            const res = await fetch('http://localhost:4000/api/ebay/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    userId: currentUser?.id,
                    listings: listingsToImport
                })
            });

            const data = await res.json();
            setImportResults(data);

            // Refresh listings to update alreadyImported status
            await fetchListings();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setStatus('connected');
        }
    };

    const disconnectEbay = async () => {
        try {
            await fetch('http://localhost:4000/api/ebay/disconnect', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ userId: currentUser?.id })
            });
            setStatus('disconnected');
            setListings([]);
            setSelectedListings(new Set());
        } catch (err: any) {
            setError(err.message);
        }
    };

    const formatPrice = (cents: number) => {
        return `$${(cents / 100).toFixed(2)}`;
    };

    if (!currentUser) {
        return <div className={styles.container}>Please log in to import from eBay</div>;
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1>Import from eBay</h1>
                <p className={styles.subtitle}>
                    Connect your eBay account to import your active listings into Leverage
                </p>
            </div>

            {error && (
                <div className={styles.errorBanner}>
                    <span>⚠️</span> {error}
                    <button onClick={() => setError(null)}>×</button>
                </div>
            )}

            {status === 'loading' && (
                <div className={styles.loadingState}>
                    <div className={styles.spinner}></div>
                    <p>Checking eBay connection...</p>
                </div>
            )}

            {status === 'disconnected' && (
                <div className={styles.connectCard}>
                    <div className={styles.ebayLogo}>
                        <img src="/ebay-logo.svg" alt="eBay" />
                    </div>
                    <h2>Connect Your eBay Account</h2>
                    <p>
                        Link your eBay seller account to import your active listings.
                        You'll be redirected to eBay to authorize access.
                    </p>
                    <button className={styles.connectButton} onClick={initiateConnection}>
                        Connect with eBay
                    </button>
                    <p className={styles.disclaimer}>
                        We only request read-only access to your inventory. We cannot make changes to your eBay listings.
                    </p>
                </div>
            )}

            {(status === 'connected' || status === 'fetching' || status === 'importing') && (
                <div className={styles.importPanel}>
                    <div className={styles.toolbar}>
                        <div className={styles.connectionStatus}>
                            <span className={styles.connectedDot}></span>
                            eBay Connected
                            <button className={styles.disconnectButton} onClick={disconnectEbay}>
                                Disconnect
                            </button>
                        </div>
                        <div className={styles.toolbarActions}>
                            <button onClick={selectAll} disabled={status !== 'connected'}>
                                Select All
                            </button>
                            <button onClick={deselectAll} disabled={status !== 'connected'}>
                                Deselect All
                            </button>
                            <button onClick={fetchListings} disabled={status !== 'connected'}>
                                🔄 Refresh
                            </button>
                        </div>
                    </div>

                    {importResults && (
                        <div className={styles.resultsCard}>
                            <h3>Import Complete</h3>
                            <div className={styles.resultStats}>
                                <span className={styles.imported}>✓ {importResults.imported} imported</span>
                                <span className={styles.skipped}>⊘ {importResults.skipped} skipped</span>
                                {importResults.errors.length > 0 && (
                                    <span className={styles.errorsCount}>✗ {importResults.errors.length} errors</span>
                                )}
                            </div>
                            {importResults.errors.length > 0 && (
                                <div className={styles.errorsList}>
                                    {importResults.errors.map((err, i) => (
                                        <p key={i}>{err}</p>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {status === 'fetching' && (
                        <div className={styles.loadingState}>
                            <div className={styles.spinner}></div>
                            <p>Fetching your eBay listings...</p>
                        </div>
                    )}

                    {status === 'importing' && (
                        <div className={styles.loadingState}>
                            <div className={styles.spinner}></div>
                            <p>Importing {selectedListings.size} items...</p>
                        </div>
                    )}

                    {status === 'connected' && listings.length === 0 && (
                        <div className={styles.emptyState}>
                            <p>No active listings found in your eBay account.</p>
                            <button onClick={fetchListings}>Try Again</button>
                        </div>
                    )}

                    {status === 'connected' && listings.length > 0 && (
                        <>
                            <div className={styles.listingsGrid}>
                                {listings.map(listing => (
                                    <div
                                        key={listing.itemId}
                                        className={`${styles.listingCard} ${listing.alreadyImported ? styles.imported : ''} ${selectedListings.has(listing.itemId) ? styles.selected : ''}`}
                                        onClick={() => !listing.alreadyImported && toggleSelection(listing.itemId)}
                                    >
                                        {listing.alreadyImported && (
                                            <div className={styles.importedBadge}>Already Imported</div>
                                        )}
                                        <div className={styles.listingImage}>
                                            {listing.imageUrls && listing.imageUrls.length > 0 ? (
                                                <img src={listing.imageUrls[0]} alt={listing.title} />
                                            ) : (
                                                <div className={styles.noImage}>No Image</div>
                                            )}
                                        </div>
                                        <div className={styles.listingInfo}>
                                            <h3>{listing.title}</h3>
                                            <div className={styles.listingMeta}>
                                                <span className={styles.price}>{formatPrice(listing.price)}</span>
                                                <span className={styles.condition}>{listing.condition}</span>
                                            </div>
                                            {!listing.alreadyImported && (
                                                <div className={styles.checkbox}>
                                                    {selectedListings.has(listing.itemId) ? '☑' : '☐'}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className={styles.importFooter}>
                                <p className={styles.selectionCount}>
                                    {selectedListings.size} of {listings.filter(l => !l.alreadyImported).length} items selected
                                </p>
                                <button
                                    className={styles.importButton}
                                    onClick={importSelected}
                                    disabled={selectedListings.size === 0}
                                >
                                    Import {selectedListings.size} Items
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
