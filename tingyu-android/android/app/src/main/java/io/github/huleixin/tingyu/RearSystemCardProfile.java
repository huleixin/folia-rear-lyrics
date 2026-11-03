package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearSystemCardProfile.java
/** APK-verified mappings. Version is a preference; a complete structural match is mandatory. */
final class RearSystemCardProfile {
    final long version;
    final String bindMethod,holderClass,widgetClass;
    final String panelClass,holdersField,activeField,holderWidgetField,holderSlotField;
    final String musicGate,managerClass,entryClass,entryDataField,serviceClass,serviceMethod;
    final String updateMethod,collapseMethod,expandMethod,removeMethod,switchesField;
    private RearSystemCardProfile(long version,String method,String holder,String widget,String gate,String manager,String entry,String service,String incoming,
            String update,String collapse,String expand,String remove,String switches,String entryData){
        this.version=version;bindMethod=method;holderClass=holder;widgetClass=widget;
        panelClass=RearSystemCardBinding.PANEL;holdersField="i";activeField="x";holderWidgetField="b";holderSlotField="a";
        musicGate=gate;managerClass=manager;entryClass=entry;serviceClass=service;serviceMethod=incoming;
        updateMethod=update;collapseMethod=collapse;expandMethod=expand;removeMethod=remove;switchesField=switches;entryDataField=entryData;
    }
    static final RearSystemCardProfile JANUARY=new RearSystemCardProfile(26010521L,"n","Z1.s0","r2.r","n2.a","Z1.V","Z1.U","Y1.b","a","f","j","i","g","q","k");
    static final RearSystemCardProfile SEPTEMBER=new RearSystemCardProfile(426091419L,"y","k2.o0","E2.w","A2.a","k2.V","k2.U","F2.g","a","f","j","i","g","q","l");
    static final RearSystemCardProfile SEPTEMBER_23=new RearSystemCardProfile(426092316L,"y","U1.O0","q2.v","m2.a","U1.r0","U1.q0","T1.c","b","g","k","j","h","r","l");
    static RearSystemCardProfile[] all(){return new RearSystemCardProfile[]{JANUARY,SEPTEMBER,SEPTEMBER_23};}
    static RearSystemCardProfile forPanel(long version,String panel){
        // MainPanel is the watchface/theme canvas, not 动态通知与便利贴.
        return RearSystemCardBinding.PANEL.equals(panel)?forVersion(version):null;
    }
    Class<?>[] parameters(){return new Class<?>[]{int.class,int.class,int.class,int.class,Runnable.class};}
    static RearSystemCardProfile forVersion(long version){
        if(version==JANUARY.version)return JANUARY;
        if(version==SEPTEMBER.version)return SEPTEMBER;
        if(version==SEPTEMBER_23.version)return SEPTEMBER_23;
        return null;
    }
    /** No nearest-version guess. Unknown versions must have one unambiguous verified fingerprint. */
    static RearSystemCardProfile choose(long version,java.util.List<RearSystemCardProfile> verified){
        RearSystemCardProfile exact=forVersion(version);
        if(exact!=null&&verified.contains(exact))return exact;
        return verified.size()==1?verified.get(0):null;
    }
    boolean matchesTypes(Class<?> holder,Class<?> widget){
        if(!holderClass.equals(holder.getName()))return false;
        for(Class<?> type=widget;type!=null;type=type.getSuperclass())if(widgetClass.equals(type.getName()))return true;
        return false;
    }
}
