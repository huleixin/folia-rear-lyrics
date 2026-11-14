import { getFoliaNative } from '../platform/foliaNative';

// Native settings controls are painted by Compose, so Android file selection must use SAF
// instead of relying on WebView transient user activation for input[type=file].
type PickedFile = { id: string; name: string; mimeType: string; size: number };
type NativePicker = {
    pickSettingsFiles(options: { accept: string; multiple: boolean }): Promise<{ cancelled?: boolean; files?: PickedFile[] }>;
    readSettingsFileChunk(options: { id: string; offset: number; length: number }): Promise<{ base64: string; length: number }>;
    releaseSettingsFiles(options: { ids: string[] }): Promise<void>;
};

const native = getFoliaNative<NativePicker>();
const CHUNK_SIZE = 256 * 1024;

export async function pickNativeSettingsFiles(input: HTMLInputElement): Promise<File[] | null> {
    const selection = await native.pickSettingsFiles({ accept: input.accept || '*/*', multiple: input.multiple });
    if (selection.cancelled || !selection.files?.length) return [];
    const files: File[] = [];
    try {
        for (const picked of selection.files) {
            if (!Number.isSafeInteger(picked.size) || picked.size < 0) throw new Error('所选文件大小无效');
            const parts: BlobPart[] = [];
            for (let offset = 0; offset < picked.size; offset += CHUNK_SIZE) {
                const expected = Math.min(CHUNK_SIZE, picked.size - offset);
                const result = await native.readSettingsFileChunk({ id: picked.id, offset, length: expected });
                if (result.length !== expected) throw new Error(`文件读取不完整：${picked.name}`);
                const raw = atob(result.base64);
                if (raw.length !== expected) throw new Error(`文件读取不完整：${picked.name}`);
                const buffer = new ArrayBuffer(raw.length);
                const bytes = new Uint8Array(buffer);
                for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
                parts.push(bytes);
            }
            files.push(new File(parts, picked.name, { type: picked.mimeType || 'application/octet-stream', lastModified: Date.now() }));
        }
        return files;
    } finally {
        await native.releaseSettingsFiles({ ids: selection.files.map(file => file.id) }).catch(() => undefined);
    }
}
