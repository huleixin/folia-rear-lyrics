import { useEffect, useRef, useState } from 'react';
import type { SongResult } from '../../../../types';
import { getPlaybackSongKey } from '../../../../utils/appPlaybackGuards';
import { getSongCoverUrl } from '../../../../services/onlineMusic/songMetadata';
import { navigationMark } from '../../../../services/navigationTiming';

// src/components/app/overlays/minimal-stage/useMinimalArtwork.ts
// Image recovery owns only its new cache URLs. It never revokes a URL supplied by the player.
type Picture = { key: string; url: string; image: HTMLImageElement };
export function useMinimalArtwork(url: string | null, track?: SongResult | null) {
    const key = track ? getPlaybackSongKey(track) : url ?? '';
    const remote = track ? getSongCoverUrl(track) || null : null;
    const trackRef = useRef(track); trackRef.current = track;
    const [picture, setPicture] = useState<Picture | null>(null);
    const [failedRequest, setFailedRequest] = useState<string | null>(null);
    const [revision, setRevision] = useState(0);
    const budget = useRef({request:'',count:0});
    const owned = useRef(new Set<string>());
    const resourceRequest = `${key}\n${url ?? ''}\n${remote ?? ''}`;
    const request = `${resourceRequest}\n${revision}`;
    // A track change never paints the preceding track; stale cache reads are revoked on arrival.
    useEffect(() => () => { owned.current.forEach(value => URL.revokeObjectURL(value)); owned.current.clear(); }, [key]);
    useEffect(() => {
        navigationMark('minimal-cover-load-start');
        if (budget.current.request !== resourceRequest) budget.current = {request:resourceRequest,count:0};
        let alive = true;
        let cancelLoad = () => {};
        let cancelCache = () => {};
        const load = (source: string) => new Promise<HTMLImageElement | null>(resolve => {
            if (!alive || budget.current.count >= 4) { resolve(null); return; }
            budget.current.count++;
            const image = new Image();
            image.decoding = 'async';
            let settled = false;
            const finish = (ok: boolean) => {
                if (settled) return; settled = true;
                clearTimeout(timer); image.onload = null; image.onerror = null;
                if (!ok) image.removeAttribute?.('src');
                resolve(ok && alive ? image : null);
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
            if (!source || !alive) return false;
            const image = await load(source);
            if (!image || !alive) return false;
            navigationMark('minimal-cover-decode-ready');
            setPicture({key,url:source,image}); return true;
        };
        void (async () => {
            // A missing cached URL must not put a known remote cover behind an IndexedDB read.
            if (await attempt(url || remote)) return;
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
                        if (owned.current.size > 4) { const oldest = owned.current.values().next().value!; URL.revokeObjectURL(oldest); owned.current.delete(oldest); }
                    }
                    if (await attempt(recovered)) return;
                } catch { /* Continue to this track's original metadata; never another song. */ }
            }
            if (url && remote !== url && await attempt(remote)) return;
            // One retry only; no cache-busting query parameters or background polling.
            if (await attempt(url)) return;
            if (alive) setFailedRequest(request);
        })();
        return () => { alive = false; cancelLoad(); cancelCache(); };
    }, [key,url,remote,revision,request,resourceRequest]);
    const painted = picture?.key === key ? picture.url : null;
    const recover = () => {
        setPicture(null);
        if (budget.current.count < 4) setRevision(value => value + 1);
        else setFailedRequest(request);
    };
    return {source:painted,image:picture?.key === key ? picture.image : null,failed:failedRequest === request,recover};
}
