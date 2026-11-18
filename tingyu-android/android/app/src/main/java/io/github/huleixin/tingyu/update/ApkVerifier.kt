package io.github.huleixin.tingyu.update

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import java.util.zip.ZipFile

// android/app/src/main/java/io/github/huleixin/tingyu/update/ApkVerifier.kt
// 安装前强制七重安全校验：实际文件大小、SHA-256、APK 包名、versionCode、Android SDK 兼容、CPU ABI 兼容、APK 签名证书指纹。

object ApkVerifier {

    fun verifyDownloadedApk(
        context: Context,
        apkFile: File,
        manifest: UpdateManifest,
        currentVersionCode: Long,
        expectedPackageName: String = context.packageName,
        deviceSdkInt: Int = Build.VERSION.SDK_INT,
        deviceSupportedAbis: List<String> = Build.SUPPORTED_ABIS.toList(),
        expectedCertSha256: String? = null,
    ): ApkVerifyResult {
        if (!apkFile.exists() || !apkFile.isFile) {
            return ApkVerifyResult.Invalid("apk_missing", "安装包文件不存在，请重新下载。")
        }

        // 1. 校验文件实际字节大小
        val actualSize = apkFile.length()
        if (manifest.apkSizeBytes <= 0L || actualSize != manifest.apkSizeBytes) {
            return ApkVerifyResult.Invalid(
                "size_mismatch",
                "安装包大小校验未通过（期望 ${manifest.apkSizeBytes} 字节，实际 $actualSize 字节）。",
            )
        }

        // 2. 校验完整文件 SHA-256
        val actualSha256 = computeFileSha256(apkFile)
        if (!actualSha256.equals(manifest.sha256, ignoreCase = true)) {
            return ApkVerifyResult.Invalid(
                "sha256_mismatch",
                "安装包完整性摘要（SHA-256）校验失败，已拦截安装。",
            )
        }

        // 3. 解析 APK 包信息（包名、versionCode、minSdk、签名证书）
        val pm = context.packageManager
        val archiveInfo = readArchivePackageInfo(pm, apkFile.absolutePath)
            ?: return ApkVerifyResult.Invalid("invalid_apk_archive", "无法解析 APK 安装包结构，文件可能已损坏。")

        if (archiveInfo.packageName != expectedPackageName) {
            return ApkVerifyResult.Invalid(
                "package_name_mismatch",
                "安装包应用包名不匹配（${archiveInfo.packageName}），已拦截安装。",
            )
        }

        // 4. 校验真实 versionCode 整数（匹配清单且必须高于当前版本，拒绝降级包）
        val archiveVersionCode = getPackageVersionCode(archiveInfo)
        if (archiveVersionCode != manifest.latestVersionCode) {
            return ApkVerifyResult.Invalid(
                "version_code_mismatch",
                "安装包内部版本号（$archiveVersionCode）与发布配置（${manifest.latestVersionCode}）不一致。",
            )
        }
        if (archiveVersionCode <= currentVersionCode) {
            return ApkVerifyResult.Invalid(
                "version_not_newer",
                "安装包版本号（$archiveVersionCode）不高于当前已安装版本（$currentVersionCode）。",
            )
        }

        // 5. 校验 Android 系统最低版本兼容性
        val archiveMinSdk = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            archiveInfo.applicationInfo?.minSdkVersion ?: manifest.minSdk
        } else {
            manifest.minSdk
        }
        val requiredMinSdk = maxOf(archiveMinSdk, manifest.minSdk)
        if (deviceSdkInt < requiredMinSdk) {
            return ApkVerifyResult.Invalid(
                "sdk_incompatible",
                "当前 Android 系统版本（API $deviceSdkInt）低于新版本要求的最低版本（API $requiredMinSdk）。",
            )
        }

        // 6. 校验 CPU ABI 架构兼容性（检查清单与 APK 内 lib/<abi>/*.so 原生库）
        val manifestAbiCompatible = manifest.supportedAbis.contains("universal") ||
            manifest.supportedAbis.any { it in deviceSupportedAbis }
        if (!manifestAbiCompatible) {
            return ApkVerifyResult.Invalid(
                "abi_incompatible",
                "当前设备处理器架构（${deviceSupportedAbis.firstOrNull() ?: "unknown"}）不受该安装包支持。",
            )
        }
        val apkNativeAbis = inspectApkNativeAbis(apkFile)
        if (apkNativeAbis.isNotEmpty() && apkNativeAbis.none { it in deviceSupportedAbis }) {
            return ApkVerifyResult.Invalid(
                "apk_native_abi_incompatible",
                "安装包内原生库架构（${apkNativeAbis.joinToString()}）与当前设备不兼容。",
            )
        }

        // 7. 校验 APK 签名证书（必须同时匹配配置声明指纹与当前已安装客户端自身正式签名）
        val archiveCertDigests = extractSigningCertDigests(archiveInfo)
        if (archiveCertDigests.isEmpty()) {
            return ApkVerifyResult.Invalid("apk_unsigned", "安装包缺少有效的 Android 签名证书，已拦截安装。")
        }
        val installedCertDigests = expectedCertSha256?.let { setOf(it.lowercase()) }
            ?: readInstalledAppCertDigests(context)
        val requiredCert = manifest.apkCertSha256.lowercase()
        if (requiredCert !in archiveCertDigests) {
            return ApkVerifyResult.Invalid(
                "cert_manifest_mismatch",
                "安装包签名证书与正式发布记录不一致，已拒绝安装。",
            )
        }
        if (installedCertDigests.isNotEmpty() && archiveCertDigests.intersect(installedCertDigests).isEmpty()) {
            return ApkVerifyResult.Invalid(
                "cert_installed_mismatch",
                "安装包签名与当前已安装听屿签名不兼容，无法安全覆盖安装。",
            )
        }

        return ApkVerifyResult.Valid(
            apkFile = apkFile,
            packageName = archiveInfo.packageName,
            versionCode = archiveVersionCode,
            sha256 = actualSha256,
        )
    }

    fun computeFileSha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val buf = ByteArray(64 * 1024)
        FileInputStream(file).use { input ->
            while (true) {
                val read = input.read(buf)
                if (read <= 0) break
                digest.update(buf, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    fun getPackageVersionCode(info: PackageInfo): Long =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode
        else @Suppress("DEPRECATION") info.versionCode.toLong()

    @Suppress("DEPRECATION")
    private fun readArchivePackageInfo(pm: PackageManager, path: String): PackageInfo? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.getPackageArchiveInfo(
                    path,
                    PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES.toLong()),
                )
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                pm.getPackageArchiveInfo(path, PackageManager.GET_SIGNING_CERTIFICATES)
            } else {
                pm.getPackageArchiveInfo(path, PackageManager.GET_SIGNATURES)
            }
        } catch (_: Exception) {
            null
        }
    }

    @Suppress("DEPRECATION")
    fun readInstalledAppCertDigests(context: Context): Set<String> {
        return try {
            val pm = context.packageManager
            val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.getPackageInfo(
                    context.packageName,
                    PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES.toLong()),
                )
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
            } else {
                pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES)
            }
            extractSigningCertDigests(info)
        } catch (_: Exception) {
            setOf(UpdateTrustAnchors.EXPECTED_RELEASE_CERT_SHA256)
        }
    }

    @Suppress("DEPRECATION")
    fun extractSigningCertDigests(info: PackageInfo): Set<String> {
        val out = mutableSetOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val signingInfo = info.signingInfo
            val signers = if (signingInfo != null) {
                if (signingInfo.hasMultipleSigners()) signingInfo.apkContentsSigners
                else signingInfo.signingCertificateHistory
            } else null
            signers?.forEach { sig ->
                out.add(sha256Hex(sig.toByteArray()))
            }
        }
        info.signatures?.forEach { sig ->
            out.add(sha256Hex(sig.toByteArray()))
        }
        return out
    }

    private fun inspectApkNativeAbis(apkFile: File): Set<String> {
        val abis = mutableSetOf<String>()
        try {
            ZipFile(apkFile).use { zip ->
                val entries = zip.entries()
                while (entries.hasMoreElements()) {
                    val name = entries.nextElement().name
                    if (name.startsWith("lib/") && name.endsWith(".so")) {
                        val parts = name.split('/')
                        if (parts.size >= 3 && parts[1].isNotBlank()) {
                            abis.add(parts[1])
                        }
                    }
                }
            }
        } catch (_: Exception) {
            // PackageManager archive check already guards malformed zip structure.
        }
        return abis
    }

    private fun sha256Hex(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}
