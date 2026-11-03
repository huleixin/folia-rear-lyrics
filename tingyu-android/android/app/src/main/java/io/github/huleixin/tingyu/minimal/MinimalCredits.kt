package io.github.huleixin.tingyu.minimal

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/MinimalCredits.kt
//
// 制作人名单识别：`minimalLyrics.ts` 中 isProductionCreditLine 的移植。
//
// 为什么值得移植：大量 LRC 把「歌名-歌手 / 作词： / 作曲： / 编曲： / 制作人」当成普通时间行，
// 在这套版式里它们会和演唱行一样大，于是第一句还没唱，三行名单已经占满一屏。
// 识别**只改字号**，不删行、不改时间、不改点击跳转。判定刻意收得很窄：误判会把一句真歌词降级。

private const val CREDIT_MAX_GRAPHEMES = 24

private val CREDIT_LABELS = arrayOf(
    // 简体 / 繁体，文件头常见形式优先
    "作词", "作詞", "填词", "填詞", "作曲", "编曲", "編曲", "配唱", "和声", "和聲",
    "词", "曲", "詞",
    "制作人", "製作人", "制作", "製作", "监制", "監製", "统筹", "統籌", "出品", "发行", "發行",
    "混音", "母带", "母帶", "录音", "錄音", "录音师", "錄音師", "混音师", "母带师",
    "吉他", "贝斯", "貝斯", "鼓", "键盘", "鍵盤", "弦乐", "弦樂", "管弦", "萨克斯", "小提琴", "大提琴",
    "和音", "伴唱", "和声编写", "文案", "企划", "企劃", "封面", "MV", "字幕",
    // English forms seen in NetEase and Apple-style LRC heads.
    "lyricist", "lyrics by", "lyrics", "composer", "composed by", "composition", "arranger",
    "arranged by", "producer", "produced by", "production", "written by", "written", "mixed by",
    "mixing", "mastered by", "mastering", "recorded by", "recording", "vocal", "vocals", "guitar",
    "bass", "drums", "keyboard", "piano", "strings", "saxophone", "violin", "cello", "chorus",
    "a&r", "publishing", "copyright", "op", "sp",
)

/** 歌词会以这些标点收尾；名单收尾是名字。这是最强的排除条件。 */
private val LYRIC_ENDING = Regex("[，。！？…、；：!?,;.]$")

/** `^\s*[：:／/·•\-—–】」』）)]\s*\S` */
private val CREDIT_SEPARATOR = Regex("^\\s*[：:／/·•\\-—–】」』）)]\\s*\\S")

private val LEADING_BRACKETS = Regex("^[（(【\\[]+")
private val SPACE_THEN_TEXT = Regex("^\\s+\\S")
private val ENDS_WITH_BY = Regex("by$")
private val NON_ASCII = Regex("[^\\x00-\\x7F]")

private fun separatorAfterLabel(label: String, rest: String): Boolean {
    if (CREDIT_SEPARATOR.containsMatchIn(rest)) return true
    if (!SPACE_THEN_TEXT.containsMatchIn(rest)) return false
    // "作词 李焯雄" 与 "Produced by X" 合法；"guitar solo" 不合法 —— 宁可漏判，也不要把歌词降级。
    return NON_ASCII.containsMatchIn(label) || ENDS_WITH_BY.containsMatchIn(label)
}

private fun isCreditLabelled(text: String): Boolean {
    val lowered = text.lowercase()
    for (label in CREDIT_LABELS) {
        if (!lowered.startsWith(label)) continue
        if (separatorAfterLabel(label, text.substring(label.length))) return true
    }
    return false
}

/**
 * 这一行是制作信息还是演唱行。
 *
 * @param index 该行在**已解析歌词集**里的位置：只有第一行才可能是「歌名 - 歌手」，
 *              因为歌词里的破折号并不罕见，而"排在第一个"才让这种读法成立。
 */
fun isProductionCreditLine(line: MinimalLyricLine, index: Int): Boolean {
    val text = line.text.trim()
    if (text.isEmpty() || text.length > CREDIT_MAX_GRAPHEMES) return false
    if (LYRIC_ENDING.containsMatchIn(text)) return false
    val bare = text.replace(LEADING_BRACKETS, "").trim()
    if (isCreditLabelled(bare)) return true
    if (index == 0) {
        val parts = text.split(Regex("\\s*[—–-]\\s*"))
        if (parts.size == 2 && parts[0].isNotEmpty() && parts[1].isNotEmpty() &&
            parts[0].length <= 32 && parts[1].length <= 40
        ) {
            return true
        }
    }
    return false
}
