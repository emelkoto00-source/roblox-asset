import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateAssetId,validateOwner,safeFilename,readRobloxMetadata} from '../apps/web/src/lib/assetLookup';

test('asset IDs accept digits only and reject URLs, traversal and excessive length',()=>{
  for(const id of ['1','12345678901234567890'])
    assert.equal(validateAssetId(id),id);
  for(const id of ['','-1','012a','https://roblox.com/123','../../etc/passwd','1'.repeat(21),'1 2'])
    assert.throws(()=>validateAssetId(id));
});
test('creator selection only permits existing user/group key sets',()=>{
  assert.equal(validateOwner('user'),'user');
  assert.equal(validateOwner('group'),'group');
  assert.throws(()=>validateOwner('other'));
});
test('safe download names remove path and special character sequences',()=>{
  assert.equal(safeFilename('E:/secret/my cool.png'),'my_cool');
  assert.equal(safeFilename('...png'),'asset');
});
test('read Roblox metadata without claiming download permissions',()=>{
  const obj=readRobloxMetadata({
    asset:{assetId:'123',assetType:'Model',displayName:'Test',
      creationContext:{creator:{groupId:'456'}}}
  },'123');
  assert.equal(obj?.assetType,'Model');
  assert.equal(obj?.creatorType,'group');
  assert.equal(obj?.creatorId,'456');
  assert.equal(obj?.name,'Test');
});
test('handles missing metadata conservatively',()=>{
  assert.equal(readRobloxMetadata(null,'123'),null);
  const m=readRobloxMetadata({assetType:'Animation'},'123');
  assert.equal(m?.creatorType,null);
  assert.equal(m?.assetType,'Animation');
});
