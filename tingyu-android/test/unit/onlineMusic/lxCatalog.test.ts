import { describe, it, expect, vi, beforeEach } from 'vitest';
import kuwo from '../../fixtures/lxCatalog/kuwo.json';
import migu from '../../fixtures/lxCatalog/migu.json';
import { normalizeKuwoCatalog, normalizeMiguCatalog, searchLxCatalog } from '../../../src/services/onlineMusic/lxCatalog';
import { createLxProvider, installLxProviders } from '../../../src/services/onlineMusic/lxProviders';
import { useLxSourceStore } from '../../../src/stores/useLxSourceStore';
import type { OnlineMusicProvider } from '../../../src/types/onlineMusic';
import type { LxScript } from '../../../src/services/lxSource/contract';
const {http, resolveAudio} = vi.hoisted(()=>({http:vi.fn(),resolveAudio:vi.fn()}));
vi.mock('../../../src/services/lxSource/http',()=>({lxHttp:http}));
vi.mock('../../../src/services/lxSource/playback',()=>({resolveLxSource:resolveAudio}));

// test/unit/onlineMusic/lxCatalog.test.ts
describe('LX catalog platform adapters',()=>{
    beforeEach(()=>{vi.clearAllMocks();});
    it('normalizes real Kuwo search metadata with LX identity',()=>{
        const songs=normalizeKuwoCatalog(kuwo.abslist);
        expect(songs).toHaveLength(3);
        expect(songs[0].sourceRef).toMatchObject({providerId:'lx-kw',mediaId:'228908'});
        expect(normalizeKuwoCatalog([null,{},...kuwo.abslist])).toHaveLength(3);
        expect(songs[0].name).toBe('晴天');expect(songs[0].durationMs).toBe(269000);
    });
    it('keeps Migu copyright and catalog song IDs separate for the script',()=>{
        const songs=normalizeMiguCatalog(migu.songResultData.resultList);
        expect(songs[0].sourceRef).toMatchObject({providerId:'lx-mg',mediaId:'60054704965',providerData:{songMid:'1140505222',copyrightId:'60054704965'}});
        expect(songs[0].album.coverUrl).toMatch(/^https:/);
        expect(normalizeMiguCatalog([migu.songResultData.resultList[0],migu.songResultData.resultList[0]])).toHaveLength(1);
    });
    it('uses stable upstream page offsets and rejects invalid responses',async()=>{
        http.mockResolvedValueOnce({statusCode:200,body:kuwo});
        const page=await searchLxCatalog('kw','周杰伦',3,3);
        expect(page.nextOffset).toBe(6);expect(page.hasMore).toBe(true);
        expect(http.mock.calls[0][0]).toContain('pn=1');
        http.mockResolvedValueOnce({statusCode:200,body:{code:'error'}});
        await expect(searchLxCatalog('mg','周杰伦',3,0)).rejects.toThrow();
    });
    it('maps an existing catalog to LX without mutating the base provider song',async()=>{
        const original={id:'mid',name:'Song',artists:[],album:{id:1,name:'Album'},durationMs:1000,sourceRef:{kind:'online',providerId:'qq',mediaId:'mid',providerData:{songMid:'mid',songId:42}}};
        const base={search:{searchSongs:vi.fn(async()=>({items:[original],hasMore:false,nextOffset:1}))},lyrics:{getLyrics:vi.fn(async()=>({lyrics:null,isPureMusic:false}))}} as unknown as OnlineMusicProvider;
        const provider=createLxProvider('tx',()=>base);
        const page=await provider.search!.searchSongs('song',30,0);
        expect(page.items[0].sourceRef).toMatchObject({providerId:'lx-tx',providerData:{songMid:'mid',songId:42}});
        expect(original.sourceRef.providerId).toBe('qq');
        resolveAudio.mockResolvedValue({url:'https://example.com/song.mp3',quality:'high',fetchedAt:1});
        await provider.playback!.getAudioSource(page.items[0],'high');expect(resolveAudio).toHaveBeenCalledWith(page.items[0],'high');
        await provider.lyrics!.getLyrics(page.items[0]);expect(base.lyrics!.getLyrics).toHaveBeenCalledWith(expect.objectContaining({sourceRef:expect.objectContaining({providerId:'qq',mediaId:'mid'})}));
    });
    it('registers only platforms the enabled script supports and removes them on disable',()=>{
        const previous=useLxSourceStore.getState();
        const script={id:'test',name:'test',code:'',version:'1',description:'',author:'',homepage:'',capabilities:{kw:{name:'Kuwo',qualitys:['128k']},mg:{name:'Migu',qualitys:['flac']}}} as LxScript;
        const registered=new Map<string,OnlineMusicProvider>();
        useLxSourceStore.setState({scripts:[script],activeId:'test',revision:1});
        const unsubscribe=installLxProviders(provider=>registered.set(provider.id,provider),id=>registered.delete(id),()=>null);
        try {
            expect([...registered.keys()]).toEqual(['lx-kw','lx-mg']);
            useLxSourceStore.setState({activeId:null,revision:2});expect(registered.size).toBe(0);
        } finally {unsubscribe();useLxSourceStore.setState(previous);}
    });
});
