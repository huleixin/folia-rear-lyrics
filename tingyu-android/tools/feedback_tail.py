"""Bounded production tail with a strict output whitelist, never raw requests or exceptions."""
import argparse
import json
import os
import queue
import re
import subprocess
import threading
import time
from pathlib import Path

# Wrangler stdout may contain credentials in request headers: filter before writing anything.
def safe_event(event):
    request=event.get("event",{}).get("request",{})
    url=request.get("url","")
    from urllib.parse import urlsplit
    path=urlsplit(url).path
    route=path if path in ("/health","/api/feedback","/api/feedback/challenge","/api/feedback/status") else "other"
    result={"time":event.get("eventTimestamp"),"outcome":event.get("outcome"),"method":request.get("method"),"route":route,"status":event.get("event",{}).get("response",{}).get("status")}
    for key in ("cpuTime","wallTime"):
        if isinstance(event.get(key),(int,float)):result[key]=event[key]
    result["exceptionTypes"]=[e.get("name") for e in event.get("exceptions",[]) if e.get("name") in ("Error","TypeError","RangeError") ]
    result["traces"]=[]
    allowed={"kind","requestId","stage","status","code","bytes","elapsedMs","host","route","d1Ms","r2Ms"}
    for log in event.get("logs",[]):
        for message in log.get("message",[]):
            try:trace=json.loads(message) if isinstance(message,str) else message
            except (ValueError,TypeError):continue
            if isinstance(trace,dict) and trace.get("kind")=="feedback-request":result["traces"].append({k:v for k,v in trace.items() if k in allowed and isinstance(v,(str,int,float))})
    return result

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("--seconds",type=int,default=180);p.add_argument("--output",required=True);a=p.parse_args()
    root=Path(__file__).resolve().parents[1]/"feedback-server"
    child=subprocess.Popen(["node",str(root/"node_modules"/"wrangler"/"bin"/"wrangler.js"),"tail","tingyu-feedback-api","--format","json"],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding="utf-8",errors="replace")
    lines=queue.Queue()
    threading.Thread(target=lambda:[lines.put(line) for line in child.stdout],daemon=True).start()
    threading.Thread(target=lambda:[lines.put(line) for line in child.stderr],daemon=True).start()
    output=Path(a.output);output.parent.mkdir(parents=True,exist_ok=True);end=time.monotonic()+min(600,max(10,a.seconds));buf="";count=0
    try:
        with output.open("a",encoding="utf-8") as handle:
            while time.monotonic()<end:
                try:line=lines.get(timeout=1)
                except queue.Empty:
                    if child.poll() is not None:raise RuntimeError("Tail exited with code "+str(child.returncode))
                    continue
                if "Connected to" in line or "Successfully created tail" in line:print("Production tail connected",flush=True)
                line=re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", line).lstrip()
                if not buf and not line.startswith("{"):continue
                buf+=line
                try:event=json.loads(buf)
                except ValueError:continue
                buf="";safe=safe_event(event);handle.write(json.dumps(safe)+"\n");handle.flush();count+=1
                print(json.dumps(safe),flush=True)
    finally:
        if os.name=="nt":subprocess.run(["taskkill","/PID",str(child.pid),"/T","/F"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        else:child.terminate()
        print("Filtered tail completed: "+str(count)+" events",flush=True)
if __name__=="__main__":main()
