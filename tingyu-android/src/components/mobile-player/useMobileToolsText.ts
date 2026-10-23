import { useTranslation } from 'react-i18next';

// src/components/mobile-player/useMobileToolsText.ts
const zh = {
    title:'歌曲工具', noSong:'先播放一首歌', close:'关闭', sections:'歌曲工具分类', song:'歌曲', lyrics:'歌词', queue:'队列',
    source:'当前歌词来源', platform:'平台歌词', imported:'导入的歌词', embedded:'内嵌歌词', local:'本地歌词', server:'服务器歌词',
    match:'重新匹配歌词', import:'导入歌词文件', translation:'导入翻译文件', choose:'选择文件', matchingHint:'歌词不对？按歌名和歌手重新选择。',
    importHint:'支持 LRC、TTML、QRC、KRC 等歌词文件。', importedOk:'已提交歌词文件', importFailed:'无法读取歌词文件，请检查文件内容。',
    offset:'单曲时间校准', offsetHint:'只调整当前歌曲，播放时可以边听边调。正值使歌词延后。', earlier:'提前 0.25 秒', later:'延后 0.25 秒', reset:'重置', precise:'精确调整（毫秒）',
    advanced:'更多歌词操作', clear:'恢复平台原始歌词', loading:'正在读取歌词信息…', emptySources:'还没有可切换的歌词，可以重新匹配或导入。',
    serverHint:'Navidrome 歌词来自服务器，也可以重新匹配在线歌词。', play:'播放 / 暂停', previous:'上一首', next:'下一首', loop:'切换循环模式', like:'喜欢这首歌',
    volume:'播放音量', album:'查看专辑', artist:'查看歌手', settings:'播放设置', appearance:'舞台与配色', account:'音源与账号',
    gain:'音量标准化', off:'关闭', track:'按歌曲', albumGain:'按专辑', copied:'复制歌曲信息', lyricFile:'导入原文',
};
const en: typeof zh = {
    title:'Song tools', noSong:'Play a song first', close:'Close', sections:'Song tool sections', song:'Song', lyrics:'Lyrics', queue:'Queue',
    source:'Lyric source', platform:'Platform lyrics', imported:'Imported lyrics', embedded:'Embedded lyrics', local:'Local lyrics', server:'Server lyrics',
    match:'Match lyrics again', import:'Import lyric file', translation:'Import translation', choose:'Choose file', matchingHint:'Wrong lyrics? Search by song and artist.',
    importHint:'Supports LRC, TTML, QRC, KRC and other lyric files.', importedOk:'Lyric file submitted', importFailed:'Could not read this lyric file.',
    offset:'Timing for this song', offsetHint:'Adjust while listening. Positive values delay the lyrics.', earlier:'Earlier by 0.25 s', later:'Later by 0.25 s', reset:'Reset', precise:'Exact offset (ms)',
    advanced:'More lyric tools', clear:'Restore platform lyrics', loading:'Loading lyric information…', emptySources:'No alternative lyrics yet. Match or import a file.',
    serverHint:'Navidrome uses server lyrics. Online matching is also available.', play:'Play / pause', previous:'Previous', next:'Next', loop:'Cycle repeat mode', like:'Like this song',
    volume:'Volume', album:'Open album', artist:'Open artist', settings:'Playback settings', appearance:'Stage and colors', account:'Sources and accounts',
    gain:'Volume normalization', off:'Off', track:'Track', albumGain:'Album', copied:'Copy song information', lyricFile:'Import original lyrics',
};
export function useMobileToolsText() { const { i18n } = useTranslation(); return (i18n.resolvedLanguage || i18n.language).startsWith('zh') ? zh : en; }
