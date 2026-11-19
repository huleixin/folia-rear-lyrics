import assert from 'node:assert/strict';
import test from 'node:test';
import { privateBetaVerificationReady } from './release-cli.mjs';

// Private publication requires fresh byte-for-byte and Range verification on both protected nodes.
const now=10000000,target={id:'rel-private_beta-fixture',sha256:'abc'};
function receipt(){return {id:target.id,verification:{sha256:target.sha256,fullPrivateDownload:true,verifiedAt:now,
    nodes:{primary:{accessible:true,rangeVerified:true,sha256:'abc'},backup:{accessible:true,rangeVerified:true,sha256:'abc'}}}};}
test('accepts only a fresh, matching, fully downloaded private candidate',()=>{
    assert.equal(privateBetaVerificationReady(receipt(),target,now),true);
    assert.equal(privateBetaVerificationReady(null,target,now),false);
    assert.equal(privateBetaVerificationReady(receipt(),{...target,sha256:'changed'},now),false);
    assert.equal(privateBetaVerificationReady(receipt(),target,now+3600001),false);
    assert.equal(privateBetaVerificationReady(receipt(),target,now-1),false);
});
test('refuses metadata-only, failed mirror and failed range receipts',()=>{
    for(const field of ['accessible','rangeVerified']){
        const draft=receipt();draft.verification.nodes.backup[field]=false;
        assert.equal(privateBetaVerificationReady(draft,target,now),false);
    }
    const draft=receipt();draft.verification.fullPrivateDownload=false;
    assert.equal(privateBetaVerificationReady(draft,target,now),false);
});
