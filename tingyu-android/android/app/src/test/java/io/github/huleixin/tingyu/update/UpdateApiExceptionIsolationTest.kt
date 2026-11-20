package io.github.huleixin.tingyu.update

import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateApiExceptionIsolationTest {

    @Test
    fun returnsFailureInsteadOfThrowingWhenHttpClientThrowsNpe() = runBlocking {
        val crashingClient = OkHttpClient.Builder()
            .addInterceptor(Interceptor { throw NullPointerException("simulated platform TLS NPE") })
            .build()
        val api = UpdateApi(httpClient = crashingClient)
        val outcome = api.fetchAuthoritativePolicy(
            channel = "stable",
            minAcceptedRevision = 0L,
            endpoints = listOf(UpdateEndpointNode("n1", "node1", "https://example.com/stable.json", 1)),
        )
        assertTrue(outcome is UpdateApi.FetchOutcome.Failure)
        val failure = outcome as UpdateApi.FetchOutcome.Failure
        assertEquals("all_nodes_unreachable", failure.reason)
        assertTrue(failure.nodeErrors.any { it.first == "n1" && it.second == "NullPointerException" })
    }

    @Test
    fun rejectsBlankAndUnsignedResponsesWithoutCrashing() = runBlocking {
        val emptyBodyClient = OkHttpClient.Builder()
            .addInterceptor(Interceptor { chain ->
                Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body("   ".toResponseBody("application/json".toMediaType()))
                    .build()
            })
            .build()
        val api = UpdateApi(httpClient = emptyBodyClient)
        val outcome = api.fetchAuthoritativePolicy(
            channel = "stable",
            minAcceptedRevision = 0L,
            endpoints = listOf(UpdateEndpointNode("n1", "node1", "https://example.com/stable.json", 1)),
        )
        assertTrue(outcome is UpdateApi.FetchOutcome.Failure)
        assertEquals("all_nodes_unreachable", (outcome as UpdateApi.FetchOutcome.Failure).reason)
    }

    @Test
    fun handlesMalformedUrlsAndEmptyEndpointsSafely() = runBlocking {
        val api = UpdateApi()
        val emptyOutcome = api.fetchAuthoritativePolicy(
            channel = "stable",
            minAcceptedRevision = 0L,
            endpoints = emptyList(),
        )
        assertTrue(emptyOutcome is UpdateApi.FetchOutcome.Failure)
        assertEquals("no_endpoints", (emptyOutcome as UpdateApi.FetchOutcome.Failure).reason)

        val badUrlOutcome = api.fetchAuthoritativePolicy(
            channel = "stable",
            minAcceptedRevision = 0L,
            endpoints = listOf(UpdateEndpointNode("bad", "bad", "https://[invalid-host", 1)),
        )
        assertTrue(badUrlOutcome is UpdateApi.FetchOutcome.Failure)
    }
}
