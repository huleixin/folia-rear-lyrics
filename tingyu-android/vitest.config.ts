import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';
import { commandPinyinPlugin } from './dev/pinyin/commandPinyinPlugin.mjs';
import { icuFoliaDataPlugin } from './dev/icuFolia/icuFoliaDataPlugin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // 命令面板的检索索引在单测里也要读到构建期生成的拼音字典。
  // icu-folia 的 jieba 词典和 HMM 表同样以虚拟模块提供，单测走的是和正式构建同一条加载路径。
  plugins: [commandPinyinPlugin(), icuFoliaDataPlugin()],
  // 单测默认按官方构建跑（vite.config 构建期注入的值）；非官方分支由各自的用例显式传入构建环境。
  define: {
    __BUILD_KIND__: JSON.stringify('official'),
    __BUILD_HOST__: JSON.stringify(''),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  test: {
    environment: 'node',
    // 第二消费者始终参与单测；test.env 与 vi.stubEnv 使用同一入口，可覆写验证关闭/生产边界。
    // 初始选择钉在 grid：现有用例都假设没选过 suite 的人看到网格（开发阶段的初始选择是 bravais）。
    env: { VITE_LIBRARY_TUI: 'true', VITE_LIBRARY_INITIAL_SUITE: 'grid' },
    // 默认 5 秒预算对这套用例偏紧：qqTransport / qqQrDiagnostics.integration / netease 这几组会把
    // transport、provider 与 core 真串起来跑。单独跑不到 1 秒，但整套并发（transform + import 上百秒）
    // 时会漂到 4~10 秒，表现为「随机几个用例超时失败、单独重跑全过」。超时应该意味着真的卡住，
    // 而不是「机器正好忙」。
    testTimeout: 20_000,
    hookTimeout: 20_000,
    include: ['test/unit/**/*.test.ts']
  }
});
