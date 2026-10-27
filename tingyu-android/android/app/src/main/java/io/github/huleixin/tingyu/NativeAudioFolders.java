package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/NativeAudioFolders.java
final class NativeAudioFolders {
    private NativeAudioFolders() {}
    static String mediaFolder(String location, String volume, boolean relative) {
        if (location == null || location.isEmpty()) return null;
        String path = location.replace('\\', '/').replaceAll("/+", "/");
        if (!relative) {
            int slash = path.lastIndexOf('/');
            return slash > 0 ? path.substring(0, slash) : null;
        }
        path = path.replaceAll("^/+|/+$", "");
        return (volume == null || volume.isEmpty() ? "external" : volume) + (path.isEmpty() ? "" : "/" + path);
    }
}
