import {expect,it} from 'vitest';
import type {LocalSong} from '@/types';
import {localSearchSuggestions} from '@/services/search/localSuggestions';

// test/unit/search/localSuggestions.test.ts
const song=(title:string,artist:string,album:string)=>({title,importedMetadata:{artistNames:[artist],albumName:album}} as LocalSong);
it('uses real local titles, artists and albums, deduplicated without file paths',async()=>{
    expect(await localSearchSuggestions([song('海岸','海风','海岛'),song('海岸','海风','海岛')],'海',new AbortController().signal)).toEqual(['海岸','海风','海岛'].map(text=>({kind:'keyword',text})));
});
it('cancels between chunks instead of publishing a stale partial result',async()=>{
    const controller=new AbortController();const request=localSearchSuggestions(Array.from({length:2000},()=>song('other','artist','album')),'target',controller.signal);
    controller.abort();await expect(request).rejects.toMatchObject({name:'AbortError'});
});
it('limits matches and skips an empty query',async()=>{
    const songs=Array.from({length:100},(_,i)=>song('match '+i,'',''));
    expect(await localSearchSuggestions(songs,'match',new AbortController().signal)).toHaveLength(12);
    expect(await localSearchSuggestions(songs,'',new AbortController().signal)).toEqual([]);
});
