package io.github.huleixin.tingyu.playback;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/NativeAudioOutputPolicy.java
/** Foreground browsing and the stage share one PCM output. FFT visibility is not a decoder mode. */
final class NativeAudioOutputPolicy {
    private boolean interactive=true,analysis;
    private int applied=-1;
    void request(boolean interactive,boolean analysis){this.interactive=interactive;this.analysis=analysis;}
    int change(boolean safeBoundary){
        int wanted=interactive||analysis?0:1;
        // Do not tear down audible PCM output just because a stage closes or the app sleeps.
        // Restore DSP offload on a new track/pause instead. Foreground PCM is needed for live FFT.
        if(wanted==applied||wanted==1&&!safeBoundary)return -1;
        applied=wanted;return wanted;
    }
    int applied(){return applied;}
}
