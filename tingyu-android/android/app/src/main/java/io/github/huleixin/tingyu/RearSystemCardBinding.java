package io.github.huleixin.tingyu;

import android.os.Bundle;
import android.view.View;
import android.view.ViewParent;
import android.widget.FrameLayout;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;
import java.util.List;

// android/app/src/main/java/io/github/huleixin/tingyu/RearSystemCardBinding.java
/** Read-only adapter for the supplied RELEASE-1.0.2601052145 host, not a card creator.
 * Field names are raw DEX names, not JADX's generated aliases. Unknown ROMs fail closed. */
final class RearSystemCardBinding {
    static final String PANEL="com.xiaomi.subscreencenter.SmartAssistantPanel";
    static volatile String evidence="system slot not inspected";
    static boolean unsupportedVersion;
    static Runnable changed;
    private final View panel;
    private final Object holder,widget;
    private final FrameLayout slot,content;

    private RearSystemCardBinding(View panel,Object holder,Object widget,FrameLayout slot,FrameLayout content){
        this.panel=panel;this.holder=holder;this.widget=widget;this.slot=slot;this.content=content;
    }

    static void install(ClassLoader loader){
        try{
            Class<?> type=XposedHelpers.findClass(PANEL,loader);
            java.lang.reflect.Method bind=type.getDeclaredMethod("n",int.class,int.class,int.class,int.class,Runnable.class);
            if(bind.getReturnType()!=void.class)throw new IllegalStateException("slot bind signature changed");
            XposedBridge.hookMethod(bind,new XC_MethodHook(){
                @Override protected void afterHookedMethod(MethodHookParam p){
                    // n() assigns holder.b only AFTER z() has attached the MamlView.
                    if(!p.hasThrowable()&&changed!=null)changed.run();
                }
            });
            evidence="system slot binding observer installed; runtime association pending";
        }catch(Throwable error){evidence="system slot observer unavailable: "+error.getClass().getSimpleName();}
    }

    /** Require the real panel -> holder -> widget -> content identity chain; never infer from size. */
    static RearSystemCardBinding resolve(FrameLayout content){
        try{
            android.content.pm.PackageInfo info=content.getContext().getPackageManager().getPackageInfo(RearHostContract.TARGET,0);
            long version=info.getLongVersionCode();
            unsupportedVersion=version!=26010521L;
            if(unsupportedVersion){evidence="unsupported system slot profile versionCode="+version+", versionName="+info.versionName+", supportedVersionCode=26010521; require currently installed host APK, not factory APK";return null;}
            ViewParent parent=content.getParent();View panel=null;
            for(int depth=0;parent instanceof View&&depth<16;depth++,parent=parent.getParent()){
                if(PANEL.equals(parent.getClass().getName())){panel=(View)parent;break;}
            }
            if(panel==null){evidence="MAML has no SmartAssistantPanel ancestor";return null;}
            Object value=XposedHelpers.getObjectField(panel,"i");
            if(!(value instanceof List)||((List<?>)value).size()!=3){evidence="system holder profile mismatch";return null;}
            List<?> holders=(List<?>)value;
            for(int i=0;i<3;i++){
                Object holder=holders.get(i),widget=XposedHelpers.getObjectField(holder,"b");
                if(widget==null||XposedHelpers.getObjectField(widget,"n")!=content)continue;
                Object slot=XposedHelpers.getObjectField(holder,"a");
                if(!(slot instanceof FrameLayout)||content.getParent()!=slot||XposedHelpers.getObjectField(widget,"p")!=slot){evidence="system slot/content parent mismatch";return null;}
                RearSystemCardBinding result=new RearSystemCardBinding(panel,holder,widget,(FrameLayout)slot,content);
                if(result.current()){
                    evidence="system music entry verified; centerSlot=1; creator=Tingyu; native parent and outline retained; "+parents(content);
                    return result;
                }
                return null;
            }
            evidence="MAML not bound to a system holder (binding pending or another scene)";
        }catch(Throwable error){evidence="system slot inspection failed: "+error.getClass().getSimpleName();}
        return null;
    }

    boolean current(){
        try{
            List<?> holders=(List<?>)XposedHelpers.getObjectField(panel,"i");
            boolean center=holders.size()==3&&holders.get(1)==holder;
            Bundle data=(Bundle)XposedHelpers.getObjectField(widget,"i");
            boolean valid=RearSystemCardPolicy.eligible(data==null?null:data.getString("package_name"),
                data==null?null:data.getString("business"),data==null?null:data.getString("creator_package"),
                center,XposedHelpers.getBooleanField(panel,"x"),
                content.getParent()==slot&&XposedHelpers.getObjectField(holder,"b")==widget
                    &&XposedHelpers.getObjectField(widget,"n")==content&&XposedHelpers.getObjectField(widget,"p")==slot);
            if(!valid)evidence="system slot not eligible: center="+center+", panelActive="+XposedHelpers.getBooleanField(panel,"x")+"; require own unified.music/music entry with unchanged content";
            return valid;
        }catch(Throwable error){evidence="system slot revalidation failed: "+error.getClass().getSimpleName();return false;}
    }

    /** Bounded structural evidence, excluding text, notification payloads and other players. */
    private static String parents(View view){
        StringBuilder out=new StringBuilder("parents=");
        for(int depth=0;view!=null&&depth<8;depth++){
            if(depth>0)out.append(" -> ");
            out.append(view.getClass().getName()).append('[').append(view.getWidth()).append('x').append(view.getHeight())
                .append(",alpha=").append(view.getAlpha()).append(",clipOutline=").append(view.getClipToOutline()).append(']');
            view=view.getParent() instanceof View?(View)view.getParent():null;
        }
        return out.toString();
    }
}
