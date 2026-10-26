package io.github.huleixin.tingyu;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.Binder;
import android.os.Bundle;
import android.os.Process;
import io.github.huleixin.tingyu.lsp.RearBridgeContract;

// android/app/src/main/java/io/github/huleixin/tingyu/LspRearProvider.java
/** Only system_server may deliver the privileged Binder; other exported operations are closed. */
public final class LspRearProvider extends ContentProvider {
    private final Binder lifeline = new Binder();
    @Override public boolean onCreate() { return true; }
    @Override public Bundle call(String method, String arg, Bundle extras) {
        if (Binder.getCallingUid() != Process.SYSTEM_UID) throw new SecurityException("System only");
        if (!"connect".equals(method) || extras == null || extras.getInt("protocol") != RearBridgeContract.VERSION)
            throw new IllegalArgumentException("Unsupported bridge protocol");
        try { LspRearBridge.accept(getContext(), extras.getBinder("service"), extras.getString("profile", "LSP")); }
        catch (Exception error) { throw new IllegalStateException("LSP connection rejected", error); }
        Bundle result = new Bundle(); result.putBoolean("connected", true); result.putBinder("lifeline", lifeline); return result;
    }
    @Override public Cursor query(Uri u, String[] p, String s, String[] a, String o) { throw new SecurityException("No query"); }
    @Override public String getType(Uri u) { return null; }
    @Override public Uri insert(Uri u, ContentValues v) { throw new SecurityException("No insert"); }
    @Override public int delete(Uri u, String s, String[] a) { throw new SecurityException("No delete"); }
    @Override public int update(Uri u, ContentValues v, String s, String[] a) { throw new SecurityException("No update"); }
}
