package io.github.huleixin.tingyu.lx;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 「脚本给的 options」→「真正发出去的请求」这一段映射的回归测试。
 *
 * 它守的是一个已经发生过的真机故障：长青音源用
 * `lx.request(url, { method: 'POST', headers: {...}, body: { source, rid, level } })`
 * 取地址，宿主把 options 整包丢掉，POST 变成 GET、JSON 请求体消失，
 * 服务端只回一句 `Cannot GET /v1/music/resolve-url`，后台连播因此整段停摆。
 *
 * 所以这里的断言不是"能构造出请求"，而是"method / body / Content-Type
 * 必须真的落地"——任何一条退化都会再犯同一个错。
 */
public class LxHttpMappingTest {

    private static final String RESOLVE_URL = "https://musicserver.example/v1/music/resolve-url";

    /** 真机故障现场的请求：POST + application/json + {source, rid, level}。 */
    private static JSONObject resolveOptions() throws Exception {
        return new JSONObject()
            .put("method", "POST")
            .put("headers", new JSONObject().put("Content-Type", "application/json"))
            .put("body", new JSONObject().put("source", "tx").put("rid", "0039MnYb0qxYhV").put("level", "320k"))
            .put("timeout", 8000);
    }

    @Test public void postWithJsonBodyKeepsMethodBodyAndContentType() throws Exception {
        LxHttp.LxRequestPlan plan = LxHttp.INSTANCE.plan(RESOLVE_URL, resolveOptions());
        assertEquals("POST", plan.getMethod());
        assertEquals("application/json", header(plan, "Content-Type"));
        JSONObject body = new JSONObject(plan.getBody());
        assertEquals("tx", body.optString("source"));
        assertEquals("0039MnYb0qxYhV", body.optString("rid"));
        assertEquals("320k", body.optString("level"));
    }

    @Test public void jsonBodyIsSerializedEvenWhenTheScriptGaveNoContentType() throws Exception {
        JSONObject options = new JSONObject()
            .put("method", "POST")
            .put("body", new JSONObject().put("a", 1).put("b", "x"));
        LxHttp.LxRequestPlan plan = LxHttp.INSTANCE.plan(RESOLVE_URL, options);
        assertEquals("POST", plan.getMethod());
        // 没有声明 Content-Type 时，与 WebView http.ts 一样默认 application/json。
        assertEquals("application/json", header(plan, "Content-Type"));
        JSONObject body = new JSONObject(plan.getBody());
        assertEquals(1, body.optInt("a"));
        assertEquals("x", body.optString("b"));
    }

    @Test public void getWithoutBodyProducesNoBodyAndNoContentType() throws Exception {
        // 这一条同时是"故障长什么样"的记录：options 空 ⇒ GET、无体、无 Content-Type。
        LxHttp.LxRequestPlan plan = LxHttp.INSTANCE.plan(RESOLVE_URL, new JSONObject());
        assertEquals("GET", plan.getMethod());
        assertNull(plan.getBody());
        assertEquals("", header(plan, "Content-Type"));
    }

    @Test public void formEncodesBodyAndContentType() throws Exception {
        LxHttp.LxRequestPlan plan = LxHttp.INSTANCE.plan(RESOLVE_URL, new JSONObject()
            .put("method", "POST")
            .put("form", new JSONObject().put("a", "1").put("b", "x y")));
        assertEquals("POST", plan.getMethod());
        assertEquals("application/x-www-form-urlencoded", header(plan, "Content-Type"));
        assertEquals("a=1&b=x+y", plan.getBody());
    }

    @Test public void blockedHeadersAreDropped() throws Exception {
        LxHttp.LxRequestPlan plan = LxHttp.INSTANCE.plan(RESOLVE_URL, new JSONObject()
            .put("headers", new JSONObject().put("cookie", "x").put("host", "evil").put("X-Token", "keep")));
        assertEquals("", header(plan, "cookie"));
        assertEquals("", header(plan, "host"));
        assertEquals("keep", header(plan, "X-Token"));
    }

    // -------------------------------------------------- JS 对象 → Kotlin 的落地

    @Test public void jsObjectLikeMapIsNotSilentlyDropped() throws Exception {
        // quickjs-kt 交过来的就是这种东西（JsObject，本质是 Map），
        // 以前只认 org.json.JSONObject，其余一律变成空 options —— 故障的根因。
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("source", "tx");
        body.put("rid", "0039MnYb0qxYhV");
        Map<String, Object> headers = new LinkedHashMap<>();
        headers.put("Content-Type", "application/json");
        Map<String, Object> options = new LinkedHashMap<>();
        options.put("method", "POST");
        options.put("headers", headers);
        options.put("body", body);

        JSONObject parsed = LxJson.INSTANCE.toJsonObject(options);
        assertEquals("POST", parsed.optString("method"));
        assertEquals("tx", parsed.optJSONObject("body").optString("source"));
        assertEquals("application/json", parsed.optJSONObject("headers").optString("Content-Type"));

        LxHttp.LxRequestPlan plan = LxHttp.INSTANCE.plan(RESOLVE_URL, parsed);
        assertEquals("POST", plan.getMethod());
        assertEquals("application/json", header(plan, "Content-Type"));
        assertEquals("0039MnYb0qxYhV", new JSONObject(plan.getBody()).optString("rid"));
    }

    @Test public void jsonTextOptionsAreParsed() throws Exception {
        JSONObject parsed = LxJson.INSTANCE.toJsonObject(
            "{\"method\":\"POST\",\"body\":{\"source\":\"tx\"},\"timeout\":8000}");
        assertEquals("POST", parsed.optString("method"));
        assertEquals(8000, parsed.optInt("timeout"));
        assertEquals("tx", parsed.optJSONObject("body").optString("source"));
    }

    @Test public void garbageTextOptionsBecomeEmptyInsteadOfThrowing() throws Exception {
        assertTrue(LxJson.INSTANCE.toJsonObject("not json at all").length() == 0);
        assertTrue(LxJson.INSTANCE.toJsonObject(null).length() == 0);
    }

    @Test public void objectBodyTextIsJsonNotJavaIdentity() throws Exception {
        // 早先是 raw.toString()，对象会变成 com.xxx.JsObject@hash，服务端永远读不懂。
        String text = LxJson.INSTANCE.bodyText(new JSONObject().put("source", "tx").put("rid", "abc"));
        JSONObject back = new JSONObject(text);
        assertEquals("tx", back.optString("source"));
        assertEquals("abc", back.optString("rid"));
    }

    /** 守住所修的那一行：宿主函数必须收到 JSON 文本，而不是裸 JS 对象。 */
    @Test public void bootstrapSerializesOptionsBeforeCrossingIntoKotlin() {
        assertTrue("lx.request 必须先把 options 序列化成 JSON 文本再交给宿主，"
            + "否则 QuickJS 绑定交过来的 JsObject 会被当成空 options",
            LxBootstrap.SHIM.contains("http(String(url), JSON.stringify(options || {}))"));
    }

    private static String header(LxHttp.LxRequestPlan plan, String name) {
        for (Map.Entry<String, String> entry : plan.getHeaders().entrySet()) {
            if (entry.getKey().equalsIgnoreCase(name)) return entry.getValue();
        }
        return "";
    }
}
