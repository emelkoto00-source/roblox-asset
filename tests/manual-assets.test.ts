import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateManualRequest,safeAssetName,originalIdFromPath,isManualAssetPath } from '../apps/web/src/lib/manualAssets';

const one={name:'photo.png',size:1024};
const base={workflow:'upload',owner:'user',sourceId:'',rights:'',confirmed:true,files:[one]};

test('multiple authorized image uploads are allowed',()=>{
  assert.doesNotThrow(()=>validateManualRequest({...base,files:[one,one,one]}));
  assert.doesNotThrow(()=>validateManualRequest({...base,owner:'group'}));
});
test('reject missing files, invalid owners, and missing rights attestation',()=>{
  for(const input of [{...base,files:[]},{...base,owner:'random'},{...base,confirmed:false},
    {...base,files:Array.from({length:31},()=>one)},{...base,files:[{name:'huge.png',size:9_000_000}]}]){
    assert.throws(()=>validateManualRequest(input));
  }
});
test('migration requires exactly one original image, numeric source ID, and authorized rights',()=>{
  assert.doesNotThrow(()=>validateManualRequest({...base,workflow:'migration',sourceId:'123456789',rights:'owned'}));
  assert.doesNotThrow(()=>validateManualRequest({...base,workflow:'migration',sourceId:'123456789',rights:'licensed'}));
  for(const input of [{...base,workflow:'migration',sourceId:'bad',rights:'owned'},
    {...base,workflow:'migration',sourceId:'123',rights:'none'},
    {...base,workflow:'migration',sourceId:'123',rights:'owned',files:[one,one]}]){
    assert.throws(()=>validateManualRequest(input));
  }
});
test('normalization does not allow path injection or an empty file name',()=>{
  assert.equal(safeAssetName('folder\\../../CYBER! 星.png'),'CYBER');
  assert.equal(safeAssetName('%%%..png'),'image');
  assert.equal(safeAssetName('my best image.webp'),'my_best_image');
});
test('only migration paths expose the original ID',()=>{
  assert.equal(originalIdFromPath('Authorized_Migrations/123/001_foo.png'),'123');
  assert.equal(originalIdFromPath('Manual_Images/001_foo.png'),null);
  assert.ok(isManualAssetPath('Authorized_Migrations/123/001_foo.png'));
  assert.ok(isManualAssetPath('Manual_Images/001_foo.png'));
  assert.ok(!isManualAssetPath('01_Sparkles/test.png'));
});
