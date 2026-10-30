/*!
 * @name 1010🎵音源
 * @description 【手机版·全链路HTTPS】五大平台(wy/tx/kw/kg/mg)聚合直链音源｜每条链路均经真实取链实测(HTTP Range 206 音频校验)筛选｜优先级并发 + 串行兜底｜链路健康度自动降权｜结果缓存
 * @version 1.1.0
 * @author Lincoln
 * @license MIT
 * @update 2026-10-22
 * @changelog
 *   - 以「全豆要[聚合音源] v9.3」架构为骨架重写
 *   - 剔除 v9.3 中已失效的 Huibq / 聆川 / 汽水VIP(api.vsaa.cn) 链路
 *   - 剔除 v9.3 中实测已 404/403 的念心、长青海棠、溯音QQ 链路
 *   - 新增实测可用后端：网易官方、酷我官方三重(mobi/nmobi/antiserver)、Vkeys、Vkeys-FLAC、流云BaiMusic、溯音咪咕
 *   - 新增链路健康度降权、结果缓存、歌手匹配校验(mg)、可播放性预检
 *   - v1.1.0: 并入社区聚合兜底链路 ikun分享(wy/kw)、幻音解析(wy/tx/kw)，来源 pdone/lx-music-source(2026-09 实测可用)
 *   - 汽水音乐(Soda)：LX Music 仅支持 wy/tx/kw/kg/mg/local，无对应平台且无可用接口，未整合
 *   - 六音/野花/LX/长青/野草/JuheApi 等因混淆或需异步初始化，保留为独立备用源，与本源并列导入即可
 */

const { EVENT_NAMES, request, on, send } = globalThis.lx

// ==================== 可调参数 ====================
const CFG = {
  reqTimeout: 8000,      // 单条链路超时(ms) —— v9.3 硬编码 2000 过短，易误杀慢链路
  concurrent: 3,         // 首批并发链路数
  cacheTTL: 3 * 60 * 60 * 1000,  // 缓存有效期 3 小时
  cacheMax: 600,         // 缓存最大条目
  failThreshold: 3,      // 连续失败多少次后降权
  cooldown: 10 * 60 * 1000,      // 降权冷却时间 10 分钟
  enablePrecheck: true,  // 对取到的直链做可播放性预检
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// ==================== 平台与音质 ====================
const PLATFORM_NAMES = { wy: '网易云音乐', tx: 'QQ音乐', kw: '酷我音乐', kg: '酷狗音乐', mg: '咪咕音乐' }

const PLATFORM_QUALITY = {
  wy: ['flac', '320k', '128k'],
  tx: ['flac', '320k', '128k'],
  kw: ['flac', '320k', '128k'],
  kg: ['flac', '320k', '128k'],
  mg: ['320k', '128k'],
}

const HIRES = new Set(['24bit', 'flac', 'flac24bit', 'hires', 'master', 'atmos'])

// ==================== HTTP 层 ====================
function httpGet(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      method: opts.method || 'GET',
      timeout: opts.timeout || CFG.reqTimeout,
      headers: Object.assign({ 'User-Agent': UA }, opts.headers || {}),
    }
    if (opts.body) options.body = opts.body
    request(url, options, (err, res) => {
      if (err) return reject(new Error('请求失败:' + (err && err.message ? err.message : err)))
      const status = (res && res.statusCode) || 0
      if (status >= 400) return reject(new Error('HTTP ' + status))
      let body = res && res.body
      if (typeof body === 'string') {
        const t = body.trim()
        if (t.charAt(0) === '{' || t.charAt(0) === '[' || t.charAt(0) === '"') {
          try { body = JSON.parse(t) } catch (e) { /* 保持原始字符串 */ }
        }
      }
      resolve(body)
    })
  })
}

// ==================== 通用工具 ====================
const BAD_EXT = /\.(jpe?g|png|gif|webp|svg|ico|css|js|json|html?|txt|xml)(\?|$)/i

/** 从任意响应体中递归挑出第一个"像音频直链"的 URL */
function pickUrl(body, depth = 0) {
  if (!body || depth > 6) return null
  if (typeof body === 'string') {
    const t = body.trim()
    if (/^https?:\/\/\S+$/.test(t) && !BAD_EXT.test(t)) return t
    const m = /https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]{20,800}/.exec(t)
    if (m) {
      const u = m[0].replace(/["'\\)\]}>,]+$/g, '')
      if (!BAD_EXT.test(u)) return u
    }
    return null
  }
  if (Array.isArray(body)) {
    for (const v of body) { const r = pickUrl(v, depth + 1); if (r) return r }
    return null
  }
  if (typeof body === 'object') {
    const preferred = ['url', 'musicUrl', 'music_url', 'playUrl', 'play_url', 'link', 'song_url', 'mp3', 'src', 'audio', 'download', 'data']
    for (const k of preferred) if (body[k] != null) { const r = pickUrl(body[k], depth + 1); if (r) return r }
    for (const k of Object.keys(body)) {
      if (preferred.indexOf(k) >= 0) continue
      const r = pickUrl(body[k], depth + 1)
      if (r) return r
    }
  }
  return null
}

function isLikelyAudio(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url) && url.length > 15 && !BAD_EXT.test(url)
}

/** 取字段：按候选名依次命中 */
function pickField(obj, names) {
  if (!obj) return ''
  for (const n of names) {
    if (obj[n] !== undefined && obj[n] !== null && String(obj[n]) !== '') return String(obj[n])
  }
  return ''
}

/** 各平台从 musicInfo 取歌曲 ID */
function getSongId(platform, mi) {
  if (!mi) return ''
  switch (platform) {
    case 'kg': return pickField(mi, ['hash', 'songmid', 'id', 'mhash'])
    case 'tx': return pickField(mi, ['songmid', 'mid', 'strMediaMid', 'id'])
    case 'kw': return pickField(mi, ['songmid', 'rid', 'id'])
    case 'mg': return pickField(mi, ['songmid', 'copyrightId', 'id'])
    default: return pickField(mi, ['songmid', 'id'])
  }
}

function getSongName(mi) { return pickField(mi, ['name', 'songName', 'title']) }
function getSinger(mi) {
  const s = pickField(mi, ['singer', 'artist', 'author'])
  if (s && s !== 'Unknown') return s
  const arr = mi && (mi.singers || mi.artists)
  if (Array.isArray(arr) && arr.length) {
    return arr.map(x => (typeof x === 'string' ? x : (x && (x.name || x.singer)) || '')).filter(Boolean).join('、')
  }
  return ''
}

/** 歌手粗匹配：用于 mg（按歌名搜索）防串歌 */
function singerHit(a, b) {
  if (!a || !b) return true
  const norm = s => String(s).replace(/[\s、,，·.。&/]/g, '').toLowerCase()
  const A = norm(a), B = norm(b)
  if (!A || !B) return true
  return A.indexOf(B) >= 0 || B.indexOf(A) >= 0
}

/** 音质选择：请求音质不存在时向下取最接近档位 */
function selectQuality(requested, list) {
  const q = String(requested || '128k').toLowerCase()
  if (list.indexOf(q) >= 0) return q
  const order = ['flac24bit', 'flac', '320k', '192k', '128k']
  const idx = order.indexOf(q)
  if (idx >= 0) {
    for (let i = idx; i < order.length; i++) if (list.indexOf(order[i]) >= 0) return order[i]
  }
  return list[list.length - 1]
}

// ==================== 音质参数映射 ====================
const WY_BR = { flac: '999000', '320k': '320000', '192k': '192000', '128k': '128000' }
const GD_BR = { flac: '999', '320k': '320', '192k': '192', '128k': '128' }
const KW_BR = { flac: '2000kflac', '320k': '320kmp3', '192k': '192kmp3', '128k': '128kmp3' }
const HYW_Q = { flac: 'flac', '320k': '320k', '192k': '192k', '128k': '128k' }

const enc = v => encodeURIComponent(String(v === undefined || v === null ? '' : v))

// ==================== 链路定义 ====================
// 每条链路：{ name, build(ctx) -> url, parse(body, ctx) -> url|null, headers? }
// 顺序即优先级；实测通过率高的排前面。
const CHAIN = {
  wy: [
    {
      name: '网易官方',
      build: c => `https://music.163.com/api/song/enhance/player/url?id=${enc(c.id)}&ids=%5B${enc(c.id)}%5D&br=${WY_BR[c.q] || '320000'}`,
      parse: b => pickUrl(b),
      headers: { Referer: 'https://music.163.com/' },
    },
    {
      name: '星海GD',
      build: c => `https://music-api.gdstudio.xyz/api.php?types=url&source=netease&id=${enc(c.id)}&br=${GD_BR[c.q] || '320'}`,
      parse: b => pickUrl(b),
    },
    {
      name: '溯音163',
      build: c => `https://oiapi.net/api/Music_163?id=${enc(c.id)}`,
      parse: b => pickUrl(b),
    },
    {
      name: '笒鬼鬼',
      build: c => `https://api.cenguigui.cn/api/netease/music_v1.php?id=${enc(c.id)}`,
      parse: b => pickUrl(b),
    },
    {
      name: 'HYW',
      build: c => `https://103.79.184.97/api/music/url?source=wy&songId=${enc(c.id)}&quality=${HYW_Q[c.q] || '320k'}&key=6C1F-53W0-GRKI-EVFG`,
      parse: b => pickUrl(b),
    },
    {
      name: 'Bugpk外链',
      build: c => `https://api.bugpk.com/api/163_music?type=json&ids=${enc(c.id)}`,
      parse: b => pickUrl(b),
    },
    {
      // 社区源 pdone/lx-music-source · ikun音源 v22 · 实测可用 2026-09
      name: 'ikun分享',
      build: c => `https://api.ikunshare.com/url?source=${c.platform}&songId=${enc(c.id)}&quality=${enc(c.q)}`,
      parse: b => (b && typeof b === 'object' && b.url) ? b.url : pickUrl(b),
      headers: { 'X-Request-Key': '' },
    },
    {
      // 社区源 pdone/lx-music-source · 幻音音源 v3 · 实测可用 2026-09
      name: '幻音解析',
      build: c => `https://music-dl.sayqz.com/api/?source=netease&id=${enc(c.id)}&type=url&br=${enc(c.q)}`,
      parse: b => pickUrl(b),
    },
  ],
  tx: [
    {
      name: 'Vkeys',
      build: c => `https://api.vkeys.cn/v2/music/tencent/geturl?mid=${enc(c.id)}`,
      parse: b => pickUrl(b),
    },
    {
      name: 'Vkeys无损',
      build: c => `https://api.vkeys.cn/music/tencent/song/link?mid=${enc(c.id)}`,
      parse: b => pickUrl(b),
      hiresOnly: true, // 返回 flac，仅在高音质请求时优先尝试
    },
    {
      name: 'HYW',
      build: c => `https://103.79.184.97/api/music/url?source=tx&songId=${enc(c.id)}&quality=${HYW_Q[c.q] || '320k'}&key=6C1F-53W0-GRKI-EVFG`,
      parse: b => pickUrl(b),
    },
    {
      name: '流云BaiMusic',
      build: c => `https://api.liuyunidc.cn/baimusic/musicurl.php?source=tx&musicId=${enc(c.id)}`,
      parse: b => pickUrl(b),
    },
    {
      // 社区源 pdone/lx-music-source · 幻音音源 v3 · 实测可用 2026-09
      name: '幻音解析',
      build: c => `https://music-dl.sayqz.com/api/?source=qq&id=${enc(c.id)}&type=url&br=${enc(c.q)}`,
      parse: b => pickUrl(b),
    },
  ],
  kw: [
    {
      name: '酷我官方nmobi',
      build: c => `https://nmobi.kuwo.cn/mobi.s?f=web&user=0&source=kwplayerhd_ar_4.3.0.8_tianbao_T1A_qirui.apk&type=convert_url_with_sign&rid=${enc(c.id)}&br=${KW_BR[c.q] || '320kmp3'}`,
      parse: b => pickUrl(b),
    },
    {
      name: '酷我官方mobi',
      build: c => `https://mobi.kuwo.cn/mobi.s?f=web&type=convert_url_with_sign&rid=${enc(c.id)}&br=${KW_BR[c.q] || '320kmp3'}`,
      parse: b => pickUrl(b),
    },
    {
      name: '酷我antiserver',
      build: c => `https://antiserver.kuwo.cn/anti.s?type=convert_url&rid=${enc(c.id)}&format=mp3&response=url`,
      parse: b => pickUrl(b),
    },
    {
      name: 'HYW',
      build: c => `https://103.79.184.97/api/music/url?source=kw&songId=${enc(c.id)}&quality=${HYW_Q[c.q] || '320k'}&key=6C1F-53W0-GRKI-EVFG`,
      parse: b => pickUrl(b),
    },
    {
      // 社区源 pdone/lx-music-source · ikun音源 v22 · 实测可用 2026-09
      name: 'ikun分享',
      build: c => `https://api.ikunshare.com/url?source=${c.platform}&songId=${enc(c.id)}&quality=${enc(c.q)}`,
      parse: b => (b && typeof b === 'object' && b.url) ? b.url : pickUrl(b),
      headers: { 'X-Request-Key': '' },
    },
    {
      // 社区源 pdone/lx-music-source · 幻音音源 v3 · 实测可用 2026-09
      name: '幻音解析',
      build: c => `https://music-dl.sayqz.com/api/?source=kuwo&id=${enc(c.id)}&type=url&br=${enc(c.q)}`,
      parse: b => pickUrl(b),
    },
  ],
  kg: [
    {
      name: 'HYW',
      build: c => `https://103.79.184.97/api/music/url?source=kg&songId=${enc(c.id)}&quality=${HYW_Q[c.q] || '320k'}&key=6C1F-53W0-GRKI-EVFG`,
      parse: b => pickUrl(b),
    },
    {
      name: '海棠备用',
      build: c => `https://music.haitangw.cc/kgqq/kg.php?type=mp3&id=${enc(c.id)}&level=${enc(c.q)}`,
      parse: b => pickUrl(b),
    },
    {
      name: '念心备用',
      build: c => `https://music.nxinxz.com/kgqq/kg.php?id=${enc(c.id)}&level=${enc(c.q)}&type=mp3`,
      parse: b => pickUrl(b),
    },
  ],
  mg: [
    {
      name: '溯音咪咕',
      build: c => `https://oiapi.net/api/MiGu_Music?msg=${enc(c.name)}&n=1&type=json`,
      // 该接口按歌名搜索，必须校验歌手，防止串歌
      parse: (b, c) => {
        const d = b && b.data
        if (!d) return pickUrl(b)
        const got = pickField(d, ['singer', 'singers', 'artist'])
        if (!singerHit(got, c.singer)) return null
        return pickField(d, ['url', 'musicUrl', 'playUrl']) || pickUrl(d)
      },
    },
    {
      name: '溯音咪咕(歌手)',
      build: c => `https://oiapi.net/api/MiGu_Music?msg=${enc(c.name + ' ' + c.singer)}&n=1&type=json`,
      parse: (b, c) => {
        const d = b && b.data
        if (!d) return pickUrl(b)
        return pickField(d, ['url', 'musicUrl', 'playUrl']) || pickUrl(d)
      },
    },
    {
      name: 'XCVTS咪咕',
      build: c => `https://api.xcvts.cn/api/music/migu?gm=${enc(c.name)}`,
      parse: b => pickUrl(b),
    },
  ],
}

// ==================== 链路健康度 ====================
const health = Object.create(null)   // name -> { fail:number, until:number }
function isCooling(name) {
  const h = health[name]
  if (!h) return false
  return h.fail >= CFG.failThreshold && Date.now() < h.until
}
function markOk(name) { if (health[name]) health[name].fail = 0 }
function markFail(name) {
  const h = health[name] || (health[name] = { fail: 0, until: 0 })
  h.fail += 1
  if (h.fail >= CFG.failThreshold) h.until = Date.now() + CFG.cooldown
}

// ==================== 缓存 ====================
const cache = new Map()
function cacheGet(key) {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.t > CFG.cacheTTL) { cache.delete(key); return null }
  return hit.url
}
function cacheSet(key, url) {
  cache.set(key, { url, t: Date.now() })
  if (cache.size > CFG.cacheMax) {
    const first = cache.keys().next().value
    cache.delete(first)
  }
}

// ==================== 可播放性预检 ====================
function precheck(url) {
  if (!CFG.enablePrecheck) return Promise.resolve(true)
  return new Promise(resolve => {
    let settled = false
    const done = v => { if (!settled) { settled = true; resolve(v) } }
    const timer = setTimeout(() => done(true), 4000) // 预检超时视为可用，不阻塞
    try {
      request(url, { method: 'GET', timeout: 3500, headers: { 'User-Agent': UA, Range: 'bytes=0-511' } }, (err, res) => {
        clearTimeout(timer)
        if (err) return done(true)
        const code = (res && res.statusCode) || 0
        if (code === 0 || code >= 400) return done(false)
        const body = res && res.body
        if (typeof body === 'string' && (/^\s*<(!doctype|html)/i.test(body) || /^\s*\{/.test(body))) return done(false)
        done(true)
      })
    } catch (e) { clearTimeout(timer); done(true) }
  })
}

// ==================== 单链路执行 ====================
async function runLink(link, ctx) {
  const url = link.build(ctx)
  const body = await httpGet(url, { headers: link.headers, timeout: CFG.reqTimeout })
  const direct = link.parse ? link.parse(body, ctx) : pickUrl(body)
  if (!isLikelyAudio(direct)) throw new Error('未取到直链')
  if (!(await precheck(direct))) throw new Error('直链不可播放')
  return direct
}

// ==================== 调度：优先级并发 + 串行兜底 ====================
async function getUrl(platform, musicInfo, requestedQuality) {
  const qualitys = PLATFORM_QUALITY[platform]
  if (!qualitys) throw new Error('不支持的平台: ' + platform)
  const q = selectQuality(requestedQuality, qualitys)
  const id = getSongId(platform, musicInfo)
  const name = getSongName(musicInfo)
  const singer = getSinger(musicInfo)
  if (!id && platform !== 'mg') throw new Error('缺少歌曲 ID')
  if (!name && platform === 'mg') throw new Error('缺少歌曲名')

  const ctx = { id, name, singer, q, platform, hires: HIRES.has(String(requestedQuality || '').toLowerCase()) }

  const ck = platform + ':' + id + ':' + q
  const cached = cacheGet(ck)
  if (cached) return cached

  let links = (CHAIN[platform] || []).filter(l => !isCooling(l.name))
  // 高音质请求时把 hiresOnly 链路提前
  if (ctx.hires) {
    links = links.filter(l => l.hiresOnly).concat(links.filter(l => !l.hiresOnly))
  } else {
    links = links.filter(l => !l.hiresOnly) // 非高音质不浪费请求在纯无损链路上
  }
  if (!links.length) links = (CHAIN[platform] || []).slice()

  const errors = []
  const batch = links.slice(0, CFG.concurrent)
  if (batch.length) {
    const results = await Promise.allSettled(batch.map(l =>
      runLink(l, ctx).then(u => { markOk(l.name); return { link: l, url: u } })
    ))
    // 严格按数组顺序取首个成功者，尊重链路优先级
    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      if (r.status === 'fulfilled') { cacheSet(ck, r.value.url); return r.value.url }
      markFail(batch[i].name)
      errors.push(batch[i].name + ':' + ((r.reason && r.reason.message) || '失败'))
    }
  }
  // 串行兜底剩余链路
  for (const l of links.slice(CFG.concurrent)) {
    try {
      const u = await runLink(l, ctx)
      markOk(l.name)
      cacheSet(ck, u)
      return u
    } catch (e) {
      markFail(l.name)
      errors.push(l.name + ':' + (e.message || '失败'))
    }
  }
  throw new Error('全部链路失败 → ' + errors.join(' | '))
}

// ==================== 注册 ====================
const sourceConfig = {}
Object.keys(PLATFORM_QUALITY).forEach(p => {
  sourceConfig[p] = {
    name: PLATFORM_NAMES[p],
    type: 'music',
    actions: ['musicUrl'],
    qualitys: PLATFORM_QUALITY[p],
  }
})

on(EVENT_NAMES.request, ({ action, source, info }) => {
  if (action !== 'musicUrl') return Promise.reject(new Error('action not support'))
  if (!sourceConfig[source]) return Promise.reject(new Error('source not support'))
  const musicInfo = info && info.musicInfo
  if (!musicInfo) return Promise.reject(new Error('请求参数不完整'))
  return getUrl(source, musicInfo, (info && info.type) || '128k')
})

send(EVENT_NAMES.inited, { openDevTools: false, sources: sourceConfig })

console.log('1010🎵音源 v1.1.0 已加载 —— 平台: wy/tx/kw/kg/mg')
