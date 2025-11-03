import { Item } from "../types";

/**
 * Formats a number in cents into a locale-specific currency string (e.g., $1,234.50).
 * @param cents The value in cents.
 * @returns A formatted currency string.
 */
export const formatCurrency = (cents: number): string => {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(dollars);
};

/**
 * Converts a dollar amount to cents, rounding to avoid floating-point errors.
 * @param dollars The value in dollars.
 * @returns The value in cents as an integer.
 */
export const dollarsToCents = (dollars: number): number => {
  return Math.round(dollars * 100);
};