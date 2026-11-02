package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearHostPolicyTest.java
/**
 * 1.3.96 的宿主准入测试。
 *
 * <p>最关键的一条是 {@link #aRearCentreHostNeedsNoSystemMusicCard()}：宿主判定里<b>根本没有
 * 媒体包名参数</b>。1.3.95 的 {@code eligible(mediaPackage, ...)} 与 {@code ownMedia()} 已被
 * 移除，这里用「同样的条件写成 true、任一条不成立即 false」把「不再依赖系统音乐卡片」固定
 * 成回归测试，而不是只靠删代码。
 */
public class RearHostPolicyTest {
    @Test public void aRearCentreHostNeedsNoSystemMusicCard(){
        // 会话、未挂起、launcher resumed、视图已挂上、背屏、面板点亮 —— 没有媒体卡片这一项。
        assertTrue(RearHostPolicy.render(true,false,true,true,1,RearHostPolicy.STATE_ON));
        assertFalse(RearHostPolicy.render(false,false,true,true,1,RearHostPolicy.STATE_ON));
        assertFalse(RearHostPolicy.render(true,false,false,true,1,RearHostPolicy.STATE_ON));
        assertFalse(RearHostPolicy.render(true,false,true,false,1,RearHostPolicy.STATE_ON));
        assertFalse(RearHostPolicy.render(true,false,true,true,0,RearHostPolicy.STATE_ON));
        assertFalse(RearHostPolicy.render(true,false,true,true,-1,RearHostPolicy.STATE_ON));
    }
    @Test public void cameraAodAndPanelOffNeverRenderInTheRearCentre(){
        for(int state:new int[]{0,1,3,4})assertFalse(RearHostPolicy.render(true,false,true,true,1,state));
        assertFalse(RearHostPolicy.render(true,true,true,true,1,RearHostPolicy.STATE_ON));
    }
    @Test public void onlyAnInteractiveHostAttributesASwipeToTheUser(){
        assertTrue(RearHostPolicy.userExit(true,false,false,100,120));
        assertFalse(RearHostPolicy.userExit(false,false,false,100,120)); // 宿主不可见
        assertFalse(RearHostPolicy.userExit(true,true,false,100,120));   // 相机/应用侧挂起
        assertFalse(RearHostPolicy.userExit(true,false,true,100,120));   // AOD / 熄屏停渲染
        assertFalse(RearHostPolicy.userExit(true,false,false,-1,120));
        assertFalse(RearHostPolicy.userExit(true,false,false,100,2000));
    }
    @Test public void launcherIsRequestedOnlyForAColdStartAndWithABudget(){
        long now=10_000;
        assertTrue(RearHostPolicy.mayLaunch(false,false,false,1,RearHostPolicy.STATE_ON,0,0,0,now));
        // 已经挂上 / 被相机挂起 / launcher 仍在前台：都不请求。
        assertFalse(RearHostPolicy.mayLaunch(true,false,false,1,RearHostPolicy.STATE_ON,0,0,0,now));
        assertFalse(RearHostPolicy.mayLaunch(false,true,false,1,RearHostPolicy.STATE_ON,0,0,0,now));
        assertFalse(RearHostPolicy.mayLaunch(false,false,true,1,RearHostPolicy.STATE_ON,0,0,0,now));
        // 面板不亮或不在背屏：不请求（不替系统点亮背屏）。
        assertFalse(RearHostPolicy.mayLaunch(false,false,false,1,0,0,0,0,now));
        assertFalse(RearHostPolicy.mayLaunch(false,false,false,0,RearHostPolicy.STATE_ON,0,0,0,now));
        // 预算与节流。
        assertFalse(RearHostPolicy.mayLaunch(false,false,false,1,RearHostPolicy.STATE_ON,RearHostPolicy.MAX_LAUNCH_REQUESTS,0,0,now));
        assertFalse(RearHostPolicy.mayLaunch(false,false,false,1,RearHostPolicy.STATE_ON,0,now+1,0,now));
        // 观察到 launcher 被别的界面暂停过：本次会话不再把它拉回来。
        assertFalse(RearHostPolicy.mayLaunch(false,false,false,1,RearHostPolicy.STATE_ON,0,0,now-5_000,now));
    }
    @Test public void rebindingTheHostViewIsBounded(){
        for(int i=0;i<RearHostPolicy.MAX_REBINDS;i++)assertTrue(RearHostPolicy.mayRebind(i));
        assertFalse(RearHostPolicy.mayRebind(RearHostPolicy.MAX_REBINDS));
        assertFalse(RearHostPolicy.mayRebind(RearHostPolicy.MAX_REBINDS+3));
    }
    @Test public void aDismissalSurvivesPlaybackCameraAndBackendChangesUntilExplicitEnable(){
        for(int songs=0;songs<50;songs++){
            assertFalse(RearDisplayPolicy.wanted(true,true,false));
            assertFalse(RearHostPolicy.render(RearDisplayPolicy.wanted(true,true,false),false,true,true,1,RearHostPolicy.STATE_ON));
        }
        assertTrue(RearDisplayPolicy.wanted(true,false,false));
        assertFalse(RearDisplayPolicy.wanted(true,false,true));
    }
    @Test public void oldSessionAndReleaseCallbacksCannotCloseTheReplacement(){
        assertFalse(RearDisplayPolicy.matching("session-old","session-new"));
        assertFalse(RearDisplayPolicy.closeCallback(1,2,true));
        assertFalse(RearDisplayPolicy.closeCallback(2,2,false));
        assertTrue(RearDisplayPolicy.closeCallback(2,2,true));
    }
    @Test public void aodAndOffSuspendTheIndependentWindowWithoutChangingPlaybackIntent(){
        for(int state:new int[]{0,1,3,4})assertFalse(RearDisplayPolicy.render(true,true,false,false,state));
        assertTrue(RearDisplayPolicy.render(true,true,false,false,2));
        assertFalse(RearDisplayPolicy.render(true,true,true,false,2));
    }
    @Test public void displaySessionTokensAreBounded(){
        assertTrue(RearHostPolicy.validSession(java.util.UUID.randomUUID().toString()));
        assertFalse(RearHostPolicy.validSession(""));
        assertFalse(RearHostPolicy.validSession("../token"));
        assertFalse(RearHostPolicy.validSession("x".repeat(81)));
        assertFalse(RearHostPolicy.validSession(null));
    }
    @Test public void delayedHandshakeCannotStartAfterCancelOrTemporaryLossOfIntent(){
        assertTrue(RearHostPolicy.mayStart(7,7,true));
        assertFalse(RearHostPolicy.mayStart(7,8,true));
        assertFalse(RearHostPolicy.mayStart(7,7,false));
        assertFalse(RearHostPolicy.mayStart(7,8,false));
    }
}
