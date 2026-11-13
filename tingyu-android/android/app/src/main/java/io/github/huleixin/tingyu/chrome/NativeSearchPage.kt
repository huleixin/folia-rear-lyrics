package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSearchPage.kt
// Full-width search field, wrapping history chips and numbered two-column hot list.
@OptIn(ExperimentalLayoutApi::class)
@Composable internal fun NativeSearchPage(page:NativePage,modifier:Modifier,action:PageAction,pane:Boolean=false,headerOnly:Boolean=false){
    if(LocalPadWindow.current.expanded&&!pane&&!headerOnly&&!page.key.startsWith("search:menu:")){PadSearchPage(page,modifier,action);return}
    val bottomClearance=with(LocalDensity.current){LocalNativePageBottomPx.current.toDp()}
    val reduced = LocalLiquidReduced.current
    val padGrid=LocalPadWindow.current.expanded
    val menu=page.key.startsWith("search:menu:")
    val caches=page.sections.filter{it.layout=="rows"}.associate{it.id to key(it.id){rememberNativeRows(page.key,it)}}
    // 沉浸式毛玻璃顶栏（TopGlassBar）：搜索结果全幅滚动进入固定搜索区玻璃后方；
    // 输入框/内联音源/分类标签是玻璃之上的清晰层，输入法弹出时列表随 imePadding 避让。
    val colors=page.surfaceColors()
    val hasTabs=page.sections.any{it.id=="tabs"}
    val glass=rememberTyTopGlassState(estimateHeaderBottomDp=if(pane)0f else page.safeTop+if(menu)74f else 56f+if(hasTabs)54f else 0f)
    Box(modifier){
        TyTopGlassContentLayer(glass,colors,ambientImage=null,ambientViewportHeight=null,modifier=Modifier.fillMaxSize(),paintBackground=!pane&&!headerOnly){
        val list=rememberLazyListState()
        LazyColumn(Modifier.fillMaxSize().imePadding(),state=list,contentPadding=PaddingValues(start=14.dp,end=14.dp,top=glass.contentTop+if(menu)0.dp else 16.dp,bottom=maxOf((page.safeBottom+18).dp,bottomClearance))){
            page.sections.filter{it.id !in setOf("query","sources","tabs")}.forEach{section->
                val history=section.id=="history";val hot=section.id=="hot"
                if(section.title.isNotBlank())item(key="${section.id}:heading"){
                    Row(Modifier.fillMaxWidth().padding(top=6.dp,bottom=10.dp).heightIn(min=28.dp),verticalAlignment=Alignment.CenterVertically){
                        if(hot)PageIcon("flame",PageMuted,Modifier.padding(end=8.dp).size(19.dp))
                        Text(section.title,color=PageInk,fontSize=16.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.weight(1f))
                        if(history)ChromeButton("清空历史",size=40.dp,onClick={action(section.more,"",0.0)}){PageIcon("trash2",PageMuted,Modifier.size(17.dp))}
                        if(hot&&section.more.isNotBlank()){
                            val rotation by animateFloatAsState(if(section.expanded)180f else 0f,tween(if(reduced)0 else 220),label="hot-toggle")
                            Row(Modifier.heightIn(min=40.dp).chromeClickable(role=Role.Button,corner=10.dp){action(section.more,"",0.0)}
                                .semantics{stateDescription=if(section.expanded)"已展开" else "已收起"}.padding(horizontal=6.dp),
                                verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(4.dp)){
                                Text(section.moreLabel,color=PageMuted,fontSize=12.sp)
                                PageIcon("chevron-down",PageMuted,Modifier.size(14.dp).rotate(rotation))
                            }
                        }
                    }
                }
                when {
                    hot -> item(key=section.id){
                        Column(Modifier.animateContentSize(tween(if(reduced)0 else 220))){
                            section.items.chunked(2).forEachIndexed{row,items->Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(12.dp)){
                                items.forEachIndexed{column,item->Row(Modifier.weight(1f).height(44.dp).chromeClickable(corner=10.dp){action(item.action,"",0.0)},verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)){
                                    val rank=row*2+column+1
                                    Text(rank.toString(),color=if(rank<=3)PageAccent else PageMuted,fontSize=12.sp,modifier=Modifier.width(16.dp))
                                    Text(item.title,color=if(rank<=3)PageAccent else PageInk,fontSize=13.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
                                }}
                                if(items.size==1)Spacer(Modifier.weight(1f))
                            }}
                        }
                    }
                    history||section.layout=="chips"&&section.id=="discovery" -> item(key=section.id){
                        FlowRow(Modifier.fillMaxWidth().animateContentSize(tween(if(reduced)0 else 180)),horizontalArrangement=Arrangement.spacedBy(8.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
                            section.items.forEach{item->
                                Row(Modifier.height(38.dp).clip(RoundedCornerShape(999.dp)).background(LocalInterfacePalette.current.subtle).border(1.dp,LocalInterfacePalette.current.searchBorder,RoundedCornerShape(999.dp)),verticalAlignment=Alignment.CenterVertically){
                                    Text(item.title,color=PageInk,fontSize=13.sp,modifier=Modifier.chromeClickable(corner=999.dp){action(item.action,"",0.0)}.padding(horizontal=12.dp))
                                    if(item.secondary.isNotBlank())Box(Modifier.width(30.dp).fillMaxHeight().chromeClickable(corner=10.dp){action(item.secondary,"",0.0)},contentAlignment=Alignment.Center){PageIcon("x",PageMuted,Modifier.size(13.dp))}
                                }
                            }
                        }
                        Spacer(Modifier.height(20.dp));Box(Modifier.fillMaxWidth().height(1.dp).background(LocalInterfacePalette.current.searchBorder));Spacer(Modifier.height(12.dp))
                    }
                    section.layout=="rows"&&padGrid&&section.id in setOf("artist","album","playlist") -> padSearchGrid(page,section,caches.getValue(section.id),action)
                    section.layout=="rows" -> pagedNativeRows(page,section,caches.getValue(section.id),56,action)
                    section.layout=="chips" -> item(key=section.id){Column{section.items.forEach{item->
                        Row(Modifier.fillMaxWidth().height(52.dp).chromeClickable(corner=12.dp){action(item.action,"",0.0)},verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)){
                            PageIcon("search",PageMuted,Modifier.size(17.dp));Text(item.title,color=PageInk,fontSize=14.sp)
                        }
                    }}}
                    section.text.isNotBlank() -> item(key=section.id){Text(section.text,color=PageMuted,fontSize=13.sp,modifier=Modifier.padding(vertical=12.dp))}
                }
                // Keep pagination after all logical rows, including rows fetched through the 100-item window.
                if(section.busy)item(key="${section.id}:busy"){
                    Box(Modifier.fillMaxWidth().heightIn(min=48.dp),contentAlignment=Alignment.Center){
                        CircularProgressIndicator(Modifier.size(20.dp),color=PageAccent,strokeWidth=2.dp)
                    }
                }
                if(!hot&&!history&&!section.busy&&(section.more.isNotBlank()||section.layout=="rows"&&section.text.isNotBlank()))item(key="${section.id}:more"){
                    Row(Modifier.fillMaxWidth().heightIn(min=48.dp)
                        .then(if(section.more.isNotBlank())Modifier.chromeClickable(role=Role.Button,corner=10.dp){action(section.more,"",0.0)}else Modifier)
                        .padding(horizontal=8.dp,vertical=10.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(6.dp)){
                        if(section.layout=="rows"&&section.text.isNotBlank())Text(section.text,color=PageMuted,fontSize=12.sp,modifier=Modifier.weight(1f))
                        else Spacer(Modifier.weight(1f))
                        if(section.more.isNotBlank()){
                            Text(section.moreLabel,color=PageAccent,fontSize=13.sp,fontWeight=FontWeight.Medium)
                            if(section.text.isBlank())PageIcon(if(section.more=="allSongs"||section.more.startsWith("all:"))"chevron-right"else"chevron-down",PageAccent,Modifier.size(15.dp))
                        }
                        if(section.text.isBlank())Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
        }
        if(!pane&&!headerOnly)TyTopGlassSurface(glass,colors)
        // 顶栏内容（清晰层）：搜索框内含音源入口；实际测量同时覆盖分类标签的增减。
        if(!pane)TyTopGlassForeground {
            Column(Modifier.fillMaxWidth().padding(top=page.safeTop.dp)
                .onGloballyPositioned{glass.reportHeader(it.positionInWindow().y,it.size.height)}){
                if(menu)PageHeading(page,Modifier.padding(14.dp),action=action)
                else Column(Modifier.padding(start=14.dp,end=14.dp,top=10.dp)){
                    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
                        page.sections.firstOrNull{it.id=="query"}?.let{section->BoxWithConstraints(Modifier.weight(1f)){
                            val compact=maxWidth<280.dp||LocalDensity.current.fontScale>1.3f
                            val sources=page.sections.firstOrNull{it.id=="sources"}
                            NativePageInput(section,action,search=true,trailing={if(sources!=null)SearchSourceMenu(sources,compact,action)})
                        }}
                    }
                    page.sections.firstOrNull{it.id=="tabs"}?.let{section->
                        NativeSourceTabs(section, Modifier.padding(top=8.dp), underline=true, action=action)
                    }
                }
            }
        }
    }
}

/** A single compact dropdown; title and chevron share one touch target, including icon-only layouts. */
@Composable internal fun SearchSourceMenu(section:NativePageSection,compact:Boolean,action:PageAction){
    var open by remember{mutableStateOf(false)}
    val selected=section.items.firstOrNull{it.selected}
    Box{
        Row(Modifier.height(40.dp).widthIn(min=40.dp,max=104.dp)
            .chromeClickable(role=Role.Button,corner=999.dp){open=true}
            .semantics(mergeDescendants=true){contentDescription="搜索音源：${selected?.title.orEmpty()}"}
            .padding(horizontal=if(compact)10.dp else 8.dp),
            verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(4.dp)){
            if(!compact)Text(selected?.title.orEmpty(),color=PageInk,fontSize=12.sp,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.weight(1f,false))
            PageIcon("chevron-down",PageMuted,Modifier.size(16.dp))
        }
        LiquidDropdown(expanded=open,onDismissRequest={open=false}){
            // Menu surfaces keep one palette across themes, so the rows must use menuInk rather
            // than the page ink: on a dark theme the page ink is near-white and vanished on cream.
            val menuInk=LocalInterfacePalette.current.menuInk
            val menuAccent=LocalInterfacePalette.current.accent
            section.items.forEach{item->DropdownMenuItem(
                text={Text(item.title,color=menuInk)},enabled=!item.disabled,
                trailingIcon={if(item.selected)PageIcon("check",menuAccent,Modifier.size(17.dp))},
                onClick={open=false;action(item.action,"",0.0)})}
        }
    }
}
