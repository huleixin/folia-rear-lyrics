package io.github.huleixin.tingyu.lx

// android/app/src/main/java/io/github/huleixin/tingyu/lx/LxRedaction.kt
/** Scrub before diagnostics receive script-controlled error messages. */
object LxRedaction {
    fun clean(value: String?): String = (value ?: "")
        .replace(Regex("(?i)https?://[^\\s\"'<>]+"), "[地址]")
        .replace(Regex("(?i)\\bBearer\\s+[^\\s,;]+"), "Bearer [已脱敏]")
        .replace(Regex("(?i)\\b(authorization|cookie|set-cookie|[\\w-]*token|secret|api[_-]?key|signature|password|auth|sign|session(?:id)?|jwt|key)\\b[\"']?\\s*[:=]\\s*[^\\r\\n]+"), "$1=[已脱敏]")
        .replace(Regex("[\\r\\n\\t]"), " ").take(200)
}
