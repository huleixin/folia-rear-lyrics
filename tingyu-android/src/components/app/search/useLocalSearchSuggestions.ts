import { useEffect, useState } from 'react';
import type { LocalSong } from '../../../types';
import type { SearchSuggestion } from '../../../types/search';
import { localSearchSuggestions } from '../../../services/search/localSuggestions';

// src/components/app/search/useLocalSearchSuggestions.ts
export function useLocalSearchSuggestions(songs:readonly LocalSong[],query:string,enabled:boolean){
    const [snapshot,setSnapshot]=useState<{songs:readonly LocalSong[];query:string;items:SearchSuggestion[]}|null>(null);
    useEffect(()=>{
        if(!enabled||!query.trim())return;
        const controller=new AbortController();
        const timer=setTimeout(()=>{void localSearchSuggestions(songs,query,controller.signal).then(items=>{
            if(!controller.signal.aborted)setSnapshot({songs,query,items});
        }).catch(()=>{/* Cancelled input never publishes partial results. */});},300);
        return()=>{clearTimeout(timer);controller.abort();};
    },[songs,query,enabled]);
    return enabled&&snapshot?.query===query&&snapshot.songs===songs?snapshot.items:[];
}
