package io.github.huleixin.tingyu;

import android.content.Context;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

// android/app/src/main/java/io/github/huleixin/tingyu/RearMusicAdmission.java
/** Independently implemented own-package adaptation of the documented Janus admission points.
 * No MediaController construction, field replacement or unrelated package admission. */
final class RearMusicAdmission {
    static volatile String status="not installed";
    static volatile int ownChecks,ownLists;
    static void install(ClassLoader loader){
        ArrayList<String> result=new ArrayList<>();
        try{
            Class<?> c=XposedHelpers.findClass("p2.a",loader);
            Method check=c.getDeclaredMethod("c",String.class);
            if(check.getReturnType()!=boolean.class)throw new IllegalStateException("c(String) signature mismatch");
            XposedBridge.hookMethod(check,new XC_MethodHook(){
                @Override protected void afterHookedMethod(MethodHookParam p){
                    if(!p.hasThrowable()&&RearNativeCardPolicy.ownMedia((String)p.args[0])){ownChecks++;p.setResult(true);}
                }
            });result.add("own-check=installed");
            Method list=c.getDeclaredMethod("b");
            if(!Set.class.isAssignableFrom(list.getReturnType()))throw new IllegalStateException("b() signature mismatch");
            XposedBridge.hookMethod(list,new XC_MethodHook(){
                @Override protected void afterHookedMethod(MethodHookParam p){
                    if(!p.hasThrowable()&&p.getResult() instanceof Set){p.setResult(RearOwnMusicPackages.set((Set<?>)p.getResult()));ownLists++;}
                }
            });result.add("own-set=installed");
        }catch(Throwable error){result.add("ROM gate unavailable="+error.getClass().getSimpleName());}
        try{
            Class<?> c=XposedHelpers.findClass("com.miui.maml.elements.MusicController",loader);
            Method list=c.getDeclaredMethod("addMusicPackageList",List.class);
            XposedBridge.hookMethod(list,new XC_MethodHook(){
                @Override protected void beforeHookedMethod(MethodHookParam p){
                    if(p.args[0] instanceof List){p.args[0]=RearOwnMusicPackages.list((List<?>)p.args[0]);ownLists++;}
                }
            });result.add("MAML own-list=installed");
        }catch(Throwable error){result.add("MAML gate unavailable="+error.getClass().getSimpleName());}
        status=result.toString();
    }
    static String sessionEvidence(Context context){
        try{
            MediaSessionManager m=context.getSystemService(MediaSessionManager.class);int own=0,playing=0;
            for(MediaController c:m.getActiveSessions(null))if(RearNativeCardPolicy.ownMedia(c.getPackageName())){own++;if(c.getPlaybackState()!=null&&c.getPlaybackState().getState()==3)playing++;}
            return "activeOwn="+own+", playingOwn="+playing;
        }catch(SecurityException denied){return "active-session-query=permission-denied";}
        catch(Throwable error){return "active-session-query="+error.getClass().getSimpleName();}
    }
    private RearMusicAdmission(){}
}
