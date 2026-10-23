// src/utils/openAIEndpoint.ts
// Renderer copy of openAIEndpointOf in electron/aiCredentialStore.cjs. The main process binds the
// saved OpenAI-compatible key to this endpoint and enforces it; the settings form only uses it to
// warn before a URL change leaves the saved key unusable.

const DEFAULT_OPENAI_ENDPOINT = 'https://api.openai.com';

/** Scheme and host an OPENAI_API_URL value sends requests to (the trimmed value if it is not a URL). */
export const openAIEndpointOf = (rawUrl: unknown): string => {
    const trimmed = typeof rawUrl === 'string' ? rawUrl.trim() : '';
    if (!trimmed) {
        return DEFAULT_OPENAI_ENDPOINT;
    }
    try {
        const { protocol, host } = new URL(trimmed);
        return `${protocol}//${host}`;
    } catch {
        return trimmed.replace(/\/+$/, '');
    }
};
