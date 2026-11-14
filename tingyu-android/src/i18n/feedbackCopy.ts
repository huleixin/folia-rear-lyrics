// src/i18n/feedbackCopy.ts
//
// 「问题反馈」页面的文案。刻意不塞进 zh-CN/en/in 三个 40 万字符的语言文件：
// 这块界面是自包含的，文案跟着组件走更好维护，也避免每次改一句话都要在三个大文件里
// 找同一个位置。新增语言时在这里补一张表即可。

export type FeedbackCopy = {
    title: string;
    subtitle: string;
    categoryLabel: string;
    categories: Record<'crash' | 'playback' | 'stutter' | 'lyrics' | 'display' | 'rear' | 'pad' | 'local' | 'other', string>;
    descriptionLabel: string;
    descriptionPlaceholder: string;
    descriptionHint: string;
    screenshotsLabel: string;
    addScreenshot: string;
    removeScreenshot: string;
    screenshotLimit: string;
    includeDiagnostics: string;
    includeDiagnosticsHint: string;
    preview: string;
    previewTitle: string;
    previewLoading: string;
    previewClose: string;
    export: string;
    exportWorking: string;
    exportShared: string;
    exportFailed: string;
    privacyTitle: string;
    privacyBody: string;
    cancel: string;
    close: string;
    emptyDescription: string;
};

const zh: FeedbackCopy = {
    title: '问题反馈',
    subtitle: '描述发生了什么，附上诊断日志，开发者才能定位到具体模块。',
    categoryLabel: '问题类型',
    categories: {
        crash: '闪退或卡死',
        playback: '播放异常',
        stutter: '播放卡顿',
        pad: 'Pad适配异常',
        local: '本地音乐异常',
        lyrics: '歌词问题',
        display: '界面显示问题',
        rear: '背屏或灵动岛问题',
        other: '其他问题',
    },
    descriptionLabel: '问题描述',
    descriptionPlaceholder: '例如：在资料库点开一首歌，播放到一半停住，进度条还在走但没有声音。',
    descriptionHint: '最多 2000 字。不要填写账号、密码等个人信息。',
    screenshotsLabel: '截图（可选）',
    addScreenshot: '添加截图',
    removeScreenshot: '移除',
    screenshotLimit: '最多 3 张，导出前会自动压缩',
    includeDiagnostics: '附带诊断日志',
    includeDiagnosticsHint: '开启后会打包最近事件、崩溃记录与性能摘要，不含账号与歌词内容。',
    preview: '预览诊断信息',
    previewTitle: '将随反馈发送的内容',
    previewLoading: '正在生成预览…',
    previewClose: '关闭预览',
    export: '导出并分享报告',
    exportWorking: '正在打包…',
    exportShared: '已打开系统分享',
    exportFailed: '导出失败，请重试',
    privacyTitle: '隐私',
    privacyBody: '手动诊断包在本机生成，由你通过系统面板分享。云端反馈使用单独的白名单诊断内容，必须先预览并确认；存储于 Cloudflare 私有空间，默认保留30天，供开发者及 Codex 辅助排查。截图仅用于手动导出。请勿填写私人或登录信息。',
    cancel: '取消',
    close: '关闭',
    emptyDescription: '（没有填写描述）',
};

const en: FeedbackCopy = {
    title: 'Send feedback',
    subtitle: 'Describe what happened. With the diagnostic log attached, we can pinpoint the module.',
    categoryLabel: 'Category',
    categories: {
        crash: 'Crash or freeze',
        playback: 'Playback issue',
        stutter: 'Playback stutter',
        pad: 'Tablet layout',
        local: 'Local music',
        lyrics: 'Lyrics issue',
        display: 'Display issue',
        rear: 'Rear screen / Dynamic Island',
        other: 'Something else',
    },
    descriptionLabel: 'What happened?',
    descriptionPlaceholder: 'e.g. Opened a song from the library, playback stopped halfway while the progress bar kept moving.',
    descriptionHint: 'Up to 2000 characters. Do not include passwords or other personal data.',
    screenshotsLabel: 'Screenshots (optional)',
    addScreenshot: 'Add screenshot',
    removeScreenshot: 'Remove',
    screenshotLimit: 'Up to 3, compressed before export',
    includeDiagnostics: 'Attach diagnostic log',
    includeDiagnosticsHint: 'Packs recent events, crash records and performance summary. No account or lyric content.',
    preview: 'Preview diagnostics',
    previewTitle: 'Content that will be shared',
    previewLoading: 'Building preview…',
    previewClose: 'Close preview',
    export: 'Export & share',
    exportWorking: 'Packaging…',
    exportShared: 'System share sheet opened',
    exportFailed: 'Export failed, please retry',
    privacyTitle: 'Privacy',
    privacyBody: 'Manual packages are shared through the system panel. Cloud feedback uses separate allowlisted diagnostics, requires preview and consent, and is privately stored at Cloudflare for 30 days for developer and Codex analysis. Screenshots are manual-export only. Do not enter credentials or private information.',
    cancel: 'Cancel',
    close: 'Close',
    emptyDescription: '(no description)',
};

const id: FeedbackCopy = {
    ...en,
    title: 'Kirim masukan',
    categoryLabel: 'Kategori',
    descriptionLabel: 'Apa yang terjadi?',
    screenshotsLabel: 'Tangkapan layar (opsional)',
    includeDiagnostics: 'Lampirkan log diagnostik',
    preview: 'Pratinjau diagnostik',
    export: 'Ekspor & bagikan',
    privacyTitle: 'Privasi',
    cancel: 'Batal',
    close: 'Tutup',
};

const TABLES: Record<string, FeedbackCopy> = { zh, en, in: id, id };

export const feedbackCopy = (language: string | undefined): FeedbackCopy => {
    if (!language) return zh;
    const lower = language.toLowerCase();
    if (lower.startsWith('zh')) return zh;
    if (lower.startsWith('id') || lower.startsWith('in')) return id;
    return en;
};
