import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useLiquidReduced } from './useLiquidReduced';
import { TY_DURATION, TY_SPRING } from './motionTokens';
import { registerModalBack } from '../../services/modalBackStack';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import MobileScrollFrame from './MobileScrollFrame';

// src/components/shared/MobileSheet.tsx
export default function MobileSheet({
    title,
    subtitle,
    footer,
    onClose,
    children,
}: React.PropsWithChildren<{
    title: string;
    subtitle?: string;
    footer?: React.ReactNode;
    onClose: () => void;
}>) {
    const ref = useRef<HTMLDivElement>(null);
    const reduced = useLiquidReduced();
    const [closing, setClosing] = useState(false);
    const closed = useRef(false);
    const close = useCallback(() => setClosing(true), []);
    const finishClose = () => {
        if (closing && !closed.current) { closed.current = true; onClose(); }
    };
    useEffect(() => registerModalBack(close), [close]);
    const { t } = useTranslation();
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        ref.current?.focus();
        const key = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close();
            }
            if (event.key !== 'Tab') return;
            const nodes = ref.current?.querySelectorAll<HTMLElement>(
                'button:not(:disabled),input,select,[tabindex="0"]'
            );
            if (!nodes?.length) return;
            const first = nodes[0],
                last = nodes[nodes.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', key, true);
        return () => {
            document.removeEventListener('keydown', key, true);
            previous?.focus();
        };
    }, [close]);
    return createPortal(
        <motion.div
            initial={{ opacity: reduced ? 1 : 0 }}
            animate={{ opacity: closing ? 0 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : TY_DURATION.panelExit }}
            onAnimationComplete={finishClose}
            style={{ animation: 'none' }}
            className="mobile-library ml-sheet-scrim"
            data-closing={closing || undefined}
            onClick={(event) => {
                if (!ref.current?.contains(event.target as Node)) close();
            }}
        >
            <MobileScrollFrame className="ml-sheet-frame">
                <motion.div
                    initial={{ y: reduced ? 0 : '100%' }}
                    animate={{ y: closing ? '100%' : 0 }}
                    exit={{ y: '100%', transition: { duration: reduced ? 0 : TY_DURATION.panelExit } }}
                    transition={reduced ? { duration: 0 } : closing ? { duration: TY_DURATION.panelExit } : TY_SPRING.panel}
                    style={{
                        animation: 'none',
                        borderTopLeftRadius: 24,
                        borderTopRightRadius: 24,
                        paddingLeft: 20,
                        paddingRight: 20,
                        ...(footer ? { display: 'flex', flexDirection: 'column', maxHeight: '88dvh', overflow: 'hidden' } : {}),
                    }}
                    ref={ref}
                    tabIndex={-1}
                    role="dialog"
                    aria-modal="true"
                    data-folia-keyboard-window="true"
                    aria-label={title}
                    className="ml-sheet"
                >
                    <header className="shrink-0" style={{ alignItems: subtitle ? 'flex-start' : 'center' }}>
                        <div>
                            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{title}</h2>
                            {subtitle && <p style={{ fontSize: 12, opacity: 0.72, margin: '4px 0 0' }}>{subtitle}</p>}
                        </div>
                        <button className="ml-icon" style={{ minWidth: 48, minHeight: 48 }} aria-label={t('mobileLibrary.close')} onClick={close}>
                            <X />
                        </button>
                    </header>
                    {footer ? (
                        <>
                            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-0.5">
                                {children}
                            </div>
                            <div
                                className="shrink-0 pt-3 border-t border-current/10"
                                style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' }}
                            >
                                {footer}
                            </div>
                        </>
                    ) : children}
                </motion.div>
            </MobileScrollFrame>
        </motion.div>,
        document.body
    );
}
