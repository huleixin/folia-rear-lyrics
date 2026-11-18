"""Remote deployment helper for Unified Tingyu Developer Console (Worker + D1 migrations + DPAPI secrets)."""
import argparse
import json
import os
import subprocess
from pathlib import Path
from feedback_credentials import prepare, read
from release_credentials import prepare_release_credentials, read_release_secret

# tools/deploy_feedback.py: secrets enter Wrangler through stdin, never CLI arguments or Git.
ROOT = Path(__file__).resolve().parents[1] / 'feedback-server'


def run(args, data=None):
    command = ['npx.cmd' if os.name == 'nt' else 'npx', 'wrangler', *args]
    result = subprocess.run(
        command,
        cwd=ROOT,
        input=data,
        text=True,
        encoding='utf-8',
        errors='replace',
        capture_output=True,
    )
    if result.returncode:
        # Never echo stdin; print only safe command name and truncated non-secret stderr reason if migration/deploy fails.
        safe_err = ''
        if args[0] != 'secret':
            safe_err = '\n' + (result.stderr or result.stdout)[-600:]
        raise RuntimeError('Wrangler operation failed: ' + ' '.join(args[:3]) + safe_err)
    print('Completed: ' + ' '.join(args[:3]))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--confirmed-remote-deployment', action='store_true')
    args = parser.parse_args()
    if not args.confirmed_remote_deployment:
        parser.error('Explicit migration/deployment confirmation required')

    prepare()
    prepare_release_credentials()

    k1 = read_release_secret('policy_signing_k1')
    secrets_payload = {
        'FEEDBACK_READ_TOKEN': read('read', allow_env=False)['token'],
        'FEEDBACK_ADMIN_TOKEN': read('admin', allow_env=False)['token'],
        'RELEASE_PREPARE_TOKEN': read_release_secret('release_prepare')['token'],
        'RELEASE_PUBLISH_SECRET': read_release_secret('release_publish')['token'],
        'UPDATE_SIGNING_KEY_ID': k1['keyId'],
        'UPDATE_SIGNING_PRIVATE_KEY_JWK': json.dumps({
            'keyId': k1['keyId'],
            'privateKeyJwk': k1['privateKeyJwk'],
        }),
    }

    run(['d1', 'migrations', 'apply', 'DB', '--remote'])
    run(['secret', 'bulk'], json.dumps(secrets_payload))
    run(['deploy'])
