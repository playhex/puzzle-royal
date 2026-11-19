/**
 * Public player info, as displayed in lists.
 */
export type PlayerProfile = {
    publicId: string;
    pseudo: string;
    slug: string;
    isGuest: boolean;

    /** Full URL, or null */
    avatarUrl: null | string;

    countryFlag: null | string;
    rating: number;
    ratingDeviation: number;
};
