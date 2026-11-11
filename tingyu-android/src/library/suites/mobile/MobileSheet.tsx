import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useLiquidReduced } from '../../../components/shared/useLiquidReduced';
import { TY_DURATION, TY_SPRING } from '../../../components/shared/motionTokens';
import { registerModalBack } from '../../../services/modalBackStack';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import MobileScrollFrame from './MobileScrollFrame';

// src/library/suites/mobile/MobileSheet.tsx
export default function MobileSheet({
    title,
    onClose,
    children,
}: React.PropsWithChildren<{ title: string; onClose: () => void }>) {
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
                    style={{ animation: 'none' }}
                    ref={ref}
                    tabIndex={-1}
                    role="dialog"
                    aria-modal="true"
                    data-folia-keyboard-window="true"
                    aria-label={title}
                    className="ml-sheet"
                >
                    <header>
                        <h2>{title}</h2>
                        <button className="ml-icon" aria-label={t('mobileLibrary.close')} onClick={close}>
                            <X />
                        </button>
                    </header>
                    {children}
                </motion.div>
            </MobileScrollFrame>
        </motion.div>,
        document.body
    );
}
