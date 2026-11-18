package io.github.huleixin.tingyu.update

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
        if (endpoints.isEmpty()) {
            return@withContext FetchOutcome.Failure("no_endpoints", emptyList())
        }

        // 并发查询 CNB 国内主节点与云端实时签名策略节点（及备用节点），按最高有效 policyRevision 裁决
        val results = supervisorScope {
            endpoints.sortedBy { it.priority }.map { node ->
                async {
                    fetchSingleNode(node)
                }
            }.awaitAll()
        }

        val rawCandidates = mutableListOf<UpdatePolicy.NodeCandidate>()
        val networkErrors = mutableListOf<Pair<String, String>>()

        for ((nodeId, res) in results) {
            res.fold(
                onSuccess = { body -> rawCandidates.add(UpdatePolicy.NodeCandidate(nodeId, body)) },
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
    }

    private fun fetchSingleNode(node: UpdateEndpointNode): Pair<String, Result<String>> {
        if (!node.url.startsWith("https://") && !node.url.startsWith("http://127.0.0.1")) {
            return node.id to Result.failure(IllegalArgumentException("insecure_scheme"))
        }
        val request = Request.Builder()
            .url(node.url)
            .cacheControl(CacheControl.FORCE_NETWORK)
            .header("Accept", "application/json")
            .header("User-Agent", "Tingyu-Android-Updater/1.0")
            .get()
            .build()

        return try {
            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    return node.id to Result.failure(RuntimeException("http_${response.code}"))
                }
                val body = response.body?.string()
                    ?: return node.id to Result.failure(RuntimeException("empty_body"))
                if (body.length > 262_144) {
                    return node.id to Result.failure(RuntimeException("body_too_large"))
                }
                node.id to Result.success(body)
            }
        } catch (e: Exception) {
            node.id to Result.failure(RuntimeException(e.javaClass.simpleName))
        }
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
