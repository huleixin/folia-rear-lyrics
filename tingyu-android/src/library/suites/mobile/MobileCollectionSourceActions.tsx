import type { TFunction } from 'i18next';
import type { LibraryCollectionSurfaceProps } from '../../core/contracts/suite';
import type { LibraryMutationResult } from '../../core/contracts/mutations';
import type { useMobileCollection } from './useMobileCollection';
import type { NativePanelActionRow, NativePanelBlock } from '../../../types/nativePanels';

// src/library/suites/mobile/MobileCollectionSourceActions.tsx
//
// 歌单「来源动作」——重命名 / 删除 / 重扫 / 导出 / 编辑 / 每日推荐日期。
//
// 原生化专项（第 21 轮）：这里从"直接吐 <button> 的组件"改成**纯声明式模型构造器**。
// 为什么不是组件：面板的渲染已经统一到 OperationPanel（原生或 DOM 由它决定），
// 再让每个功能族自己吐 DOM 就等于把面板又分叉回两套。<br>
// 业务规则一行未变：能力位判断、禁用条件、`ask()`/`run()` 的用法与原实现逐字对应。

export type MobileMenuCommands = {
    ask: (
        label: string,
        initial: string,
        confirm: boolean,
        action: (value: string) => Promise<LibraryMutationResult>
    ) => void;
    run: (action: () => Promise<LibraryMutationResult>, done?: () => void) => Promise<void>;
    busy: boolean;
    onClose: () => void;
};

export type PanelHandlers = Record<string, (payload?: { text?: string }) => void>;

export function buildCollectionSourcePanel({
    props,
    model,
    commands,
    t,
}: {
    props: LibraryCollectionSurfaceProps;
    model: ReturnType<typeof useMobileCollection>;
    commands: MobileMenuCommands;
    /** 由调用方传入：本函数不是组件，不能自己调 hook。 */
    t: TFunction;
}): { blocks: NativePanelBlock[]; handlers: PanelHandlers } {
    const { ask, run, busy, onClose } = commands;
    const caps = model.mutations.capabilities;
    const mutations = props.mutations;
    const blocks: NativePanelBlock[] = [];
    const handlers: PanelHandlers = {};
    const row = (id: string, label: string, disabled = false, icon?: string): NativePanelActionRow =>
        ({ id, label, disabled: disabled || busy, icon });

    // ---- 刷新（能力位驱动）----
    if (model.actions.capabilities.reload.supported) {
        handlers.refresh = () => { model.actions.reload(); onClose(); };
        blocks.push({
            kind: 'actions', id: 'source-refresh',
            items: [row('refresh', t('mobileLibrary.refresh'), !model.actions.capabilities.reload.enabled)],
        });
    }

    // ---- 本地文件夹排序（与歌单排序是两套能力，不要合并）----
    if (model.supportsSort) {
        handlers.sort = payload => {
            model.sortActions.setField(payload?.text as typeof model.field);
        };
        blocks.push({
            kind: 'select', id: 'sort', label: t('mobileLibrary.sort'), value: model.field,
            options: [
                { value: 'fileName', label: t('mobileLibrary.sortName') },
                { value: 'fileLastModified', label: t('mobileLibrary.sortDate') },
                { value: 'albumTrack', label: t('mobileLibrary.sortAlbum') },
            ],
        });
        handlers.sortDirection = () => model.sortActions.setDirection(model.direction === 'asc' ? 'desc' : 'asc');
        blocks.push({
            kind: 'actions', id: 'source-sort-direction',
            items: [row('sortDirection', t(model.direction === 'asc' ? 'mobileLibrary.ascending' : 'mobileLibrary.descending'))],
        });
    }

    // ---- 重命名 / 删除：走 ask() 的输入与二次确认，语义与原实现一致 ----
    const manageItems: NativePanelActionRow[] = [];
    if (caps.rename.supported) {
        handlers.rename = () => ask(
            t('mobileLibrary.rename'),
            model.mutations.renamedTo ?? props.collection.name,
            false,
            name => mutations!.rename(name)
        );
        manageItems.push(row('rename', t('mobileLibrary.rename'), !caps.rename.enabled, 'settings2'));
    }
    if (caps.deleteCollection.supported) {
        handlers.deleteCollection = () => ask(t('mobileLibrary.deletePlaylist'), '', true, async () => {
            const result = await mutations!.deleteCollection();
            if (result.ok) props.onDone();
            return result;
        });
        manageItems.push(row('deleteCollection', t('mobileLibrary.deletePlaylist'), !caps.deleteCollection.enabled, 'trash2'));
    }
    if (caps.resyncFolder.supported) {
        handlers.resyncFolder = () => void run(() => mutations!.resyncFolder());
        manageItems.push(row('resyncFolder', t('mobileLibrary.rescan'), !caps.resyncFolder.enabled));
    }
    if (caps.resyncAllFolders.supported) {
        handlers.resyncAllFolders = () => void run(() => mutations!.resyncAllFolders());
        manageItems.push(row('resyncAllFolders', t('mobileLibrary.rescanAll'), !caps.resyncAllFolders.enabled));
    }
    if (caps.exportPlaylist.supported) {
        handlers.exportPlaylist = () => void run(() => mutations!.exportPlaylist());
        manageItems.push(row('exportPlaylist', t('mobileLibrary.exportPlaylist'), !caps.exportPlaylist.enabled));
    }
    if (caps.editEntity.supported) {
        handlers.editEntity = () => void run(() => mutations!.editEntity());
        manageItems.push(row('editEntity', t('mobileLibrary.editInfo'), !caps.editEntity.enabled));
    }
    if (caps.organizeSongInfo.supported) {
        handlers.organizeSongInfo = () => void run(() => mutations!.organizeSongInfo());
        manageItems.push(row('organizeSongInfo', t('mobileLibrary.organizeInfo'), !caps.organizeSongInfo.enabled));
    }
    if (manageItems.length) blocks.push({ kind: 'actions', id: 'source-manage', items: manageItems });

    // ---- 每日推荐日期 ----
    if (caps.dailyDate.supported) {
        handlers.dailyDate = payload => void run(() => mutations!.setDailyDate(payload?.text ?? ''));
        blocks.push({
            kind: 'select', id: 'dailyDate', label: t('mobileLibrary.dailyDate'), value: model.mutations.dailyDate,
            disabled: busy || !caps.dailyDate.enabled,
            options: [
                { value: '', label: t('mobileLibrary.today') },
                ...model.mutations.dailyHistoryDates.filter(Boolean).map(date => ({ value: date, label: date })),
            ],
        });
    }
    return { blocks, handlers };
}

export default buildCollectionSourcePanel;
