const CENTS = 100

/**
 * Monetary values are compared in cents on purpose: checking the decimal part
 * with a floating point remainder misses values such as 1999.99.
 */
export const toCents = (value: string | number): number => {
	const parsed = typeof value === 'number' ? value : Number(value)

	if (!Number.isFinite(parsed)) {
		return 0
	}

	return Math.round(parsed * CENTS)
}

/** Decimal columns are returned as text by the pg driver. */
export const toMoney = (value: string | number): number => toCents(value) / CENTS
