package io.github.huleixin.tingyu.update

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File

// android/app/src/main/java/io/github/huleixin/tingyu/update/ApkInstaller.kt
// 系统覆盖安装器：检查未知来源安装权限、生成安全 FileProvider URI 启动安装器、支持外部浏览器兜底下载。

object ApkInstaller {

    sealed class LaunchOutcome {
        object Launched : LaunchOutcome()
        object NeedsInstallPermission : LaunchOutcome()
        data class Error(val message: String) : LaunchOutcome()
    }

    fun canRequestPackageInstalls(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.packageManager.canRequestPackageInstalls()
        } else {
            true
        }
    }

    fun openInstallPermissionSettings(activity: Activity): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
        return try {
            val intent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${activity.packageName}"),
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            activity.startActivity(intent)
            true
        } catch (_: Exception) {
            false
        }
    }

    fun launchSystemInstaller(context: Context, apkFile: File): LaunchOutcome {
        if (!apkFile.exists() || !apkFile.isFile) {
            return LaunchOutcome.Error("安装包不存在，请重新下载。")
        }
        if (!canRequestPackageInstalls(context)) {
            return LaunchOutcome.NeedsInstallPermission
        }
        return try {
            val authority = "${context.packageName}.fileprovider"
            val contentUri = FileProvider.getUriForFile(context, authority, apkFile)
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(contentUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            LaunchOutcome.Launched
        } catch (e: Exception) {
            LaunchOutcome.Error("无法调起系统安装程序（${e.javaClass.simpleName}），可尝试手动下载安装。")
        }
    }

    fun openManualDownloadInBrowser(context: Context, url: String): Boolean {
        if (!url.startsWith("https://")) return false
        return try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            true
        } catch (_: Exception) {
            false
        }
    }

    fun isActiveNetworkMetered(context: Context): Boolean {
        return try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            cm?.isActiveNetworkMetered == true
        } catch (_: Exception) {
            false
        }
    }
}
