package io.github.huleixin.tingyu.lx

import org.json.JSONArray
import org.json.JSONObject

// QuickJS → Kotlin 的值转换。
//
// 这个文件存在的唯一理由是一个已经发生的真实故障：
// quickjs-kt 把 JS 对象交给宿主函数时用的是它自己的 JsObject（本质是 Map），
// **不是** org.json.JSONObject。以前的写法只认 JSONObject，其余一律退化成空 options ——
// 脚本给的 method / body / headers 被整包丢掉，POST 变 GET、JSON 请求体消失，
// 服务端只回一句 Cannot GET /v1/music/resolve-url。
//
// 所以三条输入都要能落地，任何一条都不能再静默变成空：
//   1. JSON 字符串（shim 现在走这条，语义与 WebView 侧的桥序列化一致）；
//   2. JsObject / Map（防御：换绑定方式或脚本直接传对象时不至于再丢）；
//   3. JSONObject（原生内部调用）。
object LxJson {

    /** 把宿主函数收到的第二个参数当成 options 解析；拿不到就给空对象，但调用方必须能区分"给了但没解析出来"。 */
    fun toJsonObject(raw: Any?): JSONObject = when (val value = unwrap(raw)) {
        is JSONObject -> value
        is Map<*, *> -> JSONObject().apply {
            value.forEach { (key, item) -> put(key.toString(), unwrap(item)) }
        }
        is String -> try {
            JSONObject(value)
        } catch (_: Throwable) {
            JSONObject()
        }
        else -> JSONObject()
    }

    fun unwrap(value: Any?): Any? = when (value) {
        null, JSONObject.NULL -> JSONObject.NULL
        is JSONObject, is JSONArray, is Boolean, is Number, is String -> value
        is Map<*, *> -> JSONObject().apply { value.forEach { (key, item) -> put(key.toString(), unwrap(item)) } }
        is Iterable<*> -> JSONArray().apply { value.forEach { put(unwrap(it)) } }
        is Array<*> -> JSONArray().apply { value.forEach { put(unwrap(it)) } }
        else -> value.toString()
    }

    /** 请求体的最终文本：字符串原样，对象/数组走 JSON，其余退成字符串。 */
    fun bodyText(value: Any?): String = when (val unwrapped = unwrap(value)) {
        is JSONObject, is JSONArray -> unwrapped.toString()
        is String -> unwrapped
        JSONObject.NULL -> "null"
        else -> unwrapped.toString()
    }
}
