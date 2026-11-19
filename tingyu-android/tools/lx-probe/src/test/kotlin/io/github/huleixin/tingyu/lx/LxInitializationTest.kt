package io.github.huleixin.tingyu.lx

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

// Real QuickJS lifecycle regression: a script may keep timers after declaring readiness.
class LxInitializationTest {
    @Test(timeout = 10000) fun timedOutInitializationCanBeClosedAndRetried() = runBlocking {
        val engine=LxScriptEngine()
        try {
            try {
                engine.start("setTimeout(() => {}, 60000);",JSONObject(),100)
                fail("Initialization should time out without an inited event")
            } catch (_: kotlinx.coroutines.TimeoutCancellationException) { assertFalse(engine.started) }
            engine.close()
            engine.start("lx.send('inited',{sources:{tx:{type:'music',actions:['musicUrl'],qualitys:['128k']}}});",JSONObject(),1000)
            assertTrue(engine.started)
        } finally { engine.shutdown() }
    }
    @Test(timeout = 10000) fun initializationDoesNotWaitForBackgroundTimers() = runBlocking {
        val engine = LxScriptEngine()
        try {
            engine.start("""
                setInterval(() => {}, 60000);
                lx.on('request', () => Promise.resolve('https://example.com/audio.mp3'));
                lx.send('inited', {sources:{tx:{type:'music',actions:['musicUrl'],qualitys:['128k']}}});
            """.trimIndent(), JSONObject(), 1000)
            assertTrue(engine.started)
            assertTrue(engine.request(JSONObject().put("source", "tx").put("action", "musicUrl"), 1000).ok)
        } finally { engine.shutdown() }
    }
}
