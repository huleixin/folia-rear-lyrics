import type { LocalSong } from '../../types';
import type { SearchSuggestion } from '../../types/search';

// src/services/search/localSuggestions.ts
/** Yield between chunks so a large imported library cannot monopolize input rendering. */
export async function localSearchSuggestions(songs:readonly LocalSong[],query:string,signal:AbortSignal):Promise<SearchSuggestion[]> {
    const term=query.trim().toLocaleLowerCase();
    if(!term)return [];
    const found=new Map<string,string>();
    for(let start=0;start<songs.length&&found.size<12;start+=256){
        if(signal.aborted)throw new DOMException('Cancelled','AbortError');
        for(const song of songs.slice(start,start+256)){
            const metadata=song.onlineMetadata;
            const words=[song.title,...(metadata?.artists.map(a=>a.name)??song.importedMetadata.artistNames),metadata?.album?.name??song.importedMetadata.albumName];
            for(const word of words){
                const text=word?.trim();
                if(text&&text.toLocaleLowerCase().includes(term))found.set(text.toLocaleLowerCase(),text);
                if(found.size>=12)break;
            }
            if(found.size>=12)break;
        }
        if(start+256<songs.length&&found.size<12)await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
    if(signal.aborted)throw new DOMException('Cancelled','AbortError');
    return [...found.values()].map(text=>({kind:'keyword',text}));
}
