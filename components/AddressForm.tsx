import React, { useState, useEffect } from 'react';
import './AddressForm.css';

export interface Address {
    id?: number;
    name: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country?: string;
    phone?: string;
    is_default?: boolean;
    is_validated?: boolean;
}

interface AddressFormProps {
    userId: number;
    initialAddress?: Address | null;
    onSave: (address: Address) => void;
    onCancel?: () => void;
    showValidation?: boolean;
}

const US_STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

export const AddressForm: React.FC<AddressFormProps> = ({
    userId,
    initialAddress,
    onSave,
    onCancel,
    showValidation = true
}) => {
    const [address, setAddress] = useState<Address>({
        name: '',
        street1: '',
        street2: '',
        city: '',
        state: '',
        zip: '',
        country: 'US',
        phone: '',
        is_default: false,
        ...initialAddress
    });

    const [isValidating, setIsValidating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [validationResult, setValidationResult] = useState<{
        isValid: boolean;
        messages?: string[];
    } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;

        setAddress(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));

        // Clear validation when address changes
        setValidationResult(null);
        setError(null);
    };

    const handleValidate = async () => {
        setIsValidating(true);
        setError(null);

        try {
            const response = await fetch('/api/addresses/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(address)
            });

            const result = await response.json();
            setValidationResult(result);

            if (!result.isValid && result.messages?.length) {
                setError(result.messages.join('. '));
            }
        } catch (err: any) {
            setError('Failed to validate address');
        } finally {
            setIsValidating(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setError(null);

        try {
            const url = initialAddress?.id
                ? `/api/users/${userId}/addresses/${initialAddress.id}`
                : `/api/users/${userId}/addresses`;

            const method = initialAddress?.id ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...address,
                    isDefault: address.is_default,
                    validate: showValidation
                })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to save address');
            }

            const result = await response.json();
            onSave({ ...address, id: result.id, is_validated: result.isValidated });
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form className="address-form" onSubmit={handleSubmit}>
            <div className="form-row">
                <div className="form-group full-width">
                    <label htmlFor="name">Full Name *</label>
                    <input
                        type="text"
                        id="name"
                        name="name"
                        value={address.name}
                        onChange={handleChange}
                        required
                        placeholder="John Smith"
                    />
                </div>
            </div>

            <div className="form-row">
                <div className="form-group full-width">
                    <label htmlFor="street1">Street Address *</label>
                    <input
                        type="text"
                        id="street1"
                        name="street1"
                        value={address.street1}
                        onChange={handleChange}
                        required
                        placeholder="123 Main St"
                    />
                </div>
            </div>

            <div className="form-row">
                <div className="form-group full-width">
                    <label htmlFor="street2">Apt, Suite, etc.</label>
                    <input
                        type="text"
                        id="street2"
                        name="street2"
                        value={address.street2 || ''}
                        onChange={handleChange}
                        placeholder="Apt 4B"
                    />
                </div>
            </div>

            <div className="form-row three-col">
                <div className="form-group">
                    <label htmlFor="city">City *</label>
                    <input
                        type="text"
                        id="city"
                        name="city"
                        value={address.city}
                        onChange={handleChange}
                        required
                        placeholder="New York"
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="state">State *</label>
                    <select
                        id="state"
                        name="state"
                        value={address.state}
                        onChange={handleChange}
                        required
                    >
                        <option value="">Select...</option>
                        {US_STATES.map(state => (
                            <option key={state} value={state}>{state}</option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label htmlFor="zip">ZIP Code *</label>
                    <input
                        type="text"
                        id="zip"
                        name="zip"
                        value={address.zip}
                        onChange={handleChange}
                        required
                        placeholder="10001"
                        pattern="[0-9]{5}(-[0-9]{4})?"
                    />
                </div>
            </div>

            <div className="form-row">
                <div className="form-group">
                    <label htmlFor="phone">Phone (for delivery)</label>
                    <input
                        type="tel"
                        id="phone"
                        name="phone"
                        value={address.phone || ''}
                        onChange={handleChange}
                        placeholder="(555) 123-4567"
                    />
                </div>
            </div>

            <div className="form-row">
                <label className="checkbox-label">
                    <input
                        type="checkbox"
                        name="is_default"
                        checked={address.is_default || false}
                        onChange={handleChange}
                    />
                    Set as default shipping address
                </label>
            </div>

            {error && (
                <div className="address-error">
                    ⚠️ {error}
                </div>
            )}

            {validationResult?.isValid && (
                <div className="address-validated">
                    ✓ Address validated successfully
                </div>
            )}

            <div className="form-actions">
                {showValidation && (
                    <button
                        type="button"
                        className="btn-validate"
                        onClick={handleValidate}
                        disabled={isValidating || !address.street1 || !address.city || !address.state || !address.zip}
                    >
                        {isValidating ? 'Validating...' : '✓ Validate Address'}
                    </button>
                )}

                <div className="action-buttons">
                    {onCancel && (
                        <button type="button" className="btn-cancel" onClick={onCancel}>
                            Cancel
                        </button>
                    )}
                    <button type="submit" className="btn-save" disabled={isSaving}>
                        {isSaving ? 'Saving...' : (initialAddress?.id ? 'Update Address' : 'Save Address')}
                    </button>
                </div>
            </div>
        </form>
    );
};

export default AddressForm;
