import { describe, expect, it } from 'vitest';
import {
    buildConnectPacket,
    buildSubscribePacket,
    decodeVariableInteger,
    encodeProperties,
    encodeUtf8,
    encodeVariableInteger,
    parseConnack,
    parsePublish,
    splitPackets,
    wrapPacket,
} from '@/nativeBridge/api/qq-mqtt.js';

// test/unit/nativeBridge/qqMqtt.test.ts
//
// 「手机 QQ」原生扫码通道靠 MQTT 推送拿凭据（网页通道的凭据写入会被服务端拒）。
// 这里是纯字节协议的锁定：CONNECT / SUBSCRIBE 的线上形状，以及 PUBLISH 里 cookies 事件的解析。

const asString = (bytes: Uint8Array) => new TextDecoder('utf-8').decode(bytes);

describe('MQTT variable integer', () => {
    it('round-trips the multi-byte forms', () => {
        for (const value of [0, 1, 127, 128, 16383, 16384, 2097151, 268435455]) {
            const encoded = encodeVariableInteger(value);
            expect(decodeVariableInteger(encoded, 0)).toEqual({ value, bytes: encoded.length });
        }
    });

    it('returns null when the buffer is truncated', () => {
        expect(decodeVariableInteger(new Uint8Array([0x80]), 0)).toBeNull();
    });
});

describe('MQTT packets', () => {
    it('builds a CONNECT for the qrcode subscription', () => {
        const packet = buildConnectPacket('17000000001234', 'QRCODEID');
        expect(packet[0]).toBe(0x10);
        const text = asString(packet);
        expect(text).toContain('MQTT');
        expect(text).toContain('qqmusic');       // tmeAppID
        expect(text).toContain('management');    // business
        expect(text).toContain('QRCODEID');      // hashTag / userID
        expect(text).toContain('17000000001234');
        // 协议级别 5 + clean start 0x02，keepalive 45
        expect(Array.from(packet).join(',')).toContain('77,81,84,84,5,2,0,45');
    });

    it('builds a SUBSCRIBE to the qrcode login topic', () => {
        const packet = buildSubscribePacket('QRCODEID');
        expect(packet[0]).toBe(0x82);
        const text = asString(packet);
        expect(text).toContain('management.qrcode_login/QRCODEID');
        expect(text).toContain('tmelogin');   // authorization
        expect(text).toContain('unicast');    // pubsub
    });

    it('parses a CONNACK with a redirect reference', () => {
        // MQTT 5 CONNACK 的可变头是「确认标志 → 原因码 → 属性」，服务器要求跳转时
        // 属性里带 serverReference（0x1c），参考实现据此重连。
        const propBody = new Uint8Array([0x1c, ...Array.from(encodeUtf8('node-2'))]);
        const properties = new Uint8Array([
            ...Array.from(encodeVariableInteger(propBody.length)),
            ...Array.from(propBody),
        ]);
        const packet = wrapPacket(0x20, new Uint8Array([0x00, 0x9c, ...Array.from(properties)]));

        const parsed = parseConnack(packet) as { reasonCode: number; serverReference?: string };
        expect(parsed.reasonCode).toBe(0x9c);
        expect(parsed.serverReference).toBe('node-2');
    });

    // 扫码成功后服务端推的就是这包：userProperties.type + JSON 正文（cookies）。
    it('parses a cookies PUBLISH', () => {
        const payload = JSON.stringify({
            cookies: {
                qqmusic_uin: { value: '3379082' },
                qqmusic_key: { value: 'MUSICKEY' },
            },
        });
        const properties = encodeProperties(null, [['type', 'cookies']]);
        const body = new Uint8Array([
            ...Array.from(encodeUtf8('management.qrcode_login/QRCODEID')),
            ...Array.from(properties),
            ...Array.from(new TextEncoder().encode(payload)),
        ]);
        const packet = wrapPacket(0x30, body);

        const event = parsePublish(packet);
        expect(event.type).toBe('cookies');
        expect(event.payload.cookies.qqmusic_uin.value).toBe('3379082');
        expect(event.payload.cookies.qqmusic_key.value).toBe('MUSICKEY');
    });

    it('reassembles packets split across frames and keeps the remainder', () => {
        const first = buildSubscribePacket('A');
        const second = buildConnectPacket('client', 'A');
        const joined = new Uint8Array([...Array.from(first), ...Array.from(second)]);

        const split = splitPackets(joined);
        expect(split.packets).toHaveLength(2);
        expect(split.rest).toHaveLength(0);

        // 只给一半：解不出完整包，剩下的是待拼的尾巴。
        const half = joined.subarray(0, first.length + 3);
        const partial = splitPackets(half);
        expect(partial.packets).toHaveLength(1);
        expect(Array.from(partial.rest)).toEqual(Array.from(joined.subarray(first.length, first.length + 3)));
    });
});
