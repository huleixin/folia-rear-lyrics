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
/** Read-only adapter for structurally verified system APK profiles, not a card creator.
 * Field names are raw DEX names, not JADX's generated aliases. Unknown ROMs fail closed. */
final class RearSystemCardBinding {
    static final String PANEL="com.xiaomi.subscreencenter.SmartAssistantPanel";
    static volatile String evidence="system slot not inspected";
    static boolean unsupportedVersion;
    static Runnable changed;
    private final View panel;
    private final Object holder,widget;
    private final FrameLayout slot,content;
    private final RearSystemCardProfile profile;

    private RearSystemCardBinding(View panel,Object holder,Object widget,FrameLayout slot,FrameLayout content,RearSystemCardProfile profile){
        this.panel=panel;this.holder=holder;this.widget=widget;this.slot=slot;this.content=content;
        this.profile=profile;
    }

    static void install(ClassLoader loader){
        try{
            int installed=0;
            java.util.Set<java.lang.reflect.Method> observed=new java.util.HashSet<>();
            for(RearSystemCardProfile profile:RearSystemCardCapabilities.verified(loader)){
                try{
                    Class<?> type=XposedHelpers.findClass(profile.panelClass,loader);
                    java.lang.reflect.Method bind=type.getDeclaredMethod(profile.bindMethod,profile.parameters());
                    if(bind.getReturnType()!=void.class)continue;
                    if(!observed.add(bind))continue;
                    XposedBridge.hookMethod(bind,new XC_MethodHook(){
                        @Override protected void afterHookedMethod(MethodHookParam p){
                            if(!p.hasThrowable()&&changed!=null)changed.run();
                        }
                    });
                    installed++;
                }catch(NoSuchMethodException absent){ /* Other verified ROM profile. */ }
            }
            evidence="system slot binding observers="+installed+"; runtime profile and association pending";
        }catch(Throwable error){evidence="system slot observer unavailable: "+error.getClass().getSimpleName();}
    }

    /** Require the real panel -> holder -> widget -> content identity chain; never infer from size. */
    static RearSystemCardBinding resolve(FrameLayout content){
        return resolve(content,true);
    }
    static RearSystemCardBinding resolve(FrameLayout content,boolean requireVisible){
        try{
            android.content.pm.PackageInfo info=content.getContext().getPackageManager().getPackageInfo(RearHostContract.TARGET,0);
            long version=info.getLongVersionCode();
            RearSystemCardProfile profile=RearSystemCardProfile.choose(version,RearSystemCardCapabilities.verified(content.getClass().getClassLoader()));
            unsupportedVersion=profile==null;
            if(unsupportedVersion){evidence="unsupported or ambiguous system slot capabilities versionCode="+version+", versionName="+info.versionName+"; "+RearSystemCardCapabilities.evidence;return null;}
            ViewParent parent=content.getParent();View panel=null;
            for(int depth=0;parent instanceof View&&depth<16;depth++,parent=parent.getParent()){
                if(profile.panelClass.equals(parent.getClass().getName())){panel=(View)parent;break;}
            }
            if(panel==null){evidence="MAML has no verified native panel ancestor; "+parents(content);return null;}
            java.lang.reflect.Method bind=panel.getClass().getDeclaredMethod(profile.bindMethod,profile.parameters());
            if(bind.getReturnType()!=void.class)throw new IllegalStateException("profile binding signature mismatch");
            Object value=XposedHelpers.getObjectField(panel,profile.holdersField);
            if(!(value instanceof List)||((List<?>)value).size()!=3){evidence="system holder profile mismatch";return null;}
            List<?> holders=(List<?>)value;
            for(int i=0;i<3;i++){
                Object holder=holders.get(i),widget=XposedHelpers.getObjectField(holder,profile.holderWidgetField);
                if(widget==null||XposedHelpers.getObjectField(widget,"n")!=content)continue;
                if(!profile.matchesTypes(holder.getClass(),widget.getClass())){evidence="system holder/widget types do not match profile="+profile.version;return null;}
                Object slot=XposedHelpers.getObjectField(holder,profile.holderSlotField);
                if(!(slot instanceof FrameLayout)||content.getParent()!=slot||XposedHelpers.getObjectField(widget,"p")!=slot){evidence="system slot/content parent mismatch";return null;}
                RearSystemCardBinding result=new RearSystemCardBinding(panel,holder,widget,(FrameLayout)slot,content,profile);
                if(requireVisible?result.current():result.associated()){
                    evidence="system music entry verified; version="+version+"; profile="+profile.version+"; match="+(version==profile.version?"exact-and-structural":"structural")+"; panel="+profile.panelClass+"; bind="+profile.bindMethod+"; visibleRequired="+requireVisible+"; centerSlot="+(requireVisible?"1":"prepared-only")+"; selected=Tingyu; native parent and outline retained; "+parents(content);
                    return result;
                }
                return null;
            }
            evidence="MAML not bound to a system holder (binding pending or another scene)";
        }catch(Throwable error){evidence="system slot inspection failed: "+error.getClass().getSimpleName();}
        return null;
    }

    static final class State {
        final boolean associated,center,active,bound;
        State(boolean associated,boolean center,boolean active,boolean bound){this.associated=associated;this.center=center;this.active=active;this.bound=bound;}
        boolean current(){return associated&&center&&active;}
    }
    boolean current(){return snapshot().current();}
    /** Association never implies selection; read all navigation fields in one snapshot. */
    boolean associated(){return snapshot().associated;}
    State snapshot(){
        try{
            List<?> holders=(List<?>)XposedHelpers.getObjectField(panel,profile.holdersField);
            boolean listed=false;for(Object entry:holders)if(entry==holder)listed=true;
            boolean center=holders.size()==3&&holders.get(1)==holder;
            Bundle data=(Bundle)XposedHelpers.getObjectField(widget,"i");
            Bundle media=data==null?null:data.getBundle("media_data");
            String mediaPackage=media==null?null:media.getString("packageName");
            String pkg=data==null?null:data.getString("package_name"),business=data==null?null:data.getString("business"),creator=data==null?null:data.getString("creator_package");
            boolean active=XposedHelpers.getBooleanField(panel,profile.activeField);
            boolean bound=listed&&holders.size()==3&&profile.matchesTypes(holder.getClass(),widget.getClass())
                &&content.getParent()==slot&&XposedHelpers.getObjectField(holder,profile.holderWidgetField)==widget
                &&XposedHelpers.getObjectField(widget,"n")==content&&XposedHelpers.getObjectField(widget,"p")==slot;
            boolean associated=RearSystemCardPolicy.eligible(pkg,business,creator,mediaPackage,true,true,bound);
            if(!associated)evidence="system slot identity invalid: center="+center+", active="+active+", bound="+bound;
            return new State(associated,center,active,bound);
        }catch(Throwable error){evidence="system slot revalidation failed: "+error.getClass().getSimpleName();return new State(false,false,false,false);}
    }

    private String selectedPackage(){
        Object root=XposedHelpers.getObjectField(content,"mRoot");
        Object music=root==null?null:XposedHelpers.callMethod(root,"findElement","music_control");
        if(music==null||!"com.miui.maml.elements.MusicControlScreenElement".equals(music.getClass().getName()))return null;
        Object bridge=XposedHelpers.getObjectField(music,"mMusicController");
        Object controller=bridge==null?null:XposedHelpers.callMethod(bridge,"getMediaController");
        return controller instanceof android.media.session.MediaController?((android.media.session.MediaController)controller).getPackageName():null;
    }
    private static String label(String value,String expected){return value==null?"absent":expected.equals(value)?"expected":"other";}

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
