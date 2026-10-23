import React from 'react';
import type { ProbeDefinition } from './definition';
import SearchSuggestions from '../../src/components/app/search/SearchSuggestions';

// dev/probes/searchSuggestions.probe.tsx
function Probe() {
    return <div className="ty-search" data-light={undefined} style={{ position: 'static', height: '100dvh' }}>
        <div className="ty-search-scroll">
            <SearchSuggestions
                query="许嵩"
                status="ready"
                historyMatches={['许嵩 安泊猜想']}
                items={[
                    { kind: 'artist', hit: { providerId: 'qq', id: '000CK5xN3yZDJt', name: '许嵩', description: '歌曲:430  专辑:59  视频:1481' } },
                    { kind: 'song', id: '001bLkWD2EYA4P', name: '天龙八部之宿敌', artistName: '许嵩' },
                    { kind: 'album', hit: { providerId: 'qq', id: '002KSDg90IaScI', name: '自定义', artistName: '许嵩' } },
                    { kind: 'keyword', text: '许嵩 安泊猜想' },
                ]}
                onKeyword={() => {}}
                onArtist={() => {}}
                onAlbum={() => {}}
                onSong={() => {}}
            />
        </div>
    </div>;
}

export default {
    id: 'searchSuggestions',
    title: 'Tingyu search suggestions',
    description: 'Compact suggestion rows for artist, song, album and keyword with match highlighting.',
    Component: Probe,
} satisfies ProbeDefinition;
