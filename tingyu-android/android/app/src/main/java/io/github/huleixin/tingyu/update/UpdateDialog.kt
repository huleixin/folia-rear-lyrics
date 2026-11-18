package io.github.huleixin.tingyu.update

import android.app.Activity
import android.graphics.drawable.BitmapDrawable
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.toBitmap
import io.github.huleixin.tingyu.R
import io.github.huleixin.tingyu.chrome.LocalInterfacePalette

// android/app/src/main/java/io/github/huleixin/tingyu/update/UpdateDialog.kt
// 听屿原生软件更新弹窗与强制更新拦截门（UpdateGate）：遵循固定设计规范与四套主题语义 Token。

internal data class UpdateDialogColors(
    val scrim: Color,
    val dialogBg: Color,
    val cardBg: Color,
    val border: Color,
    val ink: Color,
    val muted: Color,
    val primaryBtnBg: Color,
    val primaryBtnText: Color,
    val secondaryBtnBg: Color,
    val secondaryBtnText: Color,
    val badgeForceBg: Color,
    val badgeForceText: Color,
    val badgeNormalBg: Color,
    val badgeNormalText: Color,
    val errorBg: Color,
    val errorText: Color,
)

@Composable
internal fun rememberUpdateDialogColors(): UpdateDialogColors {
    val palette = LocalInterfacePalette.current
    val isGlacierLight = palette.light && palette.style != "classic"
    return remember(palette) {
        if (isGlacierLight) {
            // 严格对齐冰川浅色设计规范参考值
            UpdateDialogColors(
                scrim = Color(0x8810202C),
                dialogBg = Color(0xFFF3F7FB),
                cardBg = Color(0xFFE9F0F7),
                border = Color(0xFFD5E0EA),
                ink = Color(0xFF203747),
                muted = Color(0xFF536D80),
                primaryBtnBg = Color(0xFF385B73),
                primaryBtnText = Color(0xFFFFFFFF),
                secondaryBtnBg = Color(0xFFCEDDE9),
                secondaryBtnText = Color(0xFF385B73),
                badgeForceBg = Color(0xFFFCE8E6),
                badgeForceText = Color(0xFFB3261E),
                badgeNormalBg = Color(0xFFCEDDE9),
                badgeNormalText = Color(0xFF385B73),
                errorBg = Color(0xFFFDECEA),
                errorText = Color(0xFFB3261E),
            )
        } else if (palette.light) {
            UpdateDialogColors(
                scrim = palette.scrim,
                dialogBg = palette.sheet,
                cardBg = palette.subtle,
                border = palette.border,
                ink = palette.ink,
                muted = palette.muted,
                primaryBtnBg = palette.button,
                primaryBtnText = palette.onAccent,
                secondaryBtnBg = palette.selected,
                secondaryBtnText = palette.accent,
                badgeForceBg = Color(0xFFFCE8E6),
                badgeForceText = Color(0xFFB3261E),
                badgeNormalBg = palette.selected,
                badgeNormalText = palette.accent,
                errorBg = Color(0xFFFDECEA),
                errorText = Color(0xFFB3261E),
            )
        } else {
            // 深色主题（冰川深色 / 经典深色）：严格保证深色底搭配高对比浅色文字
            UpdateDialogColors(
                scrim = Color(0xB8050B10),
                dialogBg = palette.panelSurface,
                cardBg = palette.panelCard,
                border = palette.border,
                ink = palette.ink,
                muted = palette.muted,
                primaryBtnBg = palette.button,
                primaryBtnText = palette.onAccent,
                secondaryBtnBg = palette.selected,
                secondaryBtnText = palette.accent,
                badgeForceBg = Color(0x33FF6B6B),
                badgeForceText = Color(0xFFFFB4AB),
                badgeNormalBg = palette.selected,
                badgeNormalText = palette.accent,
                errorBg = Color(0x33FF6B6B),
                errorText = Color(0xFFFFB4AB),
            )
        }
    }
}

@Composable
fun UpdateOverlayHost(
    manager: UpdateManager,
    activity: Activity?,
    safeTopDp: Float,
    safeBottomDp: Float,
    modifier: Modifier = Modifier,
) {
    val uiState by manager.state.collectAsState()
    val manifest = uiState.decision.manifest
    val shouldShow = manifest != null && (uiState.isForceUpdateActive || uiState.dialogVisible)
    if (!shouldShow) return

    // UpdateGate：强制更新激活时拦截系统返回键/侧滑手势；普通更新允许按返回键等同“稍后更新”
    BackHandler(enabled = true) {
        if (!uiState.isForceUpdateActive) {
            manager.dismissOptionalDialog()
        }
    }

    UpdateDialogSurface(
        state = uiState,
        manifest = manifest,
        safeTopDp = safeTopDp,
        safeBottomDp = safeBottomDp,
        onPrimaryAction = {
            when (uiState.download.phase) {
                DownloadPhase.READY_TO_INSTALL -> manager.launchInstall(activity)
                DownloadPhase.AWAITING_INSTALL_PERMISSION -> {
                    if (activity != null && !ApkInstaller.canRequestPackageInstalls(activity)) {
                        ApkInstaller.openInstallPermissionSettings(activity)
                    } else {
                        manager.launchInstall(activity)
                    }
                }
                DownloadPhase.AWAITING_CELLULAR_CONFIRM -> manager.startOrResumeDownload(activity, userConfirmedCellular = true)
                DownloadPhase.DOWNLOADING, DownloadPhase.VERIFYING -> Unit
                DownloadPhase.IDLE, DownloadPhase.FAILED -> manager.startOrResumeDownload(activity)
            }
        },
        onCancelDownload = { manager.cancelDownload() },
        onDismissOptional = { manager.dismissOptionalDialog() },
        onSwitchMirrorRetry = { manager.switchToNextMirrorAndRetry(activity) },
        onSelectMirror = { manager.selectDownloadMirror(it) },
        onRecheck = { manager.checkNowManual() },
        onManualBrowserDownload = { manager.openManualDownloadFallback() },
        onExitApp = { activity?.finishAffinity() },
        modifier = modifier,
    )
}

@Composable
internal fun UpdateDialogSurface(
    state: UpdateUiState,
    manifest: UpdateManifest,
    safeTopDp: Float,
    safeBottomDp: Float,
    onPrimaryAction: () -> Unit,
    onCancelDownload: () -> Unit,
    onDismissOptional: () -> Unit,
    onSwitchMirrorRetry: () -> Unit,
    onSelectMirror: (String) -> Unit,
    onRecheck: () -> Unit,
    onManualBrowserDownload: () -> Unit,
    onExitApp: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = rememberUpdateDialogColors()
    val isForce = state.isForceUpdateActive
    val dl = state.download
    val context = LocalContext.current

    val appLogoBitmap = remember(context) {
        runCatching {
            val drawable = ContextCompat.getDrawable(context, R.mipmap.ic_launcher_round)
                ?: ContextCompat.getDrawable(context, R.mipmap.ic_launcher)
            (drawable as? BitmapDrawable)?.bitmap?.asImageBitmap()
                ?: drawable?.toBitmap(192, 192)?.asImageBitmap()
        }.getOrNull()
    }

    // 全屏模态阻断层（UpdateGate）：吞掉全部穿透手势，强制更新点击外部绝不关闭
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(colors.scrim)
            .pointerInput(isForce) {
                awaitPointerEventScope {
                    while (true) {
                        awaitPointerEvent()
                    }
                }
            }
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = {
                    if (!isForce && dl.phase != DownloadPhase.DOWNLOADING && dl.phase != DownloadPhase.VERIFYING) {
                        onDismissOptional()
                    }
                },
            )
            .padding(
                start = 24.dp,
                end = 24.dp,
                top = (safeTopDp + 16f).dp,
                bottom = (safeBottomDp + 16f).dp,
            ),
        contentAlignment = Alignment.Center,
    ) {
        val dialogShape = RoundedCornerShape(24.dp)
        Column(
            modifier = Modifier
                .widthIn(max = 420.dp)
                .fillMaxWidth()
                .heightIn(max = 768.dp)
                .shadow(20.dp, dialogShape, clip = false)
                .clip(dialogShape)
                .background(colors.dialogBg)
                .border(1.dp, colors.border, dialogShape)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = {}, // 消费卡片内部点击，防止冒泡触发背景关闭
                )
                .padding(horizontal = 22.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // 可纵向自适应压缩的顶部+公告滚动区，保证短屏/横屏/大字号下底部关键按钮与进度条始终可见
            Column(
                modifier = Modifier
                    .weight(1f, fill = false)
                    .verticalScroll(rememberScrollState()),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // 1. 听屿正式 Logo (56dp)
                if (appLogoBitmap != null) {
                    Image(
                        bitmap = appLogoBitmap,
                        contentDescription = "听屿 Logo",
                        modifier = Modifier
                            .size(56.dp)
                            .clip(RoundedCornerShape(14.dp)),
                    )
                } else {
                    Box(
                        Modifier
                            .size(56.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(colors.primaryBtnBg),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("听屿", color = colors.primaryBtnText, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    }
                }

                // 2. 标题 & 3. 当前版本及最新版本 & 4. 更新类型及固定文案
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = "听屿有新版本啦",
                        color = colors.ink,
                        fontSize = 21.sp,
                        lineHeight = 27.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                    )
                    Text(
                        text = "当前版本 v${state.currentVersionName}  →  最新版本 v${manifest.latestVersionName}",
                        color = colors.muted,
                        fontSize = 13.sp,
                        lineHeight = 18.sp,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(2.dp))
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(if (isForce) colors.badgeForceBg else colors.badgeNormalBg)
                            .padding(horizontal = 12.dp, vertical = 4.dp),
                    ) {
                        Text(
                            text = if (isForce) "强制更新" else "普通更新",
                            color = if (isForce) colors.badgeForceText else colors.badgeNormalText,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Text(
                        text = if (isForce) "为保证正常使用，请更新至最新版本。" else "新版本已准备就绪，快来体验吧。",
                        color = colors.ink,
                        fontSize = 13.sp,
                        lineHeight = 18.sp,
                        textAlign = TextAlign.Center,
                    )
                }

                // 5. 本次更新公告
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(colors.cardBg)
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = "本次更新公告",
                        color = colors.ink,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = manifest.releaseNotes.ifBlank { "优化产品体验与稳定性，修复已知问题。" },
                        color = colors.ink,
                        fontSize = 13.sp,
                        lineHeight = 20.sp,
                    )
                }

                // 6. 安装包大小与下载节点选择
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "安装包大小：${UpdateManager.formatSizeMb(manifest.apkSizeBytes)}",
                            color = colors.muted,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                        )
                        if (manifest.publishedAt.isNotBlank()) {
                            Text(
                                text = manifest.publishedAt.take(10),
                                color = colors.muted,
                                fontSize = 12.sp,
                            )
                        }
                    }

                    if (manifest.downloadUrls.size > 1) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            manifest.downloadUrls.forEach { mirror ->
                                val selected = mirror.id == state.selectedMirrorId
                                val shape = RoundedCornerShape(10.dp)
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .heightIn(min = 36.dp)
                                        .clip(shape)
                                        .background(if (selected) colors.secondaryBtnBg else colors.cardBg)
                                        .border(1.dp, if (selected) colors.primaryBtnBg else colors.border, shape)
                                        .clickable(enabled = dl.phase != DownloadPhase.DOWNLOADING) {
                                            onSelectMirror(mirror.id)
                                        }
                                        .padding(horizontal = 8.dp, vertical = 6.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text(
                                        text = mirror.label,
                                        color = if (selected) colors.secondaryBtnText else colors.muted,
                                        fontSize = 12.sp,
                                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                        }
                    }
                }

                // 7. 更新提示
                Text(
                    text = "覆盖安装过程会保留本机已有收藏、歌单、账号状态与播放记录；建议对重要本地音频文件保持常规备份。",
                    color = colors.muted,
                    fontSize = 12.sp,
                    lineHeight = 17.sp,
                    textAlign = TextAlign.Start,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            // 8. 实时下载进度条 / 校验状态 / 异常提示（固定紧贴主操作按钮上方，无需滚动即可直视）
            if (dl.phase != DownloadPhase.IDLE || !dl.errorMessage.isNullOrBlank()) {
                Spacer(Modifier.height(10.dp))
                UpdateDownloadStatusBlock(dl = dl, colors = colors)
            }

            Spacer(Modifier.height(12.dp))

            // 9. 固定可见底部关键操作区（主要按钮高度 48dp，圆角 14dp，触摸热区 >=48dp）
            val isBusyDownloading = dl.phase == DownloadPhase.DOWNLOADING || dl.phase == DownloadPhase.VERIFYING
            val primaryLabel = when (dl.phase) {
                DownloadPhase.IDLE -> "立即更新"
                DownloadPhase.AWAITING_CELLULAR_CONFIRM -> "继续下载（使用移动流量）"
                DownloadPhase.DOWNLOADING -> {
                    val pct = dl.progressFraction?.let { "${(it * 100).toInt()}%" } ?: "下载中"
                    "正在下载 $pct"
                }
                DownloadPhase.VERIFYING -> "正在校验安装包签名与完整性…"
                DownloadPhase.READY_TO_INSTALL -> "立即安装"
                DownloadPhase.AWAITING_INSTALL_PERMISSION -> "前往授权安装权限"
                DownloadPhase.FAILED -> "重试下载"
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(colors.primaryBtnBg.copy(alpha = if (isBusyDownloading) 0.82f else 1f))
                        .clickable(enabled = !isBusyDownloading, role = Role.Button, onClick = onPrimaryAction)
                        .padding(horizontal = 16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        if (isBusyDownloading || state.checkPhase == CheckPhase.CHECKING) {
                            val btnFrac = if (dl.phase == DownloadPhase.DOWNLOADING) dl.progressFraction else null
                            if (btnFrac != null) {
                                CircularProgressIndicator(
                                    progress = { btnFrac },
                                    modifier = Modifier.size(18.dp),
                                    color = colors.primaryBtnText,
                                    strokeWidth = 2.dp,
                                )
                            } else {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(18.dp),
                                    color = colors.primaryBtnText,
                                    strokeWidth = 2.dp,
                                )
                            }
                        }
                        Text(
                            text = primaryLabel,
                            color = colors.primaryBtnText,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                        )
                    }
                }

                if (dl.phase == DownloadPhase.DOWNLOADING) {
                    Box(
                        modifier = Modifier
                            .height(48.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(colors.secondaryBtnBg)
                            .clickable(role = Role.Button, onClick = onCancelDownload)
                            .padding(horizontal = 14.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "取消",
                            color = colors.secondaryBtnText,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }

            Spacer(Modifier.height(8.dp))

            // 10. 次要操作或强制更新恢复/退出入口（所有热区 >= 48dp）
            if (!isForce) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (dl.phase == DownloadPhase.FAILED && manifest.downloadUrls.size > 1) {
                        UpdateTextButton("切换备用节点", colors.secondaryBtnText, onSwitchMirrorRetry)
                    }
                    if (dl.phase == DownloadPhase.FAILED) {
                        UpdateTextButton("浏览器手动下载", colors.muted, onManualBrowserDownload)
                    }
                    UpdateTextButton("稍后更新", colors.muted, onDismissOptional)
                }
            } else {
                // 强制更新：不提供“暂不更新/关闭”，但完整保留切换节点、重新检查更新（用于接收紧急解除）、手动下载与退出应用
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (manifest.downloadUrls.size > 1) {
                            UpdateTextButton("切换备用节点", colors.secondaryBtnText, onSwitchMirrorRetry)
                        } else {
                            UpdateTextButton("重新检查更新", colors.secondaryBtnText, onRecheck)
                        }
                        UpdateTextButton("浏览器手动下载", colors.secondaryBtnText, onManualBrowserDownload)
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (manifest.downloadUrls.size > 1) {
                            UpdateTextButton(
                                text = if (state.checkPhase == CheckPhase.CHECKING) "正在检查…" else "重新检查更新",
                                color = colors.muted,
                                onClick = onRecheck,
                            )
                        } else {
                            Spacer(Modifier.width(1.dp))
                        }
                        UpdateTextButton("退出应用", colors.muted, onExitApp)
                    }
                }
            }
        }
    }
}

@Composable
private fun UpdateDownloadStatusBlock(
    dl: DownloadSnapshot,
    colors: UpdateDialogColors,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(if (dl.phase == DownloadPhase.FAILED) colors.errorBg else colors.cardBg)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        when (dl.phase) {
            DownloadPhase.DOWNLOADING, DownloadPhase.VERIFYING -> {
                val fraction = dl.progressFraction
                if (fraction != null) {
                    LinearProgressIndicator(
                        progress = { fraction },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp)
                            .clip(RoundedCornerShape(999.dp)),
                        color = colors.primaryBtnBg,
                        trackColor = colors.border,
                    )
                } else {
                    // 未知总长度时使用不确定进度条，绝不伪造百分比
                    LinearProgressIndicator(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp)
                            .clip(RoundedCornerShape(999.dp)),
                        color = colors.primaryBtnBg,
                        trackColor = colors.border,
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    val sizeInfo = if (dl.totalBytes > 0L) {
                        "${UpdateManager.formatSizeMb(dl.downloadedBytes)} / ${UpdateManager.formatSizeMb(dl.totalBytes)}"
                    } else {
                        "已下载 ${UpdateManager.formatSizeMb(dl.downloadedBytes)}"
                    }
                    Text(sizeInfo, color = colors.muted, fontSize = 12.sp)
                    val rightInfo = if (dl.phase == DownloadPhase.VERIFYING) {
                        "校验签名中…"
                    } else {
                        val pctText = fraction?.let { "${(it * 100).toInt()}% · " }.orEmpty()
                        val speedText = formatSpeed(dl.speedBytesPerSec)
                        "$pctText$speedText"
                    }
                    Text(rightInfo, color = colors.ink, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                }
            }
            DownloadPhase.READY_TO_INSTALL -> {
                Text(
                    text = "安装包已准备完成。",
                    color = colors.ink,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = "已通过 SHA-256、包名、版本号与正式签名证书校验，点击「立即安装」启动系统覆盖安装。",
                    color = colors.muted,
                    fontSize = 12.sp,
                    lineHeight = 17.sp,
                )
            }
            DownloadPhase.AWAITING_INSTALL_PERMISSION,
            DownloadPhase.AWAITING_CELLULAR_CONFIRM,
            DownloadPhase.FAILED,
            DownloadPhase.IDLE -> {
                if (!dl.errorMessage.isNullOrBlank()) {
                    Text(
                        text = dl.errorMessage,
                        color = if (dl.phase == DownloadPhase.FAILED) colors.errorText else colors.ink,
                        fontSize = 12.sp,
                        lineHeight = 18.sp,
                    )
                }
            }
        }
    }
}

@Composable
private fun UpdateTextButton(
    text: String,
    color: Color,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(12.dp))
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            color = color,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
        )
    }
}

private fun formatSpeed(bytesPerSec: Long): String {
    if (bytesPerSec <= 0L) return "连接中…"
    return if (bytesPerSec >= 1024L * 1024L) {
        String.format("%.1f MB/s", bytesPerSec.toDouble() / (1024.0 * 1024.0))
    } else {
        String.format("%d KB/s", (bytesPerSec / 1024L).coerceAtLeast(1L))
    }
}
