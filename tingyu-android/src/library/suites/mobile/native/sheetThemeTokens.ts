import { useInterfaceLight } from '../../../../hooks/useInterfaceAppearance';
import { useThemeSettingsStore } from '../../../../stores/useThemeSettingsStore';
import { resolveInterfaceTheme } from '../../../../theme/interfaceThemes.generated';

// src/library/suites/mobile/native/sheetThemeTokens.ts
export interface SheetThemeTokens {
    isLight: boolean;
    isGlacier: boolean;
    pageBg: string;
    cardBg: string;
    elevatedBg: string;
    text: string;
    muted: string;
    border: string;
    accent: string;
    accentSoft: string;
    primaryBtnBg: string;
    primaryBtnText: string;
    secondaryBtnBg: string;
    secondaryBtnText: string;
}

export function useSheetThemeTokens(): SheetThemeTokens {
    const isLight = useInterfaceLight();
    const theme = resolveInterfaceTheme(useThemeSettingsStore(s => s.interfaceTheme));
    const isGlacier = theme !== 'classic';

    if (isGlacier) {
        return isLight
            ? {
                isLight: true,
                isGlacier: true,
                pageBg: '#EEF4F8',
                cardBg: 'rgba(255, 255, 255, 0.78)',
                elevatedBg: 'rgba(56, 91, 115, 0.08)',
                text: '#1E3342',
                muted: '#577082',
                border: 'rgba(56, 91, 115, 0.18)',
                accent: '#385B73',
                accentSoft: 'rgba(82, 126, 159, 0.15)',
                primaryBtnBg: '#385B73',
                primaryBtnText: '#FFFFFF',
                secondaryBtnBg: 'rgba(56, 91, 115, 0.10)',
                secondaryBtnText: '#203747',
            }
            : {
                isLight: false,
                isGlacier: true,
                pageBg: '#0E171F',
                cardBg: 'rgba(255, 255, 255, 0.06)',
                elevatedBg: 'rgba(170, 200, 223, 0.10)',
                text: '#EAF2F8',
                muted: '#9AB2C4',
                border: 'rgba(170, 200, 223, 0.18)',
                accent: '#7FA9C9',
                accentSoft: 'rgba(127, 169, 201, 0.18)',
                primaryBtnBg: '#7FA9C9',
                primaryBtnText: '#0E171F',
                secondaryBtnBg: 'rgba(170, 200, 223, 0.14)',
                secondaryBtnText: '#EAF2F8',
            };
    }

    return isLight
        ? {
            isLight: true,
            isGlacier: false,
            pageBg: '#F4F7F5',
            cardBg: 'rgba(255, 255, 255, 0.86)',
            elevatedBg: 'rgba(33, 62, 52, 0.08)',
            text: '#1D332B',
            muted: '#526B62',
            border: 'rgba(33, 62, 52, 0.16)',
            accent: '#2D6A4F',
            accentSoft: 'rgba(45, 106, 79, 0.14)',
            primaryBtnBg: '#2D6A4F',
            primaryBtnText: '#FFFFFF',
            secondaryBtnBg: 'rgba(33, 62, 52, 0.10)',
            secondaryBtnText: '#1D332B',
        }
        : {
            isLight: false,
            isGlacier: false,
            pageBg: '#0F1814',
            cardBg: 'rgba(255, 255, 255, 0.06)',
            elevatedBg: 'rgba(130, 199, 165, 0.10)',
            text: '#E8F4ED',
            muted: '#96B3A5',
            border: 'rgba(130, 199, 165, 0.18)',
            accent: '#6CC49A',
            accentSoft: 'rgba(108, 196, 154, 0.18)',
            primaryBtnBg: '#6CC49A',
            primaryBtnText: '#0B1A13',
            secondaryBtnBg: 'rgba(130, 199, 165, 0.14)',
            secondaryBtnText: '#E8F4ED',
        };
}
