"""Security regression tests for the portable downloader; no real credentials/network."""
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch
import feedback
import feedback_credentials

# tools/test_feedback.py: adversarial extraction, checksums, paging and persistent credential recovery.
class FeedbackTests(unittest.TestCase):
    def archive(self, name, data):
        output=io.BytesIO()
        with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:z.writestr(name,data)
        return output.getvalue()
    def test_zip_boundaries(self):
        with tempfile.TemporaryDirectory() as d:
            for name,data in [('../escape','x'),('/absolute','x'),('diagnostics.json','0'*1000000),('script.py','print(1)')]:
                with self.assertRaises(RuntimeError):feedback.safe_extract(self.archive(name,data),d)
            feedback.safe_extract(self.archive('diagnostics.json','{}'),d)
            self.assertEqual((Path(d)/'diagnostics.json').read_text(),'{}')
    def test_checksum_rejects_before_writing(self):
        identifier='TY-'+'a'*36
        class Fake:
            def json(self,path):return {'log_bytes':2,'log_hash':'wrong'}
            def request(self,path,**kw):return b'{}',{'X-Log-SHA256':'wrong','X-Log-Bytes':'2'}
        with tempfile.TemporaryDirectory() as d,patch.object(feedback,'CACHE',Path(d)):
            with self.assertRaises(RuntimeError):feedback.pull(Fake(),{'id':identifier})
            self.assertEqual(list(Path(d).iterdir()),[])
    def test_windows_encryption_roundtrip(self):
        import os
        if os.name!='nt':self.skipTest('Windows only')
        raw=b'synthetic-test-not-a-real-credential'
        encrypted=feedback_credentials.protect(raw)
        self.assertNotIn(raw,encrypted)
        self.assertEqual(feedback_credentials.protect(encrypted,True),raw)
    def test_existing_broken_store_is_never_overwritten(self):
        import os
        if os.name!='nt':self.skipTest('Windows only')
        with tempfile.TemporaryDirectory() as d,patch.object(feedback_credentials,'STORE',Path(d)),patch.object(feedback_credentials,'save') as save:
            (Path(d)/'read.dpapi').write_bytes(b'broken')
            with self.assertRaises(RuntimeError):feedback_credentials.prepare()
            save.assert_not_called()
    def test_no_redirect_and_invalid_url(self):
        with self.assertRaises(RuntimeError):feedback.NoRedirect().redirect_request(None,None,None,None,None,None)
        with patch.object(feedback,'read',return_value={'url':'http://external.test','token':'test'}):
            with self.assertRaises(RuntimeError):feedback.Client()
    def test_cache_retention(self):
        import os,time
        with tempfile.TemporaryDirectory() as d,patch.object(feedback,'CACHE',Path(d)):
            p=Path(d)/('TY-'+'a'*36+'.json');p.write_text('{}');os.utime(p,(0,0));other=Path(d)/'keep.txt';other.write_text('keep')
            feedback.prune();self.assertFalse(p.exists());self.assertTrue(other.exists())
    def test_pagination_and_repeated_cursor(self):
        client=object.__new__(feedback.Client)
        pages=iter([{'items':[{'id':'first'}],'nextCursor':'next'},{'items':[{'id':'second'}],'nextCursor':None}])
        client.json=lambda path:next(pages)
        self.assertEqual([r['id'] for r in client.pages({'type':'crash'})],['first','second'])
        client.json=lambda path:{'items':[],'nextCursor':'repeat'}
        with self.assertRaises(RuntimeError):list(client.pages({}))
    def test_zip_duplicate_and_symlink_rejected(self):
        import warnings
        for kind in ('duplicate','symlink','count'):
            raw=io.BytesIO()
            with zipfile.ZipFile(raw,'w') as archive,warnings.catch_warnings():
                warnings.simplefilter('ignore',UserWarning)
                if kind=='symlink':
                    item=zipfile.ZipInfo('events.jsonl');item.create_system=3;item.external_attr=0o120777<<16
                    archive.writestr(item,'/outside')
                else:
                    for i in range(2 if kind=='duplicate' else 5):archive.writestr('events.jsonl' if kind=='duplicate' else str(i),'x')
            with tempfile.TemporaryDirectory() as d,self.assertRaises(RuntimeError):feedback.safe_extract(raw.getvalue(),d)

if __name__=='__main__':unittest.main()
