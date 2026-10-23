import { useEffect, useState } from 'react';

// src/hooks/useUpdateIndicator.ts

// 首页「发现新版本」提示：开着更新检查、检测到新版本、且用户还没在设置里看过它时为 true。
// 设置面板打开后会 markUpdateSeen，经 onUpdateStatusChanged 推回来，提示随之消失。非桌面端恒为 false。
export function useUpdateIndicator(): boolean {
    const [updateStatus, setUpdateStatus] = useState<ElectronUpdateStatus | null>(null);

    useEffect(() => {
        if (!window.electron?.getUpdateStatus) {
            return;
        }

        let disposed = false;

        window.electron.getUpdateStatus().then((status) => {
            if (!disposed) {
                setUpdateStatus(status);
            }
        }).catch(() => {
            if (!disposed) {
                setUpdateStatus(null);
            }
        });

        const unsubscribe = window.electron.onUpdateStatusChanged?.((status) => {
            setUpdateStatus(status);
        });

        return () => {
            disposed = true;
            unsubscribe?.();
        };
    }, []);

    return Boolean(
        updateStatus?.updateCheckEnabled &&
        updateStatus.availableVersion &&
        !updateStatus.updateSeen
    );
}
