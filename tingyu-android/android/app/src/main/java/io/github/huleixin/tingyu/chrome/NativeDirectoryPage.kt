package io.github.huleixin.tingyu.chrome

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeDirectoryPage.kt
// The existing library has a fixed header/filter and contiguous 68px rows, not spaced cards.
@Composable internal fun NativeDirectoryPage(page:NativePage,modifier:Modifier,action:PageAction) {
    // 资料库搜索（68591）：搜索框平时是页面里的一块普通区域，点一下就升到状态栏下方成为
    // 固定层；列表在它下面继续滚动。用 pageOrigin 采集根布局坐标，供展开动画从原位起飞。
    var pageOrigin by remember{mutableStateOf(Offset.Zero)}
    var searchExpanded by remember(page.key){mutableStateOf(false)}
    var fieldRect by remember{mutableStateOf<Rect?>(null)}
    val searchSection=page.sections.firstOrNull{it.layout=="input"}
    // 返回键：搜索展开时先收搜索，不直接退出页面。
    BackHandler(enabled=searchExpanded){searchExpanded=false}
    BoxWithConstraints(modifier.pageOrigin{pageOrigin=it}){
        val width=maxWidth;val wide=width>=840.dp;val library=page.key.startsWith("library:")
        val start=if(wide)if(maxHeight<=600.dp)108.dp else 116.dp else if(library&&width>=374.dp)18.dp else 16.dp
        val end=if(wide)32.dp else if(library&&width>=374.dp)18.dp else 16.dp
        val rowSections=page.sections.filter{it.layout=="rows"&&it.id!="intro"}
        val caches=rowSections.associate{it.id to key(it.id){rememberNativeRows(page.key,it)}}
        val list=rememberLazyListState();val identity=rowSections.map{it.id to it.dataKey}.toString()
        var previous by rememberSaveable { mutableStateOf(identity) }
        LaunchedEffect(identity){if(previous!=identity){list.scrollToItem(0);previous=identity}}
        Column(Modifier.fillMaxSize().padding(top=(page.safeTop+if(library)36 else 8).dp)){
            if(library){
                // 搜索展开时整块头部收起（240ms 同步收缩），把屏幕让给"固定搜索层 + 列表"。
                AnimatedVisibility(visible=!searchExpanded,
                    enter=expandVertically(tween(240)),exit=shrinkVertically(tween(240))){
                    Column{
                        PageHeading(page,Modifier.padding(start=start+4.dp,end=end+4.dp,bottom=16.dp).heightIn(min=44.dp),large=true,action=action)
                        page.sections.filter{it.layout=="chips"&&it.id!="sort"}.forEach { section ->
                            NativeSourceTabs(section,Modifier.padding(start=start,end=end,bottom=12.dp),action=action)
                        }
                        page.sections.filter{it.layout=="message"&&it.more.isNotBlank()&&it.text.isBlank()}.forEach{section->
                            Box(Modifier.padding(start=start,end=end,bottom=8.dp)){PagePill(section.moreLabel,{action(section.more,"",0.0)})}
                        }
                        page.sections.firstOrNull{it.layout=="input"}?.let{section->
                            // 被动模式：文本框自己不拿焦点，点击由外层接管 —— 直接展开固定层，
                            // 避免"内联先弹键盘 → 层展开再收键盘"的两次输入法动画。
                            Box(Modifier.padding(start=start,end=end,bottom=14.dp)
                                .pageAnchor(pageOrigin){fieldRect=it}
                                .clickable{searchExpanded=true}){
                                NativePageInput(section,action,passive=true)
                            }
                        }
                        val sort=page.sections.firstOrNull{it.id=="sort"}
                        if(sort!=null)Row(Modifier.fillMaxWidth().padding(start=start,end=end,bottom=8.dp).heightIn(min=34.dp),verticalAlignment=Alignment.CenterVertically){
                            Text(sort.title,color=PageInk,fontSize=17.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.weight(1f))
                            if(sort.items.isNotEmpty())PageSort(sort,action)
                        }
                    }
                }
            } else Row(Modifier.fillMaxWidth().padding(start=start-8.dp,end=end-8.dp).height(44.dp),verticalAlignment=Alignment.CenterVertically){
                ChromeButton("返回",size=42.dp,onClick={action(page.leading,"",0.0)}){PageIcon("chevron-left",PageInk,Modifier.size(23.dp))}
                Spacer(Modifier.weight(1f))
                if(page.trailing.isNotBlank())ChromeButton("更多",size=42.dp,onClick={action(page.trailing,"",0.0)}){PageIcon("ellipsis-vertical",PageInk,Modifier.size(23.dp))}
            }
            val listTop by animateDpAsState(if(searchExpanded)NativeSearchBarHeight+16.dp else 0.dp,tween(240),label="dir-list-top")
            LazyColumn(Modifier.fillMaxSize().imePadding(),state=list,contentPadding=PaddingValues(start=start,end=end,top=listTop,
                bottom=(page.bottomClearance+page.safeBottom).dp)){
                page.sections.forEach { section ->
                    when {
                        section.id=="intro" -> item(key=section.id){
                            Column(Modifier.padding(top=4.dp,bottom=13.dp)){
                                Text(page.title,color=PageInk,fontSize=27.sp,lineHeight=34.sp,fontWeight=FontWeight.Bold)
                                section.items.firstOrNull()?.let{item->
                                    if(page.key.contains("artist:")) {
                                        var expanded by remember(item.subtitle){mutableStateOf(false)}
                                        val collapsible=item.subtitle.length>90||item.subtitle.contains('\n')
                                        Row(Modifier.fillMaxWidth().padding(top=12.dp),horizontalArrangement=Arrangement.spacedBy(16.dp),verticalAlignment=Alignment.CenterVertically){
                                            PageArtwork(item.image,Modifier.size(88.dp),12.dp)
                                            Column(Modifier.weight(1f).then(if(collapsible)Modifier.clickable{expanded=!expanded}else Modifier)){
                                                Text(item.subtitle,color=PageMuted,fontSize=13.sp,lineHeight=20.sp,maxLines=if(expanded||!collapsible)Int.MAX_VALUE else 3,overflow=androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                                                if(collapsible)Text(if(expanded)"收起" else "展开简介",color=PageAccent,fontSize=12.sp,modifier=Modifier.padding(top=4.dp))
                                            }
                                        }
                                    } else Row(Modifier.fillMaxWidth().padding(top=12.dp),horizontalArrangement=Arrangement.spacedBy(20.dp),verticalAlignment=Alignment.CenterVertically){
                                        PageArtwork(item.image,Modifier.size(118.dp),12.dp)
                                        Text(item.subtitle,color=PageMuted,fontSize=13.sp,lineHeight=23.sp)
                                    }
                                }
                            }
                        }
                        section.layout=="rows" -> pagedNativeRows(page,section,caches.getValue(section.id),if(library)NativePageDesign.DirectoryRow else 62,action,chevron=library)
                        !library&&section.id=="play"&&page.key.contains("artist:") -> item(key=section.id){
                            Row(Modifier.fillMaxWidth().padding(bottom=16.dp)){
                                section.items.firstOrNull()?.let{item->PagePill(item.title,{action(item.action,"",0.0)},
                                    selected=true,enabled=!item.disabled,height=36.dp,font=14,trailing="play")}
                            }
                        }
                        !library&&section.layout=="chips" -> item(key=section.id){NativeSourceTabs(section,Modifier.padding(bottom=12.dp),action=action)}
                        !library&&section.layout=="input" -> item(key=section.id){Box(Modifier.padding(bottom=10.dp)){NativePageInput(section,action)}}
                        section.layout=="message"&&section.text.isNotBlank() -> item(key=section.id){Text(section.text,color=PageMuted,fontSize=13.sp,modifier=Modifier.padding(vertical=20.dp,horizontal=8.dp))}
                    }
                    if(section.busy)item(key="${section.id}:busy"){CircularProgressIndicator(Modifier.padding(12.dp).size(20.dp),color=PageAccent,strokeWidth=2.dp)}
                    if(section.more.isNotBlank()&&section.text.isNotBlank())item(key="${section.id}:retry"){PagePill(section.moreLabel,{action(section.more,"",0.0)})}
                }
            }
        }
        // 固定搜索层：在列表之上、页面根之下；不参与 LazyColumn 布局，因此不随列表滚动。
        if(library&&searchSection!=null)NativeSearchOverlay(
            visible=searchExpanded,
            section=searchSection,
            action=action,
            safeTop=page.safeTop,
            origin=fieldRect,
            onRequestClose={searchExpanded=false},
            // 内联输入框一直在模型里，收起后原布局自动恢复，不需要额外交互。
        )
    }
}
internal fun LazyListScope.pagedNativeRows(page:NativePage,section:NativePageSection,cache:NativeRowsCache,height:Int,action:PageAction,chevron:Boolean=false){
    items(section.total,key={index->"${section.id}:${section.dataKey}:$index"}){index->
        val item=cache.get(section,index)
        if(item!=null)NativePageRow(item,height.dp,if(chevron)NativePageDesign.DirectoryArt.dp else 40.dp,if(chevron)15 else 14,if(chevron)12 else 11,divider=!chevron,chevron=chevron){action(it,"",0.0)}
        else {
            Spacer(Modifier.height(height.dp))
            if(section.request.isNotBlank())LaunchedEffect(page.key,page.session,section.id,section.dataKey,index/100){if(cache.request(index,page.session))action(section.request,"",(index/100*100).toDouble())}
        }
    }
}
@Composable internal fun NativeSourceTabs(section:NativePageSection,modifier:Modifier=Modifier,search:Boolean=false,action:PageAction){
    Row(modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(if(search)8.dp else 6.dp)){
        section.items.forEach { item ->
            val shape=RoundedCornerShape(999.dp)
            Box(Modifier.height(36.dp).clip(shape).background(if(item.selected)interfaceColor(Color(0x2C6BC8A7),LightInterfaceColors.Selected)else if(search)interfaceColor(Color(0x08FFFFFF),LightInterfaceColors.Subtle)else Color.Transparent)
                .then(if(search)Modifier.border(1.dp,if(item.selected)interfaceColor(Color(0x709FE0C4),LightInterfaceColors.SelectedBorder)else Color.Transparent,shape)else Modifier)
                .clickable(enabled=!item.disabled){action(item.action,"",0.0)}.padding(horizontal=if(search)14.dp else 18.dp),contentAlignment=Alignment.Center){
                Text(item.title,color=if(item.selected)PageAccent else PageMuted,fontSize=(if(search)13 else 14).sp)
            }
        }
    }
}
