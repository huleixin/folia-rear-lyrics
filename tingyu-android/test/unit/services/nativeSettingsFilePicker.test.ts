// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

const plugin = vi.hoisted(() => ({
    pickSettingsFiles: vi.fn(), readSettingsFileChunk: vi.fn(), releaseSettingsFiles: vi.fn(),
}));
vi.mock('@/platform/foliaNative', () => ({ getFoliaNative: () => plugin }));
import { pickNativeSettingsFiles } from '@/services/nativeSettingsFilePicker';

beforeEach(() => vi.clearAllMocks());

it('streams selected SAF content into a File and releases the private staged copy', async () => {
    plugin.pickSettingsFiles.mockResolvedValue({ cancelled: false, files: [{ id: 'opaque-id', name: 'wall.png', mimeType: 'image/png', size: 5 }] });
    plugin.readSettingsFileChunk.mockResolvedValue({ base64: 'aW1hZ2U=', length: 5 });
    plugin.releaseSettingsFiles.mockResolvedValue(undefined);
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.multiple = true;

    const files = await pickNativeSettingsFiles(input);

    expect(plugin.pickSettingsFiles).toHaveBeenCalledWith({ accept: 'image/*', multiple: true });
    expect(files).toHaveLength(1);
    expect(files?.[0].name).toBe('wall.png');
    expect(files?.[0].type).toBe('image/png');
    const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error);
        reader.readAsText(files![0]);
    });
    expect(content).toBe('image');
    expect(plugin.readSettingsFileChunk).toHaveBeenCalledWith({ id: 'opaque-id', offset: 0, length: 5 });
    expect(plugin.releaseSettingsFiles).toHaveBeenCalledWith({ ids: ['opaque-id'] });
});

it('treats a user cancellation as an empty selection', async () => {
    plugin.pickSettingsFiles.mockResolvedValue({ cancelled: true, files: [] });
    await expect(pickNativeSettingsFiles(document.createElement('input'))).resolves.toEqual([]);
    expect(plugin.readSettingsFileChunk).not.toHaveBeenCalled();
    expect(plugin.releaseSettingsFiles).not.toHaveBeenCalled();
});
