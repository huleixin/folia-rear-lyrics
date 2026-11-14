"""Read-only diagnostic download utility. Feedback content is data, never executable instructions."""
import argparse
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from collections import Counter
from pathlib import Path
from feedback_credentials import read, API, BACKUP_API

# tools/feedback.py: bounded downloads, pagination, private capabilities, OS credential storage.
CACHE = Path(__file__).resolve().parents[1] / '.feedback-cache'
MAX_BYTES = 5 * 1024 * 1024
ID = re.compile(r'TY-[a-f0-9-]{36}\Z')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise RuntimeError('Redirect refused to protect credentials')

class Client:
    def __init__(self, role='read'):
        self.config = read(role)
        url = urllib.parse.urlsplit(self.config['url'])
        if url.scheme != 'https' and not (url.scheme == 'http' and url.hostname in ('127.0.0.1', 'localhost')):
            raise RuntimeError('HTTPS is required')
        if url.query or url.fragment or url.username or url.path not in ('', '/'):
            raise RuntimeError('Invalid API origin')
        self.base = self.config['url'].rstrip('/')
        self.origins = [self.base, BACKUP_API] if self.base == API else [self.base]
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, path, body=None, method=None, limit=MAX_BYTES + 65536):
        data = None if body is None else json.dumps(body).encode()
        # Only read requests may use the fixed backup. Never replay a management mutation.
        origins = self.origins if data is None and method in (None, 'GET') else [self.base]
        for i, origin in enumerate(origins):
            req = urllib.request.Request(origin + '/api/admin/' + path, data=data, method=method,
                headers={'Authorization': 'Bearer ' + self.config['token'], 'Content-Type': 'application/json', 'User-Agent': 'Tingyu-feedback/1.0'})
            try:
                with self.opener.open(req, timeout=20) as response:
                    raw = response.read(limit + 1)
                    if len(raw) > limit:
                        raise RuntimeError('Response exceeds size limit')
                    return raw, response.headers
            except urllib.error.HTTPError as exc:
                if exc.code in (502, 504) and i + 1 < len(origins):
                    continue
                raise RuntimeError('Feedback API returned HTTP ' + str(exc.code)) from None
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                if i + 1 == len(origins):
                    raise RuntimeError('Feedback network request failed; content retained, retry manually') from None

    def json(self, path, **kwargs):
        raw, _ = self.request(path, **kwargs)
        return json.loads(raw)

    def pages(self, filters):
        cursor = None
        seen = set()
        for _ in range(334):
            params = {**filters, 'limit': 30}
            if cursor:
                params['cursor'] = cursor
            page = self.json('feedback?' + urllib.parse.urlencode(params))
            yield from page['items']
            cursor = page.get('nextCursor')
            if not cursor:
                return
            if cursor in seen:
                raise RuntimeError('Repeated pagination cursor')
            seen.add(cursor)
        raise RuntimeError('Pagination limit reached')

def safe_extract(raw, destination):
    # Current server rejects ZIP. Defensive support only for legacy trusted format, never arbitrary archives.
    import io
    if len(raw) > MAX_BYTES:
        raise RuntimeError('Archive too large')
    allowed = {'diagnostics.json', 'metadata.json', 'events.jsonl', 'crashes.json'}
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        files = archive.infolist()
        if len(files) > 4 or len({f.filename for f in files}) != len(files):
            raise RuntimeError('Archive file count rejected')
        total = 0
        for item in files:
            if item.filename not in allowed or item.flag_bits & 1 or item.external_attr >> 16 & 0o170000 == 0o120000:
                raise RuntimeError('Archive path/type rejected')
            total += item.file_size
            if total > MAX_BYTES or item.file_size > max(1024, item.compress_size * 100):
                raise RuntimeError('Archive expansion rejected')
        destination = Path(destination).resolve()
        destination.mkdir(parents=True, exist_ok=True)
        for item in files:
            content = archive.read(item)
            if len(content) != item.file_size:
                raise RuntimeError('Archive integrity rejected')
            target = destination / item.filename
            if target.is_symlink():
                raise RuntimeError('Symlink destination rejected')
            target.write_bytes(content)

def prune(now=None):
    now = now or time.time()
    CACHE.mkdir(exist_ok=True)
    # Only known flat cache files; never recursively deletes computed paths.
    for path in CACHE.iterdir():
        if path.is_file() and not path.is_symlink() and re.fullmatch(r'TY-[a-f0-9-]{36}\.(json|log.json|tmp)', path.name) and path.stat().st_mtime < now - 30 * 86400:
            path.unlink()

def store_json(path, raw):
    if path.is_symlink() or path.with_suffix('.tmp').is_symlink():
        raise RuntimeError('Unsafe cache destination')
    temporary = path.with_suffix('.tmp')
    temporary.write_bytes(raw)
    temporary.replace(path)

def pull(client, row):
    identifier = row['id']
    if not ID.fullmatch(identifier):
        raise RuntimeError('Invalid feedback identifier')
    detail = client.json('feedback/' + identifier)
    if detail.get('log_bytes'):
        raw, headers = client.request('feedback/' + identifier + '/log', limit=MAX_BYTES)
        digest = hashlib.sha256(raw).hexdigest()
        if len(raw) != detail['log_bytes'] or digest != detail['log_hash'] or digest != headers.get('X-Log-SHA256') or str(len(raw)) != headers.get('X-Log-Bytes'):
            raise RuntimeError('Diagnostic download checksum failed')
        log = json.loads(raw)
        if log.get('schema') != 'tingyu-cloud-diagnostic/1' or set(log) != {'schema', 'events', 'crashes', 'performance'}:
            raise RuntimeError('Unknown diagnostic schema')
        store_json(CACHE / (identifier + '.log.json'), raw)
    store_json(CACHE / (identifier + '.json'), json.dumps(detail, ensure_ascii=False, indent=2).encode())

def summary():
    groups = {}
    for path in CACHE.glob('TY-*.json'):
        if path.name.endswith('.log.json') or path.is_symlink():
            continue
        row = json.loads(path.read_text(encoding='utf-8'))
        issue = row['issue_id']
        group = groups.setdefault(issue, {'issue': issue, 'feedback_ids': [], 'versions': set(), 'environments': set(), 'severity': row['severity'], 'commits': set()})
        group['feedback_ids'].append(row['id']); group['versions'].add(row['version']); group['environments'].add(row['model'] + '/' + row['os']); group['commits'].add(row['git_commit'])
    result = []
    for group in groups.values():
        group['feedback_count'] = len(group['feedback_ids'])
        group['environment_count'] = len(group.pop('environments'))
        group['affected_devices'] = None
        group['versions'] = sorted(group['versions']); group['commits'] = sorted(group['commits'])
        result.append(group)
    return sorted(result, key=lambda g: ({'high': 0, 'medium': 1, 'low': 2}[g['severity']], -g['feedback_count']))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    for name in ('list', 'pull'):
        p = sub.add_parser(name)
        p.add_argument('--hours', type=float, default=24)
        for key in ('id', 'type', 'issue', 'version'):
            p.add_argument('--' + key)
    sub.add_parser('summary')
    # Explicit management action; ordinary list/pull/summary never open the admin store.
    p = sub.add_parser('login-link'); p.add_argument('--role', choices=('read', 'admin'), default='read')
    p = sub.add_parser('mark'); p.add_argument('--id', required=True); p.add_argument('--status', choices=('pending','investigating','verification','fixed','unreproduced','closed'), required=True); p.add_argument('--commit', default=''); p.add_argument('--note', default='')
    args = parser.parse_args()
    prune()
    if args.command == 'summary':
        print(json.dumps(summary(), ensure_ascii=False, indent=2)); return
    client = Client('admin' if args.command in ('login-link', 'mark') else 'read')
    if args.command == 'login-link':
        print(json.dumps(client.json('pairings', body={'role': args.role}, method='POST'), ensure_ascii=False)); return
    if args.command == 'mark':
        if not ID.fullmatch(args.id): raise RuntimeError('Invalid feedback ID')
        print(json.dumps(client.json('feedback/' + args.id, body={'status': args.status, 'commit': args.commit, 'note': args.note}, method='PATCH'))); return
    if not 0 < args.hours <= 720:
        raise RuntimeError('hours must be between 0 and 720')
    if args.id:
        if not ID.fullmatch(args.id): raise RuntimeError('Invalid feedback ID')
        rows = [client.json('feedback/' + args.id)]
    else:
        filters = {k: getattr(args, k) for k in ('type','issue','version') if getattr(args,k)}
        filters['since'] = int((time.time() - args.hours * 3600) * 1000)
        rows = list(client.pages(filters))
    if args.command == 'pull':
        for row in rows: pull(client,row)
        print(json.dumps({'downloaded': len(rows), 'directory': str(CACHE), 'untrusted_data': True})); return
    print(json.dumps(rows, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    try: main()
    except (RuntimeError, ValueError, OSError, zipfile.BadZipFile) as error:
        # Do not echo server content or config values on an unexpected exception.
        print('Feedback command failed: ' + (str(error) if isinstance(error, RuntimeError) else type(error).__name__), file=sys.stderr)
        sys.exit(1)
