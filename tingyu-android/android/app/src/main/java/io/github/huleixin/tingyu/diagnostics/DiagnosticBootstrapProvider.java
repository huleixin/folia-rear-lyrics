package io.github.huleixin.tingyu.diagnostics;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;

// android/app/src/main/java/io/github/huleixin/tingyu/diagnostics/DiagnosticBootstrapProvider.java
/**
 * 最早的进程入口：ContentProvider 先于 Application.onCreate 创建。
 *
 * <p>为什么需要它：如果崩溃发生在 Application 初始化或别的 ContentProvider 里，
 * Activity 根本不会创建，MainActivity 里那套安装逻辑永远跑不到。把安装放进 initOrder 最高的
 * provider，是系统允许的最早应用代码之一（AndroidX Startup 用的是同一套机制）。
 *
 * <p>约束：只装诊断，不做任何业务初始化；所有代码都包在 try/catch 里，
 * 自身不允许成为启动失败的原因。
 */
public final class DiagnosticBootstrapProvider extends ContentProvider {
    @Override
    public boolean onCreate() {
        try {
            Context context = getContext();
            if (context != null) {
                DiagnosticBootstrap.install(context, StartupGuard.STAGE_PROVIDER_INIT);
            }
        } catch (Throwable ignored) {
            // 诊断组件自己不能抛。
        }
        return true;
    }

    /** 仅用于触发进程创建，不承载任何查询能力。 */
    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        return null;
    }

    @Override
    public String getType(Uri uri) {
        return null;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
