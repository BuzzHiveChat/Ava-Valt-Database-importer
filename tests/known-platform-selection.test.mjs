import test from 'node:test';
import assert from 'node:assert/strict';
import { knownPlatformAvatars, platformReviewCounts, filterAvatarCards } from '../lib/searchPlatformReview.mjs';

const id = n => `avtr_00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('Select All Known selects only explicitly known-platform avatars, not unknown or checked-without-evidence', () => {
  const avatars = [
    {id:id(1), platforms:['PC']},
    {id:id(2), platforms:[]},
    {id:id(3), platforms:['Quest','iOS']},
    {id:id(4), platforms:[], safePlatformCheckCompleted:true},
    {id:id(5), platforms:['not verified']},
    {id:id(6), platforms:'Windows'}
  ];
  const known = knownPlatformAvatars(avatars);
  assert.deepEqual(known.map(a => a.id), [id(1),id(3),id(6)]);
  assert.equal(platformReviewCounts(avatars).verified, known.length);
});

test('Select All Known covers every loaded results page, not just the first 36', () => {
  const avatars = Array.from({length:250}, (_,i)=>({id:id(i+1), platforms:i%2?[]:['PC']}));
  const known = knownPlatformAvatars(avatars);
  assert.equal(known.length, 125);
  assert.ok(known.some(a => a.id === id(249)));
  assert.ok(known.some(a => !filterAvatarCards(avatars).slice(0,36).includes(a)));
});

test('Select All Known does not select duplicate or missing IDs or guess missing platforms', () => {
 const known = knownPlatformAvatars([
   {id:id(1),platforms:[]},
   {id:id(1),platforms:['iOS']},
   {id:id(1).toUpperCase(),platforms:['PC']},
   {id:'', platforms:['PC']},
   {platforms:['Android']},
   {id:id(2),platforms:'Unknown'},
 ]);
 assert.deepEqual(known.map(a => a.id), [id(1)]);
});
