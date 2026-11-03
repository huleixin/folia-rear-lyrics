import { useEffect, useRef, useState } from 'react';
import type { SongResult } from '../../../../types';
import { getPlaybackSongKey } from '../../../../utils/appPlaybackGuards';
import { getSongCoverUrl } from '../../../../services/onlineMusic/songMetadata';

// src/components/app/overlays/minimal-stage/useMinimalArtwork.ts
// Image recovery owns only its new cache URLs. It never revokes a URL supplied by the player.
const ready = new Set<string>();
const remember = (url: string) => {
    ready.delete(url); ready.add(url);
    if (ready.size > 16) ready.delete(ready.values().next().value!);
};
export const forgetMinimalArtwork = (url: string) => ready.delete(url);

type Picture = { key: string; url: string };
export function useMinimalArtwork(url: string | null, track?: SongResult | null) {
    const key = track ? getPlaybackSongKey(track) : url ?? '';
    const remote = track ? getSongCoverUrl(track) || null : null;
    const trackRef = useRef(track); trackRef.current = track;
    const [picture, setPicture] = useState<Picture | null>(() => url && ready.has(url) ? {key,url} : null);
    const [failed, setFailed] = useState(false);
    const [revision, setRevision] = useState(0);
    const budget = useRef({request:'',count:0});
    const owned = useRef(new Set<string>());
    // A track change never paints the preceding track; stale cache reads are revoked on arrival.
    useEffect(() => () => { owned.current.forEach(value => { ready.delete(value); URL.revokeObjectURL(value); }); owned.current.clear(); }, [key]);
    useEffect(() => {
        const request = `${key}\n${url ?? ''}\n${remote ?? ''}`;
        if (budget.current.request !== request) budget.current = {request,count:0};
        let alive = true;
        let cancelLoad = () => {};
        let cancelCache = () => {};
        setFailed(false);
        const load = (source: string) => new Promise<boolean>(resolve => {
            if (!alive || budget.current.count >= 4) { resolve(false); return; }
            budget.current.count++;
            const image = new Image();
            image.decoding = 'async';
            let settled = false;
            const finish = (ok: boolean) => {
                if (settled) return; settled = true;
                clearTimeout(timer); image.onload = null; image.onerror = null;
                if (!ok) { ready.delete(source); image.removeAttribute?.('src'); }
                resolve(ok && alive);
            };
            // A stalled decode/network must not leave the card permanently empty.
            const timer = window.setTimeout(() => finish(false), 4500);
            cancelLoad = () => finish(false);
            image.onload = () => {
                if (typeof image.decode === 'function') void image.decode().then(() => finish(true), () => finish(image.naturalWidth > 0));
                else finish(image.naturalWidth > 0);
            };
            image.onerror = () => finish(false);
            image.src = source;
            if (image.complete && image.naturalWidth > 0) image.onload?.(new Event('load'));
        });
        const attempt = async (source: string | null) => {
            if (!source || !alive || !(await load(source)) || !alive) return false;
            remember(source); setPicture({key,url:source}); return true;
        };
        void (async () => {
            if (await attempt(url)) return;
            if (!alive) return;
            const song = trackRef.current;
            if (song && getPlaybackSongKey(song) === key) {
                try {
                    const {getCachedSongCoverUrl} = await import('../../../../services/onlineMusic/resourceCache');
                    if (!alive) return;
                    let expired = false;
                    const recovered = await new Promise<string|null>(resolve => {
                        const finish = (value:string|null) => { if (expired) return; expired = true; clearTimeout(deadline); resolve(value); };
                        const deadline = window.setTimeout(() => finish(null), 2000);
                        cancelCache = () => finish(null);
                        void getCachedSongCoverUrl(song).then(value => {
                            if (expired) { if (value?.startsWith('blob:')) URL.revokeObjectURL(value); }
                            else finish(value);
                        }, () => finish(null));
                    });
                    if (!alive) { if (recovered?.startsWith('blob:')) URL.revokeObjectURL(recovered); return; }
                    if (recovered?.startsWith('blob:')) {
                        owned.current.add(recovered);
                        if (owned.current.size > 4) { const oldest = owned.current.values().next().value!; ready.delete(oldest); URL.revokeObjectURL(oldest); owned.current.delete(oldest); }
                    }
                    if (await attempt(recovered)) return;
                } catch { /* Continue to this track's original metadata; never another song. */ }
            }
            if (remote !== url && await attempt(remote)) return;
            // One retry only; no cache-busting query parameters or background polling.
            if (await attempt(url)) return;
            if (alive) setFailed(true);
        })();
        return () => { alive = false; cancelLoad(); cancelCache(); };
    }, [key,url,remote,revision]);
    const painted = picture?.key === key ? picture.url : null;
    const recover = () => {
        if (painted) ready.delete(painted);
        setPicture(null);
        if (budget.current.count < 4) setRevision(value => value + 1);
        else setFailed(true);
    };
    return {source:painted,failed,recover};
}
