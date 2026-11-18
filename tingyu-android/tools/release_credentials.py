"""OS-protected release & policy signing credential manager (Windows DPAPI / OS keyring).
Never prints, logs, or writes private keys or tokens into the repository."""
import argparse
import ctypes
import json
import os
import secrets
import subprocess
from pathlib import Path
from feedback_credentials import STORE, API, protect, save as dpapi_save, read as dpapi_read

# tools/release_credentials.py
ROOT = Path(__file__).resolve().parents[1]
TRUST_ANCHORS_FILE = ROOT / 'shared' / 'updateTrustAnchors.json'

ROLES_TOKEN = ('release_prepare', 'release_publish')
KEY_SLOTS = (
    ('policy_signing_k1', 'tingyu-policy-2026-k1', 'active'),
    ('policy_signing_k2_backup', 'tingyu-policy-2026-k2-backup', 'backup'),
)


def _exists(slot: str) -> bool:
    if os.name == 'nt':
        return (STORE / f'{slot}.dpapi').exists()
    try:
        dpapi_read(slot, allow_env=False)
        return True
    except Exception:
        return False


def _generate_ec_p256_keypair(key_id: str) -> dict:
    script = """
    const crypto = require('node:crypto');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const spkiB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const pubJwk = publicKey.export({ format: 'jwk' });
    const privJwk = privateKey.export({ format: 'jwk' });
    process.stdout.write(JSON.stringify({ spkiBase64: spkiB64, publicKeyJwk: pubJwk, privateKeyJwk: privJwk }));
    """
    out = subprocess.check_output(['node', '-e', script], text=True, encoding='utf-8')
    parsed = json.loads(out)
    return {
        'keyId': key_id,
        'algorithm': 'ECDSA-P256-SHA256',
        'publicKeySpkiBase64': parsed['spkiBase64'],
        'publicKeyJwk': parsed['publicKeyJwk'],
        'privateKeyJwk': parsed['privateKeyJwk'],
    }


def prepare_release_credentials() -> dict:
    """Idempotently initializes missing tokens/keypairs in DPAPI and exports ONLY public trust anchors."""
    for role in ROLES_TOKEN:
        if _exists(role):
            dpapi_read(role, allow_env=False)
        else:
            dpapi_save(role, {'url': API, 'token': secrets.token_hex(32)})

    anchors = {}
    active_key_id = KEY_SLOTS[0][1]
    for slot, key_id, status in KEY_SLOTS:
        if _exists(slot):
            record = dpapi_read(slot, allow_env=False)
        else:
            record = _generate_ec_p256_keypair(key_id)
            dpapi_save(slot, record)
        anchors[record['keyId']] = {
            'keyId': record['keyId'],
            'algorithm': 'ECDSA-P256-SHA256',
            'status': status,
            'spkiBase64': record['publicKeySpkiBase64'],
        }

    trust_doc = {
        'schemaVersion': 1,
        'activeKeyId': active_key_id,
        'keys': anchors,
    }
    TRUST_ANCHORS_FILE.parent.mkdir(parents=True, exist_ok=True)
    TRUST_ANCHORS_FILE.write_text(json.dumps(trust_doc, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    return trust_doc


def read_release_secret(slot: str) -> dict:
    return dpapi_read(slot, allow_env=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare', action='store_true', help='Initialize DPAPI release keys & export public trust anchors')
    parser.add_argument('--status', action='store_true', help='Show non-sensitive credential slot readiness')
    parser.add_argument('--ipc-stdin', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args()

    if args.ipc_stdin:
        import sys
        if os.environ.get('TINGYU_INTERNAL_IPC') != '1':
            raise SystemExit('IPC mode restricted to local release-cli child pipe.')
        req = json.loads(sys.stdin.read())
        slot = str(req.get('slot', ''))
        allowed = {'read', 'admin', *ROLES_TOKEN, *(s[0] for s in KEY_SLOTS)}
        if slot not in allowed:
            raise SystemExit('Disallowed credential slot.')
        sys.stdout.write(json.dumps(dpapi_read(slot, allow_env=False)))
        sys.stdout.flush()
        raise SystemExit(0)

    if args.prepare or not args.status:
        doc = prepare_release_credentials()
        print(f"Prepared DPAPI release credentials & exported public trust anchors ({len(doc['keys'])} public keys). No secrets printed.")
    if args.status:
        slots = [*ROLES_TOKEN, *(s[0] for s in KEY_SLOTS), 'read', 'admin']
        status_map = {slot: _exists(slot) for slot in slots}
        print(json.dumps({'storeDir': str(STORE), 'configuredSlots': status_map}, indent=2))
