package io.github.huleixin.tingyu;

import android.media.session.MediaController;
import android.view.View;
import android.widget.FrameLayout;
import de.robv.android.xposed.XposedHelpers;
import java.util.IdentityHashMap;

// android/app/src/main/java/io/github/huleixin/tingyu/RearNativeCardOwner.java
/** One verified music_control instance. Never owns the Activity decor or another player's card. */
final class RearNativeCardOwner {
    final FrameLayout container;
    final Object root,music;
    final RearSystemCardBinding binding;
    private final IdentityHashMap<View,Integer> visibility=new IdentityHashMap<>();
    private boolean owned,restored=true;
    RearNativeCardOwner(FrameLayout view,Object root,Object music,RearSystemCardBinding binding){this.container=view;this.root=root;this.music=music;this.binding=binding;}
    MediaController selected(){
        Object bridge=XposedHelpers.getObjectField(music,"mMusicController");
        Object value=bridge==null?null:XposedHelpers.callMethod(bridge,"getMediaController");
        return value instanceof MediaController?(MediaController)value:null;
    }
    private MediaController observing;
    private boolean destroyed;
    private android.media.session.MediaController.Callback callback;
    void watch(Runnable changed){
        observing=selected();
        if(observing==null)throw new IllegalStateException("Selected controller disappeared");
        callback=new MediaController.Callback(){
            @Override public void onSessionDestroyed(){destroyed=true;changed.run();}
            @Override public void onPlaybackStateChanged(android.media.session.PlaybackState state){changed.run();}
        };
        observing.registerCallback(callback,new android.os.Handler(android.os.Looper.getMainLooper()));
    }
    void unwatch(){if(observing!=null&&callback!=null)observing.unregisterCallback(callback);observing=null;callback=null;}
    boolean ownMedia(){try{MediaController c=selected();return c!=null&&RearNativeCardPolicy.ownMedia(c.getPackageName())
        &&RearNativeCardPolicy.sameMediaSession(observing==null?null:observing.getSessionToken(),c.getSessionToken(),destroyed);}catch(Throwable error){return false;}}
    boolean sameRoot(){try{return XposedHelpers.getObjectField(container,"mRoot")==root;}catch(Throwable error){return false;}}
    boolean owned(){return owned;}
    boolean applies(Object object){return object==root||object==music||object==container;}
    void acquire(View stage){
        if(!ownMedia()||!binding.current()||!container.isAttachedToWindow()||XposedHelpers.getObjectField(container,"mRoot")!=root)throw new IllegalStateException("Native music session or system slot changed");
        if(owned){maskChildren(stage);return;}
        restored=false;owned=true;
        try{
            XposedHelpers.callMethod(root,"selfPause");XposedHelpers.callMethod(root,"detachFromVsync");
            maskChildren(stage);
        }catch(Throwable error){restore();throw error;}
    }
    /** A power/theme update can add or reveal a native child without replacing the card root. */
    private void maskChildren(View stage){
        visibility.entrySet().removeIf(entry->entry.getKey().getParent()!=container);
        for(int i=0;i<container.getChildCount();i++){
            View child=container.getChildAt(i);if(child==stage)continue;
            if(!visibility.containsKey(child))visibility.put(child,child.getVisibility());
            if(child.getVisibility()!=View.INVISIBLE)child.setVisibility(View.INVISIBLE);
        }
    }
    boolean restore(){
        if(!owned&&restored)return true;
        owned=false;boolean ok=true;
        // Retain failed entries so a subsequent bounded release attempt can actually restore them.
        java.util.Iterator<java.util.Map.Entry<View,Integer>> pending=visibility.entrySet().iterator();
        while(pending.hasNext()){
            java.util.Map.Entry<View,Integer> e=pending.next();
            try{if(e.getKey().getParent()==container)e.getKey().setVisibility(e.getValue());pending.remove();}
            catch(Throwable error){ok=false;}
        }
        try{
            if(XposedHelpers.getObjectField(container,"mRoot")!=root){restored=ok;return ok;}
            java.lang.reflect.Field finished=XposedHelpers.findFieldIfExists(root.getClass(),"mFinished");
            if(finished!=null&&finished.getBoolean(root)){restored=ok;return ok;}
            ok=call("attachToVsync")&&ok;
            if(container.isAttachedToWindow()&&container.isShown()){
                ok=call("selfResume")&&ok;
                try{
                    MediaController c=selected();Object listener=XposedHelpers.getObjectField(music,"mMusicListener");
                    if(c!=null&&listener!=null){if(c.getMetadata()!=null)XposedHelpers.callMethod(listener,"onClientMetadataUpdate",c.getMetadata());if(c.getPlaybackState()!=null)XposedHelpers.callMethod(listener,"onClientPlaybackStateUpdate",c.getPlaybackState().getState());}
                }catch(Throwable error){ok=false;}
                ok=call("requestUpdate")&&ok;
            }
        }catch(Throwable error){ok=false;}
        container.invalidate();restored=ok;return ok;
    }
    private boolean call(String method){try{XposedHelpers.callMethod(root,method);return true;}catch(Throwable error){return false;}}
}
