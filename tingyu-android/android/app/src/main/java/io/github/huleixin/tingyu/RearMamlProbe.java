package io.github.huleixin.tingyu;

import android.media.session.MediaController;
import android.view.View;
import android.view.ViewGroup;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.WeakHashMap;

// android/app/src/main/java/io/github/huleixin/tingyu/RearMamlProbe.java
/** Discovers real music_control instances; ownership and mutations live in RearNativeCardOwner. */
final class RearMamlProbe {
    private static final String MAML="com.miui.maml.component.MamlView";
    private static final WeakHashMap<View,Boolean> candidates=new WeakHashMap<>();
    private static String status="MAML probe not installed";
    private static Class<?> maml;
    static java.util.function.Consumer<View> changed;
    static java.util.function.BiConsumer<View,Boolean> paused;
    private static int observed, scans;
    private static volatile String snapshot="MAML runtime not inspected";
    private RearMamlProbe(){}

    static void install(ClassLoader loader){
        try{
            maml=XposedHelpers.findClass(MAML,loader);
            XposedHelpers.findClass("com.miui.maml.ScreenElementRoot",loader);
            XposedHelpers.findClass("com.miui.maml.elements.MusicControlScreenElement",loader);
            int count=0;
            for(String name:new String[]{"initMamlview","onAttachedToWindow","onResume"}){
                count+=XposedBridge.hookAllMethods(maml,name,new XC_MethodHook(){
                    @Override protected void afterHookedMethod(MethodHookParam p){
                        if(!p.hasThrowable()&&p.thisObject instanceof View){View v=(View)p.thisObject;observe(v);if(changed!=null)changed.accept(v);}
                    }
                }).size();
            }
            for(String event:new String[]{"onPause","onResume","onDetachedFromWindow"})XposedBridge.hookAllMethods(maml,event,new XC_MethodHook(){
                @Override protected void afterHookedMethod(MethodHookParam p){if(p.thisObject instanceof View&&paused!=null)paused.accept((View)p.thisObject,!"onResume".equals(event));}
            });
            status="MAML classes loaded; lifecycleHooks="+count+"; runtime music instance not verified";
        }catch(Throwable error){status="MAML capability unavailable: "+error.getClass().getSimpleName();}
        XposedBridge.log("Tingyu MAML probe: "+status);
    }
    private static void observe(View view){
        if(view.getDisplay()==null||view.getDisplay().getDisplayId()<=0)return;
        if(!candidates.containsKey(view))observed++;
        candidates.put(view,Boolean.TRUE);
    }
    /** Bounded traversal catches MAML instances already attached before module callbacks. */
    static String inspect(View decor){
        if(decor!=null&&scans++<8){
            ArrayList<View> queue=new ArrayList<>();queue.add(decor);
            for(int i=0;i<queue.size()&&i<512;i++){
                View v=queue.get(i);if(maml!=null&&maml.isInstance(v))observe(v);
                if(v instanceof ViewGroup){ViewGroup g=(ViewGroup)v;for(int j=0;j<g.getChildCount()&&queue.size()<512;j++)queue.add(g.getChildAt(j));}
            }
        }
        int attached=0,musicCount=0,own=0,other=0,unknown=0;String reason="no MAML music_control instance observed";
        for(View v:new ArrayList<>(candidates.keySet())){
            if(!v.isAttachedToWindow()||v.getDisplay()==null||v.getDisplay().getDisplayId()<=0)continue;
            attached++;
            try{
                Object root=XposedHelpers.getObjectField(v,"mRoot");
                if(root==null){reason="MAML root not initialized";continue;}
                Object music=XposedHelpers.callMethod(root,"findElement","music_control");
                if(music==null){reason="MAML exists but music_control absent";continue;}
                if(!music.getClass().getName().equals("com.miui.maml.elements.MusicControlScreenElement")){reason="music_control has unexpected type";continue;}
                musicCount++;
                Object bridge=XposedHelpers.getObjectField(music,"mMusicController");
                Object value=bridge==null?null:XposedHelpers.callMethod(bridge,"getMediaController");
                String pkg=value instanceof MediaController?((MediaController)value).getPackageName():null;
                if(RearNativeCardPolicy.ownMedia(pkg))own++;else if(pkg==null)unknown++;else other++;
                String missing=missingRestore(root);
                reason=RearNativeCardPolicy.blocker(true,pkg,missing.isEmpty());
                reason+="; display="+v.getDisplay().getDisplayId()+", size="+v.getWidth()+"x"+v.getHeight()+", shown="+v.isShown();
                if(!missing.isEmpty())reason+="; missing="+missing;
                if(own>0)break;
            }catch(Throwable error){reason="MAML inspection failed: "+error.getClass().getSimpleName();}
        }
        snapshot=status+"; observed="+observed+", attached="+attached+", music="+musicCount+", own="+own+", other="+other+", unknown="+unknown+"; "+reason;
        return snapshot;
    }
    static RearNativeCardOwner ownCard(int expectedDisplay){
        for(View v:new ArrayList<>(candidates.keySet()))try{
            if(!(v instanceof android.widget.FrameLayout)||!v.isAttachedToWindow()||!v.isShown()||v.getDisplay()==null||v.getDisplay().getDisplayId()<=0)continue;
            Object root=XposedHelpers.getObjectField(v,"mRoot");
            Object music=root==null?null:XposedHelpers.callMethod(root,"findElement","music_control");
            if(music==null||!music.getClass().getName().equals("com.miui.maml.elements.MusicControlScreenElement")||!missingRestore(root).isEmpty())continue;
            RearNativeCardOwner candidate=new RearNativeCardOwner((android.widget.FrameLayout)v,root,music);
            MediaController selected=candidate.selected();
            if(selected!=null&&RearNativeCardPolicy.mayMount(selected.getPackageName(),v.isAttachedToWindow(),v.isShown(),v.getDisplay().getDisplayId(),expectedDisplay,v.getWidth(),v.getHeight()))return candidate;
        }catch(Throwable ignored){}
        return null;
    }
    static String inspectLatest(){return status+"; "+snapshot;}
    private static String missingRestore(Object root){
        StringBuilder out=new StringBuilder();
        for(String name:new String[]{"selfPause","detachFromVsync","attachToVsync","selfResume","requestUpdate"}){
            boolean found=false;
            for(Class<?> c=root.getClass();c!=null;c=c.getSuperclass())for(Method m:c.getDeclaredMethods())if(m.getName().equals(name)&&m.getParameterCount()==0)found=true;
            if(!found)out.append(name).append(',');
        }
        return out.toString();
    }
}
