"""Explicit, bounded synthetic production uploads. No user data or authentication is printed."""
import argparse
import concurrent.futures
import hashlib
import json
import secrets
import time
import urllib.error
import urllib.request
from pathlib import Path
from feedback import NoRedirect, Client, pull, prune
from feedback_credentials import API, BACKUP_API

# tools/test_feedback_stability.py: keep test drafts and results in the ignored diagnostic cache.
OUT=Path(__file__).resolve().parents[1]/".feedback-cache"/"p0"
def request(origin,path,body=None,headers=None):
    start=time.monotonic()
    req=urllib.request.Request(origin+path,data=body,headers={"User-Agent":"Tingyu-P0-synthetic",**(headers or {})})
    try:
        response=urllib.request.build_opener(NoRedirect()).open(req,timeout=65)
    except urllib.error.HTTPError as e:response=e
    except (urllib.error.URLError,TimeoutError,ConnectionError):return {"status":0,"code":"network_failed","elapsedMs":round((time.monotonic()-start)*1000),"host":origin},{}
    with response:
        raw=response.read(6*1024*1024);facts={"status":response.code,"elapsedMs":round((time.monotonic()-start)*1000),"ray":response.headers.get("CF-Ray"),"requestId":response.headers.get("X-Feedback-Request-ID"),"serverStage":response.headers.get("X-Feedback-Stage"),"host":origin}
    try:data=json.loads(raw)
    except ValueError:data={"error":"non_json_response"}
    if data.get("error"):facts["code"]=data["error"]
    return facts,data

def send(label,phase,origin=API,replay=False):
    fixture=OUT/(label+".json");raw=fixture.read_bytes();draft=OUT/(phase+"-"+label+"-draft.json")
    replay=draft.exists()
    row=json.loads(draft.read_text()) if replay else {"key":secrets.token_hex(32),"cap":secrets.token_hex(32)}
    draft.write_text(json.dumps(row))
    facts,c=request(origin,"/api/feedback/challenge")
    if facts["status"]!=200:
        facts.update({"label":label,"phase":phase,"stage":"challenge"});print(json.dumps(facts),flush=True);return facts
    n=0;start=time.monotonic()
    while int.from_bytes(hashlib.sha256((c["token"]+":"+str(n)).encode()).digest()[:4],"big")>>(32-c["bits"]):n+=1
    proofMs=round((time.monotonic()-start)*1000)
    h={"Content-Type":"application/json","Idempotency-Key":row["key"],"X-Feedback-Status-Token":row["cap"],"X-Feedback-Challenge":c["token"],"X-Feedback-Proof":str(n)}
    facts,data=request(origin,"/api/feedback",raw,h)
    facts.update({"label":label,"phase":phase,"stage":"upload","bodyBytes":len(raw),"proofMs":proofMs,"replay":replay})
    if facts["status"] in (200,201) and data.get("id"):
        identifier=data["id"];row["id"]=identifier;draft.write_text(json.dumps(row));facts["id"]=identifier
        client=Client();detail=client.json("feedback/"+identifier)
        facts["ready"]=True;facts["storedBytes"]=detail["log_bytes"]
        if detail["log_bytes"]:
            log,headers=client.request("feedback/"+identifier+"/log")
            facts["integrity"]=len(log)==detail["log_bytes"] and hashlib.sha256(log).hexdigest()==detail["log_hash"]==headers.get("X-Log-SHA256")
        else:facts["integrity"]=True
        prune();pull(client,detail)
        # Close only this script-generated synthetic row.
        Client("admin").json("feedback/"+identifier,body={"status":"closed","commit":"","note":"P0 synthetic stability test"},method="PATCH")
    print(json.dumps(facts),flush=True)
    with (OUT/(phase+"-results.jsonl")).open("a") as out:out.write(json.dumps(facts)+"\n")
    return facts

def rejections(phase):
    client=Client();before=list(client.pages({"version":"feedback-p0-reject"}));assert not before
    facts,c=request(API,"/api/feedback/challenge");assert facts["status"]==200
    n=0
    while int.from_bytes(hashlib.sha256((c["token"]+":"+str(n)).encode()).digest()[:4],"big")>>(32-c["bits"]):n+=1
    base=json.loads((OUT/"none.json").read_text());base["metadata"]["version"]="feedback-p0-reject"
    samples=[]
    for label,size in [("3MiB-invalid-schema",3*1024*1024),("near5MiB-invalid-schema",5*1024*1024-1024),("over-body-limit",5*1024*1024+32769)]:
        p={**base,"padding":"x"*size};samples.append((label,json.dumps(p).encode(),"application/json"))
    samples.append(("ZIP-rejected",b"PK"+bytes(64),"application/zip"))
    for label,raw,content_type in samples:
        h={"Content-Type":content_type,"Idempotency-Key":secrets.token_hex(32),"X-Feedback-Status-Token":secrets.token_hex(32),"X-Feedback-Challenge":c["token"],"X-Feedback-Proof":str(n)}
        facts,_=request(API,"/api/feedback",raw,h);facts.update({"phase":phase,"label":label,"bodyBytes":len(raw)})
        print(json.dumps(facts),flush=True)
        with (OUT/(phase+"-results.jsonl")).open("a") as out:out.write(json.dumps(facts)+"\n")
        assert facts["status"]==400
        time.sleep(2)
    assert not list(client.pages({"version":"feedback-p0-reject"}))
    print("PASS rejected inputs created no feedback rows",flush=True)

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("--allow-test-uploads",action="store_true");p.add_argument("--phase",required=True);p.add_argument("--labels",nargs="+",default=["none","10k","100k","500k","1m","max-schema"]);p.add_argument("--backup",action="store_true");p.add_argument("--concurrent",action="store_true");p.add_argument("--rejections",action="store_true");a=p.parse_args()
    if not a.allow_test_uploads:p.error("Explicit upload authorization is required")
    if len(a.labels)>8:p.error("At most eight controlled attempts")
    if a.phase not in ("before","after","concurrent","rejection","backup"):p.error("Use a fixed synthetic test phase")
    if any(label not in ("none","10k","100k","500k","1m","max-schema") for label in a.labels):p.error("Unknown fixture")
    if a.rejections:return rejections(a.phase)
    for origin in (API,BACKUP_API):print(json.dumps({"health":request(origin,"/health")[0]}),flush=True)
    if a.concurrent:
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(lambda l:send(l,a.phase,BACKUP_API if a.backup else API),a.labels))
    else:
        for label in a.labels:
            send(label,a.phase,BACKUP_API if a.backup else API);time.sleep(2)
if __name__=="__main__":main()
