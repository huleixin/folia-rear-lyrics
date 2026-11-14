package io.github.huleixin.tingyu.lx

import android.content.Context
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import io.github.huleixin.tingyu.playback.PlaybackDiagnostics
import io.github.huleixin.tingyu.resolver.SourceResolution

/** Backup VMs exist only during an attempt, so eight imported scripts do not remain in memory. */
object LxScriptChain {
    interface Access {
        fun qualities(provider: String): List<String>?
        fun resolve(source: String, quality: String, info: JSONObject, timeout: Long): LxOutcome
    }
    fun interface Work { fun run(access: Access): SourceResolution }
    @Volatile private var scripts: List<JSONObject> = emptyList()
    @Volatile private var revision = 0L
    private var file: File? = null
    fun attach(context: Context) { synchronized(this) {
        if(file!=null)return
        file=File(context.filesDir,"lx-source/fallbacks.json")
        try { install(JSONArray(file!!.readText()), false) } catch (_: Exception) { }
    } }
    @JvmOverloads fun install(input: JSONArray?, persist: Boolean = true) { synchronized(this) {
        val next = (0 until minOf(input?.length()?:0,7)).mapNotNull { input?.optJSONObject(it) }
            .filter { it.optString("id").length in 1..160 && it.optString("code").toByteArray().size in 1..1_048_576 }
        if(next.toString()==scripts.toString())return
        scripts=next; revision++
        if(persist)try {file?.parentFile?.mkdirs();val tmp=File(file!!.path+".tmp");tmp.writeText(JSONArray(next).toString());if(!tmp.renameTo(file!!))tmp.delete()}catch (_: Exception) { }
    } }
    fun ids(): List<String> = listOf("") + scripts.map {it.optString("id")}
    fun run(id: String, deadlineNs: Long, work: Work): SourceResolution {
        val own=revision
        // Initializing the next VM consumes the same budget as catalog search and musicUrl.
        fun remaining() = minOf(15_000L, (deadlineNs - System.nanoTime()) / 1_000_000L)
        if (Thread.currentThread().isInterrupted || remaining() <= 0) return SourceResolution.failure("source deadline reached")
        if(id.isEmpty()) {
            val result=work.run(object: Access {
                override fun qualities(provider: String): List<String>? {
                    val time=remaining()
                    return if(time>0)LxRuntimeHost.prepare(provider,time) else null
                }
                override fun resolve(source: String,quality: String,info: JSONObject,timeout: Long): LxOutcome {
                    val time=minOf(timeout,remaining())
                    return if(time>0)LxRuntimeHost.resolve(source,quality,info,time) else LxOutcome(false,null,"source deadline reached")
                }
            })
            return if(own==revision&&System.nanoTime()<deadlineNs)result else SourceResolution.failure("script changed or source deadline reached")
        }
        val script=scripts.find {it.optString("id")==id}?:return SourceResolution.failure("script changed")
        val engine=LxScriptEngine(object:LxHooks {
            override fun note(event: String,fields: JSONObject){PlaybackDiagnostics.note(event,fields)}
            override fun http(host: String,status: Int,bytes: Int){}
            override fun request(url: String,options: JSONObject){}
        })
        return try {
            runBlocking {engine.start(script.optString("code"),script,remaining().coerceAtLeast(1L))}
            val result=work.run(object:Access {
                override fun qualities(provider: String)=engine.capabilities[LxPlatform.sourceFor(provider)]
                override fun resolve(source: String,quality: String,info: JSONObject,timeout: Long): LxOutcome {
                    val payload=JSONObject().put("source",source).put("action","musicUrl").put("info",JSONObject().put("type",quality).put("musicInfo",info))
                    val time=minOf(timeout,remaining())
                    return if(time>0)runBlocking {engine.request(payload,time)} else LxOutcome(false,null,"source deadline reached")
                }
            })
            if(own==revision&&System.nanoTime()<deadlineNs)result else SourceResolution.failure("script changed or source deadline reached")
        } catch (_: Exception) {SourceResolution.failure("backup script failed")}
        finally {runBlocking {engine.shutdown()}}
    }
}
