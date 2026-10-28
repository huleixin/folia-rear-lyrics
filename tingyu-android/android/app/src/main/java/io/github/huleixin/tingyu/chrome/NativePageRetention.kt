package io.github.huleixin.tingyu.chrome

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePageRetention.kt
// Memory-only presentations bridge adapter lifetimes. Retired sessions cannot handle input;
// settings documents are never written to disk. Loading/disabled packets never replace UI.
internal class NativePageRetention(private val limit:Int=12) {
    private val frames=LinkedHashMap<String,NativePage>()
    fun update(page:NativePage):Boolean{
        if(!page.enabled||page.key.startsWith("settings:loading:")||page.key.startsWith("settings:document:")&&page.document==null)return false
        frames.remove(page.key);frames[page.key]=page
        while(frames.size>limit)frames.remove(frames.keys.first())
        return true
    }
    fun find(route:String,selected:Int,target:String):NativePage?=frames.values.lastOrNull{page->
        page.id==route&&(route!="home"||page.key.startsWith(if(selected==1)"library:"else"home:"))&&
            (target.isEmpty()||if(target.endsWith(":"))page.key.startsWith(target)else page.key==target)
    }
    fun clear(){frames.clear()}
}
internal fun pageBelongsToRoute(page:NativePage,route:String,selected:Int,target:String,packetNavigation:String,navigation:String):Boolean =
    packetNavigation==navigation&&page.id==route&&
        (route!="home"||page.key.startsWith(if(selected==1)"library:"else"home:"))&&
        (route!="collection"||target.isEmpty()||page.key==target)&&
        (route!="settings"||target!="settings:index"||page.key in setOf("settings:index","settings:document:rear-guide"))&&
        (route!="settings"||!target.startsWith("settings:document:")||page.key.startsWith(target))
internal class NativeRouteMotion {
    private val trail=mutableListOf<String>()
    fun visit(key:String):Boolean {
        if(trail.lastOrNull()==key)return false
        val previous=trail.indexOfLast{it==key};val back=previous>=0
        if(back)while(trail.size>previous+1)trail.removeAt(trail.lastIndex)
        else {trail.add(key);if(trail.size>24)trail.removeAt(0)}
        return back
    }
}
