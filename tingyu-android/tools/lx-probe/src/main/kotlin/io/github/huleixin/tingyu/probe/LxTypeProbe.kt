package io.github.huleixin.tingyu.probe

import com.dokar.quickjs.QuickJs
import com.dokar.quickjs.binding.asyncFunction
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking

// 类型探针：确认 QuickJS 把 JS 对象交给 Kotlin 宿主函数时的真实 Java 类型。
//
// 这一条必须先查清，否则 "原生发成 GET" 的原因只能靠猜：
// LxScriptEngine.http() 只在 args[1] 是 JSONObject 时认它，其余一律退化成空 options
// —— 空 options 意味着 method 默认 GET、body/headers 全丢。
fun main() {
    val engine = QuickJs.create(Dispatchers.IO)
    engine.asyncFunction("__http") { args ->
        println("arity=${args.size}")
        args.forEachIndexed { index, value ->
            println("  [$index] javaType=${value?.javaClass?.name} value=${value.toString().take(300)}")
        }
        "{\"statusCode\":200}"
    }
    runBlocking {
        println("== case 1 对象字面量 ==")
        println(engine.evaluate<Any?>(
            "__http('https://example.invalid/a', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { a: 1, b: 'x' } })"
        ).toString())
        println("== case 2 无 options ==")
        println(engine.evaluate<Any?>("__http('https://example.invalid/a')").toString())
        println("== case 3 JSON 字符串 ==")
        println(engine.evaluate<Any?>("__http('https://example.invalid/a', JSON.stringify({method:'POST'}))").toString())
        engine.close()
    }
}
