package io.github.huleixin.tingyu.resolver;

import io.github.huleixin.tingyu.playback.NativePlaylist;

/**
 * 原生地址解析器的接口 —— 阶段 B。
 *
 * 一个解析器回答的是"给定一首歌的逻辑身份，能不能在不经过 WebView 的前提下拿到一个可播放地址"。
 * 它在后台线程被调用，所以实现里不能碰主线程、不能碰 WebView、不能碰 Activity。
 */
public interface SourceResolver {

    /** 与 JS providerId 对齐的标识，进诊断用。 */
    String id();

    /** 这个解析器是否认领该 provider 的歌曲。 */
    boolean supports(String providerId);

    /**
     * 解析。抛异常等同于 {@link SourceResolution.Status#FAILURE}。
     *
     * @param quality 偏好音质（standard / high / lossless / hires）
     */
    SourceResolution resolve(NativePlaylist.Track track, String quality);
}
