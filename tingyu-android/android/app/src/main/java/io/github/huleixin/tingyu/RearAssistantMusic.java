package io.github.huleixin.tingyu;

import android.content.Context;
import android.os.Bundle;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;
import java.lang.ref.WeakReference;
import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;

// android/app/src/main/java/io/github/huleixin/tingyu/RearAssistantMusic.java
/** Observes the system's real music business; never creates a card, payload or MediaController.
 * The system retains its own list, popup policy, music switch, ordering and gesture state. */
final class RearAssistantMusic {
    private static WeakReference<Object> manager=new WeakReference<>(null);
    private static RearSystemCardProfile mapping;
    private static String installation="not installed";
    private static long hostVersion=-1;
    private static volatile String topMedia="topMedia=not-observed";
    static Runnable changed;
    static final class State {
        final boolean registered,selected;
        final String detail;
        State(boolean registered,boolean selected,String detail){this.registered=registered;this.selected=selected;this.detail=detail;}
    }
    static void install(ClassLoader loader){
        StringBuilder result=new StringBuilder();
        for(RearSystemCardProfile profile:RearSystemCardCapabilities.verified(loader))try{
            Class<?> type=XposedHelpers.findClass(profile.managerClass,loader);
            // Validate all signatures before observing this ROM. No optional mutation methods.
            Method update=type.getDeclaredMethod(profile.updateMethod,String.class,Bundle.class);
            Method collapse=type.getDeclaredMethod(profile.collapseMethod,boolean.class);
            Method expand=type.getDeclaredMethod(profile.expandMethod);
            Method remove=type.getDeclaredMethod(profile.removeMethod);
            if(update.getReturnType()!=void.class||collapse.getReturnType()!=void.class||expand.getReturnType()!=void.class||remove.getReturnType()!=void.class)
                throw new IllegalStateException("manager signature mismatch");
            XC_MethodHook observe=new XC_MethodHook(){
                @Override protected void afterHookedMethod(MethodHookParam p){
                    if(p.hasThrowable())return;
                    manager=new WeakReference<>(p.thisObject);mapping=profile;
                    if(changed!=null)changed.run();
                }
            };
            XposedBridge.hookAllConstructors(type,observe);
            for(Method method:new Method[]{update,collapse,expand,remove})XposedBridge.hookMethod(method,observe);
            // The service calls this diagnostic method with the unmodified SystemUI media bundle.
            // Read only booleans/own-package classification, never payload strings or artwork.
            Class<?> service=XposedHelpers.findClass(profile.serviceClass,loader);
            Method incoming=service.getDeclaredMethod(profile.serviceMethod,String.class,Bundle.class);
            XposedBridge.hookMethod(incoming,new XC_MethodHook(){
                @Override protected void beforeHookedMethod(MethodHookParam p){
                    if(!"mediaData".equals(p.args[0]))return;
                    Bundle data=(Bundle)p.args[1];
                    topMedia=data==null?"topMedia=empty":"topMedia="+(RearNativeCardPolicy.ownMedia(data.getString("packageName"))?"own":"other")
                        +", active="+data.getBoolean("active",false)+", playing="+data.getBoolean("isPlaying",false);
                    if(changed!=null)changed.run();
                }
            });
            result.append(profile.managerClass).append(" observed; ");
        }catch(Throwable error){result.append(profile.managerClass).append('=').append(error.getClass().getSimpleName()).append("; ");}
        installation=result.toString();
    }
    /** Called on the host UI thread. Reads at most the system's existing business list. */
    static State inspect(Context context){
        Object current=manager.get();RearSystemCardProfile profile=mapping;
        if(current==null||profile==null)return new State(false,false,"assistant manager not observed; "+installation+"; "+topMedia);
        try{
            if(hostVersion<0)hostVersion=context.getPackageManager().getPackageInfo(RearHostContract.TARGET,0).getLongVersionCode();
            long version=hostVersion;
            if(RearSystemCardProfile.choose(version,RearSystemCardCapabilities.verified(current.getClass().getClassLoader()))!=profile)return new State(false,false,"assistant ROM capabilities ambiguous or changed="+version);
            Map<?,?> switches=(Map<?,?>)XposedHelpers.getObjectField(current,profile.switchesField);
            boolean enabled=Boolean.TRUE.equals(switches.get("com.music.service"));
            List<?> entries=(List<?>)XposedHelpers.getObjectField(current,"a");
            Bundle data=null;int count,entryIndex=-1;
            synchronized(entries){
                count=entries.size();
                for(int i=0;i<Math.min(count,256);i++){
                    Object entry=entries.get(i);
                    if("unified.music:music_media".equals(XposedHelpers.getObjectField(entry,"a"))){
                        data=(Bundle)XposedHelpers.getObjectField(entry,profile.entryDataField);entryIndex=i;break;
                    }
                }
            }
            Bundle media=data==null?null:data.getBundle("media_data");
            boolean own=data!=null&&RearSystemCardPolicy.registered(data.getString("package_name"),data.getString("business"),data.getString("creator_package"),media==null?null:media.getString("packageName"),enabled);
            boolean expanded=XposedHelpers.getBooleanField(current,"f");
            int index=XposedHelpers.getIntField(current,"d");
            return new State(own,own&&expanded&&index==entryIndex,"assistant="+profile.managerClass+", musicSwitch="+enabled+", entries="+count
                +", ownMusic="+own+", expanded="+expanded+", index="+index
                +", retainedIndex="+XposedHelpers.getIntField(current,"e")
                +(data==null?", waiting=real system top-media music entry":"")+"; "+topMedia);
        }catch(Throwable error){return new State(false,false,"assistant inspection failed: "+RearHostHooks.describe(error));}
    }
    private RearAssistantMusic(){}
}
