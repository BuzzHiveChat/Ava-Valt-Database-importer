import test from 'node:test';
import assert from 'node:assert/strict';
import {displayedCreator,isUnknownCreatorAvatar,partitionUnknownCreators,unknownCreatorPreview}
 from '../lib/unknownCreatorCleanup.mjs';
const id = n => `avtr_00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const rec=(n,author,platforms=['PC'])=>({id:id(n),name:`Avatar ${n}`,author,platforms});

test('matches explicit by Unknown regardless of case/whitespace; not partial matches',()=>{
 assert.equal(isUnknownCreatorAvatar(rec(1,'Unknown')),true);
 assert.equal(isUnknownCreatorAvatar(rec(2,' uNkNoWn ')),true);
 assert.equal(isUnknownCreatorAvatar(rec(3,'The Unknown')),false);
 assert.equal(isUnknownCreatorAvatar(rec(4,'UnknownUser')),false);
 assert.equal(isUnknownCreatorAvatar(rec(5,'Unknown Artist')),false);
});

test('does not confuse unknown platform with unknown creator',()=>{
 const a=rec(1,'Known Creator',[]);
 const b=rec(2,'Known Creator',['Unknown']);
 const c=rec(3,'Unknown',['PC','Android','iOS']);
 const {keep,unknown}=partitionUnknownCreators([a,b,c]);
 assert.deepEqual(keep,[a,b]);
 assert.deepEqual(unknown,[c]);
});

test('uses author first, supports alternative names and missing creator labels',()=>{
 assert.equal(displayedCreator({author:'Unknown',creatorName:'Real'}),'Unknown');
 assert.equal(isUnknownCreatorAvatar({id:id(10),author:'',creatorName:'Good'}),false);
 assert.equal(isUnknownCreatorAvatar({id:id(10),author:{displayName:'Real'}}),false);
 assert.equal(isUnknownCreatorAvatar({id:id(10),author:null}),true);
 assert.equal(isUnknownCreatorAvatar({id:id(10),authorName:'Real'}),false);
 assert.equal(isUnknownCreatorAvatar({id:id(10),authorName:'Unknown'}),true);
 assert.equal(isUnknownCreatorAvatar({id:id(10),name:'Unknown Avatar',author:'Real'}),false);
});

test('preview is read-only, limits sample, and partition preserves original ordering and metadata',()=>{
 const rows=[rec(1,'Unknown'),rec(2,'Alice'),rec(3,'UNKNOWN')];
 const before=JSON.stringify(rows);
 const preview=unknownCreatorPreview(rows,1);
 assert.deepEqual({scanned:preview.scanned,found:preview.found}, {scanned:3,found:2});
 assert.equal(preview.sample.length,1);
 assert.equal(preview.sample[0].id,id(1));
 assert.equal(JSON.stringify(rows),before);
 assert.deepEqual(partitionUnknownCreators(rows).keep,[rows[1]]);
});

test('unusual or empty records cannot crash scan',()=>{
 const {keep,unknown}=partitionUnknownCreators([undefined,{}, {name:'x'}, {id:id(11),creator:{name:'Alice'}}, {id:id(12),author:{name:'Unknown'}}]);
 assert.equal(keep.length,4);
 assert.equal(unknown.length,1);
});
