import { newQuickJSWASMModuleFromVariant, newVariant, type QuickJSContext } from 'quickjs-emscripten-core';
import RELEASE_SYNC from '@jitl/quickjs-wasmfile-release-sync';
import wasmUrl from '@jitl/quickjs-wasmfile-release-sync/wasm?url';
import { lxBootstrap } from './bootstrap';
import { lxUtility } from './utilities';

// src/services/lxSource/runtime.worker.ts
let vm: QuickJSContext | null = null;
let deadline = 0;
let remainingJobs = 20000;
let messageCount = 0;
let evaluating = false;
let initMessage: unknown = null;
function run(code: string) {
    if (!vm) throw Error('LX runtime not initialized');
    deadline = Date.now() + 300;
    messageCount = 0;
    vm.unwrapResult(vm.evalCode(code)).dispose();
    while (vm.runtime.hasPendingJob()) {
        if (--remainingJobs < 0 || Date.now() > deadline) throw Error('音源脚本执行超时');
        vm.runtime.executePendingJobs(1).unwrap();
    }
}
self.onmessage = async event => {
    const data = event.data;
    try {
        if (data.kind === 'init') {
            const module = await newQuickJSWASMModuleFromVariant(newVariant(RELEASE_SYNC, { wasmLocation: wasmUrl }));
            vm = module.newContext();
            vm.runtime.setMemoryLimit(24 * 1024 * 1024);
            vm.runtime.setMaxStackSize(256 * 1024);
            vm.runtime.setInterruptHandler(() => Date.now() > deadline);
            vm.newFunction('emit', input => {
                const raw = vm!.getString(input);
                if (raw.length > 2 * 1024 * 1024) throw Error('LX message too large');
                if (++messageCount > 64) throw Error('LX message limit exceeded');
                const message = JSON.parse(raw);
                if (message.kind === 'inited' && evaluating) initMessage = message;
                else self.postMessage(message);
            }).consume(handle => vm!.setProp(vm!.global, '__emit', handle));
            vm.newFunction('utility', input => vm!.newString(lxUtility(vm!.getString(input)))).consume(handle => vm!.setProp(vm!.global, '__utility', handle));
            run(lxBootstrap);
            run(`lx.currentScriptInfo=${JSON.stringify(data.metadata)};`);
            evaluating = true;
            run(data.code);
            evaluating = false;
            if (initMessage) { self.postMessage(initMessage); initMessage = null; }
        } else if (data.kind === 'request') {
            remainingJobs = 20000;
            run(`__request(${JSON.stringify(data)});`);
        } else if (data.kind === 'deliver') run(`__deliver(${JSON.stringify(data)});`);
    } catch (error) { self.postMessage({ kind: 'fatal', error: error instanceof Error ? error.message : String(error) }); }
};
