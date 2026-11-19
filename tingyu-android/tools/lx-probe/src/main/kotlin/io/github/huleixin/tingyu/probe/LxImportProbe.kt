package io.github.huleixin.tingyu.probe

import io.github.huleixin.tingyu.lx.LxHttp
import io.github.huleixin.tingyu.lx.LxScriptEngine
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import java.io.File

// Exercise the APK's real URL download and QuickJS initialization without exposing script contents.
fun main(args: Array<String>) = runBlocking {
    require(args.isNotEmpty()) { "Provide a public script URL or a local fixture" }
    val input=args[0]
    val code=if(input.startsWith("https://")) {
        val response=JSONObject(LxHttp.request(input,JSONObject().put("timeout",15000)))
        check(response.optInt("statusCode") in 200..299) { "Script download HTTP ${response.optInt("statusCode")}" }
        response.getString("body")
    } else File(input).readText()
    val engine=LxScriptEngine()
    val started=System.nanoTime()
    try {
        engine.start(code,JSONObject().put("name","User import regression"),60000)
        println(JSONObject().put("initialized",engine.started).put("elapsedMs",(System.nanoTime()-started)/1_000_000)
            .put("platforms",engine.capabilities.keys.joinToString(",")).put("characters",code.length))
    } finally { engine.shutdown() }
}
