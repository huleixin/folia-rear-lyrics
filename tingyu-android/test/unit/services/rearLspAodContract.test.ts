import {readFileSync} from 'node:fs';
import path from 'node:path';
import {it,expect} from 'vitest';

// test/unit/services/rearLspAodContract.test.ts
const read=(name:string)=>readFileSync(path.resolve('android/app/src/main/java/io/github/huleixin/tingyu',name),'utf8');
it('retains identity gates and keeps inactive AOD bridge pixels invisible without pausing the retained document',()=>{
    const source=read('RearHostView.java');
    expect(source).toContain('!binding.associated||!root||!own');
    expect(source).toContain('binding.center,binding.active');
    const bridge=source.slice(source.indexOf('else if(decision.remainingMs>0)'),source.indexOf('sendMode();trace(')>0?source.indexOf('sendMode();trace('):source.indexOf('        sendMode();'));
    expect(bridge).toContain('shown=false');
    expect(bridge).toContain('stage.setVisibility(View.INVISIBLE)');
    expect(bridge).not.toContain('pauseRenderer()');
    expect(source).toContain('main.removeCallbacks(transitionTimeout);main.removeCallbacks(drawTimeout)');
});
it('acquires only after native draw and records explicit presentation uncertainty without wake or brightness APIs',()=>{
    const source=read('RearHostView.java');
    expect(source.indexOf('super.onDraw(canvas)')).toBeLessThan(source.indexOf('card.acquire(stage)'));
    expect(source).toContain('binding.current()&&card.ownMedia()&&card.sameRoot()');
    expect(source).toContain('postVisualStateCallback');
    expect(source).toContain('presentation=unmeasured');
    expect(source).toContain('iframeApplied');
    expect(source).not.toMatch(/WakeLock|POLICY_BRIGHT|setScreenBrightness|startActivity/);
    const owner=read('RearNativeCardOwner.java');
    expect(owner).toContain('sameMediaSession(');expect(owner).toContain('!binding.current()');
});
it('separates functional mode edges from diagnostic snapshots and does not expire hidden cards as normal frames',()=>{
    const source=read('RearHostView.java');
    expect(source).toContain('if(lastReportedEpoch!=modeEpoch)');
    const trace=source.slice(source.indexOf('private void trace('),source.indexOf('private void sendMode('));
    expect(trace).not.toContain('"render-mode"');
    expect(read('RearHostBridge.java')).toContain('if(!RearHostFrameWait.requiredForMode(renderMode))return;');
    expect(read('RearHostBridge.java')).toContain('RearHostPolicy.invalidatesDrawnState(event,renderMode)');
    expect(source).toContain('boolean qualified=frameEvidence.recordDraw(modeEpoch)');
    expect(source).toContain('!card.owned()&&qualified&&binding.current()');
});
it('disconnects every hardware-camera suspension path from native cards while preserving Shizuku handoff',()=>{
    const coordinator=read('RearLyricsCoordinator.java'),bridge=read('RearHostBridge.java'),hooks=read('RearHostHooks.java'),view=read('RearHostView.java');
    expect(coordinator).not.toContain('RearHostBridge.suspend(');
    expect(coordinator).toContain('RearCameraPolicy.monitorRequired(LspRearBridge.selected(context),enabled,dismissed)');
    expect(coordinator).toContain('RearCameraPolicy.blocksPresentation(LspRearBridge.selected(context)');
    const camera=coordinator.slice(coordinator.indexOf('private void cameraChanged('),coordinator.indexOf('private void evaluateRear('));
    expect(camera).toContain('if(LspRearBridge.selected(context))return;');
    const nativeHeartbeat=coordinator.slice(coordinator.indexOf('private void checkWindow()'),coordinator.indexOf('// 锁屏跳变 →'));
    expect(nativeHeartbeat).not.toContain('cameraMonitor.blocked()');
    expect(bridge).not.toContain('transact(RearHostContract.SUSPEND');
    expect(bridge).not.toContain('active && !suspended');
    expect(bridge).toContain('if(!RearLyricsCoordinator.get(context).canPresent())return;');
    const legacy=hooks.slice(hooks.indexOf('if (code == RearHostContract.SUSPEND)'),hooks.indexOf('} else if (code == RearHostContract.PROBE)'));
    expect(legacy).toContain('legacy-camera-suspend-ignored');
    expect(legacy).not.toMatch(/suspended\s*=|host\.suspended|attach\(/);
    expect(view).not.toMatch(/camera-command|void suspended\(|boolean[^;]*\bsuspended\b/);
    expect(read('RearCardRenderPolicy.java')).not.toContain('"camera"');
    expect(coordinator).toContain('observation.set(wanted(), cameraMonitor.blocked(), rearTaskCamera, mainTaskCamera');
    expect(coordinator).toContain('startCameraRelease(now)');expect(coordinator).toContain('startCameraRestore(now)');
});
