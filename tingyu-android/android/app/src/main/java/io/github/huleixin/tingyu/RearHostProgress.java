package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearHostProgress.java
/** Critical milestones cannot be overwritten by maintenance probes or later wait conditions. */
final class RearHostProgress {
    private int rank;
    private String milestone="SHOW dispatched", waiting="", error="";
    void update(String event,String reason) {
        String[] stages={"show-received","launcher","card-available","created","page-start","html-ok","html-complete","html-script","js-entry","react-mounted","state-config","config-received","configured","ready-request","page-ready","drawn","ready"};
        for(int i=0;i<stages.length;i++)if(stages[i].equals(event)&&i+1>rank){rank=i+1;milestone=event;}
        if("attaching".equals(event)||"waiting-launcher".equals(event)||"view-state".equals(event))waiting=reason;
        if("web-error".equals(event)||"blocked".equals(event)||"failed".equals(event))error=reason;
    }
    String describe(){return "milestone="+milestone+", waiting="+waiting+", error="+error;}
}
