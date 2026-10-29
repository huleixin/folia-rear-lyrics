// src/utils/nativePlaybackFailure.ts
// HTTP, cancellation and transient network failures cannot be repaired by a different decoder.
export const shouldUseCompatibleDecoder = (error: MediaError | null): boolean => {
    const code = (error as (MediaError & { nativeCode?: number }) | null)?.nativeCode;
    return code !== undefined && [3001, 3003, 4001, 4002, 4003, 4004, 4005, 5001, 5002].includes(code);
};
