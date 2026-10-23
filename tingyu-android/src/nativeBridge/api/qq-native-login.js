// src/nativeBridge/api/qq-native-login.js
//
// 「手机 QQ」扫码通道 —— QQ 官方客户端走的那条。
//
// 流程（与 qq-music-api 的 qrDrivers/qrService/credentialWire 一致）：
//   1. musicu `music.login.LoginServer` / `CreateQRCode`（comm 覆盖 ct:23, cv:0）→ qrcodeID + PNG
//   2. 订阅 MQTT 主题 management.qrcode_login/<qrcodeID>，**SUBACK 之后才把二维码给出去**
//      （单播订阅，上游不重放订阅前的推送，显示早了 scanned/cookies 会丢）
//   3. 手机确认后收到 cookies 事件：qqmusic_uin.value = musicid，qqmusic_key.value = token
//   4. musicu `music.login.LoginServer` / `Login`（comm.tmeLoginType = 6）
//      { musicid, qrCodeID, token } → musickey 等凭据
//   5. 按网页通道同样的形状落盘会话 cookie，后续请求照旧
//
// 为什么要这条通道：网页 ptlogin2 拿到的凭据是**另一条通道**的。服务端对读取放行、对写入
// （红心/收藏这类按设备校验的 musicasset 写接口）会拒 —— 现场就是 identity/read 全 code=0、
// 只有 write 回业务码 500026，而 provider 自己的注释也写着 `qq` 通道「仍送 tmeLoginType 6」。

import { createQrMqttListener } from './qq-mqtt.js';
import { qqAnonymousMusicuCall } from './qq.js';
import { buildLoginSession, writeSessionCookies } from './qq-login-qr.js';
import { noteQrLoginStep } from './qrLoginTrace.js';

const QQ_MOBILE_LOGIN_TYPE = 6;
const NATIVE_QR_TTL_MS = 3 * 60 * 1000;

/** qrcodeId → 会话。跨 login_qr_key / login_qr_check 两次调用共享，MQTT 长连接挂在这里。 */
const nativeQrSessions = new Map();

const dropSession = (qrcodeId) => {
  const session = nativeQrSessions.get(qrcodeId);
  if (!session) return;
  try { session.listener?.close?.(); } catch (_) {}
  nativeQrSessions.delete(qrcodeId);
};

/** cookies 事件 → 换凭据 → 落盘。失败只记账，不抛（调用方在轮询里读状态）。 */
const exchangeNativeCredential = async (session, payload) => {
  const cookies = (payload && payload.cookies) || {};
  const musicid = String((cookies.qqmusic_uin || {}).value || '').trim();
  const token = String((cookies.qqmusic_key || {}).value || '').trim();
  noteQrLoginStep('native:cookies', { hasMusicId: Boolean(musicid), hasToken: Boolean(token) });
  if (!musicid || !token) {
    session.state = 'failed';
    session.error = '扫码回调缺少凭据（qqmusic_uin / qqmusic_key）';
    return;
  }

  const result = await qqAnonymousMusicuCall(
    'music.login.LoginServer', 'Login',
    { musicid: Number(musicid), qrCodeID: session.qrcodeId, token },
    { tmeLoginType: QQ_MOBILE_LOGIN_TYPE },
  );
  const data = (result.data && typeof result.data === 'object') ? result.data : {};
  const musickey = String(data.musickey || '').trim();
  const musicId = String(data.musicid || musicid).replace(/\D/g, '');
  noteQrLoginStep('native:exchange', {
    ok: result.ok,
    code: result.code,
    subcode: result.subcode,
    hasMusicKey: Boolean(musickey),
  });
  if (!result.ok || !musickey || !musicId) {
    session.state = 'failed';
    session.error = `换票失败（code ${result.code ?? 'n/a'}）`;
    return;
  }

  // cookie 形状与网页通道一致（uin 带 `o` 前缀、str_musicid 带裸值），
  // 后续 qqCookieUin / qqCookieMusicId / buildQQRadioCookie 都按这套读。
  const cookie = [
    `uin=o${musicId}`,
    `qqmusic_uin=o${musicId}`,
    `qm_keyst=${musickey}`,
    `qqmusic_key=${musickey}`,
    `str_musicid=${musicId}`,
    'login_type=1',
  ].join('; ');
  const loginSession = buildLoginSession(cookie);
  await writeSessionCookies(loginSession);
  session.credential = loginSession;
  session.state = 'confirmed';
  noteQrLoginStep('native:session', { cookieCount: loginSession.cookieList.length });
};

const handleNativeEvent = (session, event) => {
  const type = String((event && event.type) || '');
  noteQrLoginStep('native:event', { type });
  if (type === 'waiting') return;
  if (type === 'scanned') { session.state = 'scanned'; return; }
  if (type === 'cookies' || type === 'authorized') {
    session.state = 'exchanging';
    void exchangeNativeCredential(session, event.payload).catch((error) => {
      session.state = 'failed';
      session.error = String((error && error.message) || error);
    });
    return;
  }
  if (type === 'canceled') { session.state = 'canceled'; return; }
  if (type === 'timeout') { session.state = 'expired'; return; }
  if (type === 'loginFailed') { session.state = 'failed'; session.error = '手机端登录失败'; }
};

/**
 * 创建原生二维码并开始监听。返回 `{ qrcodeId, qrimg }`；
 * 订阅（SUBACK）完成或失败后才返回 —— 失败时抛出，让调用方回落到网页通道。
 */
export async function qqNativeCreateLoginQr() {
  const result = await qqAnonymousMusicuCall(
    'music.login.LoginServer', 'CreateQRCode',
    { tmeAppID: 'qqmusic', ct: 11, cv: 14090008 },
    { ct: 23, cv: 0 },
  );
  const data = (result.data && typeof result.data === 'object') ? result.data : {};
  const qrcodeId = String(data.qrcodeID || '').trim();
  const encoded = String(data.qrcode || '').split(',').pop().trim();
  noteQrLoginStep('native:create', {
    ok: result.ok,
    code: result.code,
    hasQrcodeId: Boolean(qrcodeId),
    imageChars: encoded.length,
  });
  if (!result.ok || !qrcodeId || !encoded) {
    throw new Error(`QQ CreateQRCode failed (code ${result.code ?? 'n/a'})`);
  }

  const session = {
    qrcodeId,
    state: 'waiting',
    error: '',
    credential: null,
    expiresAt: Date.now() + NATIVE_QR_TTL_MS,
  };
  const listener = createQrMqttListener(
    qrcodeId,
    (event) => handleNativeEvent(session, event),
    NATIVE_QR_TTL_MS,
  );
  session.listener = listener;
  nativeQrSessions.set(qrcodeId, session);
  // 订阅成功之前不把二维码交出去（见文件头注释）。
  await listener.ready;
  noteQrLoginStep('native:ready', { qrcodeIdTail: qrcodeId.slice(-4) });
  return { qrcodeId, qrimg: `data:image/png;base64,${encoded}` };
}

/** 轮询状态。返回形状与网页通道的 check 对齐，交给 folia.js 的同一套映射。 */
export async function qqNativeCheckLoginQr(qrcodeId) {
  const session = nativeQrSessions.get(String(qrcodeId || ''));
  if (!session) return { refresh: true, message: '二维码已失效，请重新获取' };
  if (session.state === 'confirmed' && session.credential) {
    dropSession(session.qrcodeId);
    return {
      isOk: true,
      loggedIn: true,
      message: '登录成功',
      session: session.credential,
    };
  }
  if (session.state === 'failed') {
    const reason = session.error || '登录失败';
    dropSession(session.qrcodeId);
    return {
      status: 'error',
      retryable: false,
      failureStage: 'native-login',
      failureReason: reason,
      message: reason,
    };
  }
  if (session.state === 'canceled') {
    dropSession(session.qrcodeId);
    return { refresh: true, message: '已取消登录' };
  }
  if (session.state === 'expired' || Date.now() > session.expiresAt) {
    dropSession(session.qrcodeId);
    return { refresh: true, message: '二维码已过期' };
  }
  if (session.state === 'exchanging') return { message: '正在换取凭证…' };
  if (session.state === 'scanned') return { status: 'scanned', message: '已扫码，请在手机上确认' };
  return { message: '等待扫码' };
}

export function qqNativeCancelLoginQr(qrcodeId) {
  dropSession(String(qrcodeId || ''));
}
