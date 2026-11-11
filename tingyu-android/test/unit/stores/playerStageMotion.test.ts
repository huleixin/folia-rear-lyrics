// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayerViewModeStore, NATIVE_STAGE_TRANSITION_TIMEOUT_MS } from '../../../src/stores/usePlayerViewModeStore';

// test/unit/stores/playerStageMotion.test.ts
// The real renderer must not disappear while a delayed native transition still owns it.
describe('native stage completion ownership',()=>{
    const store=usePlayerViewModeStore;
    beforeEach(()=>{
        vi.useFakeTimers();store.getState().endStageTransition();
        store.setState({mode:'minimal',detour:false,stageTransition:'idle',stageTransitionId:0});
        document.documentElement.dataset.nativePlayerMotion='true';
    });
    afterEach(()=>{store.getState().endStageTransition();delete document.documentElement.dataset.nativePlayerMotion;vi.useRealTimers()});
    it('keeps the outgoing stage beyond the old 400ms until native acknowledges its return',()=>{
        store.getState().openStage();store.getState().acknowledgeStageTransition(true,store.getState().stageTransitionId);
        store.getState().closeStage();vi.advanceTimersByTime(700);
        expect(store.getState().stageTransition).toBe('to-minimal');
        store.getState().acknowledgeStageTransition(false,store.getState().stageTransitionId);
        expect(store.getState().stageTransition).toBe('idle');
    });
    it('does not let an old entrance acknowledgment terminate a new return',()=>{
        store.getState().openStage();store.getState().closeStage();
        store.getState().acknowledgeStageTransition(true,store.getState().stageTransitionId);
        expect(store.getState().stageTransition).toBe('to-minimal');
        store.getState().acknowledgeStageTransition(false,store.getState().stageTransitionId);
        expect(store.getState().stageTransition).toBe('idle');
    });
    it('ignores an old return acknowledgment when the user immediately reopens the stage',()=>{
        store.getState().openStage();store.getState().closeStage();store.getState().openStage();
        store.getState().acknowledgeStageTransition(false,store.getState().stageTransitionId);
        expect(store.getState().stageTransition).toBe('to-stage');
        store.getState().acknowledgeStageTransition(true,store.getState().stageTransitionId);
        expect(store.getState().stageTransition).toBe('idle');
    });
    it('ignores a stale acknowledgment even after a complete open-close-open-close cycle',()=>{
        store.getState().openStage();store.getState().closeStage();
        const oldToken=store.getState().stageTransitionId;
        store.getState().openStage();store.getState().closeStage();
        store.getState().acknowledgeStageTransition(false,oldToken);
        expect(store.getState().stageTransition).toBe('to-minimal');
        store.getState().acknowledgeStageTransition(false,store.getState().stageTransitionId);
        expect(store.getState().stageTransition).toBe('idle');
    });
    it('cannot remain stuck if the native bridge disappears',()=>{
        store.getState().openStage();vi.advanceTimersByTime(NATIVE_STAGE_TRANSITION_TIMEOUT_MS+1);
        expect(store.getState().stageTransition).toBe('idle');
    });
    it('preserves the existing browser fallback duration',()=>{
        delete document.documentElement.dataset.nativePlayerMotion;
        store.getState().openStage();vi.advanceTimersByTime(401);
        expect(store.getState().stageTransition).toBe('idle');
    });
});
