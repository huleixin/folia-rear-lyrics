// src/nativeBridge/api/qq-mqtt.js
//
// QQ「手机 QQ」扫码通道的推送监听，移植自 qq-music-api 的 services/auth/mqtt。
//
// 协议：连 wss://mu.y.qq.com/ws/handshake（子协议 mqtt），发 MQTT CONNECT 与 SUBSCRIBE，
// 订阅 management.qrcode_login/<qrcodeId>；用户在手机 QQ 里确认后，服务端向该主题推送事件：
//   { type: 'scanned' | 'cookies' | 'canceled' | 'timeout' | 'loginFailed',
//     payload: { cookies: { qqmusic_uin: { value }, qqmusic_key: { value } } } }
// 这是 QQ 官方客户端走的通道 —— 网页 ptlogin2 拿到的凭据是另一条通道的，写入会被服务端拒。
//
// MQTT 的编解码在这里是纯函数（无 socket 依赖），可以单独测。

export const MQTT_HOST = 'mu.y.qq.com';
export const MQTT_INITIAL_PATH = '/ws/handshake';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8');

const concatBytes = (chunks) => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

export function encodeVariableInteger(input) {
  let value = input;
  const bytes = [];
  do {
    let digit = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) digit |= 0x80;
    bytes.push(digit);
  } while (value > 0);
  return new Uint8Array(bytes);
}

export function decodeVariableInteger(buffer, offset = 0) {
  let multiplier = 1;
  let value = 0;
  for (let index = 0; index < 4; index += 1) {
    if (offset + index >= buffer.length) return null;
    const digit = buffer[offset + index];
    value += (digit & 0x7f) * multiplier;
    if ((digit & 0x80) === 0) return { value, bytes: index + 1 };
    multiplier *= 128;
  }
  throw new Error('Malformed MQTT variable integer');
}

// 编解码助手对单测导出：构造/解析报文要用同一套编码，测试才不会「自己写一套字节」而失真。
export { encodeUtf8, encodeProperties, wrapPacket };

function encodeUtf8(value) {
  const data = textEncoder.encode(String(value));
  return concatBytes([new Uint8Array([(data.length >> 8) & 0xff, data.length & 0xff]), data]);
}

function readUtf8(buffer, offset) {
  const length = (buffer[offset] << 8) | buffer[offset + 1];
  const start = offset + 2;
  return { value: textDecoder.decode(buffer.subarray(start, start + length)), next: start + length };
}

function encodeProperties(authMethod, properties) {
  const chunks = [];
  if (authMethod) chunks.push(new Uint8Array([0x15]), encodeUtf8(authMethod));
  for (const [key, value] of properties) {
    chunks.push(new Uint8Array([0x26]), encodeUtf8(key), encodeUtf8(value));
  }
  const data = concatBytes(chunks);
  return concatBytes([encodeVariableInteger(data.length), data]);
}

const wrapPacket = (header, body) => concatBytes([
  new Uint8Array([header]),
  encodeVariableInteger(body.length),
  body,
]);

export function buildConnectPacket(clientId, qrcodeId) {
  const properties = encodeProperties('pass', [
    ['tmeAppID', 'qqmusic'],
    ['business', 'management'],
    ['hashTag', qrcodeId],
    ['clientTag', 'management.user'],
    ['userID', qrcodeId],
  ]);
  return wrapPacket(0x10, concatBytes([
    encodeUtf8('MQTT'),
    // 协议级别 5（MQTT 5）+ 连接标志 0x02（clean start）。
    new Uint8Array([0x05, 0x02]),
    new Uint8Array([0x00, 45]), // keepalive
    properties,
    encodeUtf8(clientId),
  ]));
}

export function buildSubscribePacket(qrcodeId) {
  const properties = encodeProperties(null, [
    ['authorization', 'tmelogin'],
    ['pubsub', 'unicast'],
  ]);
  return wrapPacket(0x82, concatBytes([
    new Uint8Array([0x00, 0x01]), // packet id
    properties,
    encodeUtf8(`management.qrcode_login/${qrcodeId}`),
    new Uint8Array([0x00]), // requested QoS 0
  ]));
}

function skipProperty(buffer, offset, id) {
  if ([0x03, 0x08, 0x12, 0x15, 0x1a, 0x1c, 0x1f].includes(id)) return readUtf8(buffer, offset).next;
  if ([0x13, 0x21, 0x22, 0x23].includes(id)) return offset + 2;
  if ([0x02, 0x11, 0x18, 0x27].includes(id)) return offset + 4;
  if ([0x01, 0x17, 0x19, 0x24, 0x25, 0x28, 0x29, 0x2a].includes(id)) return offset + 1;
  if ([0x09, 0x16].includes(id)) return offset + 2 + ((buffer[offset] << 8) | buffer[offset + 1]);
  if (id === 0x0b) {
    const value = decodeVariableInteger(buffer, offset);
    if (!value) throw new Error('Truncated MQTT subscription identifier');
    return offset + value.bytes;
  }
  throw new Error(`Unsupported MQTT property 0x${id.toString(16)}`);
}

function parseProperties(buffer, offset) {
  const length = decodeVariableInteger(buffer, offset);
  if (!length) throw new Error('Truncated MQTT properties');
  let cursor = offset + length.bytes;
  const end = cursor + length.value;
  const userProperties = {};
  const values = { userProperties };
  while (cursor < end) {
    const id = buffer[cursor];
    cursor += 1;
    if (id === 0x26) {
      const key = readUtf8(buffer, cursor);
      const value = readUtf8(buffer, key.next);
      userProperties[key.value] = value.value;
      cursor = value.next;
    } else if (id === 0x1c || id === 0x1f) {
      const value = readUtf8(buffer, cursor);
      values[id === 0x1c ? 'serverReference' : 'reasonString'] = value.value;
      cursor = value.next;
    } else {
      cursor = skipProperty(buffer, cursor, id);
    }
  }
  return { values, next: end };
}

export function splitPackets(buffer) {
  const packets = [];
  let cursor = 0;
  while (cursor < buffer.length) {
    const remaining = decodeVariableInteger(buffer, cursor + 1);
    if (!remaining) break;
    const end = cursor + 1 + remaining.bytes + remaining.value;
    if (end > buffer.length) break;
    packets.push(buffer.subarray(cursor, end));
    cursor = end;
  }
  return { packets, rest: buffer.subarray(cursor) };
}

export function parseConnack(packet) {
  const remaining = decodeVariableInteger(packet, 1);
  if (!remaining) throw new Error('Truncated MQTT CONNACK');
  const offset = 1 + remaining.bytes;
  return { reasonCode: packet[offset + 1], ...parseProperties(packet, offset + 2).values };
}

export function parsePublish(packet) {
  const remaining = decodeVariableInteger(packet, 1);
  if (!remaining) throw new Error('Truncated MQTT PUBLISH');
  let cursor = 1 + remaining.bytes;
  cursor = readUtf8(packet, cursor).next;
  if (((packet[0] >> 1) & 0x03) > 0) cursor += 2; // QoS > 0 有 packet id
  const properties = parseProperties(packet, cursor);
  const users = properties.values.userProperties || {};
  const raw = textDecoder.decode(packet.subarray(properties.next));
  let payload = null;
  if (raw) {
    try { payload = JSON.parse(raw); } catch (_) { payload = null; }
  }
  return { type: typeof users.type === 'string' ? users.type : null, payload };
}

/** 按包边界重新组装 WebSocket 帧 —— 一帧里可能有多包，一包也可能跨帧。 */
const createPacketQueue = () => {
  let buffered = new Uint8Array(0);
  const packets = [];
  const waiters = [];
  let terminalError = null;
  const settle = () => {
    while (waiters.length && packets.length) waiters.shift().resolve(packets.shift());
    while (terminalError && waiters.length) waiters.shift().reject(terminalError);
  };
  return {
    handlers: {
      message: (value) => {
        const incoming = value instanceof Uint8Array ? value : new Uint8Array(value);
        const split = splitPackets(concatBytes([buffered, incoming]));
        buffered = split.rest;
        packets.push(...split.packets);
        settle();
      },
      error: () => { terminalError = new Error('MQTT WebSocket error'); settle(); },
      close: () => { terminalError = new Error('MQTT WebSocket closed'); settle(); },
    },
    next(timeoutMs) {
      if (packets.length) return Promise.resolve(packets.shift());
      if (terminalError) return Promise.reject(terminalError);
      return new Promise((resolve, reject) => {
        const waiter = { resolve, reject };
        waiters.push(waiter);
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error('MQTT packet timeout'));
        }, timeoutMs);
        waiter.resolve = (packet) => { clearTimeout(timer); resolve(packet); };
        waiter.reject = (error) => { clearTimeout(timer); reject(error); };
      });
    },
  };
};

const openWebSocket = (url, handlers) => new Promise((resolve, reject) => {
  let socket;
  try {
    socket = new WebSocket(url, 'mqtt');
  } catch (error) {
    reject(new Error(`MQTT WebSocket open failed: ${error && error.message || error}`));
    return;
  }
  socket.binaryType = 'arraybuffer';
  const timer = setTimeout(() => {
    try { socket.close(); } catch (_) {}
    reject(new Error('MQTT handshake timeout'));
  }, 20000);
  socket.onopen = () => {
    clearTimeout(timer);
    socket.onmessage = (event) => handlers.message(event.data);
    socket.onerror = () => handlers.error(new Error('MQTT WebSocket error'));
    socket.onclose = () => handlers.close();
    resolve({
      send: (data) => socket.send(data),
      close: () => { try { socket.close(); } catch (_) {} },
    });
  };
  socket.onerror = () => {
    clearTimeout(timer);
    reject(new Error('MQTT handshake failed'));
  };
});

const redirectPath = (path, reference) => {
  const parts = path.replace(/\/$/, '').split('/');
  if (parts[parts.length - 1] && parts[parts.length - 1].includes(':')) parts[parts.length - 1] = reference;
  else parts.push(reference);
  return parts.join('/');
};

/** CONNACK 要求跳转时按 serverReference 重连（最多 3 次），与参考实现一致。 */
async function connectMqtt(qrcodeId) {
  let path = MQTT_INITIAL_PATH;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const { handlers, next } = createPacketQueue();
    const socket = await openWebSocket(`wss://${MQTT_HOST}${path}`, handlers);
    const clientId = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
    socket.send(buildConnectPacket(clientId, qrcodeId));
    const connack = parseConnack(await next(20000));
    const reasonCode = Number(connack.reasonCode);
    if (reasonCode === 0) return { socket, next };
    socket.close();
    const reference = String(connack.serverReference || '');
    if (![0x9c, 0x9d].includes(reasonCode) || !reference || redirects === 3) {
      throw new Error(`MQTT CONNACK rejected: 0x${reasonCode.toString(16)}`);
    }
    path = redirectPath(path, reference);
  }
  throw new Error('MQTT redirect limit exceeded');
}

/**
 * 订阅并消费扫码事件。
 *
 * `ready` 在 **SUBACK** 时才 settle（不是连上就 settle）：CONNECT 要的是干净会话、订阅是单播，
 * 上游不会保留或重放订阅之前发布的东西 —— 二维码显示早了，`scanned`/`cookies` 会直接丢。
 */
export const createQrMqttListener = (qrcodeId, onEvent, timeoutMs) => {
  let activeSocket = null;
  let readySettled = false;
  let resolveReady = () => undefined;
  let rejectReady = () => undefined;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const done = (async () => {
    let socket = null;
    let ping = null;
    let closed = false;
    try {
      const connection = await connectMqtt(qrcodeId);
      socket = connection.socket;
      activeSocket = socket;
      ping = setInterval(() => {
        if (closed || !socket) return;
        try { socket.send(new Uint8Array([0xc0, 0x00])); } catch (_) { closed = true; }
      }, 30000);

      socket.send(buildSubscribePacket(qrcodeId));
      for (;;) {
        const packet = await connection.next(20000);
        if (packet[0] >> 4 === 9) {
          const reasonCode = packet[packet.length - 1] ?? 0x80;
          if (reasonCode >= 0x80) throw new Error(`MQTT SUBACK rejected: 0x${reasonCode.toString(16)}`);
          break;
        }
        if (packet[0] >> 4 === 3) onEvent(parsePublish(packet));
      }
      onEvent({ type: 'waiting', payload: null });
      readySettled = true;
      resolveReady();

      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const packet = await connection.next(Math.max(1, deadline - Date.now()));
        if (packet[0] >> 4 !== 3) continue;
        const event = parsePublish(packet);
        onEvent(event);
        if (['cookies', 'canceled', 'timeout', 'loginFailed'].includes(event.type || '')) return;
      }
      onEvent({ type: 'timeout', payload: null });
    } catch (error) {
      if (!readySettled) rejectReady(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      closed = true;
      if (ping) clearInterval(ping);
      if (socket) socket.close();
    }
  })();
  void done.catch(() => undefined);

  return { ready, done, close: () => { if (activeSocket) activeSocket.close(); } };
};
