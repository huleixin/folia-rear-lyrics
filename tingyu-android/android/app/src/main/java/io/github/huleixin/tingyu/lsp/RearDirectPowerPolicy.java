package io.github.huleixin.tingyu.lsp;

import android.view.Display;
import java.util.HashMap;
import java.util.Map;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/RearDirectPowerPolicy.java
/** Keep the latest system intent, not an ON replacement, so lease cleanup restores its true request. */
final class RearDirectPowerPolicy {
    static final class Request {
        final int display, original;
        private int applied = -1;
        Request(int display, int original) { this.display = display; this.original = original; }
    }
    private final RearDisplayLease lease;
    private final Map<Integer, Request> requests = new HashMap<>();
    RearDirectPowerPolicy(RearDisplayLease lease) { this.lease = lease; }
    synchronized Request record(int display, int state) {
        if (display <= 0) return null;
        Request request = new Request(display, state); requests.put(display, request); return request;
    }
    synchronized Request latest(int display) { return requests.get(display); }
    synchronized boolean current(Request request) { return request != null && requests.get(request.display) == request; }
    int effective(Request request, long now) {
        return request.original == Display.STATE_OFF && lease.holds(request.display, now) ? Display.STATE_ON : request.original;
    }
    synchronized void applied(Request request, int state) { if (current(request)) request.applied = state; }
    synchronized boolean needsReplay(Request request, long now) { return current(request) && request.applied != effective(request, now); }
}
