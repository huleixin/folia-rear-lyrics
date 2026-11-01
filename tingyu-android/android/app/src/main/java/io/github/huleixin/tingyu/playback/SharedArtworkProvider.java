package io.github.huleixin.tingyu.playback;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import java.io.FileNotFoundException;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/SharedArtworkProvider.java
public final class SharedArtworkProvider extends ContentProvider {
    @Override public boolean onCreate() { return true; }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        String url = uri.getQueryParameter("url");
        if (!"r".equals(mode) || !"/cover".equals(uri.getPath()) || !SharedArtworkAccess.imageRequestUrl(url))
            throw new FileNotFoundException("Unsupported artwork resource");
        try { return ParcelFileDescriptor.open(NativeArtworkRepository.get(getContext()).ensureFile(url), ParcelFileDescriptor.MODE_READ_ONLY); }
        catch (Exception error) { throw new FileNotFoundException("Artwork unavailable"); }
    }
    @Override public String getType(Uri uri) { return "image/jpeg"; }
    @Override public Cursor query(Uri uri,String[] p,String s,String[] a,String o) { return null; }
    @Override public Uri insert(Uri uri,ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri,String s,String[] a) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri,ContentValues v,String s,String[] a) { throw new UnsupportedOperationException(); }
}
