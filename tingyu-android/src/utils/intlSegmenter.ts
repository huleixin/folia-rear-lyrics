import '@formatjs/intl-segmenter/polyfill.js';

// src/utils/intlSegmenter.ts
// Install only when the WebView lacks Intl.Segmenter, before eager stage imports
// and pretext create their shared word/grapheme segmenters. Keep native ICU when available.
