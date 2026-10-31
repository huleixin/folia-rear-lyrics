#!/usr/bin/env node
/**
 * 校验一个 APK 是否由「听屿官方发布密钥」签名。
 *
 * 为什么需要它：仓库不含发布密钥（`android/keystore.properties` 被忽略，也没有 .jks），
 * 所以「用原版签名重新构建」这件事只能由持有 `folia-release.jks` 的人完成。这个脚本把
 * 「原版签名」从一句口头承诺变成可核对的指纹：只要证书 SHA-256 不等于下面这个值，就不是
 * 官方包，无论谁签的、版本号写的是多少。
 *
 * 用法：
 *   node dev/build/verifyApkSignature.mjs <apk> [期望的 SHA-256]
 *   不带期望值时比对内置的官方指纹。
 *
 * 退出码：0 = 匹配；1 = 不匹配 / 未签名；2 = 用法错误。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/** 官方 1.3.59 发布包的签名证书（CN=Tingyu, OU=Android, O=huleixin, C=CN）。 */
export const OFFICIAL_CERT_SHA256 =
  'a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d';
export const OFFICIAL_CERT_DN = 'CN=Tingyu, OU=Android, O=huleixin, C=CN';

function apksignerPath() {
  const roots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT]
    .filter(Boolean)
    .map((root) => path.join(root, 'build-tools'))
    .filter((dir) => existsSync(dir));
  for (const root of roots) {
    const versions = readdirSync(root).sort((a, b) =>
      b.localeCompare(a, undefined, { numeric: true }));
    for (const version of versions) {
      for (const name of ['apksigner.bat', 'apksigner']) {
        const candidate = path.join(root, version, name);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}

function firstLines(text, count) {
  return text
    .trim()
    .split(String.fromCharCode(10))
    .slice(0, count)
    .join(' ');
}

function readCerts(apk) {
  const signer = apksignerPath();
  if (!signer) throw new Error('找不到 apksigner，请设置 ANDROID_HOME 或 ANDROID_SDK_ROOT');
  let output;
  try {
    output = execFileSync(signer, ['verify', '--print-certs', apk], {
      encoding: 'utf8',
      // Windows 上 apksigner.bat 必须经 shell 启动（Node 不再隐式执行 .bat）。
      shell: process.platform === 'win32',
    });
  } catch (error) {
    // apksigner 对未签名包会以非 0 退出，并把原因写在 stdout / stderr。
    const text = `${error.stdout || ''}${error.stderr || ''}`;
    return { signed: false, reason: firstLines(text, 3) || String(error.message) };
  }
  const digest = /certificate SHA-256 digest:[ ]*([0-9a-f]{64})/i.exec(output);
  const dn = /certificate DN:[ ]*(.+)/.exec(output);
  return {
    signed: Boolean(digest),
    sha256: digest ? digest[1].toLowerCase() : '',
    dn: dn ? dn[1].trim() : '',
  };
}

const apk = process.argv[2];
const expected = (process.argv[3] || OFFICIAL_CERT_SHA256).toLowerCase();
if (!apk) {
  console.error('用法: node dev/build/verifyApkSignature.mjs <apk> [期望的 SHA-256]');
  process.exit(2);
}
if (!existsSync(apk)) {
  console.error(`找不到文件: ${apk}`);
  process.exit(2);
}

const cert = readCerts(apk);
if (!cert.signed) {
  console.error(`✗ ${path.basename(apk)} 没有可用签名：${cert.reason}`);
  console.error('  未签名的 APK 无法安装，也不是官方包。');
  process.exit(1);
}
if (cert.sha256 !== expected) {
  console.error(`✗ ${path.basename(apk)} 签名证书不匹配`);
  console.error(`  实际: ${cert.sha256}  (${cert.dn})`);
  console.error(`  期望: ${expected}  (${OFFICIAL_CERT_DN})`);
  console.error('  与官方版签名不同，无法覆盖安装官方版本。');
  process.exit(1);
}
console.log(`✓ ${path.basename(apk)} 由官方发布密钥签名`);
console.log(`  证书: ${cert.dn}`);
console.log(`  SHA-256: ${cert.sha256}`);
