package io.github.huleixin.tingyu.lx

import okhttp3.Dns
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import java.net.InetAddress
import java.util.concurrent.TimeUnit

// tools/lx-probe/src/test/kotlin/io/github/huleixin/tingyu/lx/LxHttpProtocolTest.kt
// Only the test client maps fixture.example to localhost; production DNS retains its public-address guard.
class LxHttpProtocolTest {
    private val server=MockWebServer().apply {start()}
    private val client=OkHttpClient.Builder().followRedirects(false).dns(object:Dns{
        override fun lookup(hostname:String)=listOf(InetAddress.getByName("127.0.0.1"))
    }).build()
    private fun url(path:String="/fixture")="http://fixture.example:${server.port}$path"
    private fun request(options:JSONObject=JSONObject(),onCall:(okhttp3.Call)->Unit={}):JSONObject =
        JSONObject(LxHttp.requestWithClient(url(),options,client,onCall))
    @After fun close(){server.shutdown();client.connectionPool.evictAll();client.dispatcher.executorService.shutdown()}

    @Test fun callbackResponsePreservesStatusHeadersAndJson(){
        server.enqueue(MockResponse().setResponseCode(201).setBody("{\"value\":7}").setHeader("X-Fixture","yes"))
        val response=request()
        assertEquals(201,response.getInt("statusCode"));assertTrue(response.has("statusMessage"))
        assertEquals(7,response.getJSONObject("body").getInt("value"))
        assertTrue(response.getJSONObject("headers").toString().contains("yes"))
    }
    @Test fun scalarJsonAndRawScriptResponsesKeepTheirTypesAndContent(){
        for((body,expected) in listOf("42" to 42,"true" to true,"null" to JSONObject.NULL,"\"version\"" to "version")){
            server.enqueue(MockResponse().setBody(body));assertEquals(expected,request().get("body"))
        }
        val script="/** @name fixture */\nconst value = {field: 'text'};"
        server.enqueue(MockResponse().setBody(script));assertEquals(script,request().getString("body"))
    }
    @Test fun postJsonReachesTheWire(){
        server.enqueue(MockResponse().setBody("ok"))
        request(JSONObject().put("method","POST").put("body",JSONObject().put("songId",42)))
        val wire=server.takeRequest();assertEquals("POST",wire.method);assertEquals(42,JSONObject(wire.body.readUtf8()).getInt("songId"))
    }
    @Test fun formAndMultipartReachTheWire(){
        server.enqueue(MockResponse());request(JSONObject().put("method","POST").put("form",JSONObject().put("title","a b")))
        assertEquals("title=a+b",server.takeRequest().body.readUtf8())
        server.enqueue(MockResponse());request(JSONObject().put("method","POST").put("formData",JSONObject().put("title","测试")))
        val wire=server.takeRequest();assertTrue(wire.getHeader("Content-Type")!!.contains("boundary="));assertTrue(wire.body.readUtf8().contains("测试"))
    }
    @Test fun binaryDoesNotDecodeUtf8OrJson(){
        server.enqueue(MockResponse().setBody(Buffer().write(byteArrayOf(0,(-1).toByte(),65))))
        val response=request(JSONObject().put("binary",true));assertTrue(response.getBoolean("binary"));assertEquals("[0,255,65]",response.getJSONArray("body").toString())
    }
    @Test fun explicitScriptCookieIsAllowedWithoutAmbientCookies(){
        server.enqueue(MockResponse().setHeader("Set-Cookie","ambient=private"));request()
        server.takeRequest()
        server.enqueue(MockResponse());request(JSONObject().put("headers",JSONObject().put("Cookie","script=yes").put("Origin","https://script.example")))
        val wire=server.takeRequest();assertEquals("script=yes",wire.getHeader("Cookie"));assertEquals("https://script.example",wire.getHeader("Origin"))
    }
    @Test fun redirect307PreservesPostAndBody(){
        server.enqueue(MockResponse().setResponseCode(307).setHeader("Location","/next"));server.enqueue(MockResponse())
        request(JSONObject().put("method","POST").put("body","payload"));server.takeRequest()
        val wire=server.takeRequest();assertEquals("POST",wire.method);assertEquals("payload",wire.body.readUtf8())
    }
    @Test fun redirect302ChangesPostToGet(){
        server.enqueue(MockResponse().setResponseCode(302).setHeader("Location","/next"));server.enqueue(MockResponse())
        request(JSONObject().put("method","POST").put("body","payload"));server.takeRequest();assertEquals("GET",server.takeRequest().method)
    }
    @Test fun crossOriginRedirectStripsCredentials(){
        val other=MockWebServer();other.start()
        try{
            server.enqueue(MockResponse().setResponseCode(302).setHeader("Location","http://other.example:${other.port}/next"));other.enqueue(MockResponse())
            request(JSONObject().put("headers",JSONObject().put("Authorization","Bearer private").put("Cookie","private=yes").put("X-Token","private")))
            val wire=other.takeRequest();assertNull(wire.getHeader("Authorization"));assertNull(wire.getHeader("Cookie"));assertNull(wire.getHeader("X-Token"))
        }finally{other.shutdown()}
    }
    @Test fun redirectsCannotReachPrivateAddresses(){
        server.enqueue(MockResponse().setResponseCode(302).setHeader("Location","http://127.0.0.1/private"))
        try{request();fail("private redirect accepted")}catch(expected:IllegalArgumentException){}
    }
    @Test fun cancellationClosesRealCall(){
        try{request(onCall={it.cancel()});fail("cancel ignored")}catch(expected:java.io.IOException){assertTrue(expected.message!!.contains("Canceled"))}
    }
    @Test fun timeoutStopsSlowBody(){
        server.enqueue(MockResponse().setBody("late").setBodyDelay(1,TimeUnit.SECONDS))
        try{request(JSONObject().put("timeout",100));fail("timeout ignored")}catch(expected:java.io.IOException){}
    }
    @Test fun oversizedResponseFailsBeforeUnboundedAllocation(){
        server.enqueue(MockResponse().setBody("x".repeat(2_097_153)))
        try{request();fail("oversize accepted")}catch(expected:IllegalArgumentException){assertEquals("Response too large",expected.message)}
    }
}
