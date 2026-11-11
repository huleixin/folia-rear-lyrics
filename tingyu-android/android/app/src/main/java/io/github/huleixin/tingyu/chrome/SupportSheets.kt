package io.github.huleixin.tingyu.chrome

import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/SupportSheets.kt
// 「支持与交流」的两个原生底部弹窗。视觉令牌与 NativeSettingsPage.kt 一一对应，
// 让弹窗读起来就是设置页的一部分；内容完全静态，不接入任何支付系统。

// 视觉统一（原生化专项·第 21 轮）：这里不再自带一套调色板与 ModalBottomSheet，
// 改用 TyPanelTheme + TySheetFrame —— 与队列、工具页、二级操作面板同一份表面色、
// 同一份圆角、同一份进出场。用户从设置点进"请作者喝杯咖啡"和点开任意 ⋯ 面板，
// 看到的是同一个弹窗，不再有第三套弹窗方言。
private val sheetTheme @Composable get() = TyPanelTheme.from(LocalInterfacePalette.current)

internal data class SupportCopy(
    val coffeeTitle: String, val coffeeDescription: String, val channelWechat: String, val channelAlipay: String,
    val qrMissing: String, val saveQr: String, val qrSaved: String, val qrSavedAppDir: String, val qrSaveFailed: String,
    val voluntary: String, val communityTitle: String, val communityDescription: String, val groupLabel: String,
    val groupMissing: String, val joinGroup: String, val copyGroup: String, val groupCopied: String, val joinFallback: String)

internal fun parseSupportCopy(json: String?): SupportCopy {
    // Matches zh-CN.ts; only used if the settings packet did not carry its copy.
    val fallback = SupportCopy("请作者喝杯咖啡", "听屿由个人独立开发与维护。如果你喜欢这个小小的音乐角落，欢迎请作者喝杯咖啡 ☕",
        "微信赞赏", "支付宝", "赞赏码即将上线，敬请期待", "保存赞赏码", "已保存到相册「Pictures/听屿」", "未授予存储权限，已保存到应用目录",
        "保存失败，请重试", "赞赏完全自愿，不影响听屿任何功能。", "加入听屿交流群", "欢迎来聊聊音乐、反馈问题、分享建议，也可以第一时间了解听屿的新功能。",
        "听屿 QQ 交流群", "交流群正在筹备中，敬请期待", "一键加入 QQ 群", "复制群号", "群号已复制，可在 QQ 中搜索加入",
        "无法打开 QQ，已复制群号，请在 QQ 中搜索加入")
    if (json.isNullOrBlank()) return fallback
    return try {
        val o = JSONObject(json)
        SupportCopy(o.optString("coffeeTitle", fallback.coffeeTitle), o.optString("coffeeDescription", fallback.coffeeDescription),
            o.optString("channelWechat", fallback.channelWechat), o.optString("channelAlipay", fallback.channelAlipay),
            o.optString("qrMissing", fallback.qrMissing), o.optString("saveQr", fallback.saveQr),
            o.optString("qrSaved", fallback.qrSaved), o.optString("qrSavedAppDir", fallback.qrSavedAppDir),
            o.optString("qrSaveFailed", fallback.qrSaveFailed), o.optString("voluntary", fallback.voluntary),
            o.optString("communityTitle", fallback.communityTitle), o.optString("communityDescription", fallback.communityDescription),
            o.optString("groupLabel", fallback.groupLabel), o.optString("groupMissing", fallback.groupMissing),
            o.optString("joinGroup", fallback.joinGroup), o.optString("copyGroup", fallback.copyGroup),
            o.optString("groupCopied", fallback.groupCopied), o.optString("joinFallback", fallback.joinFallback))
    } catch (_: Exception) { fallback }
}

@Composable internal fun SupportSheets(kind: String, copyJson: String?, onDismiss: () -> Unit) {
    val copy = remember(kind, copyJson) { parseSupportCopy(copyJson) }
    when (kind) {
        "coffee" -> SupportCoffeeSheet(copy, onDismiss)
        "group" -> SupportGroupSheet(copy, onDismiss)
    }
}

@Composable internal fun SupportSheetLayer(kind: String?, copyJson: String?, light: Boolean, onDismiss: () -> Unit) {
    var lastKind by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(kind) { if (kind != null) lastKind = kind }
    TyPanelOverlay(visible = kind != null, light = light, onClose = onDismiss) {
        lastKind?.let { SupportSheets(it, copyJson, onDismiss) }
    }
}

@Composable private fun SupportCoffeeSheet(copy: SupportCopy, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var channel by remember { mutableStateOf(0) } // 0 = 微信赞赏, 1 = 支付宝
    var saving by remember { mutableStateOf(false) }
    val qrRes = if (channel == 0) SupportConfig.wechatRewardQr else SupportConfig.alipayQr
    val channelTag = if (channel == 0) "wechat" else "alipay"
    fun announce(ok: Boolean) {
        saving = false
        toast(context, if (ok) copy.qrSaved else copy.qrSaveFailed)
    }
    // Android 9 及以下才需要存储权限；其余版本一律 MediaStore，零权限。
    val legacySave = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        scope.launch(Dispatchers.IO) {
            val ok = if (granted) writeQrToMediaStore(context, qrRes, SupportLinks.qrFileName(channelTag))
            else writeQrToAppDir(context, qrRes, SupportLinks.qrFileName(channelTag))
            withContext(Dispatchers.Main) {
                if (granted) announce(ok) else toast(context, if (ok) copy.qrSavedAppDir else copy.qrSaveFailed)
            }
        }
    }
    fun save() {
        if (qrRes == 0 || saving) return
        saving = true
        if (Build.VERSION.SDK_INT >= 29 || ContextCompat.checkSelfPermission(context, android.Manifest.permission.WRITE_EXTERNAL_STORAGE) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED) {
            scope.launch(Dispatchers.IO) {
                val ok = writeQrToMediaStore(context, qrRes, SupportLinks.qrFileName(channelTag))
                withContext(Dispatchers.Main) { announce(ok) }
            }
        } else legacySave.launch(android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
    }
    val theme = sheetTheme
    TySheetFrame(theme, copy.coffeeTitle, "", 0.92f, onDismiss) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.size(44.dp).clip(RoundedCornerShape(999.dp)).background(theme.card), contentAlignment = Alignment.Center) {
                PageIcon("coffee", theme.text, Modifier.size(22.dp))
            }
            Spacer(Modifier.height(10.dp))
            Text(copy.coffeeDescription, color = theme.muted, fontSize = 12.sp, lineHeight = 19.sp, textAlign = TextAlign.Center)
            Spacer(Modifier.height(16.dp))
            LiquidChoiceRow(listOf(copy.channelWechat, copy.channelAlipay), channel, theme) { channel = it }
            Spacer(Modifier.height(14.dp))
            if (qrRes != 0) Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White).padding(14.dp), contentAlignment = Alignment.Center) {
                Image(painterResource(qrRes), null, Modifier.fillMaxWidth().widthIn(max = 300.dp).heightIn(max = 300.dp), contentScale = ContentScale.Fit)
            } else Box(Modifier.fillMaxWidth().height(200.dp).clip(RoundedCornerShape(16.dp)).background(theme.card)
                .border(1.dp, theme.line, RoundedCornerShape(16.dp)), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    PageIcon("coffee", theme.muted, Modifier.size(26.dp))
                    Text(copy.qrMissing, color = theme.muted, fontSize = 12.sp)
                }
            }
            Spacer(Modifier.height(16.dp))
            val enabled = qrRes != 0 && !saving
            Box(Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(12.dp))
                .background(if (enabled) theme.accent.copy(alpha = 0.16f) else theme.card)
                .border(1.dp, theme.accent.copy(alpha = 0.45f), RoundedCornerShape(12.dp))
                .clickable(enabled = enabled) { save() }, contentAlignment = Alignment.Center) {
                Text(copy.saveQr, color = if (enabled) theme.accent else theme.muted, fontSize = 14.sp, fontWeight = FontWeight.Medium)
            }
            Spacer(Modifier.height(10.dp))
            Text(copy.voluntary, color = theme.muted, fontSize = 11.sp, lineHeight = 17.sp, textAlign = TextAlign.Center)
        }
    }
}

@Composable private fun SupportGroupSheet(copy: SupportCopy, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val groupId = SupportLinks.normalizeGroupId(SupportConfig.qqGroupId)
    val configured = groupId.isNotEmpty()
    fun copyGroupNumber() {
        val manager = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        manager?.setPrimaryClip(ClipData.newPlainText(copy.groupLabel, groupId))
        toast(context, copy.groupCopied)
    }
    val theme = sheetTheme
    TySheetFrame(theme, copy.communityTitle, "", 0.7f, onDismiss) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.size(44.dp).clip(RoundedCornerShape(999.dp)).background(theme.card), contentAlignment = Alignment.Center) {
                PageIcon("messages-square", theme.text, Modifier.size(22.dp))
            }
            Spacer(Modifier.height(10.dp))
            Text(copy.communityDescription, color = theme.muted, fontSize = 12.sp, lineHeight = 19.sp, textAlign = TextAlign.Center)
            Spacer(Modifier.height(16.dp))
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(theme.card)
                .border(1.dp, theme.line, RoundedCornerShape(14.dp)).padding(14.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(34.dp).clip(RoundedCornerShape(999.dp)).background(theme.card), contentAlignment = Alignment.Center) {
                    PageIcon("messages-square", theme.text, Modifier.size(21.dp))
                }
                Column(Modifier.weight(1f)) {
                    Text(copy.groupLabel, color = theme.text, fontSize = 14.sp, lineHeight = 19.sp, fontWeight = FontWeight.Medium)
                    Text(if (configured) groupId else copy.groupMissing, color = if (configured) theme.accent else theme.muted,
                        fontSize = 13.sp, lineHeight = 18.sp, fontWeight = if (configured) FontWeight.SemiBold else FontWeight.Normal, modifier = Modifier.padding(top = 2.dp))
                }
            }
            Spacer(Modifier.height(16.dp))
            Box(Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(12.dp))
                .background(if (configured) theme.accent.copy(alpha = 0.16f) else theme.card)
                .border(1.dp, theme.accent.copy(alpha = 0.45f), RoundedCornerShape(12.dp))
                .clickable(enabled = configured) {
                    if (!openQqGroup(context)) { copyGroupNumber(); toast(context, copy.joinFallback) }
                }, contentAlignment = Alignment.Center) {
                Text(copy.joinGroup, color = if (configured) theme.accent else theme.muted, fontSize = 14.sp, fontWeight = FontWeight.Medium)
            }
            Spacer(Modifier.height(8.dp))
            Box(Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(12.dp))
                .background(theme.card).border(1.dp, theme.line, RoundedCornerShape(12.dp))
                .clickable(enabled = configured) { copyGroupNumber() }, contentAlignment = Alignment.Center) {
                Text(copy.copyGroup, color = if (configured) theme.text else theme.muted, fontSize = 14.sp, fontWeight = FontWeight.Medium)
            }
        }
    }
}

/** 先走邀请链接，再走群资料卡协议；都不行时返回 false，由调用方回退到复制群号。 */
private fun openQqGroup(context: Context): Boolean {
    val invite = SupportConfig.qqGroupInvite
    if (invite.isNotBlank()) try {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(invite)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return true
    } catch (_: Exception) {}
    val uri = SupportLinks.groupJoinUri(SupportConfig.qqGroupId) ?: return false
    return try {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(uri)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true
    } catch (_: Exception) { false }
}

/** 原始像素解码（不随密度缩放），保证扫得出来。 */
private fun decodeQr(context: Context, res: Int): Bitmap? = try {
    BitmapFactory.decodeResource(context.resources, res, BitmapFactory.Options().apply { inScaled = false })
} catch (_: Exception) { null }

/** Android 10+（旧版本需已授权）经 MediaStore 写入 Pictures/听屿。 */
private fun writeQrToMediaStore(context: Context, res: Int, fileName: String): Boolean {
    val bitmap = decodeQr(context, res) ?: return false
    val resolver = context.contentResolver
    val values = ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, "$fileName.png")
        put(MediaStore.Images.Media.MIME_TYPE, "image/png")
        if (Build.VERSION.SDK_INT >= 29) {
            put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/听屿")
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }
    }
    val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return false
    return try {
        val out = resolver.openOutputStream(uri) ?: return false
        out.use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        if (Build.VERSION.SDK_INT >= 29) {
            val done = ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }
            resolver.update(uri, done, null, null)
        } else {
            MediaScannerConnection.scanFile(context, arrayOf(uri.toString()), arrayOf("image/png"), null)
        }
        true
    } catch (_: Exception) {
        try { resolver.delete(uri, null, null) } catch (_: Exception) {}
        false
    }
}

/** Android 9 及以下未授权时的兜底：写入应用专属目录，不弹权限、不丢图。 */
private fun writeQrToAppDir(context: Context, res: Int, fileName: String): Boolean {
    val bitmap = decodeQr(context, res) ?: return false
    val base = context.getExternalFilesDir(Environment.DIRECTORY_PICTURES) ?: return false
    return try {
        val dir = File(base, "听屿").apply { mkdirs() }
        File(dir, "$fileName.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        true
    } catch (_: Exception) { false }
}

private fun toast(context: Context, message: String) {
    Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
}
