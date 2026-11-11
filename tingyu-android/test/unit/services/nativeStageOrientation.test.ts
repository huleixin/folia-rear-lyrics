import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { NativeStageOrientationState, StageOrientationCommand } from '@/services/nativeStageOrientation';

// test/unit/services/nativeStageOrientation.test.ts
const mocks = vi.hoisted(() => ({ plugin: { setStageOrientation: vi.fn(), getStageOrientation: vi.fn(), addListener: vi.fn() } }));
vi.mock('@/platform/foliaNative', () => ({ getFoliaNative: () => mocks.plugin }));
vi.mock('@/utils/platform', () => ({ isAndroidNativeRuntime: () => true }));
let listeners: Set<(state: NativeStageOrientationState) => void>;
let current: NativeStageOrientationState;
const frame = (patch: Partial<NativeStageOrientationState> = {}) => ({ ...current, revision: current.revision + 1, ...patch });
const emit = (state: NativeStageOrientationState) => { current = state; listeners.forEach(listener => listener(state)); };
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
let api: typeof import('@/services/nativeStageOrientation');
beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks(); listeners = new Set();
    current = { session: '', active: false, landscape: false, pending: false, revision: 0, reason: 'initial' };
    mocks.plugin.addListener.mockImplementation((_name, listener) => {
        listeners.add(listener); return Promise.resolve({ remove: vi.fn(async () => { listeners.delete(listener); }) });
    });
    mocks.plugin.setStageOrientation.mockImplementation(async (command: StageOrientationCommand) => {
        const matching = command.session === current.session;
        if (command.active === true) emit(frame({ session: command.session, active: true, landscape: false, pending: false }));
        else if (command.active === false && matching) emit(frame({ active: false, landscape: false, pending: false }));
        else if (typeof command.landscape === 'boolean' && matching) emit(frame({ landscape: command.landscape }));
        return current;
    });
    api = await import('@/services/nativeStageOrientation');
});
afterEach(async () => { await api.resetStageOrientation(); });

it('uses a newer native Back event over an older toggle promise response', async () => {
    const changed = vi.fn(); const session = api.createStageOrientationSession(changed); await session.ready;
    const reply = deferred<NativeStageOrientationState>();
    mocks.plugin.setStageOrientation.mockImplementationOnce(() => reply.promise);
    const toggling = session.toggle(); await vi.waitFor(() => expect(mocks.plugin.setStageOrientation).toHaveBeenCalledTimes(2));
    const older = frame({ landscape: true, pending: false }); emit(older);
    emit(frame({ landscape: false, pending: false, reason: 'back' }));
    reply.resolve(older); await toggling;
    expect(changed).toHaveBeenLastCalledWith({ landscape: false, pending: false, error: undefined });
    expect(mocks.plugin.addListener).toHaveBeenCalledWith('stageOrientationChanged', expect.any(Function));
});

it('serializes unmount restoration after submitted rotation and before new activation', async () => {
    const changed = vi.fn(); const old = api.createStageOrientationSession(changed); await old.ready;
    const reply = deferred<NativeStageOrientationState>();
    mocks.plugin.setStageOrientation.mockImplementationOnce(() => reply.promise);
    const toggle = old.toggle(); await vi.waitFor(() => expect(mocks.plugin.setStageOrientation).toHaveBeenCalledTimes(2));
    const closing = old.close(); const next = api.createStageOrientationSession(vi.fn());
    reply.resolve(frame({ landscape: true })); await toggle; await closing; await next.ready;
    const commands = mocks.plugin.setStageOrientation.mock.calls.map(([command]) => command);
    expect(commands.map(command => command.active ?? 'rotate')).toEqual([true, 'rotate', false, true]);
    expect(commands[2].session).toBe(commands[0].session); expect(commands[3].session).not.toBe(commands[0].session);
    expect(changed).toHaveBeenLastCalledWith({ landscape: false, pending: false });
    expect(listeners.size).toBe(1);
});

it('drops queued clicks and removes a listener that resolves after unmount', async () => {
    const registration = deferred<{ remove(): Promise<void> }>(); const remove = vi.fn(async () => {});
    mocks.plugin.addListener.mockImplementationOnce(() => registration.promise);
    const session = api.createStageOrientationSession(vi.fn()); const toggle = session.toggle();
    const closing = session.close(); registration.resolve({ remove });
    await session.ready; await toggle; await closing;
    expect(remove).toHaveBeenCalledOnce();
    expect(mocks.plugin.setStageOrientation.mock.calls.some(([command]) => command.landscape === true || command.active === true)).toBe(false);
});

it('deduplicates rapid toggles and waits for native configuration to clear pending', async () => {
    const session = api.createStageOrientationSession(vi.fn()); await session.ready;
    const reply = deferred<NativeStageOrientationState>();
    mocks.plugin.setStageOrientation.mockImplementationOnce(() => reply.promise);
    const first = session.toggle(); await session.toggle();
    await vi.waitFor(() => expect(mocks.plugin.setStageOrientation).toHaveBeenCalledTimes(2));
    const rotating = frame({ landscape: true, pending: true }); emit(rotating); reply.resolve(rotating); await first;
    await session.toggle(); expect(mocks.plugin.setStageOrientation).toHaveBeenCalledTimes(2);
    emit(frame({ pending: false, reason: 'configuration' })); await session.toggle();
    expect(mocks.plugin.setStageOrientation).toHaveBeenLastCalledWith({ session: current.session, landscape: false, revision: current.revision - 1 });
});

it('surfaces native rotation errors and stop events without changing global orientation settings', async () => {
    const changed = vi.fn(); const session = api.createStageOrientationSession(changed); await session.ready;
    emit(frame({ landscape: false, error: 'rotation denied', reason: 'rotation-failed' }));
    expect(changed).toHaveBeenLastCalledWith({ landscape: false, pending: false, error: 'rotation denied' });
    emit(frame({ landscape: false, error: undefined, reason: 'stop' }));
    expect(changed).toHaveBeenLastCalledWith({ landscape: false, pending: false, error: undefined });
    expect(mocks.plugin.setStageOrientation).toHaveBeenCalledOnce();
});
