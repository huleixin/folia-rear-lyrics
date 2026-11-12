import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {collectMachiLettering,MachiRearFraming} from '../../../src/components/visualizer/machi/engine/rearFraming';
import {MachiCamera} from '../../../src/components/visualizer/machi/engine/camera';

// Native sign geometry must remain inside the calibrated camera-safe rectangle through projection changes.
const safe={left:.31,top:.025,width:.665,height:.95};
function sign(x=-3,width=7,height=3){
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height));
    mesh.position.set(x,1,0);mesh.userData.machiLettering=true;
    return mesh;
}
function expectInside(camera:THREE.OrthographicCamera,faces:ReturnType<typeof collectMachiLettering>){
    const direction=camera.getWorldDirection(new THREE.Vector3()).negate();
    let visible=0;
    for(const face of faces){
        if(face.normal.dot(direction)<=.05)continue;
        visible++;
        for(const point of face.corners){
            const p=point.clone().project(camera),x=(p.x+1)/2,y=(1-p.y)/2;
            expect(x).toBeGreaterThanOrEqual(safe.left-1e-8);
            expect(x).toBeLessThanOrEqual(safe.left+safe.width+1e-8);
            expect(y).toBeGreaterThanOrEqual(safe.top-1e-8);
            expect(y).toBeLessThanOrEqual(safe.top+safe.height+1e-8);
        }
    }
    expect(visible).toBeGreaterThan(0);
}
describe('Machi rear native lettering',()=>{
    it('fits the entire real panel at multiple zooms, azimuths and aspect ratios',()=>{
        const root=new THREE.Group();root.add(sign());
        const faces=collectMachiLettering(root),fit=new MachiRearFraming();
        for(const aspect of [1,976/596,2])for(const zoom of [.75,1,2.7,3.6])for(const angle of [-.5,0,.5]){
            const camera=new THREE.OrthographicCamera(-6*aspect,6*aspect,5.7,-6.3,.1,200);
            camera.position.set(Math.sin(angle)*60,20,Math.cos(angle)*60);camera.lookAt(0,0,0);
            camera.zoom=zoom;camera.updateProjectionMatrix();fit.fit(camera,faces,safe);
            expectInside(camera,faces);
        }
    });
    it('uses transformed mesh corners and ignores back-facing panels',()=>{
        const root=new THREE.Group(),front=sign(),back=sign(50);
        back.rotation.y=Math.PI;root.position.set(2,1,0);root.add(front,back);
        const faces=collectMachiLettering(root);
        expect(faces[0].corners[0].x).toBeCloseTo(-4.5);
        const camera=new THREE.OrthographicCamera(-10,10,6,-6,.1,200);camera.position.z=60;
        new MachiRearFraming().fit(camera,faces,safe);expectInside(camera,faces);
        expect(camera.right-camera.left).toBeCloseTo(20);
    });
    it('keeps the original front projection, does not accumulate framing, and restores it when leaving rear mode',()=>{
        const framing={points:[new THREE.Vector3(-10,-4,0),new THREE.Vector3(10,6,0)],view:{azimuth:0,elevation:.4,zoom:1.3}};
        const camera=new MachiCamera();camera.setFraming(framing,null);camera.setAspect(347,212);
        const original=camera.camera.projectionMatrix.clone();camera.fitRearLettering();
        expect(camera.camera.projectionMatrix.equals(original)).toBe(true);
        camera.setRearArea(safe,collectMachiLettering(sign()));camera.fitRearLettering();
        const fitted=camera.camera.projectionMatrix.clone();
        for(let i=0;i<100;i++)camera.fitRearLettering();
        expect(camera.camera.projectionMatrix.equals(fitted)).toBe(true);
        camera.setMotion(true);
        for(let i=0;i<1000;i++){camera.update(.1,.1);camera.fitRearLettering();expectInside(camera.camera,collectMachiLettering(sign()));}
        camera.setRearArea(undefined);camera.setMotion(false);camera.update(5,0);camera.setFraming(framing,null);
        expect(camera.camera.projectionMatrix.equals(original)).toBe(true);
        camera.dispose();
    });
});
