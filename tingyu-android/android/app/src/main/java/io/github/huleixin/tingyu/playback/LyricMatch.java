package io.github.huleixin.tingyu.playback;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/LyricMatch.java
/**
 * 「这条歌词是不是这首歌」——纯打分，无网络、无 Android 依赖。
 *
 * <p>同名错词是歌词兜底最典型的失败：一首《起风了》有十几个版本，只按标题取第一条，锁屏上就会
 * 出现别人的词，而且时间轴还「看起来正常」，比空着更糟。所以评分里**时长是硬门槛**：
 * <ul>
 *   <li>时长差 ≤ 2 秒 → +4（LRCLIB 的 /api/get 也用 ±2 秒作为可返回的门槛）；</li>
 *   <li>≤ 5 秒 → +2；</li>
 *   <li>&gt; 10 秒 → 直接淘汰（现场版、伴奏、串烧几乎都在这一档）；</li>
 *   <li>任一方没有时长 → 不加分也不淘汰，靠标题/歌手撑住。</li>
 * </ul>
 *
 * <p>标题必须先归一化再比较（大小写、全半角、标点、括号内的 (Live)/(Remastered) 都不该决定匹配），
 * 但**不允许**只靠「包含」通过：只有一边是完整子串且长度比 ≥ 0.6 才算同一首。
 */
public final class LyricMatch {

    public static final class Candidate {
        public final String trackName;
        public final String artistName;
        public final String albumName;
        public final long durationMs;
        public final boolean instrumental;
        public final String syncedLyrics;
        public final String plainLyrics;
        public final long id;

        public Candidate(long id, String trackName, String artistName, String albumName,
                         long durationMs, boolean instrumental, String syncedLyrics, String plainLyrics) {
            this.id = id;
            this.trackName = trackName;
            this.artistName = artistName;
            this.albumName = albumName;
            this.durationMs = durationMs;
            this.instrumental = instrumental;
            this.syncedLyrics = syncedLyrics;
            this.plainLyrics = plainLyrics;
        }
    }

    public static final class Score {
        public final Candidate candidate;
        public final int score;
        public final int durationDeltaMs;
        public final boolean titleExact;

        Score(Candidate candidate, int score, int durationDeltaMs, boolean titleExact) {
            this.candidate = candidate;
            this.score = score;
            this.durationDeltaMs = durationDeltaMs;
            this.titleExact = titleExact;
        }
    }

    /** 低于这个分数不认：宁可不显示，也不显示别人的词。 */
    public static final int MIN_ACCEPT_SCORE = 4;

    private LyricMatch() {
    }

    /** 返回最佳候选，或 null（没有任何一条被接受）。 */
    public static Score pick(List<Candidate> candidates, String title, String artist,
                            String album, long durationMs) {
        if (candidates == null || candidates.isEmpty()) return null;
        String wantedTitle = normalize(title);
        if (wantedTitle.isEmpty()) return null;
        String wantedArtist = normalize(artist);
        String wantedAlbum = normalize(album);
        Score best = null;
        for (Candidate candidate : candidates) {
            String candidateTitle = normalize(candidate.trackName);
            boolean exact = !candidateTitle.isEmpty() && candidateTitle.equals(wantedTitle);
            if (!exact && !looselyEqual(wantedTitle, candidateTitle)) continue;
            int score = exact ? 3 : 1;

            int delta = durationDelta(candidate.durationMs, durationMs);
            if (delta >= 0) {
                if (delta > 10_000) continue;
                if (delta <= 2_000) score += 4;
                else if (delta <= 5_000) score += 2;
            }
            if (!wantedArtist.isEmpty() && !normalize(candidate.artistName).isEmpty()) {
                if (normalize(candidate.artistName).equals(wantedArtist)) score += 3;
                else if (sharesArtistToken(wantedArtist, normalize(candidate.artistName))) score += 1;
                else continue; // 标题再像、时长再准，歌手对不上也不是同一首歌的词。
            }
            if (!wantedAlbum.isEmpty() && normalize(wantedAlbum).equals(normalize(candidate.albumName))) {
                score += 1;
            }
            if (score < MIN_ACCEPT_SCORE) continue;
            if (best == null || score > best.score
                    || (score == best.score && delta >= 0 && delta < best.durationDeltaMs)) {
                best = new Score(candidate, score, delta, exact);
            }
        }
        return best;
    }

    /** 时长差；任一方未知时返回 -1。 */
    static int durationDelta(long candidateMs, long targetMs) {
        if (candidateMs <= 0L || targetMs <= 0L) return -1;
        return (int) Math.min(Integer.MAX_VALUE, Math.abs(candidateMs - targetMs));
    }

    private static boolean looselyEqual(String wanted, String candidate) {
        if (wanted.isEmpty() || candidate.isEmpty()) return false;
        if (wanted.contains(candidate) || candidate.contains(wanted)) {
            int shorter = Math.min(wanted.length(), candidate.length());
            int longer = Math.max(wanted.length(), candidate.length());
            // 0.8 而不是 0.6：中文标题只差一个字就可能是完全不同的歌（《起风了》/《起风》），
            // 而真正需要宽松匹配的场景（Remastered、feat.、电视剧片尾曲）已经被括号清理和
            // 版本后缀处理掉了。
            return longer > 0 && (double) shorter / longer >= 0.8d;
        }
        return false;
    }

    private static boolean sharesArtistToken(String wanted, String candidate) {
        List<String> left = tokens(wanted);
        List<String> right = tokens(candidate);
        for (String token : left) {
            if (token.length() < 2) continue;
            if (right.contains(token)) return true;
            // 中文歌手名常常是「周杰伦」对「周杰伦 Jay Chou」这种包含关系，逐 token 相等会漏。
            for (String other : right) {
                if (other.length() >= 2 && (other.contains(token) || token.contains(other))) return true;
            }
        }
        return false;
    }

    private static List<String> tokens(String value) {
        List<String> out = new ArrayList<>();
        for (String part : value.split("[\\s/&,、·]+")) {
            if (!part.isEmpty()) out.add(part);
        }
        return out;
    }

    /**
     * 归一化：全半角统一、去括号内容、去标点、转小写。
     *
     * <p>括号里的东西几乎总是版本后缀（Live / Remastered / 伴奏 / 电视剧片尾曲），
     * 保留它只会让同一个录音的两条记录被判成不同歌。
     */
    public static String normalize(String value) {
        if (value == null) return "";
        String text = Normalizer.normalize(value, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
        text = text.replaceAll("[\\(（\\[【].*?[\\)）\\]】]", " ");
        text = text.replaceAll("[\\p{Punct}，。！？、：；·“”‘’…—《》]", " ");
        return text.replaceAll("\\s+", " ").trim();
    }
}
