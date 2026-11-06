package io.github.huleixin.tingyu;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import io.github.huleixin.tingyu.diagnostics.DiagnosticLog;
import io.github.huleixin.tingyu.diagnostics.SafeModeReport;
import io.github.huleixin.tingyu.diagnostics.StartupGuard;

// android/app/src/main/java/io/github/huleixin/tingyu/SafeModeActivity.java
/**
 * 安全恢复页：唯一一个不依赖 React / WebView / Media3 / 歌词 / LSP 的界面。
 *
 * <p>它只用到 Activity + 原生控件，主题色写死（不走 Compose、不读用户主题），
 * 因此即使前端 bundle 全坏了、WebView 初始化必崩，这个页面仍然能显示并导出诊断包。
 *
 * <p>四个动作都不删数据：不清歌单、不清设置、不清播放记录，只改「启动守卫」的几个标志位。
 */
public final class SafeModeActivity extends Activity {
    public static final String EXTRA_FROM_SAFE_MODE = "tingyu.fromSafeMode";

    private static final int BACKGROUND = 0xFF0E1A16;
    private static final int CARD = 0xFF15251F;
    private static final int TEXT_PRIMARY = 0xFFE8F4ED;
    private static final int TEXT_MUTED = 0xFF9DB5AB;
    private static final int ACCENT = 0xFF8FD8BD;
    private static final int DANGER = 0xFFE0A0A0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            DiagnosticLog.event("lifecycle", "warn", "safe-mode-open", StartupGuard.summary(this));
        } catch (Throwable ignored) {
        }
        setContentView(buildContent());
    }

    private View buildContent() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(BACKGROUND);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(20);
        root.setPadding(pad, dp(28), pad, dp(28));
        scroll.addView(root, new ScrollView.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView title = new TextView(this);
        title.setText(R.string.safe_mode_title);
        title.setTextColor(TEXT_PRIMARY);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        root.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText(R.string.safe_mode_subtitle);
        subtitle.setTextColor(TEXT_MUTED);
        subtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        subtitle.setLineSpacing(dp(3), 1f);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        subtitleParams.topMargin = dp(8);
        root.addView(subtitle, subtitleParams);

        TextView summary = new TextView(this);
        summary.setText(buildSummary());
        summary.setTextColor(TEXT_PRIMARY);
        summary.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        summary.setLineSpacing(dp(2), 1f);
        GradientDrawable card = new GradientDrawable();
        card.setColor(CARD);
        card.setCornerRadius(dp(16));
        summary.setBackground(card);
        summary.setPadding(dp(14), dp(12), dp(14), dp(12));
        LinearLayout.LayoutParams summaryParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        summaryParams.topMargin = dp(18);
        root.addView(summary, summaryParams);

        root.addView(action(
            R.string.safe_mode_view_errors,
            R.string.safe_mode_view_errors_hint,
            false,
            this::showRecentErrors
        ));
        root.addView(action(
            R.string.safe_mode_export,
            R.string.safe_mode_export_hint,
            false,
            this::exportReport
        ));
        root.addView(action(
            R.string.safe_mode_skip_optional,
            R.string.safe_mode_skip_optional_hint,
            false,
            () -> launchMain(true)
        ));
        root.addView(action(
            R.string.safe_mode_resume,
            R.string.safe_mode_resume_hint,
            true,
            () -> {
                StartupGuard.exitSafeMode();
                StartupGuard.setSkipOptional(false);
                launchMain(false);
            }
        ));

        TextView footer = new TextView(this);
        footer.setText(R.string.safe_mode_footer);
        footer.setTextColor(TEXT_MUTED);
        footer.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        footer.setLineSpacing(dp(2), 1f);
        LinearLayout.LayoutParams footerParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        footerParams.topMargin = dp(20);
        root.addView(footer, footerParams);

        return scroll;
    }

    private View action(int titleRes, int hintRes, boolean danger, Runnable onClick) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable background = new GradientDrawable();
        background.setColor(CARD);
        background.setCornerRadius(dp(16));
        box.setBackground(background);
        box.setPadding(dp(16), dp(14), dp(16), dp(14));
        box.setClickable(true);
        box.setFocusable(true);

        TextView title = new TextView(this);
        title.setText(titleRes);
        title.setTextColor(danger ? DANGER : ACCENT);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        box.addView(title);

        TextView hint = new TextView(this);
        hint.setText(hintRes);
        hint.setTextColor(TEXT_MUTED);
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        hint.setLineSpacing(dp(2), 1f);
        LinearLayout.LayoutParams hintParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        hintParams.topMargin = dp(4);
        box.addView(hint, hintParams);

        box.setOnClickListener(view -> onClick.run());
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(10);
        box.setLayoutParams(params);
        return box;
    }

    private String buildSummary() {
        StringBuilder text = new StringBuilder();
        try {
            JSONObject summary = StartupGuard.summary(this);
            text.append("上次启动停在：").append(summary.optString("stage", "-")).append('\n');
            text.append("连续失败：").append(summary.optInt("consecutiveFailures", 0)).append(" 次\n");
            String exitDetail = summary.optString("lastExitDetail", "");
            if (!exitDetail.isEmpty()) {
                text.append("系统退出信息：").append(exitDetail).append('\n');
            }
            text.append("进程：").append(summary.optString("process", "main")).append('\n');
            text.append("版本：").append(BuildConfig.VERSION_NAME)
                .append(" (").append(BuildConfig.VERSION_CODE).append(") · ")
                .append(BuildConfig.BUILD_ID);
        } catch (Exception ignored) {
        }
        try {
            JSONArray history = new JSONArray(CrashDiagnostics.read(this));
            if (history.length() > 0) {
                JSONObject last = history.optJSONObject(history.length() - 1);
                if (last != null) {
                    String message = last.optString("message", "");
                    if (message.length() > 180) message = message.substring(0, 180) + "…";
                    text.append("\n\n最近一条异常：").append(last.optString("type", "-"));
                    if (!TextUtils.isEmpty(message)) text.append("\n").append(message);
                }
            }
        } catch (Exception ignored) {
        }
        return text.toString();
    }

    private void showRecentErrors() {
        String body;
        try {
            body = SafeModeReport.buildErrorsText(this);
        } catch (Throwable error) {
            body = "读取异常记录失败：" + error;
        }
        TextView content = new TextView(this);
        content.setText(body);
        content.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        content.setTextColor(TEXT_PRIMARY);
        content.setPadding(dp(12), dp(8), dp(12), dp(8));
        ScrollView scroll = new ScrollView(this);
        scroll.addView(content);
        new AlertDialog.Builder(this)
            .setTitle(R.string.safe_mode_view_errors)
            .setView(scroll)
            .setPositiveButton(android.R.string.ok, null)
            .show();
    }

    private void exportReport() {
        try {
            String name = SafeModeReport.exportAndShare(this, "听屿 诊断包（安全模式）");
            Toast.makeText(this, getString(R.string.safe_mode_export_done, name), Toast.LENGTH_LONG).show();
        } catch (Throwable error) {
            new AlertDialog.Builder(this)
                .setTitle(R.string.safe_mode_export_failed)
                .setMessage(String.valueOf(error))
                .setPositiveButton(android.R.string.ok, null)
                .show();
        }
    }

    private void launchMain(boolean skipOptional) {
        StartupGuard.setSkipOptional(skipOptional);
        Intent intent = new Intent(this, MainActivity.class);
        intent.putExtra(EXTRA_FROM_SAFE_MODE, true);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(intent);
        finish();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
