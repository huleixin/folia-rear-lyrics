// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { pickLxScript } from '@/services/lxSource/importFile';

// test/unit/services/lxSourceImport.test.ts
const fixture=vi.hoisted(()=>({android:true,pick:vi.fn()}));
vi.mock('@/platform/foliaNative',()=>({getFoliaNative:()=>({pickLxSourceFile:fixture.pick})}));
vi.mock('@/utils/platform',()=>({isAndroidNativeRuntime:()=>fixture.android}));
const code='/**\n * @name Test source\n * @version 1.0\n */\nconst test = true;';
afterEach(()=>{vi.restoreAllMocks();fixture.pick.mockReset();fixture.android=true});
it('opens the native document picker instead of an untrusted HTML file click',async()=>{
    fixture.pick.mockResolvedValue({name:'我的音源.js',text:code});
    const click=vi.spyOn(HTMLInputElement.prototype,'click');
    expect(await pickLxScript()).toMatchObject({name:'Test source',version:'1.0',code});
    expect(fixture.pick).toHaveBeenCalledOnce();expect(click).not.toHaveBeenCalled();
});
it('handles cancellation without importing or showing an error',async()=>{
    fixture.pick.mockResolvedValue({cancelled:true});expect(await pickLxScript()).toBeNull();
});
it('reports picker errors and rejects invalid or oversized script content',async()=>{
    fixture.pick.mockRejectedValueOnce(new Error('Unable to open document picker'));
    await expect(pickLxScript()).rejects.toThrow('Unable to open');
    fixture.pick.mockResolvedValueOnce({name:'wrong.txt',text:code});await expect(pickLxScript()).rejects.toThrow('.js');
    fixture.pick.mockResolvedValueOnce({name:'large.js',text:code+' '.repeat(1048576)});await expect(pickLxScript()).rejects.toThrow('1 MB');
});
it('keeps the normal browser file chooser as a synchronous click fallback',async()=>{
    fixture.android=false;
    vi.spyOn(HTMLInputElement.prototype,'click').mockImplementation(function(this:HTMLInputElement){
        Object.defineProperty(this,'files',{value:[{name:'source.js',size:code.length,text:async()=>code}]});
        this.dispatchEvent(new Event('change'));
    });
    expect(await pickLxScript()).toMatchObject({name:'Test source'});expect(fixture.pick).not.toHaveBeenCalled();
});
