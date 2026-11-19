/**
 * Same rule as PlayHex shared/app/ratingUtils.ts
 */
export const DEFAULT_RATING = 1500;
export const DEFAULT_DEVIATION = 350;

export const isRatingConfident = (deviation: number): boolean => deviation < 100;

/** "1673" if confident, "~1500" otherwise */
export const formatRating = (rating: number, deviation: number): string =>
    (isRatingConfident(deviation) ? '' : '~') + Math.round(rating);
