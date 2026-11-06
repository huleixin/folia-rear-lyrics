# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile


# ---------------------------------------------------------------------------
# 诊断系统（1.3.180+）
#
# 当前 release 是 minifyEnabled false（没有混淆、没有 mapping），因此栈本身就是可读的。
# 将来开启 R8 时，下面几条必须保留，否则诊断包里的堆栈会变成 a.b.c 且没有行号：
#  - SourceFile/LineNumberTable 是 deobfuscate 的前提；
#  - 诊断类保留名字，安全模式与崩溃处理器才能在 proguard 之后仍然被反射/日志引用；
#  - 崩溃处理器依赖 Class.getName()，混淆后类型名会变，但不会崩，故只做保留以便对照。
# ---------------------------------------------------------------------------
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

-keep class io.github.huleixin.tingyu.diagnostics.** { *; }
-keep class io.github.huleixin.tingyu.CrashDiagnostics { *; }
-keep class io.github.huleixin.tingyu.TingyuApplication { *; }
-keep class io.github.huleixin.tingyu.SafeModeActivity { *; }
-keep class io.github.huleixin.tingyu.MainActivity { *; }
