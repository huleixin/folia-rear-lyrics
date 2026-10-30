# 洛雪音源双引擎对照台

用途：把**用户当前导入的脚本**、**同一首真实歌曲**、**同一个音质**，分别在两端跑一遍，
逐字段对照它们真正发出去的 HTTP 请求。所有敏感值脱敏（只留主机、路径、query 参数名、
Content-Type、请求体的键名与值类型）。

- WebView 侧：`src/services/lxSource/bootstrap.ts`（脚本看到的 `lx.*`）+ `http.ts`（请求映射）
  + `utilities.ts`（md5/aes/buffer），跑在 quickjs-emscripten 上，`@capacitor/core` 换成记账替身
  （真机上 WebView 走的是 CapacitorHttp，替身只负责原样执行并记账，不改 http.ts 一行）。
- 原生侧：`android/.../lx/LxBootstrap` + `lx/LxHttp` + `lx/LxScriptEngine`，跑在 QuickJS 上，
  用 `LxHooks.request()` 在请求发出前记录解析后的 options。

## 三条命令（在 `tools/lx-compare` 目录下）

前置：脚本放在 ASCII 路径下（JVM 参数带中文在 Windows 上会被解码错），JDK 21 与 gradle 可用。

```bash
# 1) 先由原生侧导出同一份 musicInfo（两端必须用同一个身份，否则比的是"歌不同"）
GRADLE=<gradle> $GRADLE -p ../lx-probe --offline -q musicinfo --args="<spec.json> <music-info.json>"

# 2) 原生侧取证
$GRADLE -p ../lx-probe --offline -q record --args="<script.js> <music-info.json> <source> <quality> <mid> <native.json>"

# 3) WebView 侧取证
node webview.mjs --app <appRoot> --script <script.js> --music-info <music-info.json> \
    --source <source> --quality <quality> --out <webview.json>

# 4) 对照
node compare.mjs --webview <webview.json> --native <native.json>   # 全部一致时退出码 0
```

`spec.json` 形如：
```json
{"source":"tx","providerId":"qq","mediaId":"0039MnYb0qxYhV","title":"晴天","artist":"周杰伦",
 "album":"叶惠美","seconds":269,"artwork":"","providerData":"","qualitys":["128k","320k","flac"]}
```

对照字段：`method / host / path / queryKeys / contentType / body`，外加最终结果是否同为成功。

## 已记录的实测结论（1.3.50，长青SVIP音源(二改修复版) v1.2.0）

| | 修复前（原生） | 修复后（原生） | WebView 侧 |
|---|---|---|---|
| method | `GET` | `POST` | `POST` |
| path | `/v1/music/resolve-url` | 同左 | 同左 |
| Content-Type | 空 | `application/json` | `application/json` |
| 请求体 | 空 | `{level,rid,source}` | `{level,rid,source}` |
| options 键 | 空（被丢） | `body,headers,method,timeout` | — |
| 状态码 | 404 `Cannot GET` | 201 | 201 |
| 结果 | 失败 | 206 audio/mpeg | 206 audio/mpeg |
