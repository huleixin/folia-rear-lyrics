// src/services/diagnostics/screenshotCapture.ts
//
// 反馈截图：在浏览器侧就压到「长边 ≤1280、JPEG 0.75」，再交给原生塞进 ZIP。
// 不在原生解码大图：一张 4K 截图 base64 之后有 8MB，过桥会明显卡顿。

const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.75;
const MAX_FILES = 3;

const readAsDataUrl = (file: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });

const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('image decode failed'));
        image.src = src;
    });

/**
 * 把用户选中的图片压成 dataURL。失败的文件跳过，不影响其它张。
 * 返回最多 {@link MAX_FILES} 张。
 */
export const captureScreenshots = async (files: FileList | File[]): Promise<string[]> => {
    const list = Array.from(files).filter((file) => file.type.startsWith('image/')).slice(0, MAX_FILES);
    const out: string[] = [];
    for (const file of list) {
        try {
            const raw = await readAsDataUrl(file);
            const image = await loadImage(raw);
            const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
            const width = Math.max(1, Math.round(image.width * scale));
            const height = Math.max(1, Math.round(image.height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d');
            if (!context) {
                out.push(raw);
                continue;
            }
            context.drawImage(image, 0, 0, width, height);
            out.push(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
        } catch {
            // 单张失败就少一张，不阻塞整个反馈流程。
        }
    }
    return out;
};

export const MAX_FEEDBACK_SCREENSHOTS = MAX_FILES;
