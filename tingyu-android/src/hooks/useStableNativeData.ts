import { useRef } from 'react';
import { equalNativeData } from '../utils/nativePacketData';

// src/hooks/useStableNativeData.ts
export function useStableNativeData<T>(value: T): T {
    const previous = useRef(value);
    if (!equalNativeData(previous.current, value)) previous.current = value;
    return previous.current;
}
