package io.github.huleixin.tingyu;

import java.util.regex.Pattern;

/** Interprets Android shell errors independently of am's unreliable zero exit status. */
final class RearLyricsCommandResult {
    private static final Pattern ERROR = Pattern.compile("(?im)^\\s*(?:error\\b|exception\\b|securityexception\\b|java\\.[\\w.]*exception\\b|permission denial\\b)");
    final int exitCode;
    final String output;

    RearLyricsCommandResult(int exitCode, String output) {
        this.exitCode = exitCode;
        this.output = output == null ? "" : output.trim();
    }

    boolean failed() { return exitCode != 0 || ERROR.matcher(output).find(); }
    String describe() { return "exit=" + exitCode + (output.isEmpty() ? " (no output)" : "\n" + output); }
}
