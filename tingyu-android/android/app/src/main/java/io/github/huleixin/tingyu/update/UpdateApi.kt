package io.github.huleixin.tingyu.update

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.supervisorScope
import kotlinx.coroutines.withContext
import okhttp3.CacheControl
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

// android/app/src/main/java/io/github/huleixin/tingyu/update/UpdateApi.kt
// 多节点并发版本配置拉取与权威策略裁决：区分真实无更新与网络/校验失败，绝不在断网时谎报“已是最新版本”。

class UpdateApi(
    private val httpClient: OkHttpClient = defaultHttpClient(),
) {
    sealed class FetchOutcome {
        data class Success(
            val selectedNodeId: String,
            val manifest: UpdateManifest,
            val rejections: List<Pair<String, String>>,
        ) : FetchOutcome()

        data class Failure(
            val reason: String,
            val nodeErrors: List<Pair<String, String>>,
        ) : FetchOutcome()
    }

    suspend fun fetchAuthoritativePolicy(
        channel: String,
        minAcceptedRevision: Long,
        nowMs: Long = System.currentTimeMillis(),
        endpoints: List<UpdateEndpointNode> = UpdateTrustAnchors.endpointsForChannel(channel),
        trustedKeysSpki: Map<String, String> = UpdateTrustAnchors.TRUSTED_PUBLIC_KEYS_SPKI,
        expectedAppId: String = UpdateTrustAnchors.APP_ID,
    ): FetchOutcome = withContext(Dispatchers.IO) {
        try {
            val safeEndpoints = endpoints.orEmpty().filter { it.id.isNotBlank() && it.url.isNotBlank() }
            if (safeEndpoints.isEmpty()) {
                return@withContext FetchOutcome.Failure("no_endpoints", emptyList())
            }

            // 并发查询 CNB 国内主节点与云端实时签名策略节点（及备用节点），按最高有效 policyRevision 裁决
            val results = supervisorScope {
                safeEndpoints.sortedBy { it.priority }.map { node ->
                    async {
                        try {
                            fetchSingleNode(node)
                        } catch (ce: CancellationException) {
                            throw ce
                        } catch (t: Throwable) {
                            node.id to Result.failure(RuntimeException(t.javaClass.simpleName))
                        }
                    }
                }.awaitAll()
            }

            val rawCandidates = mutableListOf<UpdatePolicy.NodeCandidate>()
            val networkErrors = mutableListOf<Pair<String, String>>()

            for ((nodeId, res) in results) {
                res.fold(
                    onSuccess = { body ->
                        if (body.isNotBlank()) {
                            rawCandidates.add(UpdatePolicy.NodeCandidate(nodeId, body))
                        } else {
                            networkErrors.add(nodeId to "empty_body")
                        }
                    },
                    onFailure = { err -> networkErrors.add(nodeId to (err.message ?: "network_error")) },
                )
            }

            if (rawCandidates.isEmpty()) {
                return@withContext FetchOutcome.Failure("all_nodes_unreachable", networkErrors)
            }

            val selection = UpdatePolicy.selectAuthoritativeManifest(
                candidates = rawCandidates,
                expectedChannel = channel,
                nowMs = nowMs,
                minAcceptedRevision = minAcceptedRevision,
                trustedKeysSpki = trustedKeysSpki,
                expectedAppId = expectedAppId,
            )

            val chosen = selection.manifest
            val chosenNode = selection.selectedNodeId
            if (chosen != null && chosenNode != null) {
                FetchOutcome.Success(chosenNode, chosen, networkErrors + selection.rejections)
            } else {
                FetchOutcome.Failure("no_valid_signed_policy", networkErrors + selection.rejections)
            }
        } catch (ce: CancellationException) {
            throw ce
        } catch (t: Throwable) {
            FetchOutcome.Failure("unexpected_${t.javaClass.simpleName}", emptyList())
        }
    }

    private fun fetchSingleNode(node: UpdateEndpointNode): Pair<String, Result<String>> {
        val url = node.url.trim()
        if (!url.startsWith("https://") && !url.startsWith("http://127.0.0.1")) {
            return node.id to Result.failure(IllegalArgumentException("insecure_scheme"))
        }
        val request = try {
            Request.Builder()
                .url(url)
                .cacheControl(CacheControl.FORCE_NETWORK)
                .header("Accept", "application/json")
                .header("User-Agent", "Tingyu-Android-Updater/1.0")
                .get()
                .build()
        } catch (t: Throwable) {
            return node.id to Result.failure(RuntimeException("invalid_url_${t.javaClass.simpleName}"))
        }

        return try {
            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    return node.id to Result.failure(RuntimeException("http_${response.code}"))
                }
                val body = response.body?.string()
                    ?: return node.id to Result.failure(RuntimeException("empty_body"))
                if (body.isBlank()) {
                    return node.id to Result.failure(RuntimeException("empty_body"))
                }
                if (body.length > 262_144) {
                    return node.id to Result.failure(RuntimeException("body_too_large"))
                }
                node.id to Result.success(body)
            }
        } catch (ce: CancellationException) {
            throw ce
        } catch (t: Throwable) {
            node.id to Result.failure(RuntimeException(t.javaClass.simpleName))
        }
    }

    /**
     * 拉取听屿自身真实已发布的历史版本更新记录（严禁请求任何上游 Folia 接口，无记录时返回空列表）。
     */
    suspend fun fetchPublishedReleaseHistory(
        channel: String,
        currentVersionCode: Long,
        urls: List<String> = UpdateTrustAnchors.releaseHistoryUrlsForChannel(channel),
    ): List<ReleaseHistoryEntry> = withContext(Dispatchers.IO) {
        for (url in urls) {
            if (!url.startsWith("https://")) continue
            val req = Request.Builder()
                .url(url)
                .cacheControl(CacheControl.FORCE_NETWORK)
                .header("Accept", "application/json")
                .header("User-Agent", "Tingyu-Android-Updater/1.0")
                .get()
                .build()
            try {
                httpClient.newCall(req).execute().use { res ->
                    if (!res.isSuccessful) return@use
                    val raw = res.body?.string() ?: return@use
                    if (raw.length > 262_144) return@use
                    val root = org.json.JSONObject(raw)
                    val arr = root.optJSONArray("items") ?: return@use
                    val parsed = mutableListOf<ReleaseHistoryEntry>()
                    for (i in 0 until arr.length()) {
                        val obj = arr.optJSONObject(i) ?: continue
                        val vName = obj.optString("versionName").trim()
                        val vCode = obj.optLong("versionCode", 0L)
                        val notes = obj.optString("releaseNotes").trim()
                        if (vName.isEmpty() || vCode <= 0L || notes.isEmpty()) continue
                        parsed.add(
                            ReleaseHistoryEntry(
                                id = obj.optString("id", "rel-$vCode"),
                                versionName = vName,
                                versionCode = vCode,
                                gitCommit = obj.optString("gitCommit", ""),
                                publishedAt = obj.optString("publishedAt", "").take(10),
                                releaseNotes = notes,
                                isCurrentInstalled = vCode == currentVersionCode,
                            )
                        )
                    }
                    return@withContext parsed
                }
            } catch (_: Exception) {
                // 尝试备用同源地址
            }
        }
        emptyList()
    }

    companion object {
        fun defaultHttpClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(6, TimeUnit.SECONDS)
            .readTimeout(8, TimeUnit.SECONDS)
            .callTimeout(12, TimeUnit.SECONDS)
            .followRedirects(true)
            .followSslRedirects(true)
            .retryOnConnectionFailure(true)
            .build()
    }
}
