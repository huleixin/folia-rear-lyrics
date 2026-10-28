package io.github.huleixin.tingyu;

import com.getcapacitor.JSObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

// android/app/src/main/java/io/github/huleixin/tingyu/PlaybackTestTone.java
/** Copyright-free quiet tone, served through the same local audio route as imported music. */
final class PlaybackTestTone {
    static JSObject prepare(LocalAudioServer server)throws Exception{
        final int rate=22050,frames=rate*10,bytes=frames*2;
        File file=new File(server.importedAudioDirectory(),"imported-tingyu-playback-test.wav");
        if(file.length()!=bytes+44){
            ByteBuffer wav=ByteBuffer.allocate(bytes+44).order(ByteOrder.LITTLE_ENDIAN);
            wav.put(new byte[]{'R','I','F','F'}).putInt(bytes+36).put(new byte[]{'W','A','V','E','f','m','t',' '})
                .putInt(16).putShort((short)1).putShort((short)1).putInt(rate).putInt(rate*2)
                .putShort((short)2).putShort((short)16).put(new byte[]{'d','a','t','a'}).putInt(bytes);
            for(int n=0;n<frames;n++){
                double envelope=Math.min(1,Math.min(n/(rate*.1),(frames-n)/(rate*.1)));
                wav.putShort((short)(Math.sin(n*440*2*Math.PI/rate)*1800*envelope));
            }
            try(FileOutputStream output=new FileOutputStream(file)){output.write(wav.array());}
        }
        return new JSObject().put("url","http://127.0.0.1:"+server.start()+"/audio/"+file.getName()).put("duration",10);
    }
}
