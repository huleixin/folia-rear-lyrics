package io.github.huleixin.tingyu.chrome

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/SupportLinks.kt
// Pure helpers for the support sheets; kept free of Android framework calls so the
// JVM tests can pin the QQ join contract without a device.

object SupportLinks {
    /** 群号只保留数字，防止把「群号：123456」这类粘贴内容直接送进跳转链接。 */
    fun normalizeGroupId(raw: String): String = raw.filter { it.isDigit() }

    /**
     * QQ 群资料卡跳转协议。未配置或群号为空时返回 null（调用方据此回退到邀请链接/复制群号，
     * 绝不跳向一个错误的群）。
     */
    fun groupJoinUri(groupId: String): String? {
        val normalized = normalizeGroupId(groupId)
        if (normalized.isEmpty()) return null
        return "mqqapi://card/show_pslcard?src_type=internal&version=1&uin=$normalized&card_type=group&source=qrcode"
    }

    /** 保存到相册的文件名（不含扩展名）。 */
    fun qrFileName(channel: String): String = "tingyu_${channel}_qr_${System.currentTimeMillis()}"
}
