package io.github.huleixin.tingyu.update

// android/app/src/main/java/io/github/huleixin/tingyu/update/UpdateTrustAnchors.kt
// 听屿客户端内置可信配置验证公钥、正式包签名指纹与多节点渠道配置。严禁内置任何私钥或写入凭据。

data class UpdateEndpointNode(
    val id: String,
    val label: String,
    val url: String,
    val priority: Int,
)

object UpdateTrustAnchors {
    const val APP_ID = "io.github.huleixin.tingyu"
    const val SCHEMA_VERSION = 1
    const val SIGNATURE_ALGORITHM = "ECDSA-P256-SHA256"
    const val EXPECTED_RELEASE_CERT_SHA256 =
        "a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d"

    /**
     * 内置更新策略验证公钥（X.509 SubjectPublicKeyInfo Base64，ECDSA P-256）。
     * 同时预置 k1 主用公钥与 k2 备用轮换公钥，支持未来平滑密钥轮换。
     */
    val TRUSTED_PUBLIC_KEYS_SPKI: Map<String, String> = mapOf(
        "tingyu-policy-2026-k1" to "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEbVJK6ih4OY2wmjWjgUgPl+8yKOKEbYKDz5xAAMj5+zXIuarUBqLUdPNU1Wmo06AuSssy4cD/ksB/Zhr9nro4dw==",
        "tingyu-policy-2026-k2-backup" to "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAENCxOfBCUyskXdIV113Y4oCYOKn3fDE4M/+h2CsIygob0nL7oETur+iJpqopBZuz3qXwwmelHczXIDX5noXW0hw==",
    )

    fun endpointsForChannel(channel: String): List<UpdateEndpointNode> = when (channel) {
        "testing" -> listOf(
            UpdateEndpointNode(
                id = "cnb-testing-root",
                label = "CNB 国内测试配置主节点",
                url = "https://cnb.cool/tingyu-2026/releases/-/git/raw/main/testing.json",
                priority = 1,
            ),
            UpdateEndpointNode(
                id = "cnb-testing-channel",
                label = "CNB 测试渠道分支节点",
                url = "https://cnb.cool/tingyu-2026/releases/-/git/raw/main/channels/testing.json",
                priority = 2,
            ),
            UpdateEndpointNode(
                id = "cf-primary-testing",
                label = "听屿云端签名策略节点",
                url = "https://feedback.20262000.xyz/api/public/update/testing",
                priority = 3,
            ),
            UpdateEndpointNode(
                id = "cf-backup-testing",
                label = "听屿备用签名策略节点",
                url = "https://tingyu-feedback-api.2473297053.workers.dev/api/public/update/testing",
                priority = 4,
            ),
        )
        "automotive" -> listOf(
            UpdateEndpointNode(
                id = "cnb-automotive",
                label = "CNB 车机渠道配置节点",
                url = "https://cnb.cool/tingyu-2026/releases/-/git/raw/main/channels/automotive.json",
                priority = 1,
            ),
            UpdateEndpointNode(
                id = "cf-primary-automotive",
                label = "听屿车机云端策略节点",
                url = "https://feedback.20262000.xyz/api/public/update/automotive",
                priority = 2,
            ),
        )
        else -> listOf(
            UpdateEndpointNode(
                id = "cnb-stable",
                label = "CNB 国内主节点",
                url = "https://cnb.cool/tingyu-2026/releases/-/git/raw/main/stable.json",
                priority = 1,
            ),
            UpdateEndpointNode(
                id = "cf-primary-stable",
                label = "听屿实时签名策略节点",
                url = "https://feedback.20262000.xyz/api/public/update/stable",
                priority = 2,
            ),
            UpdateEndpointNode(
                id = "cf-backup-stable",
                label = "听屿备用签名策略节点",
                url = "https://tingyu-feedback-api.2473297053.workers.dev/api/public/update/stable",
                priority = 3,
            ),
            UpdateEndpointNode(
                id = "github-stable",
                label = "GitHub 备用节点",
                url = "https://raw.githubusercontent.com/huleixin/folia-rear-lyrics/feat/library-search-v2/tingyu-android/releases/update-manifests/stable.json",
                priority = 4,
            ),
        )
    }

    fun releaseHistoryUrlsForChannel(channel: String): List<String> = listOf(
        "https://feedback.20262000.xyz/api/public/releases/history?channel=$channel",
        "https://tingyu-feedback-api.2473297053.workers.dev/api/public/releases/history?channel=$channel",
    )
}
