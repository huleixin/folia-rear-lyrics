package io.github.huleixin.tingyu;

import android.app.Activity;
import android.content.Context;
import android.content.ContextWrapper;
import java.util.IdentityHashMap;

// android/app/src/main/java/io/github/huleixin/tingyu/RearCardContext.java
/** Use the actual card's display/theme context. An Activity is optional, never invented. */
final class RearCardContext {
    static Activity activity(Context context){
        IdentityHashMap<Context,Boolean> seen=new IdentityHashMap<>();
        for(int depth=0;context!=null&&depth<32&&seen.put(context,true)==null;depth++){
            if(context instanceof Activity)return (Activity)context;
            if(!(context instanceof ContextWrapper))return null;
            Context base=((ContextWrapper)context).getBaseContext();
            if(base==context)return null;
            context=base;
        }
        return null;
    }
    static boolean usable(Context context){
        if(context==null)return false;
        Activity owner=activity(context);
        return owner==null||(!owner.isFinishing()&&!owner.isDestroyed());
    }
    private RearCardContext(){}
}
