import React from 'react';

// src/components/app/search/searchHighlight.tsx
/** 只高亮真正的匹配片段；空关键词或纯空白时不拆词，避免整行变色。 */
export const HighlightedText: React.FC<{ text: string; query: string }> = ({ text, query }) => {
    const needle = query.trim();
    if (!needle) return <>{text}</>;
    const index = text.toLowerCase().indexOf(needle.toLowerCase());
    if (index < 0) return <>{text}</>;
    return (
        <>
            {text.slice(0, index)}
            <span className="ty-suggest-hit">{text.slice(index, index + needle.length)}</span>
            {text.slice(index + needle.length)}
        </>
    );
};
