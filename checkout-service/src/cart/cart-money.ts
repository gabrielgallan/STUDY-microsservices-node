const CENTS = 100

const toCents = (value: string | number): number => {
	const parsed = typeof value === 'number' ? value : Number(value)

	if (!Number.isFinite(parsed)) {
		return 0
	}

	return Math.round(parsed * CENTS)
}

/**
 * Decimal columns are returned as text by the pg driver, so every monetary
 * value is normalized here before being calculated or serialized.
 */
export const toMoney = (value: string | number): number => toCents(value) / CENTS

export const multiplyMoney = (price: string | number, quantity: number): number =>
	(toCents(price) * quantity) / CENTS

export const sumMoney = (values: (string | number)[]): number =>
	values.reduce<number>((total, value) => total + toCents(value), 0) / CENTS
