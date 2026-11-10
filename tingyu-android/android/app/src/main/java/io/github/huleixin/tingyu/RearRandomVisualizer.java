package io.github.huleixin.tingyu;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Random;

// android/app/src/main/java/io/github/huleixin/tingyu/RearRandomVisualizer.java
// The existing native relay owns one bounded selection ledger for both screens, even with JS frozen.
final class RearRandomVisualizer {
    private static final LinkedHashMap<String, Selection> rules = new LinkedHashMap<>();
    private static final class Selection {
        String last = "", lastSong = "", overrideStamp = "";
    }

    /** Same song/rule returns the stored choice. A new song excludes the prior choice when possible. */
    static synchronized String select(JSONObject policy, String song, String current) {
        if (policy == null || !policy.optBoolean("enabled") || song == null || song.isEmpty()) return current;
        List<String> modes = new ArrayList<>();
        JSONArray values = policy.optJSONArray("modes");
        if (values != null) for (int i = 0; i < Math.min(64, values.length()); i++) {
            String mode = values.optString(i, "");
            if (!mode.isEmpty() && mode.length() <= 64 && !modes.contains(mode)) modes.add(mode);
        }
        if (modes.isEmpty()) return current;
        String seed = policy.optString("seed", "rear");
        String key = seed + ":" + modes;
        Selection selection = rules.get(key);
        if (selection == null) {
            selection = new Selection(); selection.last = current; rules.put(key, selection);
            while (rules.size() > 8) rules.remove(rules.keySet().iterator().next());
        }
        // The initial song also represents an explicit manual override for the current song.
        String override = policy.optString("initialSongKey") + ":" + current;
        if (song.equals(policy.optString("initialSongKey")) && !override.equals(selection.overrideStamp)) {
            selection.overrideStamp = override;
            selection.last = current; selection.lastSong = song; return current;
        }
        if (song.equals(selection.lastSong)) return selection.last;
        List<String> candidates = new ArrayList<>(modes); candidates.remove(selection.last);
        if (candidates.isEmpty()) candidates = modes;
        String mode = candidates.get(new Random((seed + ":" + song).hashCode()).nextInt(candidates.size()));
        selection.last = mode; selection.lastSong = song;
        return mode;
    }
}
