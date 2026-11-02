package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearSystemCardProfile.java
/** Versioned mappings verified against both user-provided system APKs, never version ranges. */
final class RearSystemCardProfile {
    final long version;
    final String bindMethod,holderClass,widgetClass;
    final String panelClass,holdersField,activeField,holderWidgetField,holderSlotField;
    final String musicGate,managerClass,entryDataField;
    private RearSystemCardProfile(long version,String method,String holder,String widget){
        this.version=version;bindMethod=method;holderClass=holder;widgetClass=widget;
        panelClass=RearSystemCardBinding.PANEL;holdersField="i";activeField="x";holderWidgetField="b";holderSlotField="a";
        musicGate=version==26010521L?"n2.a":"A2.a";
        managerClass=version==26010521L?"Z1.V":"k2.V";
        entryDataField=version==26010521L?"k":"l";
    }
    static final RearSystemCardProfile JANUARY=new RearSystemCardProfile(26010521L,"n","Z1.s0","r2.r");
    static final RearSystemCardProfile SEPTEMBER=new RearSystemCardProfile(426091419L,"y","k2.o0","E2.w");
    static RearSystemCardProfile forPanel(long version,String panel){
        // MainPanel is the watchface/theme canvas, not 动态通知与便利贴.
        return RearSystemCardBinding.PANEL.equals(panel)?forVersion(version):null;
    }
    Class<?>[] parameters(){return new Class<?>[]{int.class,int.class,int.class,int.class,Runnable.class};}
    static RearSystemCardProfile forVersion(long version){
        if(version==JANUARY.version)return JANUARY;
        if(version==SEPTEMBER.version)return SEPTEMBER;
        return null;
    }
    boolean matchesTypes(Class<?> holder,Class<?> widget){
        if(!holderClass.equals(holder.getName()))return false;
        for(Class<?> type=widget;type!=null;type=type.getSuperclass())if(widgetClass.equals(type.getName()))return true;
        return false;
    }
}
