package io.github.huleixin.tingyu.resolver;

import io.github.huleixin.tingyu.playback.NativePlaylist;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeMap;
import okhttp3.HttpUrl;
import okhttp3.Request;
import org.json.JSONArray;
import org.json.JSONObject;

// Native catalog-only equivalents of lxCatalog.ts and kugouTransport.ts. No audio URL is inferred.
final class LxCatalogAdapters {
    static Request request(String provider, String query) throws Exception {
        HttpUrl.Builder url; Request.Builder request=new Request.Builder();
        if ("kuwo".equals(provider)) {
            url=HttpUrl.get("https://search.kuwo.cn/r.s").newBuilder();
            String[][] params={{"client","kt"},{"all",query},{"pn","0"},{"rn","20"},{"uid","794762570"},{"ver","kwplayer_ar_9.2.2.1"},{"vipver","1"},{"show_copyright_off","1"},{"newver","1"},{"ft","music"},{"cluster","0"},{"strategy","2012"},{"encoding","utf8"},{"rformat","json"},{"vermerge","1"},{"mobi","1"},{"issubtitle","1"}};
            for(String[] p:params)url.addQueryParameter(p[0],p[1]);
        } else if ("migu".equals(provider)) {
            String time=String.valueOf(System.currentTimeMillis()),device="963B7AA0D21511ED807EE5846EC87D20";
            request.header("uiVersion","A_music_3.6.1").header("deviceId",device).header("timestamp",time).header("channel","0146921")
                .header("sign",md5(query+"6cdc72a439cef99a3418d2a78aa28c73yyapp2d16148780a1dcc7408e06336b98cfd50"+device+time)).header("User-Agent","Mozilla/5.0");
            url=HttpUrl.get("https://jadeite.migu.cn/music_search/v3/search/searchAll").newBuilder();
            JSONObject switches=new JSONObject().put("song",1).put("album",0).put("singer",0).put("tagSong",1).put("mvSong",0).put("bestShow",1).put("songlist",0).put("lyricSong",0);
            String[][] params={{"isCorrect","0"},{"isCopyright","1"},{"searchSwitch",switches.toString()},{"pageSize","20"},{"text",query},{"pageNo","1"},{"sort","0"},{"sid","USS"}};
            for(String[] p:params)url.addQueryParameter(p[0],p[1]);
        } else if ("kugou".equals(provider)) {
            long now=System.currentTimeMillis();String mid=md5(String.valueOf(now));
            TreeMap<String,String> params=new TreeMap<>();
            String[][] values={{"sorttype","0"},{"keyword",query},{"pagesize","20"},{"page","1"},{"userid","0"},{"appid","3116"},{"token",""},{"clienttime",String.valueOf(now/1000)},{"iscorrection","1"},{"uuid","-"},{"mid",mid},{"dfid","-"},{"clientver","11070"},{"platform","AndroidFilter"}};
            for(String[] p:values)params.put(p[0],p[1]);
            String salt="LnT6xpN3khm36zse0QzvmgTZ3waWdRSA";StringBuilder signed=new StringBuilder(salt);
            for(java.util.Map.Entry<String,String> p:params.entrySet())signed.append(p.getKey()).append("=").append(p.getValue());
            params.put("signature",md5(signed.append(salt).toString()));
            url=HttpUrl.get("https://complexsearch.kugou.com/v2/search/song").newBuilder();
            for(java.util.Map.Entry<String,String> p:params.entrySet())url.addQueryParameter(p.getKey(),p.getValue());
            request.header("User-Agent","Android14-1070-11070-201-0-SearchSong-wifi").header("KG-Rec","1").header("KG-RC","1").header("KG-CLIENTTIMEMS",String.valueOf(now)).header("mid",mid).header("x-router","complexsearch.kugou.com");
        } else return null;
        return request.url(url.build()).build();
    }
    static List<NativePlaylist.Track> parse(String provider,JSONObject root) throws Exception {
        List<NativePlaylist.Track> result=new ArrayList<>();JSONArray rows=null;
        if("kuwo".equals(provider))rows=root.optJSONArray("abslist");
        if("migu".equals(provider)&&"000000".equals(root.optString("code"))){JSONObject data=root.optJSONObject("songResultData");rows=data==null?null:data.optJSONArray("resultList");}
        if("kugou".equals(provider)){JSONObject data=root.optJSONObject("data");rows=data==null?null:data.optJSONArray("lists");}
        if(rows==null)return result;
        JSONArray flat=new JSONArray();for(int i=0;i<Math.min(50,rows.length());i++){Object row=rows.opt(i);if(row instanceof JSONArray){JSONArray group=(JSONArray)row;for(int j=0;j<Math.min(20,group.length());j++)flat.put(group.opt(j));}else flat.put(row);}
        java.util.Set<String> seen=new java.util.HashSet<>();
        for(int i=0;i<flat.length()&&result.size()<20;i++){
            JSONObject row=flat.optJSONObject(i);if(row==null)continue;JSONObject data=new JSONObject();JSONArray artists=new JSONArray();String id,title,album;long duration;
            if("kuwo".equals(provider)){
                id=text(row,"MUSICRID").replaceFirst("^MUSIC_","");title=text(row,"SONGNAME");album=text(row,"ALBUM");duration=row.optLong("DURATION")*1000;
                for(String name:text(row,"ARTIST").split("[&;]"))if(!name.trim().isEmpty())artists.put(name.trim());
                data.put("songMid",id).put("albumId",text(row,"ALBUMID")).put("formats",text(row,"N_MINFO"));
            }else if("migu".equals(provider)){
                id=text(row,"copyrightId");String songId=text(row,"songId");if(songId.isEmpty())continue;
                title=text(row,"name");album=text(row,"album");duration=row.optLong("duration")*1000;
                JSONArray names=row.optJSONArray("singerList");if(names!=null)for(int n=0;n<Math.min(20,names.length());n++)if(names.optJSONObject(n)!=null)artists.put(text(names.optJSONObject(n),"name"));
                data.put("songId",songId).put("songMid",songId).put("copyrightId",id).put("albumId",text(row,"albumId"));
            }else{
                id=text(row,"FileHash");title=text(row,"SongName");album=text(row,"AlbumName");duration=row.optLong("Duration")*1000;
                for(String name:text(row,"SingerName").split("[、;&]"))if(!name.trim().isEmpty())artists.put(name.trim());
                JSONObject types=new JSONObject();String[][] formats={{"128k","FileHash","FileSize"},{"320k","HQFileHash","HQFileSize"},{"flac","SQFileHash","SQFileSize"},{"flac24bit","ResFileHash","ResFileSize"}};
                for(String[] f:formats){String hash=text(row,f[1]);if(!hash.isEmpty())types.put(f[0],new JSONObject().put("hash",hash).put("size",row.optLong(f[2])).put("type",f[0]));}
                data.put("hash",id).put("albumId",text(row,"AlbumID")).put("_types",types);
            }
            if(id.isEmpty()||title.isEmpty()||!seen.add(id))continue;data.put("fallbackArtists",artists);
            StringBuilder names=new StringBuilder();for(int n=0;n<artists.length();n++){if(n>0)names.append("、");names.append(artists.optString(n));}
            result.add(new NativePlaylist.Track("online:"+provider+":"+id,provider,id,title,names.toString(),album,duration,"",data.toString(),provider+"-original"));
        }return result;
    }
    private static String text(JSONObject row,String key){return row.optString(key,"").replaceAll("<[^>]*>","").replace("&amp;","&").replace("&quot;","\"").trim();}
    private static String md5(String value)throws Exception {byte[] bytes=java.security.MessageDigest.getInstance("MD5").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));StringBuilder out=new StringBuilder();for(byte b:bytes)out.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return out.toString();}
}
