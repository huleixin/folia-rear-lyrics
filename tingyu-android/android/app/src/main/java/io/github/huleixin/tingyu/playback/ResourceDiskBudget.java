package io.github.huleixin.tingyu.playback;

import java.io.File;
import java.util.Arrays;
import java.util.Comparator;
import java.util.function.Predicate;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/ResourceDiskBudget.java
final class ResourceDiskBudget {
    static long bytes(File dir) {
        File[] files = dir.listFiles();
        long total = 0;
        if (files != null) for (File f : files) if (f.isFile()) total += f.length();
        return total;
    }
    static void prune(File dir, long budget, Predicate<File> protectedFile) {
        File[] files = dir.listFiles((d, n) -> !n.endsWith(".tmp"));
        if (files == null) return;
        long total = bytes(dir);
        if (total <= budget) return;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        for (File f : files) {
            if (total <= budget) break;
            if (!protectedFile.test(f)) {
                long size = f.length();
                if (f.delete()) total -= size;
            }
        }
    }
}
