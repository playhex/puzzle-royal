/**
 * PlayHex board display preferences (subset of PlayHex PlayerSettings).
 */
export type BoardSettings = {
    orientationLandscape: number;
    orientationPortrait: number;
    showCoords: boolean;
    show44dots: boolean;
    boardTheme: null | string;
    customBoardTheme: null | string;
    boardShadingPattern: null | string;
    boardShadingPatternOption: null | string;
    boardShadingPatternIntensity: number;
};

/** PlayHex defaults */
export const defaultBoardSettings: BoardSettings = {
    orientationLandscape: 11,
    orientationPortrait: 9,
    showCoords: false,
    show44dots: false,
    boardTheme: null,
    customBoardTheme: null,
    boardShadingPattern: null,
    boardShadingPatternOption: null,
    boardShadingPatternIntensity: 0.5,
};

export const pickBoardSettings = (raw: Partial<Record<keyof BoardSettings, unknown>> | null | undefined): BoardSettings => {
    const s = { ...defaultBoardSettings };

    if (!raw) {
        return s;
    }

    const num = (v: unknown, d: number) => typeof v === 'number' && Number.isFinite(v) ? v : d;
    const bool = (v: unknown, d: boolean) => typeof v === 'boolean' ? v : d;
    const str = (v: unknown) => typeof v === 'string' ? v : null;

    return {
        orientationLandscape: num(raw.orientationLandscape, s.orientationLandscape),
        orientationPortrait: num(raw.orientationPortrait, s.orientationPortrait),
        showCoords: bool(raw.showCoords, s.showCoords),
        show44dots: bool(raw.show44dots, s.show44dots),
        boardTheme: str(raw.boardTheme),
        customBoardTheme: str(raw.customBoardTheme),
        boardShadingPattern: str(raw.boardShadingPattern),
        boardShadingPatternOption: str(raw.boardShadingPatternOption),
        boardShadingPatternIntensity: num(raw.boardShadingPatternIntensity, s.boardShadingPatternIntensity),
    };
};
