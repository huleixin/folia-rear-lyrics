"""Bounded synthetic acceptance against a deployed or local Worker; never prints secrets."""
import argparse
import hashlib
import json
import secrets
import time
import urllib.request
import urllib.error
from feedback_credentials import read, BACKUP_API
from feedback import NoRedirect, Client, pull, prune

# tools/test_feedback_live.py: explicit synthetic uploads only after deployment authorization.
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--local',action='store_true')
    parser.add_argument('--allow-test-uploads',action='store_true')
    parser.add_argument('--check-backup',action='store_true',help='Verify the fixed legacy origin and cross-domain idempotency')
    parser.add_argument('--security-checks',action='store_true',help='Bounded rejection and emergency-gate checks; needs approved upload scope')
    args=parser.parse_args()
    admin={'url':'http://127.0.0.1:8787','token':'local-admin-test'} if args.local else read('admin',allow_env=False)
    readonly={'url':admin['url'],'token':'local-read-test'} if args.local else read(allow_env=False)
    api=admin['url'].rstrip('/'); opener=urllib.request.build_opener(NoRedirect())
    def request(path,headers=None,body=None,method=None,origin=None):
        req=urllib.request.Request((origin or api)+path,headers={'User-Agent':'Tingyu-feedback/1.0',**(headers or {})},data=body,method=method)
        try:
            with opener.open(req,timeout=45) as response:return response.status,response.read(6*1024*1024),response.headers
        except urllib.error.HTTPError as error:return error.code,error.read(4096),error.headers
    def auth(config):return {'Authorization':'Bearer '+config['token'],'Content-Type':'application/json'}
    assert json.loads(request('/health')[1])=={'ok':True}
    assert request('/api/admin/feedback')[0]==401
    assert request('/api/admin/feedback',auth(readonly))[0]==200
    assert request('/api/admin/settings',auth(readonly),b'{"uploadsEnabled":true}','PATCH')[0]==403
    assert request('/admin')[0]==200
    if args.check_backup:
        assert not args.local
        assert json.loads(request('/health',origin=BACKUP_API)[1])=={'ok':True}
        assert request('/api/admin/feedback',origin=BACKUP_API)[0]==401
        assert request('/api/admin/feedback',auth(readonly),origin=BACKUP_API)[0]==200
        assert request('/api/admin/settings',auth(readonly),b'{"uploadsEnabled":true}','PATCH',origin=BACKUP_API)[0]==403
    status,_,cors=request('/api/feedback',{'Origin':'https://localhost','Access-Control-Request-Method':'POST'},method='OPTIONS')
    assert status==204 and cors['Access-Control-Allow-Origin']=='https://localhost' and not cors.get('Access-Control-Allow-Credentials')
    assert not request('/api/admin/feedback',{'Origin':'https://untrusted.invalid'})[2].get('Access-Control-Allow-Origin')
    print('PASS live health/private access/read-admin isolation/admin shell')
    if not args.allow_test_uploads:return
    if args.security_checks:
        # Briefly exercise the emergency gate; restore it even if an assertion fails.
        try:
            assert request('/api/admin/settings',auth(admin),b'{"uploadsEnabled":false}','PATCH')[0]==200
            assert request('/api/feedback/challenge')[0]==503
            assert request('/api/feedback',{'Content-Type':'application/json'},b'{}','POST')[0]==503
        finally:
            assert request('/api/admin/settings',auth(admin),b'{"uploadsEnabled":true}','PATCH')[0]==200
        c=json.loads(request('/api/feedback/challenge')[1]);n=0
        while int.from_bytes(hashlib.sha256((c['token']+':'+str(n)).encode()).digest()[:4],'big')>>(32-c['bits']):n+=1
        headers={'Content-Type':'application/json','Idempotency-Key':secrets.token_hex(32),'X-Feedback-Status-Token':secrets.token_hex(32),'X-Feedback-Challenge':c['token'],'X-Feedback-Proof':str(n)}
        unsafe={'category':'other','description':'synthetic','cookie':'synthetic-secret-never-store'}
        assert request('/api/feedback',headers,json.dumps(unsafe).encode(),'POST')[0]==400
        assert request('/api/feedback',{**headers,'Content-Type':'application/zip'},b'PK\x03\x04synthetic','POST')[0]==400
        assert request('/api/feedback',headers,b' '*(5*1024*1024+32769),'POST')[0]==400
        assert request('/api/feedback',{'Content-Type':'application/json'},b'{}','POST')[0]==403
        status,_,cors=request('/api/feedback',{'Origin':'https://localhost','Access-Control-Request-Method':'POST'},method='OPTIONS')
        assert status==204 and cors['Access-Control-Allow-Origin']=='https://localhost'
        print('PASS live emergency pause/restore; credentials and ZIP rejected; body bound; proof requirement; Android CORS')
    ids=[]
    for log in (True,False):
        c=json.loads(request('/api/feedback/challenge')[1]);assert 'token' in c,'Uploads must be enabled within approved test scope'
        n=0
        while int.from_bytes(hashlib.sha256((c['token']+':'+str(n)).encode()).digest()[:4],'big')>>(32-c['bits']):n+=1
        payload={'category':'other','description':'Synthetic acceptance test, not user feedback','steps':'controlled protocol verification',
            'metadata':{'version':'feedback-acceptance','versionCode':0,'commit':'','buildDirty':False,'model':'synthetic','manufacturer':'','os':'','sdk':0,'webview':'','width':0,'height':0,'pad':False},
            'diagnostics':{'schema':'tingyu-cloud-diagnostic/1','events':[{'t':int(time.time()*1000),'m':'audio','l':'error','e':'load-error','f':{'errorCode':42}}],'crashes':[],'performance':{}} if log else None}
        headers={'Content-Type':'application/json','Idempotency-Key':secrets.token_hex(32),'X-Feedback-Status-Token':secrets.token_hex(32),'X-Feedback-Challenge':c['token'],'X-Feedback-Proof':str(n)}
        body=json.dumps(payload).encode();status,raw,_=request('/api/feedback',headers,body,'POST');assert status==201,(status,'submit')
        identifier=json.loads(raw)['id'];ids.append(identifier)
        status,raw,_=request('/api/feedback',headers,body,'POST');assert status==200 and json.loads(raw)['id']==identifier
        if args.check_backup:
            status,raw,_=request('/api/feedback',headers,body,'POST',origin=BACKUP_API)
            assert status==200 and json.loads(raw)['id']==identifier and json.loads(raw)['replayed']
            assert request('/api/feedback/status?id='+identifier,{'X-Feedback-Status-Token':headers['X-Feedback-Status-Token']},origin=BACKUP_API)[0]==200
            legacy=json.loads(request('/api/admin/feedback/'+identifier,auth(readonly),origin=BACKUP_API)[1])
            assert legacy['id']==identifier
        assert request('/api/feedback/status?id='+identifier)[0]==404
        assert request('/api/feedback/status?id='+identifier,{'X-Feedback-Status-Token':headers['X-Feedback-Status-Token']})[0]==200
        assert request('/api/feedback/status?id='+identifier,{'X-Feedback-Status-Token':secrets.token_hex(32)})[0]==404
        detail=json.loads(request('/api/admin/feedback/'+identifier,auth(readonly))[1])
        if log:
            status,raw,h=request('/api/admin/feedback/'+identifier+'/log',auth(readonly));assert status==200
            assert len(raw)==detail['log_bytes'] and hashlib.sha256(raw).hexdigest()==detail['log_hash']==h['X-Log-SHA256']
            assert json.loads(raw)['events'][0]['f']['errorCode']==42
            if args.check_backup:
                assert request('/api/admin/feedback/'+identifier+'/log',auth(readonly),origin=BACKUP_API)[1]==raw
        else:assert request('/api/admin/feedback/'+identifier+'/log',auth(readonly))[0]==404
        assert request('/api/admin/feedback/'+identifier,auth(admin),b'{"status":"closed","commit":"","note":"Synthetic acceptance complete"}','PATCH')[0]==200
        if not args.local:
            prune();pull(Client(),detail)
            print('PASS persistent read-only Codex pull and download checksum: '+identifier)
    assert request('/api/admin/issues',auth(readonly))[0]==200
    assert request('/api/admin/stats',auth(readonly))[0]==200
    print('PASS live with/no log; R2/D1 integrity; replay; status capability; management; issues/stats. Synthetic IDs: '+', '.join(ids))

if __name__=='__main__':
    main()
