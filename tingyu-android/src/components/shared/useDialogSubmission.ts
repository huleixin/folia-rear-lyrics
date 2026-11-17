import { useLayoutEffect, useRef, useState } from 'react';

// src/components/shared/useDialogSubmission.ts
// One mutation per open dialog. A result from an earlier opening cannot close the next dialog.
export function useDialogSubmission(isOpen: boolean) {
    const [busy, setBusy] = useState(false);
    const generation = useRef(0);
    const pending = useRef(false);
    useLayoutEffect(() => {
        generation.current += 1;
        pending.current = false;
        setBusy(false);
        return () => { generation.current += 1; };
    }, [isOpen]);
    const submit = async (action: () => Promise<void> | void, success: () => void, failure: () => void) => {
        if (!isOpen || pending.current) return;
        pending.current = true;
        setBusy(true);
        const ticket = generation.current;
        try {
            await action();
            if (ticket === generation.current) success();
        } catch {
            if (ticket === generation.current) failure();
        } finally {
            if (ticket === generation.current) { pending.current = false; setBusy(false); }
        }
    };
    return { busy, submit };
}
