import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [closing, setClosing] = useState(false);
    const close = useCallback(() => {
        if (timer.current !== null) return;
        setClosing(true);
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        timer.current = setTimeout(onClose, reduced ? 0 : 160);
    }, [onClose]);
    useEffect(
        () => () => {
            if (timer.current !== null) clearTimeout(timer.current);
        },
        []
    );
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
        <div
            className="mobile-library ml-sheet-scrim"
            data-closing={closing || undefined}
            onClick={(event) => {
                if (event.target === event.currentTarget) close();
            }}
        >
            <MobileScrollFrame className="ml-sheet-frame">
                <div
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
                </div>
            </MobileScrollFrame>
        </div>,
        document.body
    );
}
