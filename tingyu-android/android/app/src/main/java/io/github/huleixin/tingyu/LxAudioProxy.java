package io.github.huleixin.tingyu;

import java.io.IOException;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.List;
import java.util.concurrent.TimeUnit;
import okhttp3.Dns;
import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

// android/app/src/main/java/io/github/huleixin/tingyu/LxAudioProxy.java
/** User scripts issue public audio URLs outside the built-in platform host list. */
final class LxAudioProxy {
    private static final OkHttpClient CLIENT = new OkHttpClient.Builder()
        .dns(host -> {
            List<InetAddress> addresses = Dns.SYSTEM.lookup(host);
            for (InetAddress address : addresses) if (!isPublicAddress(address))
                throw new UnknownHostException("Custom audio must resolve to a public address");
            return addresses;
        })
        // Audio streams can legitimately leave the socket quiet while the player drains its
        // buffer. A short read timeout turns that pause into a closed proxy and a one-minute
        // cut-off on slow CDNs; the connect timeout still bounds an unreachable host.
        .connectTimeout(8, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS)
        .followRedirects(false).followSslRedirects(false).build();

    static boolean isPublicAddress(InetAddress address) {
        if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
            || address.isSiteLocalAddress() || address.isMulticastAddress()) return false;
        byte[] b = address.getAddress();
        if (b.length == 16) return (b[0] & 0xfe) != 0xfc;
        int first = b[0] & 255, second = b[1] & 255;
        return first != 0 && first < 224 && !(first == 100 && second >= 64 && second <= 127)
            && !(first == 198 && (second == 18 || second == 19))
            && !(first == 192 && second == 0);
    }

    static HttpUrl validate(String value) throws IOException {
        HttpUrl url;
        try { url = HttpUrl.get(value); } catch (IllegalArgumentException error) { throw new IOException("Invalid custom audio URL", error); }
        String host = url.host();
        if (!url.username().isEmpty() || !url.password().isEmpty() || host.equals("localhost")
            || host.endsWith(".local") || !host.contains(".") && !host.contains(":"))
            throw new IOException("Custom audio requires a public HTTP(S) URL");
        // DNS validation above also applies to every redirected request, including IPv6.
        if (host.matches("[0-9.]+") || host.contains(":")) {
            try { if (!isPublicAddress(InetAddress.getByName(host))) throw new IOException("Private custom audio URL"); }
            catch (UnknownHostException error) { throw new IOException("Invalid custom audio address", error); }
        }
        return url;
    }

    static Response execute(Request initial) throws IOException {
        Request request = initial.newBuilder().url(validate(initial.url().toString())).build();
        for (int redirects = 0; redirects <= 5; redirects++) {
            Response response = CLIENT.newCall(request).execute();
            int status = response.code();
            String location = response.header("Location");
            if (!(status == 301 || status == 302 || status == 303 || status == 307 || status == 308) || location == null) return response;
            HttpUrl next = response.request().url().resolve(location);
            response.close();
            if (next == null) throw new IOException("Invalid custom audio redirect");
            request = request.newBuilder().url(validate(next.toString())).removeHeader("Authorization").removeHeader("Cookie").build();
        }
        throw new IOException("Too many custom audio redirects");
    }
    private LxAudioProxy() {}
}
