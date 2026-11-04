import React from 'react';
import { Music2 } from 'lucide-react';
import type { StackCard } from './stackAnimator';
import { trackCoverUrl } from './demoTracks';

// src/dev/coverStack/CoverStack.tsx
// 三张（过渡瞬间四张）正面朝上的封面。位移、缩放由动画器逐帧写进 transform，
// 这里只负责层级、图片和元素注册，所以拖动过程中不会有任何 React 渲染。

interface CoverStackProps {
    cards: StackCard[];
    phase: 'idle' | 'drag' | 'commit' | 'spring';
    cardRef: (key: string) => (element: HTMLElement | null) => void;
    ghostRef: (key: string, index: number) => (element: HTMLElement | null) => void;
    stackRef: (element: HTMLDivElement | null) => void;
}

export default function CoverStack({ cards, phase, cardRef, ghostRef, stackRef }: CoverStackProps) {
    return (
        <div className="cs-stack" ref={stackRef} data-busy={phase !== 'idle'} data-testid="cover-stack">
            {cards.map((card, index) => {
                const url = trackCoverUrl(card.song);
                return (
                    <div
                        key={card.key}
                        ref={cardRef(card.key)}
                        className="cs-card"
                        data-role={card.moving ? 'moving' : 'stack'}
                        data-depth={Math.min(index, 3)}
                        data-song={card.song?.id ?? 'none'}
                        style={{ zIndex: 40 - index * 10 }}
                    >
                        {url ? (
                            <img className="cs-card__img" src={url} alt={card.song ? `${card.song.name} 封面` : ''} draggable={false} decoding="async" />
                        ) : (
                            <div className="cs-card__empty">
                                <Music2 size={34} strokeWidth={1.3} aria-hidden="true" />
                                {card.song ? <span>{card.song.name}</span> : <span>队列为空</span>}
                            </div>
                        )}
                        {card.moving && url
                            ? [0, 1, 2].map(index2 => (
                                <img
                                    key={index2}
                                    ref={ghostRef(card.key, index2)}
                                    className="cs-card__ghost"
                                    src={url}
                                    alt=""
                                    aria-hidden="true"
                                    draggable={false}
                                    decoding="async"
                                />
                            ))
                            : null}
                    </div>
                );
            })}
        </div>
    );
}
