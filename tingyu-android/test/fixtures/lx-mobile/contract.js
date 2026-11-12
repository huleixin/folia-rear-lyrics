/**
 * @name Tingyu mobile conformance
 * @version 1.0.0
 * @author Tingyu tests
 * @description Controlled fixture; no external music resolver.
 */
const vectors={"key":"0123456789abcdef","iv":"1234567890abcdef","plain":"听屿 UTF-8","cbc":"4f1f676ddc281d6c109786c2cc823966","ecb":"6d9e5a7196931102118548ec037535df","publicKey":"-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC03oF4tkoCwpC5i6NgpeSo6GOb\n2WXbuyEjeR6n/bRpzxlc0OybZdj/PiJBxY9+ZrV0JxHmORbxV8xpYqTcnEn3HDbJ\nMxws4XcBh3L+FlSENcpZLSUBGA6P4/6Ol3y69/YdvaldKEvZ8uQgnkVgbhrgDc7K\nDQpg2q6LiSvnLeO2zwIDAQAB\n-----END PUBLIC KEY-----\n","rsaInput":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,42],"rsaHex":"556510aef76a9e1268c0336601bf30dd7a395b4699c730378713e1509076e1ab13305daa89309dc17705595ddcad891c0cf4a0d6b20a222015c09a9c291fccff0c0350f0dd1d810faf74892116c47b60478068baf0fed6b9611686e24a1f013f58de26f2ed89490e3f5d3a8262f28d1139a84ea8fc7717b5275718c2d3f56775"};
const assert=(ok,label)=>{if(!ok)throw Error(label);};
const {buffer,crypto}=lx.utils;
assert(lx.env==='mobile'&&lx.version==='2.0.0','environment');
assert(lx.currentScriptInfo.rawScript.includes('@name'),'rawScript');
assert(typeof fetch==='undefined'&&typeof window==='undefined'&&typeof require==='undefined','isolation');
assert(Object.getOwnPropertyDescriptor(Array.prototype,'push').writable===false,'builtins protected');
Array.prototype.tingyuExtension=function(){return 7;};
assert([].tingyuExtension()===7,'builtin extension');
assert(crypto.md5('abc')==='900150983cd24fb0d6963f7d28e17f72','md5');
assert(buffer.bufToString(buffer.from('测试','utf8'),'utf8')==='测试','utf8');
assert(buffer.bufToString(crypto.aesEncrypt(vectors.plain,'aes-128-cbc',vectors.key,vectors.iv),'hex')===vectors.cbc,'aes cbc strings');
assert(buffer.bufToString(crypto.aesEncrypt(buffer.from(vectors.plain),'aes-128-ecb',buffer.from(vectors.key)),'hex')===vectors.ecb,'aes ecb bytes');
assert(buffer.bufToString(crypto.rsaEncrypt(vectors.rsaInput,vectors.publicKey),'hex')===vectors.rsaHex,'rsa no padding');
assert(crypto.randomBytes(16).length===16,'random bytes');
let cancelled=false;const timer=setTimeout(()=>{cancelled=true;},100);clearTimeout(timer);
lx.on(lx.EVENT_NAMES.request,function({source,action,info}){
 assert(this===lx,'handler this');
 if(info.musicInfo.test==='nonpromise')return 'https://example.com/no.mp3';
 return Promise.resolve().then(()=>{
  assert(!cancelled,'clearTimeout');
  if(action==='lyric')return {lyric:'[00:00.00]原文',tlyric:'[00:00.00]翻译',rlyric:'[00:00.00]roman',lxlyric:'[00:00.00]<0,100>原文'};
  if(action==='pic')return 'https://example.com/cover.jpg';
  if(info.musicInfo.test==='invalid')return '';
  if(source==='local')assert(info.type===null,'local type null');
  return 'https://example.com/fixture.wav';
 });
}).then(()=>setTimeout(()=>lx.send(lx.EVENT_NAMES.inited,{sources:{tx:{type:'music',actions:['musicUrl'],qualitys:['128k','320k','flac','flac24bit']},local:{type:'music',actions:['musicUrl','lyric','pic'],qualitys:[]}}}),5));
