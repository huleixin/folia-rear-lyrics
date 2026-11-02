package io.github.huleixin.tingyu;

import android.os.Handler;
import android.os.Looper;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// android/app/src/main/java/io/github/huleixin/tingyu/RearCardAod.java
/** Event-driven cached lyric reads, one next-line wakeup, no animation or independent clock. */
final class RearCardAod {
    private final Handler main=new Handler(Looper.getMainLooper());
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private final RearHostWebClient source;
    private final TextView label;
    private int generation;
    private boolean active,busy,again,closed;
    private final Runnable next=this::refresh;
    RearCardAod(RearHostWebClient source,TextView label){this.source=source;this.label=label;}
    void active(boolean value){active=value;generation++;main.removeCallbacks(next);if(value)refresh();}
    void refresh(){
        if(!active||closed)return;
        if(busy){again=true;return;}busy=true;final int token=generation;
        io.execute(()->{
            String text="";long delay=-1;
            try{
                JSONObject packet=new JSONObject(source.aodState());JSONObject owner=packet.optJSONObject("owner");
                if(owner!=null){
                    String key=owner.optString("songKey"),epoch=owner.optString("epoch"),engine=owner.optString("engine");
                    if(!key.isEmpty()&&(engine.equals("media3")||engine.equals("compatible"))){
                        JSONObject lyric=new JSONObject(source.aodLyrics(key,epoch));
                        // Provider validates epoch; recheck identity after potentially slow disk/cache work.
                        JSONObject latest=new JSONObject(source.aodState()).optJSONObject("owner");
                        if(latest!=null&&key.equals(latest.optString("songKey"))&&epoch.equals(latest.optString("epoch"))){
                            double seconds=latest.optDouble("positionMs")/1000d;JSONArray lines=lyric.optJSONArray("lines");
                            if(lines!=null&&key.equals(lyric.optString("songKey"))&&epoch.equals(lyric.optString("epoch"))){
                                for(int i=0;i<lines.length();i++){
                                    JSONObject line=lines.optJSONObject(i);if(line==null)continue;
                                    double start=line.optDouble("startTime");
                                    if(start<=seconds)text=line.optString("fullText");
                                    else{if(latest.optBoolean("playing"))delay=Math.max(1000,(long)((start-seconds)*1000/Math.max(.1,latest.optDouble("playbackRate",1))));break;}
                                }
                            }
                        }
                    }
                }
            }catch(Exception error){text="";}
            final String value=text;final long wait=delay;
            main.post(()->{busy=false;if(!closed&&active&&token==generation){if(!value.contentEquals(label.getText()))label.setText(value);main.removeCallbacks(next);if(wait>=0)main.postDelayed(next,wait);}if(again){again=false;refresh();}});
        });
    }
    void close(){closed=true;active=false;generation++;main.removeCallbacks(next);io.shutdownNow();}
}
