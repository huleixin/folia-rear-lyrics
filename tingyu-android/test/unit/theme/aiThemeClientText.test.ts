import { describe, expect, it } from 'vitest';
import { extractOpenAiText, requestThemeJsonWithTruncationRetry } from '@/services/aiThemeClient';

// test/unit/theme/aiThemeClientText.test.ts
// 现场报告里 AI 主题 6 次全部失败在「Model returned an empty response」，而响应是 HTTP 200。
// 这里固定住「有响应但 content 为空」的三种形态：推理字段、内容分片、老式 completions 形状。

const THEME_JSON = '{"light":{"name":"a"},"dark":{"name":"b"}}';

describe('extractOpenAiText', () => {
    it('reads a plain string content', () => {
        expect(extractOpenAiText({ content: THEME_JSON }, {})).toBe(THEME_JSON);
    });

    it('joins text parts of a content array', () => {
        expect(extractOpenAiText({
            content: [{ type: 'text', text: '{"light":' }, { type: 'text', text: '{"name":"a"}}' }],
        }, {})).toBe('{"light":{"name":"a"}}');
    });

    // 推理型模型/网关会把答案放在 reasoning 字段里，content 整个为空 —— 这正是「空响应」的常见来源。
    it('falls back to the reasoning fields when content is empty', () => {
        expect(extractOpenAiText({ content: '', reasoning_content: THEME_JSON }, {})).toBe(THEME_JSON);
        expect(extractOpenAiText({ content: '   ', reasoning: THEME_JSON }, {})).toBe(THEME_JSON);
        expect(extractOpenAiText({ reasoning_content: '先想想……' }, {})).toBe('先想想……');
    });

    it('accepts the legacy completions shape', () => {
        expect(extractOpenAiText(undefined, { text: THEME_JSON })).toBe(THEME_JSON);
    });

    it('returns an empty string when nothing usable is present', () => {
        expect(extractOpenAiText({}, { finish_reason: 'length' })).toBe('');
        expect(extractOpenAiText(null, null)).toBe('');
    });
});

// 现场报告里 stage=parse 的失败都是「JSON 不完整」，与 finish=length 的表现一致：推理型模型
// 把预算花在推理上、输出被截断。截断是偶发的，再要一次通常就完整。
describe('requestThemeJsonWithTruncationRetry', () => {
    const response = (finishReason: string, textLength: number) => ({
        text: 'x'.repeat(textLength),
        finishReason,
        status: 200,
        textLength,
    });

    it('does not ask twice when the first response is complete', async () => {
        let calls = 0;
        const result = await requestThemeJsonWithTruncationRetry(async () => {
            calls += 1;
            return response('stop', 100);
        });
        expect(calls).toBe(1);
        expect(result.finishReason).toBe('stop');
    });

    it('asks again after a truncated response and keeps the complete one', async () => {
        let calls = 0;
        const result = await requestThemeJsonWithTruncationRetry(async () => {
            calls += 1;
            return calls === 1 ? response('length', 40) : response('stop', 900);
        });
        expect(calls).toBe(2);
        expect(result.finishReason).toBe('stop');
    });

    it('keeps the longer of two truncated responses', async () => {
        let calls = 0;
        const result = await requestThemeJsonWithTruncationRetry(async () => {
            calls += 1;
            return calls === 1 ? response('length', 900) : response('length', 40);
        });
        expect(result.textLength).toBe(900);
    });

    it('falls back to the first response when the retry throws', async () => {
        let calls = 0;
        const result = await requestThemeJsonWithTruncationRetry(async () => {
            calls += 1;
            if (calls > 1) throw new Error('boom');
            return response('length', 120);
        });
        expect(result.textLength).toBe(120);
        expect(result.finishReason).toBe('length');
    });
});
