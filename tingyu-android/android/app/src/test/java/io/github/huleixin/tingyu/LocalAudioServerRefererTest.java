package io.github.huleixin.tingyu;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/**
 * 本地代理转发时的 Referer 矩阵（真机 1.3.182 后台 QQ 连续 502 的伴生回归）。
 *
 * 代理原先的兜底 Referer 是 kuwo 的 —— 它对 kuwo 是「必须带」，对 QQ CDN 却是
 * 「不该带」：QQ 的前台直连从不带 Referer，代理带着 kuwo 的 Referer 去请求 QQ CDN
 * 与前台请求形态不一致。规则现在是：QQ 主机返回空串（转发时不带 Referer 头），
 * kuwo/网易/抖音维持原样。
 */
public class LocalAudioServerRefererTest {

    @Test
    public void qqHostsGetNoRefererAtAll() {
        assertEquals("", LocalAudioServer.remoteAudioReferer("https://isure.stream.qqmusic.qq.com/C400001.mp3?guid=1&vkey=2"));
        assertEquals("", LocalAudioServer.remoteAudioReferer("https://aqqmusic.tc.qq.com/amobile.ms Music.mp3".replace(" ", "")));
        assertEquals("", LocalAudioServer.remoteAudioReferer("https://dl.stream.qqmusic.qq.com/M500xxx.mp3"));
        assertEquals("", LocalAudioServer.remoteAudioReferer("https://y.qq.com/anything"));
    }

    @Test
    public void kuwoKeepsItsRequiredReferer() {
        assertEquals("https://www.kuwo.cn/", LocalAudioServer.remoteAudioReferer("https://kuwo.cn/a.mp3"));
        assertEquals("https://www.kuwo.cn/", LocalAudioServer.remoteAudioReferer("https://other.kuwo.cn/a.mp3"));
    }

    @Test
    public void neteaseAndDouyinKeepTheirs() {
        assertEquals("https://music.163.com/", LocalAudioServer.remoteAudioReferer("https://m801.music.126.net/song"));
        assertEquals("https://music.douyin.com/", LocalAudioServer.remoteAudioReferer("https://v3-p3-go.kk-cdn.douyinvod.com/a.mp3"));
    }

    @Test
    public void unknownHostsStillFallBackToKuwo() {
        // 历史行为保持：白名单里其它主机（以及无法解析的输入）继续用 kuwo 的兜底值。
        assertEquals("https://www.kuwo.cn/", LocalAudioServer.remoteAudioReferer("https://fs.nagate.example/song.mp3"));
        assertEquals("https://www.kuwo.cn/", LocalAudioServer.remoteAudioReferer("not a url"));
    }
}
