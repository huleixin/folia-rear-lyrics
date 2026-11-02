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
/** Read-only adapter for the two supplied system APK profiles, not a card creator.
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
            for(RearSystemCardProfile profile:new RearSystemCardProfile[]{
                RearSystemCardProfile.JANUARY,RearSystemCardProfile.SEPTEMBER}){
                try{
                    Class<?> type=XposedHelpers.findClass(profile.panelClass,loader);
                    java.lang.reflect.Method bind=type.getDeclaredMethod(profile.bindMethod,profile.parameters());
                    if(bind.getReturnType()!=void.class)continue;
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
        try{
            android.content.pm.PackageInfo info=content.getContext().getPackageManager().getPackageInfo(RearHostContract.TARGET,0);
            long version=info.getLongVersionCode();
            RearSystemCardProfile profile=RearSystemCardProfile.forVersion(version);
            unsupportedVersion=profile==null;
            if(unsupportedVersion){evidence="unsupported system slot profile versionCode="+version+", versionName="+info.versionName+", supportedVersionCodes=26010521/426091419; require installed host APK";return null;}
            ViewParent parent=content.getParent();View panel=null;
            for(int depth=0;parent instanceof View&&depth<16;depth++,parent=parent.getParent()){
                if(RearSystemCardProfile.forPanel(version,parent.getClass().getName())!=null){panel=(View)parent;break;}
            }
            if(panel==null){evidence="MAML has no verified native panel ancestor; "+parents(content);return null;}
            profile=RearSystemCardProfile.forPanel(version,panel.getClass().getName());
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
                if(result.current()){
                    evidence="system music entry verified; profile="+profile.version+"; panel="+profile.panelClass+"; bind="+profile.bindMethod+"; centerSlot=1; selected=Tingyu; native parent and outline retained; "+parents(content);
                    return result;
                }
                return null;
            }
            evidence="MAML not bound to a system holder (binding pending or another scene)";
        }catch(Throwable error){evidence="system slot inspection failed: "+error.getClass().getSimpleName();}
        return null;
    }

    boolean current(){return associated(true);}
    /** Collapsing changes navigation, not the underlying business/holder identity. */
    boolean associated(){return associated(false);}
    private boolean associated(boolean requireVisible){
        try{
            List<?> holders=(List<?>)XposedHelpers.getObjectField(panel,profile.holdersField);
            boolean center=holders.size()==3&&holders.get(1)==holder&&profile.matchesTypes(holder.getClass(),widget.getClass());
            Bundle data=(Bundle)XposedHelpers.getObjectField(widget,"i");
            Bundle media=data==null?null:data.getBundle("media_data");
            String mediaPackage=media==null?null:media.getString("packageName");
            String pkg=data==null?null:data.getString("package_name"),business=data==null?null:data.getString("business"),creator=data==null?null:data.getString("creator_package");
            boolean active=XposedHelpers.getBooleanField(panel,profile.activeField);
            boolean bound=content.getParent()==slot&&XposedHelpers.getObjectField(holder,profile.holderWidgetField)==widget
                    &&XposedHelpers.getObjectField(widget,"n")==content&&XposedHelpers.getObjectField(widget,"p")==slot;
            boolean valid=RearSystemCardPolicy.eligible(pkg,business,creator,mediaPackage,!requireVisible||center,!requireVisible||active,bound);
            if(!valid)evidence="system slot not eligible: panel="+profile.panelClass+", center="+center+", active="+active+", bound="+bound
                +", notificationPackage="+label(pkg,"unified.music")+", business="+label(business,"music")+", creator="+label(creator,RearHostContract.APP)
                +", mediaPackage="+label(mediaPackage,RearHostContract.APP);
            return valid;
        }catch(Throwable error){evidence="system slot revalidation failed: "+error.getClass().getSimpleName();return false;}
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
