"""User-scoped encrypted credential storage; never prints or writes plaintext secrets."""
import ctypes
import json
import os
import secrets
import subprocess
from pathlib import Path

# tools/feedback_credentials.py: DPAPI on Windows, OS keyring elsewhere; read/admin stores separated.
API = 'https://feedback.20262000.xyz'
BACKUP_API = 'https://tingyu-feedback-api.2473297053.workers.dev'
STORE = Path(os.environ.get('LOCALAPPDATA', Path.home() / '.config')) / 'TingyuFeedback'

def protect(data, decrypt=False):
    class Blob(ctypes.Structure):
        _fields_ = [('size', ctypes.c_ulong), ('data', ctypes.POINTER(ctypes.c_ubyte))]
    buffer = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)))
    output = Blob()
    call = ctypes.windll.crypt32.CryptUnprotectData if decrypt else ctypes.windll.crypt32.CryptProtectData
    if not call(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(output)):
        raise RuntimeError('Windows credential encryption failed')
    try:
        return ctypes.string_at(output.data, output.size)
    finally:
        ctypes.windll.kernel32.LocalFree(output.data)

def save(role, value):
    raw = json.dumps(value).encode()
    if os.name == 'nt':
        STORE.mkdir(parents=True, exist_ok=True)
        user = subprocess.check_output(['whoami'], text=True).strip()
        result = subprocess.run(['icacls', str(STORE), '/inheritance:r', '/grant:r', user + ':(OI)(CI)F'], capture_output=True)
        if result.returncode:
            raise RuntimeError('Cannot restrict credential directory permissions')
        path = STORE / (role + '.dpapi')
        temp = path.with_suffix('.tmp')
        temp.write_bytes(protect(raw))
        temp.replace(path)
    else:
        import keyring
        keyring.set_password('tingyu-feedback', role, raw.decode())

def read(role='read', allow_env=True):
    if allow_env and role == 'read' and os.environ.get('TINGYU_FEEDBACK_READ_TOKEN'):
        return {'url': os.environ.get('TINGYU_FEEDBACK_API_URL', API), 'token': os.environ['TINGYU_FEEDBACK_READ_TOKEN']}
    if os.name == 'nt':
        path = STORE / (role + '.dpapi')
        if not path.exists():
            raise RuntimeError('Feedback credentials not configured')
        value = json.loads(protect(path.read_bytes(), True))
    else:
        import keyring
        raw = keyring.get_password('tingyu-feedback', role)
        if not raw:
            raise RuntimeError('Feedback credentials not configured')
        value = json.loads(raw)
    if allow_env and os.environ.get('TINGYU_FEEDBACK_API_URL'):
        value['url'] = os.environ['TINGYU_FEEDBACK_API_URL']
    return value

def migrate_origin():
    # Update known legacy origins in encrypted stores without rotating or exposing either credential.
    for role in ('read', 'admin'):
        value = read(role, allow_env=False)
        if value['url'].rstrip('/') == BACKUP_API:
            save(role, {**value, 'url': API})

def prepare():
    # Preserve existing credentials across retries; rotating requires an explicit separate procedure.
    for role in ('read', 'admin'):
        if os.name == 'nt' and (STORE / (role + '.dpapi')).exists():
            read(role, allow_env=False)  # Corruption/permission failure must not replace an existing secret.
            continue
        try:
            read(role, allow_env=False)
        except (RuntimeError, FileNotFoundError):
            save(role, {'url': API, 'token': secrets.token_hex(32)})

if __name__ == '__main__':
    prepare()
    print('Read and admin credentials saved in separate OS-protected stores; no secrets displayed.')
