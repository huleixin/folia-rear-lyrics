package io.github.huleixin.tingyu.probe

import io.github.huleixin.tingyu.lx.LxScriptEngine
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import java.io.File

// tools/lx-probe/src/main/kotlin/io/github/huleixin/tingyu/probe/LxCompatibility.kt
/** Runs the exact Android engine source against controlled, independently generated crypto vectors. */
fun main(args: Array<String>) = runBlocking {
    val fixture=File(args.firstOrNull() ?: "../../test/fixtures/lx-mobile/contract.js").readText()
    val engine=LxScriptEngine()
    var checks=0
    fun verify(ok:Boolean,label:String){check(ok){label};checks++;println("PASS $label")}
    fun payload(source:String,action:String,test:String="ok")=JSONObject().put("source",source).put("action",action)
        .put("info",JSONObject().put("type",if(source=="local")JSONObject.NULL else "flac24bit").put("musicInfo",JSONObject().put("test",test)))
    try {
        engine.start(fixture,JSONObject().put("name","Tingyu mobile conformance"))
        verify(engine.started,"async initialization and crypto vectors")
        verify(engine.capabilities["tx"]?.size==4,"four declared qualities")
        verify(engine.capabilities.containsKey("local"),"local with empty qualities")
        verify(engine.request(payload("tx","musicUrl")).ok,"Promise musicUrl with lx this")
        verify(engine.request(payload("local","musicUrl")).ok,"local quality null")
        val lyric=engine.request(payload("local","lyric"))
        verify(lyric.ok&&JSONObject(lyric.value!!).optString("lxlyric").contains("<0,100>"),"lyric object and word timing")
        verify(engine.request(payload("local","pic")).ok,"local cover URL")
        verify(!engine.request(payload("tx","lyric")).ok,"ordinary source action gate")
        verify(!engine.request(payload("tx","musicUrl","nonpromise")).ok,"reject non-Promise handler")
        verify(!engine.request(payload("tx","musicUrl","invalid")).ok,"reject invalid URL result")
        engine.close()
        verify(engine.capabilities.isEmpty()&&!engine.started,"close clears state")
        try{engine.start("throw Error('fixture init failure')",JSONObject(),1000);error("must fail")}catch(_:Exception){verify(!engine.started,"failed restart does not reuse capability state")}
        engine.close()
        engine.start(fixture,JSONObject().put("name","Tingyu mobile conformance"))
        verify(engine.request(payload("tx","musicUrl")).ok,"clean restart after exception")
    }finally{engine.shutdown()}
    println("LX JVM conformance: $checks/$checks passed (not Android device playback)")
}
