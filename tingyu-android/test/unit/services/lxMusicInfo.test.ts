import { expect, it } from 'vitest';
import { buildLxMusicInfo } from '@/services/lxSource/musicInfo';
import type { SongResult } from '@/types';

// test/unit/services/lxMusicInfo.test.ts
it('keeps QQ mid, numeric song id and media mid distinct, with both script record shapes',()=>{
    const song={id:560651613,name:'像晴天像雨天',artists:[{id:1,name:'汪苏泷'}],album:{id:'album',name:'原声带'},durationMs:236000,
        sourceRef:{kind:'online',providerId:'qq',mediaId:'003sZs4P2hFUVQ',providerData:{songId:560651613,songMid:'003sZs4P2hFUVQ',mediaMid:'media-file',albumMid:'001V8PDy1om05K',source:'wrong'}}} as SongResult;
    const before=structuredClone(song),info=buildLxMusicInfo(song,'tx',{name:'QQ',qualitys:['128k','320k']});
    expect(info).toMatchObject({id:'003sZs4P2hFUVQ',source:'tx',songmid:'003sZs4P2hFUVQ',songId:560651613,strMediaMid:'media-file',interval:'3:56',albumId:'001V8PDy1om05K',
        meta:{songId:560651613,strMediaMid:'media-file'},_types:{'320k':{type:'320k'}}});
    expect(song).toEqual(before);
});
