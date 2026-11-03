package io.github.huleixin.tingyu;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.WeakHashMap;

// android/app/src/main/java/io/github/huleixin/tingyu/RearSystemCardCapabilities.java
// Bounded read-only reflection once per host loader. No DEX scan, Activity/context retention or version range guesses.
final class RearSystemCardCapabilities {
    private static final Map<ClassLoader,List<RearSystemCardProfile>> cache=new WeakHashMap<>();
    static String evidence="not inspected";
    static synchronized List<RearSystemCardProfile> verified(ClassLoader loader){
        List<RearSystemCardProfile> previous=cache.get(loader);if(previous!=null)return previous;
        ArrayList<RearSystemCardProfile> result=new ArrayList<>();StringBuilder detail=new StringBuilder();
        for(RearSystemCardProfile p:RearSystemCardProfile.all()){
            try{validate(p,loader);result.add(p);detail.append(p.version).append(":verified; ");}
            catch(ReflectiveOperationException|LinkageError|IllegalStateException|SecurityException error){
                String message=String.valueOf(error.getMessage());if(message.length()>160)message=message.substring(0,160);
                detail.append(p.version).append(':').append(error.getClass().getSimpleName()).append('(').append(message).append("); ");
            }
        }
        evidence=detail.toString();List<RearSystemCardProfile> frozen=Collections.unmodifiableList(result);cache.put(loader,frozen);return frozen;
    }
    private static Class<?> type(String name,ClassLoader loader)throws ClassNotFoundException{return Class.forName(name,false,loader);}
    static void field(Class<?> owner,String name,Class<?> expected)throws ReflectiveOperationException{
        Field field=owner.getDeclaredField(name);
        if(!expected.isAssignableFrom(field.getType())||Modifier.isStatic(field.getModifiers()))throw new IllegalStateException(owner.getName()+'.'+name+" field type/static mismatch");
    }
    static Method method(Class<?> owner,String name,Class<?> result,Class<?>...args)throws ReflectiveOperationException{
        Method m=owner.getDeclaredMethod(name,args);if(!result.isAssignableFrom(m.getReturnType()))throw new IllegalStateException(owner.getName()+'.'+name+" return type mismatch");return m;
    }
    static void validate(RearSystemCardProfile p,ClassLoader loader)throws ReflectiveOperationException{
        Class<?> bundle=type("android.os.Bundle",loader),frame=type("android.widget.FrameLayout",loader);
        Class<?> view=type("android.view.View",loader),group=type("android.view.ViewGroup",loader);
        Class<?> panel=type(p.panelClass,loader),holder=type(p.holderClass,loader),widget=type(p.widgetClass,loader);
        method(panel,p.bindMethod,void.class,p.parameters());field(panel,p.holdersField,List.class);field(panel,p.activeField,boolean.class);
        field(holder,p.holderSlotField,frame);field(holder,p.holderWidgetField,widget);
        field(widget,"n",view);field(widget,"p",group);field(widget,"i",bundle);
        Class<?> manager=type(p.managerClass,loader),entry=type(p.entryClass,loader);
        method(manager,p.updateMethod,void.class,String.class,bundle);method(manager,p.collapseMethod,void.class,boolean.class);
        method(manager,p.expandMethod,void.class);method(manager,p.removeMethod,void.class);
        field(manager,"a",List.class);field(manager,p.switchesField,Map.class);field(manager,"d",int.class);field(manager,"e",int.class);field(manager,"f",boolean.class);
        field(entry,"a",String.class);field(entry,p.entryDataField,bundle);
        Class<?> gate=type(p.musicGate,loader);
        for(Method m:new Method[]{method(gate,"a",String.class,String.class),method(gate,"b",Set.class),method(gate,"c",boolean.class,String.class)})
            if(!Modifier.isStatic(m.getModifiers()))throw new IllegalStateException("music gate must be static");
        method(type(p.serviceClass,loader),p.serviceMethod,void.class,String.class,bundle);
    }
    private RearSystemCardCapabilities(){}
}
