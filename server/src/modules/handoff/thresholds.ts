/** Share of the period after which each reminder goes out. The job and the DTOs both read this. */
export const WARNING_FRACTIONS = { 75: 0.75, 90: 0.9, 95: 0.95 } as const;
export type Level = keyof typeof WARNING_FRACTIONS;
export const STAMP_FIELDS = { 75: 'reminded75At', 90: 'reminded90At', 95: 'reminded95At' } as const;
