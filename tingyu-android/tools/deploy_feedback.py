"""Remote deployment helper. Run only after the user's migration/deployment confirmation."""
import argparse
import json
import os
import subprocess
from pathlib import Path
from feedback_credentials import prepare, read

# tools/deploy_feedback.py: secrets enter Wrangler through stdin, never CLI arguments or Git.
ROOT = Path(__file__).resolve().parents[1] / 'feedback-server'
def run(args, data=None):
    command = ['npx.cmd' if os.name == 'nt' else 'npx', 'wrangler', *args]
    result = subprocess.run(command, cwd=ROOT, input=data, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError('Wrangler operation failed: ' + ' '.join(args[:3]))
    # Wrangler responses can change; do not echo raw output for secret operations.
    print('Completed: ' + ' '.join(args[:3]))

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('--confirmed-remote-deployment',action='store_true'); args=parser.parse_args()
    if not args.confirmed_remote_deployment: parser.error('Explicit migration/deployment confirmation required')
    prepare()
    run(['d1','migrations','apply','DB','--remote'])
    run(['secret','bulk'], json.dumps({'FEEDBACK_READ_TOKEN':read(allow_env=False)['token'],'FEEDBACK_ADMIN_TOKEN':read('admin',allow_env=False)['token']}))
    run(['deploy'])
