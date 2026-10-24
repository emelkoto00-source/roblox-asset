import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isNumberedArtifactAnimationFrame } from '../packages/core/src/artifactScanner';

test('LEVEL_FRAME is a static decoration, not a numbered animation frame',()=>{
  for(const kind of ['LEVEL_FRAME','MAIN','BASE','CORE','ORNAMENTS','GLINTS',
    'IDLE_SHEET','REVEAL_SHEET','REACTION_SHEET']){
    assert.equal(isNumberedArtifactAnimationFrame(kind),false,kind);
  }
});
test('only numbered frames of valid animations require a frame number',()=>{
  for(const kind of ['IDLE_FRAME','REVEAL_FRAME','REACTION_FRAME']){
    assert.equal(isNumberedArtifactAnimationFrame(kind),true,kind);
  }
  for(const kind of ['FAKE_FRAME','FRAME','LOOP_FRAME']){
    assert.equal(isNumberedArtifactAnimationFrame(kind),false,kind);
  }
});
