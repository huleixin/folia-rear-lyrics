import { getStoredUploadedLyricsFont } from './customLyricsFont';

// A separate WebView document needs its own FontFace even though the selected font is the same.
export interface RearUploadedFont { id: string; family: string; url: string }
export async function resolveRearUploadedFont(id: string): Promise<RearUploadedFont | null> {
    if (!id) return null;
    const stored = await getStoredUploadedLyricsFont();
    if (!stored || stored.id !== id) return null;
    const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(stored.blob);
    });
    return { id, family: stored.family, url };
}
