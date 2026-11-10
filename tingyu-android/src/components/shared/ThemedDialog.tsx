import { useMotionSettingsStore, resolveReducedMotion } from '../../stores/useMotionSettingsStore';
import {useInterfaceLight} from '../../hooks/useInterfaceAppearance';
import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { registerModalBack } from '../../services/modalBackStack';
import { NATIVE_FIRST } from '../../services/nativePages';

interface ThemedDialogProps {
    isOpen: boolean;
    onClose: () => void;
    isDaylight?: boolean;
    title: string;
    description?: string;
    headerActions?: React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
    maxWidthClass?: string;
    /** Optional stable marker for phone-fit CSS that needs to target one dialog kind. */
    panelKind?: string;
    /**
     * Blocks the two close paths this dialog owns - the X and the backdrop - while the caller is
     * mid-way through work a close would leave half-applied. Also dims the X so the wait shows:
     * a caller wrapping `onClose` instead would leave it looking live while it does nothing.
     */
    closeDisabled?: boolean;
    /** Native `title` for the dimmed X, naming the run that has to finish before closing. */
    closeDisabledTitle?: string;
}

const ThemedDialog: React.FC<ThemedDialogProps> = ({
    isOpen,
    onClose,
    isDaylight: stageDaylight = false,
    title,
    description,
    headerActions,
    children,
    footer,
    maxWidthClass = 'max-w-md',
    panelKind,
    closeDisabled = false,
    closeDisabledTitle,
}) => {
    const reduced = useMotionSettingsStore(state => resolveReducedMotion(state, 'uiMicroMotion'));
    const isDaylight=useInterfaceLight(stageDaylight);
    const bgClass = isDaylight ? 'bg-white/90 border-white/30' : 'bg-zinc-900/95 border-white/10';
    const textPrimary = isDaylight ? 'text-zinc-900' : 'text-white';
    const textSecondary = isDaylight ? 'text-zinc-500' : 'text-zinc-400';
    const closeBtnHover = isDaylight ? 'hover:bg-zinc-200/60' : 'hover:bg-white/10';
    const isMouseDownOnOverlayRef = useRef(false);

    // 返回键优先级（68600）：本弹窗在最上层时，第一次返回只关它。
    // closeDisabled（导入/验证进行中）时消费返回但不关，保持原有操作锁定。
    useEffect(() => {
        if (!isOpen) return;
        return registerModalBack(() => { if (!closeDisabled) onClose(); });
    }, [isOpen, closeDisabled, onClose]);

    const handleOverlayMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
        isMouseDownOnOverlayRef.current = event.target === event.currentTarget;
    };

    const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (closeDisabled) return;
        if (event.target === event.currentTarget && isMouseDownOnOverlayRef.current) {
            onClose();
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    // 原生设置文档页：这层会被拍成静态画，动画期间捕获=半透明快照（68600 的"发灰"）。
                    transition={{duration:reduced||NATIVE_FIRST?0:.18}}
                    data-folia-keyboard-window="true"
                    data-folia-themed-overlay="true"
                    className={`fixed inset-0 z-[200] flex items-center justify-center p-4 ${isDaylight ? 'bg-transparent' : NATIVE_FIRST ? 'bg-black/60' : 'bg-black/60 backdrop-blur-md'}`}
                    onMouseDown={handleOverlayMouseDown}
                    onClick={handleBackdropClick}
                 data-settings-style='{"align":"center","center":true,"padding":[16,16,16,16]}' data-settings-layout="row">
                    <motion.div
                        initial={{ scale: reduced?1:0.99, y:reduced?0:10, opacity: 0 }}
                        animate={{ scale: 1, y:0, opacity: 1 }}
                        exit={{ scale: reduced?1:0.99, y:reduced?0:10, opacity: 0 }}
                        transition={{ duration:reduced||NATIVE_FIRST?0:.18, ease:[.16,1,.3,1] }}
                        onClick={(event) => event.stopPropagation()}
                        data-folia-themed-dialog="true"
                        data-folia-themed-dialog-kind={panelKind}
                        className={`relative w-full ${maxWidthClass} rounded-3xl border ${bgClass} p-6 shadow-2xl backdrop-blur-sm`}
                     data-settings-style='{"radius":24,"border":true,"padding":[24,24,24,24]}' data-settings-layout="card">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={closeDisabled}
                            title={closeDisabled ? closeDisabledTitle : undefined}
                            className={`absolute right-4 top-4 rounded-full p-2 transition-colors ${closeDisabled ? 'opacity-20' : `opacity-50 hover:opacity-100 ${closeBtnHover}`} ${textPrimary}`}
                         data-settings-style='{"radius":64,"padding":[8,8,8,8]}' data-settings-layout="row">
                            <X size={18} />
                        </button>

                        <div className="mb-5 pr-10" data-settings-style='{"padding":[0,0,40,0],"margin":[0,0,0,20]}' data-settings-layout="column">
                            <div className="flex items-center justify-between gap-3" data-settings-style='{"align":"between","gap":12}' data-settings-layout="row">
                                <h2 className={`min-w-0 text-xl font-bold ${textPrimary}`} data-settings-style='{"font":20,"weight":700,"grow":true}' data-settings-layout="wrap">{title}</h2>
                                {headerActions && (
                                    <div className="shrink-0" data-settings-layout="column">{headerActions}</div>
                                )}
                            </div>
                            {description && (
                                // pre-line so a description can break where its meaning does rather
                                // than wherever the width happens to run out.
                                <p className={`mt-2 whitespace-pre-line text-sm ${textSecondary}`} data-settings-style='{"font":14,"margin":[0,8,0,0]}' data-settings-layout="wrap">{description}</p>
                            )}
                        </div>

                        <div data-settings-layout="column">{children}</div>

                        {footer && (
                            <div className="mt-5 flex items-center justify-end gap-3" data-settings-style='{"align":"end","gap":12,"margin":[0,20,0,0]}' data-settings-layout="row">
                                {footer}
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default ThemedDialog;
