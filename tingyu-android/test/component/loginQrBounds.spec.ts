import {test,expect} from './fixtures';
// Real browser layout: QR dimensions stay bounded independently of root font scaling.
for(const viewport of [{width:393,height:852},{width:1280,height:800},{width:640,height:360},{width:1920,height:1080}]){
    test(`QR fits ${viewport.width}x${viewport.height} with large fonts`,async({page,mount},testInfo)=>{
        await page.setViewportSize(viewport);
        const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
        await mount('loginQrBounds');
        await page.evaluate(()=>{document.documentElement.style.fontSize='32px'});
        const dialog=page.getByRole('dialog',{name:'Layout test'});
        await expect(dialog).toBeVisible();
        const image=dialog.getByRole('img',{name:'QR Code'});await image.scrollIntoViewIfNeeded();
        const box=await image.boundingBox();expect(box).not.toBeNull();
        expect(box!.width).toBeLessThanOrEqual(161);expect(box!.height).toBeLessThanOrEqual(161);
        expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(viewport.width);
        await page.screenshot({path:testInfo.outputPath('qr-bounds.png')});
        await dialog.getByRole('button',{name:'Close login'}).click();await expect(page.getByText('Closed',{exact:true})).toBeVisible();
        expect(errors).toEqual([]);
    });
}
