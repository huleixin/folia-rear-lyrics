package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearSystemCardProfile.java
/** Versioned mappings verified against both user-provided system APKs, never version ranges. */
final class RearSystemCardProfile {
    final long version;
    final String bindMethod,holderClass,widgetClass;
    final String panelClass,holdersField,activeField,holderWidgetField,holderSlotField;
    final boolean mainPanel;
    private RearSystemCardProfile(long version,String method,String holder,String widget){
        this.version=version;bindMethod=method;holderClass=holder;widgetClass=widget;
        panelClass=RearSystemCardBinding.PANEL;holdersField="i";activeField="x";holderWidgetField="b";holderSlotField="a";mainPanel=false;
    }
    private RearSystemCardProfile(long version,String method,String holder,String widget,String holders,String active){
        this.version=version;bindMethod=method;holderClass=holder;widgetClass=widget;
        panelClass="com.xiaomi.subscreencenter.MainPanel";holdersField=holders;activeField=active;holderWidgetField="e";holderSlotField="b";mainPanel=true;
    }
    static final RearSystemCardProfile JANUARY=new RearSystemCardProfile(26010521L,"n","Z1.s0","r2.r");
    static final RearSystemCardProfile SEPTEMBER=new RearSystemCardProfile(426091419L,"y","k2.o0","E2.w");
    static final RearSystemCardProfile JANUARY_MAIN=new RearSystemCardProfile(26010521L,"q","Z1.x","r2.r","j","p");
    static final RearSystemCardProfile SEPTEMBER_MAIN=new RearSystemCardProfile(426091419L,"t","k2.y","E2.w","k","q");
    static RearSystemCardProfile forPanel(long version,String panel){
        if("com.xiaomi.subscreencenter.MainPanel".equals(panel)){
            if(version==JANUARY_MAIN.version)return JANUARY_MAIN;
            if(version==SEPTEMBER_MAIN.version)return SEPTEMBER_MAIN;
            return null;
        }
        return RearSystemCardBinding.PANEL.equals(panel)?forVersion(version):null;
    }
    Class<?>[] parameters(){return new Class<?>[]{int.class,int.class,mainPanel?boolean.class:int.class,int.class,Runnable.class};}
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
