package io.github.huleixin.tingyu.feedback;

// feedback/CrashPrivacy.java: no exception messages, credentials or private URLs in persisted stack.
public final class CrashPrivacy {
    private CrashPrivacy() {}
    public static String text(String value) {
        if(value==null)return "";
        return value.replaceAll("(?im)^.*(?:cookie|authorization|bearer|password|secret|token|api[_-]?key).*?$", "[credential-redacted]")
            .replaceAll("(?i)(?:https?|file|content)://[^\\s<>\"']+", "[url-redacted]")
            .replaceAll("(?i)[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}", "[email-redacted]")
            .replaceAll("(?:[A-Za-z]:\\\\|/(?:storage|sdcard|data|home|Users)/)[^\\s<>\"']+", "[path-redacted]");
    }
    public static String stack(String value) {
        if(value==null)return "";StringBuilder out=new StringBuilder();int count=0;
        for(String line:value.split("\\n")) {
            String s=line.trim();
            if(s.matches("at [\\w.$<>/]+\\(([\\w.$-]+\\.(java|kt):[0-9]+|Native Method|Unknown Source)\\)")
                ||s.matches("at [\\w.$<>]+ \\([\\w.-]+\\.(m?js|tsx?):[0-9]+:[0-9]+\\)"))out.append(s).append('\n');
            else if(s.matches("(Caused by:|Suppressed:) [\\w.$]+.*"))out.append(s.replaceAll(": ([\\w.$]+).*", ": $1")).append('\n');
            if(++count>=512||out.length()>64000)break;
        }
        return out.toString();
    }
}
