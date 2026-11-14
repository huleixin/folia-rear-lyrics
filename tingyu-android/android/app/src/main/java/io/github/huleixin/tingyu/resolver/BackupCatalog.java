package io.github.huleixin.tingyu.resolver;

import io.github.huleixin.tingyu.playback.NativePlaylist;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import okhttp3.FormBody;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.json.JSONArray;
import org.json.JSONObject;

// android/app/src/main/java/io/github/huleixin/tingyu/resolver/BackupCatalog.java
/** Native equivalents of qqSearchTransport.ts and nativeBridge/api/netease.js search contracts. */
final class BackupCatalog {
    interface Transport { String execute(Request request) throws Exception; }
    private static final OkHttpClient CLIENT = new OkHttpClient.Builder().callTimeout(5, TimeUnit.SECONDS).build();
    private final Transport transport;

    BackupCatalog() {
        this(request -> {
            try (Response response = CLIENT.newCall(request).execute()) {
                if (!response.isSuccessful() || response.body() == null) return "";
                return response.body().string();
            }
        });
    }
    BackupCatalog(Transport transport) { this.transport = transport; }

    List<NativePlaylist.Track> search(String provider, String query) throws Exception {
        Request request;
        if ("qq".equals(provider)) {
            request = new Request.Builder().url(QqResolver.MUSICU_URL)
                .header("User-Agent", QqResolver.MUSICU_USER_AGENT).header("Cookie", QqResolver.MUSICU_COOKIE)
                .post(RequestBody.create(MediaType.get("application/json"), qqPayload(query).toString())).build();
        } else if ("netease".equals(provider)) {
            Map<String, String> header = NeteaseResolver.buildEapiHeader(ResolverCredentials.value("netease", "cookie"), "");
            JSONObject payload = new JSONObject().put("s", query).put("type", 1).put("limit", 20)
                .put("offset", 0).put("total", true).put("header", new JSONObject(header));
            request = new Request.Builder().url(NeteaseResolver.EAPI_BASE + "/eapi/cloudsearch/pc")
                .header("User-Agent", NeteaseResolver.EAPI_UA).header("Cookie", NeteaseResolver.formatCookieHeader(header))
                .post(new FormBody.Builder().add("params", NeteaseResolver.eapiEncrypt("/api/cloudsearch/pc", payload.toString())).build()).build();
        } else return new ArrayList<>();
        return parse(provider, transport.execute(request));
    }

    static JSONObject qqPayload(String query) throws Exception {
        JSONObject comm = new JSONObject().put("ct", 11).put("cv", "1003006").put("v", "1003006")
            .put("tmeAppID", "qqmusiclight").put("nettype", "NETWORK_WIFI").put("udid", "0").put("uid", "0");
        JSONObject param = new JSONObject().put("search_id", String.valueOf(System.currentTimeMillis()) + "00000")
            .put("remoteplace", "search.android.keyboard").put("query", query).put("search_type", 0)
            .put("num_per_page", 20).put("page_num", 1).put("highlight", 0).put("nqc_flag", 0).put("page_id", 1).put("grp", 1);
        return new JSONObject().put("comm", comm).put("request", new JSONObject()
            .put("module", "music.search.SearchCgiService").put("method", "DoSearchForQQMusicLite").put("param", param));
    }

    static List<NativePlaylist.Track> parse(String provider, String body) throws Exception {
        List<NativePlaylist.Track> songs = new ArrayList<>();
        if (body == null || body.isEmpty()) return songs;
        JSONObject root = new JSONObject(body);
        JSONArray items;
        boolean qq = "qq".equals(provider);
        if (qq) {
            JSONObject response = root.optJSONObject("request");
            JSONObject data = response == null ? null : response.optJSONObject("data");
            if (root.optInt("code", 0) != 0 || response == null || response.optInt("code", 0) != 0
                || data == null || data.optInt("code", 0) != 0) return songs;
            JSONObject payload = data.optJSONObject("body");
            items = payload == null ? null : payload.optJSONArray("item_song");
        } else {
            if (root.optInt("code", 200) != 200) return songs;
            JSONObject result = root.optJSONObject("result");
            items = result == null ? null : result.optJSONArray("songs");
        }
        if (items == null) return songs;
        for (int i = 0; i < Math.min(20, items.length()); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) continue;
            String id = item.optString(qq ? "mid" : "id", "");
            String title = item.optString(qq ? "title" : "name", "");
            JSONArray artists = item.optJSONArray(qq ? "singer" : "ar");
            if (!qq && artists == null) artists = item.optJSONArray("artists");
            JSONArray names = new JSONArray();
            if (artists != null) for (int a = 0; a < artists.length(); a++) {
                JSONObject artist = artists.optJSONObject(a);
                if (artist != null && !artist.optString("name", "").isEmpty()) names.put(artist.optString("name"));
            }
            JSONObject album = item.optJSONObject(qq ? "album" : "al");
            if (!qq && album == null) album = item.optJSONObject("album");
            JSONObject data = new JSONObject().put("fallbackArtists", names);
            JSONObject file = item.optJSONObject("file");
            if (qq) data.put("songMid", id).put("songId", item.opt("id"))
                .put("mediaMid", file == null ? "" : file.optString("media_mid", ""));
            long duration = qq ? item.optLong("interval", 0) * 1000 : item.optLong("dt", item.optLong("duration", 0));
            if (id.isEmpty() || title.isEmpty()) continue;
            songs.add(new NativePlaylist.Track("online:" + provider + ":" + id, provider, id, title,
                names.length() == 1 ? names.optString(0) : "", album == null ? "" : album.optString("name", ""),
                duration, "", data.toString(), provider + "-original"));
        }
        return songs;
    }
}
