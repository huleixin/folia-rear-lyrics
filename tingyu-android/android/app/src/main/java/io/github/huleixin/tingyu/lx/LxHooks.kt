package io.github.huleixin.tingyu.lx

import org.json.JSONObject

// 洛雪引擎与宿主之间的唯一出口。
//
// 引擎本身是纯 Kotlin（不碰 Android、不碰 Media3），诊断与埋点全部走这里。
// 这样同一份引擎代码既能在 Android 的 Service 进程里跑，也能在 JVM 上用真实脚本做集成实测。
interface LxHooks {
    /** 引擎侧发生了一件值得记录的事。字段里绝不允许出现完整 URL、Cookie 或脚本源码。 */
    fun note(event: String, fields: JSONObject)

    /** HTTP 桥每次真实外出请求后回调，只给主机与状态码。 */
    fun http(host: String, status: Int, bytes: Int)

    /**
     * 脚本发起请求**之前**回调一次，给的是引擎解析后的 options。
     *
     * 存在的理由：options 一旦在宿主管卡上被丢掉（method/body 全部消失），
     * 只看状态码就只能看到 404，看不出是"服务端没有这个路由"还是"我们把 POST 发成了 GET"。
     * 默认空实现，宿主不实现就没有开销。
     */
    fun request(url: String, options: JSONObject) = Unit

    companion object {
        val NONE: LxHooks = object : LxHooks {
            override fun note(event: String, fields: JSONObject) = Unit
            override fun http(host: String, status: Int, bytes: Int) = Unit
        }
    }
}
