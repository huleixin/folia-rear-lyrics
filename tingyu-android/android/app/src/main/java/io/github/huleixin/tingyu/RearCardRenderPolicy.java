package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearCardRenderPolicy.java
final class RearCardRenderPolicy {
    enum Mode { NORMAL, AOD, HIDDEN }
    static Mode mode(boolean current,boolean own,boolean visible,boolean follow,boolean command,int power){
        if(!current||!own||!visible||power==0||power==1)return Mode.HIDDEN;
        if(command||power==3||power==4)return follow?Mode.AOD:Mode.HIDDEN;
        return power==2?Mode.NORMAL:Mode.HIDDEN;
    }

    static final long TRANSITION_MS = 1500;
    /** A JS-ready signal or a pre-fence onDraw alone must never acquire native card ownership. */
    static final class FrameEvidence {
        private long epoch=-1,visual=-1,drawn=-1;
        void begin(long next){if(next!=epoch){epoch=next;visual=-1;drawn=-1;}}
        boolean visualReady(long sequence){if(epoch<0||sequence!=epoch)return false;visual=sequence;return true;}
        boolean recordDraw(long sequence){if(epoch<0||sequence!=epoch||visual!=epoch)return false;drawn=sequence;return true;}
        boolean drawn(long sequence){return epoch>=0&&sequence==epoch&&drawn==epoch;}
    }
    static final class Decision {
        final Mode mode;
        final String reason;
        final long remainingMs;
        Decision(Mode mode,String reason,long remainingMs){this.mode=mode;this.reason=reason;this.remainingMs=remainingMs;}
    }

    /** One deadline per physical/command AOD edge; visibility callbacks never renew the budget. */
    static final class Transition {
        private boolean previousAod;
        private long until;
        Decision resolve(boolean lease,boolean own,boolean associated,boolean center,boolean active,
                boolean attached,boolean shown,boolean owned,boolean follow,
                boolean command,int power,long now){
            boolean systemAod=command||power==3||power==4;
            if(systemAod!=previousAod){until=now+TRANSITION_MS;previousAod=systemAod;}
            String reason=!lease?"lease-lost":!own?"media-session-lost":!associated?"binding-lost":
                !attached?"detached":power!=2&&power!=3&&power!=4?"display-off":
                systemAod&&!follow?"aod-disabled":!center?"card-not-center":null;
            if(reason!=null){until=0;return new Decision(Mode.HIDDEN,reason,0);}
            if(active&&shown)return new Decision(systemAod?Mode.AOD:Mode.NORMAL,"current-card",0);
            // An unowned/collapsed/non-central card can never use this exception.
            if(owned&&follow&&until>now)
                return new Decision(Mode.AOD,"verified-aod-transition",until-now);
            return new Decision(Mode.HIDDEN,!active?"card-inactive":"card-not-shown",0);
        }
    }
}
