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
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.toBitmap
import io.github.huleixin.tingyu.R
import io.github.huleixin.tingyu.chrome.LocalInterfacePalette

// android/app/src/main/java/io/github/huleixin/tingyu/update/UpdateDialog.kt
// 听屿原生软件更新弹窗、强制更新拦截门（UpdateGate）及真实历史版本更新日志弹窗。

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
            UpdateDialogColors(
                scrim = Color(0x8810202C),
                dialogBg = Color(0xFFF6F9FC),
                cardBg = Color(0xFFEDF3F8),
                border = Color(0xFFD9E4EE),
                ink = Color(0xFF1D3342),
                muted = Color(0xFF567082),
                primaryBtnBg = Color(0xFF385B73),
                primaryBtnText = Color(0xFFFFFFFF),
                secondaryBtnBg = Color(0xFFDCE7F0),
                secondaryBtnText = Color(0xFF325268),
                badgeForceBg = Color(0xFFFDE8E7),
                badgeForceText = Color(0xFFB3261E),
                badgeNormalBg = Color(0xFFDCE7F0),
                badgeNormalText = Color(0xFF325268),
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
                badgeForceBg = Color(0xFFFDE8E7),
                badgeForceText = Color(0xFFB3261E),
                badgeNormalBg = palette.selected,
                badgeNormalText = palette.accent,
                errorBg = Color(0xFFFDECEA),
                errorText = Color(0xFFB3261E),
            )
        } else {
            UpdateDialogColors(
                scrim = Color(0xBE050A0F),
                dialogBg = palette.panelSurface,
                cardBg = palette.panelCard,
                border = palette.border,
                ink = palette.ink,
                muted = palette.muted,
                primaryBtnBg = palette.button,
                primaryBtnText = palette.onAccent,
                secondaryBtnBg = palette.selected,
                secondaryBtnText = palette.accent,
                badgeForceBg = Color(0x36FF6B6B),
                badgeForceText = Color(0xFFFFB4AB),
                badgeNormalBg = palette.selected,
                badgeNormalText = palette.accent,
                errorBg = Color(0x36FF6B6B),
                errorText = Color(0xFFFFB4AB),
            )
        }
    }
}

@Composable
private fun rememberTingyuLogoBitmap(): ImageBitmap? {
    val context = LocalContext.current
    return remember(context) {
        runCatching {
            val drawable = ContextCompat.getDrawable(context, R.mipmap.ic_launcher_round)
                ?: ContextCompat.getDrawable(context, R.mipmap.ic_launcher)
            (drawable as? BitmapDrawable)?.bitmap?.asImageBitmap()
                ?: drawable?.toBitmap(192, 192)?.asImageBitmap()
        }.getOrNull()
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
    val shouldShowUpdate = manifest != null && (uiState.isForceUpdateActive || uiState.dialogVisible)

    if (shouldShowUpdate && manifest != null) {
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
        return
    }

    if (uiState.historyVisible) {
        BackHandler(enabled = true) {
            manager.dismissReleaseHistoryDialog()
        }
        UpdateHistoryDialogSurface(
            state = uiState,
            safeTopDp = safeTopDp,
            safeBottomDp = safeBottomDp,
            onClose = { manager.dismissReleaseHistoryDialog() },
            modifier = modifier,
        )
    }
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
    val appLogoBitmap = rememberTingyuLogoBitmap()

    val noteParagraphs = remember(manifest.releaseNotes) {
        manifest.releaseNotes
            .lines()
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .ifEmpty { listOf("优化产品体验与稳定性，修复已知问题。") }
    }

    BoxWithConstraints(
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
                start = 20.dp,
                end = 20.dp,
                top = (safeTopDp + 8f).dp,
                bottom = (safeBottomDp + 8f).dp,
            ),
        contentAlignment = Alignment.Center,
    ) {
        val compactHeight = maxHeight < 460.dp
        val dialogShape = RoundedCornerShape(if (compactHeight) 20.dp else 24.dp)
        Column(
            modifier = Modifier
                .widthIn(max = if (compactHeight) 520.dp else 420.dp)
                .fillMaxWidth()
                .heightIn(max = 720.dp)
                .shadow(22.dp, dialogShape, clip = false)
                .clip(dialogShape)
                .background(colors.dialogBg)
                .border(0.8.dp, colors.border.copy(alpha = 0.7f), dialogShape)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = {},
                )
                .padding(horizontal = 20.dp, vertical = if (compactHeight) 12.dp else 20.dp),
        ) {
            // 1. 紧凑精致水平头部：44dp 正式 Logo + 版本标题/大小 + 右上角更新类型标签（告别大块突兀空白）
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                val logoSize = if (compactHeight) 36.dp else 44.dp
                if (appLogoBitmap != null) {
                    Image(
                        bitmap = appLogoBitmap,
                        contentDescription = "听屿 Logo",
                        modifier = Modifier
                            .size(logoSize)
                            .clip(RoundedCornerShape(12.dp)),
                    )
                } else {
                    Box(
                        Modifier
                            .size(logoSize)
                            .clip(RoundedCornerShape(12.dp))
                            .background(colors.primaryBtnBg),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("听屿", color = colors.primaryBtnText, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    }
                }

                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        text = "发现新版本 v${manifest.latestVersionName}",
                        color = colors.ink,
                        fontSize = if (compactHeight) 16.sp else 18.sp,
                        lineHeight = 24.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    val metaParts = buildList {
                        add("当前 v${state.currentVersionName}")
                        if (manifest.apkSizeBytes > 0L) add(UpdateManager.formatSizeMb(manifest.apkSizeBytes))
                    }
                    Text(
                        text = metaParts.joinToString(" · "),
                        color = colors.muted,
                        fontSize = 12.sp,
                        lineHeight = 16.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }

                Box(
                    Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(if (isForce) colors.badgeForceBg else colors.badgeNormalBg)
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                ) {
                    Text(
                        text = if (isForce) "强制更新" else "版本更新",
                        color = if (isForce) colors.badgeForceText else colors.badgeNormalText,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            Spacer(Modifier.height(if (compactHeight) 8.dp else 14.dp))

            // 2. 柔和无外框更新公告阅读区（独立自然滚动，行距 22sp、段距清晰）
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f, fill = false)
                    .heightIn(min = if (compactHeight) 36.dp else 76.dp, max = 300.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(colors.cardBg)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = if (compactHeight) 10.dp else 14.dp),
                verticalArrangement = Arrangement.spacedBy(if (compactHeight) 4.dp else 8.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "更新内容",
                        color = colors.ink,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (manifest.publishedAt.length >= 10) {
                        Text(
                            text = manifest.publishedAt.take(10),
                            color = colors.muted,
                            fontSize = 11.5.sp,
                        )
                    }
                }
                noteParagraphs.forEach { line ->
                    Text(
                        text = line,
                        color = colors.ink.copy(alpha = 0.92f),
                        fontSize = 14.sp,
                        lineHeight = 22.sp,
                    )
                }
            }

            // 3. 多节点下载源切换（仅当配置了多下载源时展示，无边框柔和胶囊）
            if (manifest.downloadUrls.size > 1) {
                Spacer(Modifier.height(if (compactHeight) 8.dp else 12.dp))
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
                                .heightIn(min = if (compactHeight) 30.dp else 34.dp)
                                .clip(shape)
                                .background(if (selected) colors.secondaryBtnBg else colors.cardBg)
                                .clickable(enabled = dl.phase != DownloadPhase.DOWNLOADING) {
                                    onSelectMirror(mirror.id)
                                }
                                .padding(horizontal = 10.dp, vertical = if (compactHeight) 4.dp else 6.dp),
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

            // 4. 实时下载进度条 / 校验状态 / 异常提示（紧贴主按钮上方固定可见）
            if (dl.phase != DownloadPhase.IDLE || !dl.errorMessage.isNullOrBlank()) {
                Spacer(Modifier.height(if (compactHeight) 8.dp else 12.dp))
                UpdateDownloadStatusBlock(dl = dl, colors = colors)
            }

            if (!compactHeight) {
                Spacer(Modifier.height(10.dp))

                // 5. 弱化清晰的版本来源与数据保留说明
                Text(
                    text = "听屿 Tingyu 官方签名校验 · 覆盖安装完整保留收藏、歌单与账号登录态",
                    color = colors.muted.copy(alpha = 0.85f),
                    fontSize = 11.5.sp,
                    lineHeight = 16.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            Spacer(Modifier.height(if (compactHeight) 8.dp else 14.dp))

            // 6. 固定可见底部主次操作栏
            val btnHeight = if (compactHeight) 40.dp else 46.dp
            val isBusyDownloading = dl.phase == DownloadPhase.DOWNLOADING || dl.phase == DownloadPhase.VERIFYING
            val primaryLabel = when (dl.phase) {
                DownloadPhase.IDLE -> "立即更新"
                DownloadPhase.AWAITING_CELLULAR_CONFIRM -> "继续下载（移动网络）"
                DownloadPhase.DOWNLOADING -> {
                    val pct = dl.progressFraction?.let { "${(it * 100).toInt()}%" } ?: "下载中"
                    "正在下载 $pct"
                }
                DownloadPhase.VERIFYING -> "校验安装包签名中…"
                DownloadPhase.READY_TO_INSTALL -> "立即安装"
                DownloadPhase.AWAITING_INSTALL_PERMISSION -> "授权安装权限"
                DownloadPhase.FAILED -> "重试下载"
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // 普通更新且未在下载中时：左侧并排提供“稍后”按钮
                if (!isForce && dl.phase != DownloadPhase.DOWNLOADING && dl.phase != DownloadPhase.VERIFYING) {
                    Box(
                        modifier = Modifier
                            .weight(0.36f)
                            .height(btnHeight)
                            .clip(RoundedCornerShape(14.dp))
                            .background(colors.secondaryBtnBg)
                            .clickable(role = Role.Button, onClick = onDismissOptional)
                            .padding(horizontal = 12.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "稍后",
                            color = colors.secondaryBtnText,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                        )
                    }
                }

                Box(
                    modifier = Modifier
                        .weight(if (!isForce && dl.phase != DownloadPhase.DOWNLOADING && dl.phase != DownloadPhase.VERIFYING) 0.64f else 1f)
                        .height(btnHeight)
                        .clip(RoundedCornerShape(14.dp))
                        .background(colors.primaryBtnBg.copy(alpha = if (isBusyDownloading) 0.85f else 1f))
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
                                    modifier = Modifier.size(17.dp),
                                    color = colors.primaryBtnText,
                                    strokeWidth = 2.dp,
                                )
                            } else {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(17.dp),
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
                            .height(btnHeight)
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

            // 7. 辅助恢复操作（强制更新下保留重查/浏览器兜底/退出，下载失败时额外显示切源；隐藏“稍后”）
            if (isForce) {
                Spacer(Modifier.height(6.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (dl.phase == DownloadPhase.FAILED && manifest.downloadUrls.size > 1) {
                        UpdateCompactAction("切换备用节点", colors.secondaryBtnText, onSwitchMirrorRetry)
                    }
                    UpdateCompactAction(
                        text = if (state.checkPhase == CheckPhase.CHECKING) "检查中…" else "重新检查更新",
                        color = colors.muted,
                        onClick = onRecheck,
                    )
                    UpdateCompactAction("浏览器手动下载", colors.muted, onManualBrowserDownload)
                    UpdateCompactAction("退出应用", colors.muted, onExitApp)
                }
            } else if (dl.phase == DownloadPhase.FAILED) {
                Spacer(Modifier.height(6.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (manifest.downloadUrls.size > 1) {
                        UpdateCompactAction("切换备用节点", colors.secondaryBtnText, onSwitchMirrorRetry)
                    }
                    UpdateCompactAction("浏览器手动下载", colors.muted, onManualBrowserDownload)
                }
            }
        }
    }
}

/**
 * 听屿专属「版本更新日志」原生弹窗：只展示听屿自身真实已发布版本记录，绝不混入任何上游 Folia 更新内容。
 */
@Composable
internal fun UpdateHistoryDialogSurface(
    state: UpdateUiState,
    safeTopDp: Float,
    safeBottomDp: Float,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = rememberUpdateDialogColors()
    val appLogoBitmap = rememberTingyuLogoBitmap()

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(colors.scrim)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClose,
            )
            .padding(
                start = 20.dp,
                end = 20.dp,
                top = (safeTopDp + 16f).dp,
                bottom = (safeBottomDp + 16f).dp,
            ),
        contentAlignment = Alignment.Center,
    ) {
        val dialogShape = RoundedCornerShape(24.dp)
        Column(
            modifier = Modifier
                .widthIn(max = 430.dp)
                .fillMaxWidth()
                .heightIn(max = 680.dp)
                .shadow(22.dp, dialogShape, clip = false)
                .clip(dialogShape)
                .background(colors.dialogBg)
                .border(0.8.dp, colors.border.copy(alpha = 0.7f), dialogShape)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = {},
                )
                .padding(20.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (appLogoBitmap != null) {
                    Image(
                        bitmap = appLogoBitmap,
                        contentDescription = "听屿 Logo",
                        modifier = Modifier
                            .size(40.dp)
                            .clip(RoundedCornerShape(11.dp)),
                    )
                }
                Column(Modifier.weight(1f)) {
                    Text(
                        text = "版本更新日志",
                        color = colors.ink,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = "当前安装：听屿 v${state.currentVersionName} (${state.currentVersionCode})",
                        color = colors.muted,
                        fontSize = 12.sp,
                    )
                }
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(RoundedCornerShape(18.dp))
                        .background(colors.cardBg)
                        .clickable(role = Role.Button, onClick = onClose),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("✕", color = colors.muted, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                }
            }

            Spacer(Modifier.height(14.dp))

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f, fill = false)
                    .heightIn(min = 120.dp, max = 440.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (state.historyLoading) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(120.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                color = colors.primaryBtnBg,
                                strokeWidth = 2.dp,
                            )
                            Text("正在读取听屿历史更新记录…", color = colors.muted, fontSize = 13.sp)
                        }
                    }
                } else if (state.historyEntries.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .background(colors.cardBg)
                            .padding(horizontal = 16.dp, vertical = 28.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "暂无更新记录",
                            color = colors.muted,
                            fontSize = 14.sp,
                        )
                    }
                } else {
                    state.historyEntries.forEach { entry ->
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(16.dp))
                                .background(colors.cardBg)
                                .padding(15.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = "v${entry.versionName}",
                                    color = colors.ink,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                                val rightMeta = buildList {
                                    if (entry.isCurrentInstalled) add("当前版本")
                                    if (entry.publishedAt.isNotBlank()) add(entry.publishedAt)
                                }.joinToString(" · ")
                                if (rightMeta.isNotBlank()) {
                                    Text(rightMeta, color = colors.muted, fontSize = 11.5.sp)
                                }
                            }
                            entry.releaseNotes
                                .lines()
                                .map { it.trim() }
                                .filter { it.isNotEmpty() }
                                .forEach { line ->
                                    Text(
                                        text = line,
                                        color = colors.ink.copy(alpha = 0.92f),
                                        fontSize = 13.5.sp,
                                        lineHeight = 21.sp,
                                    )
                                }
                        }
                    }
                }
            }

            Spacer(Modifier.height(14.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(colors.secondaryBtnBg)
                    .clickable(role = Role.Button, onClick = onClose),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "关闭",
                    color = colors.secondaryBtnText,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
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
                    text = "安装包已准备就绪，点击「立即安装」完成覆盖升级。",
                    color = colors.ink,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
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
private fun UpdateCompactAction(
    text: String,
    color: Color,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .heightIn(min = 38.dp)
            .clip(RoundedCornerShape(10.dp))
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 3.dp, vertical = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            color = color,
            fontSize = 11.5.sp,
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
