import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceCommand } from '../src/voice/command-parser.ts';

test('Voice Command Parser - Intent Classification', async (t) => {
  await t.test('classifies NEXT_STEP intents', () => {
    assert.equal(parseVoiceCommand('next').action, 'NEXT_STEP');
    assert.equal(parseVoiceCommand('next step').action, 'NEXT_STEP');
    assert.equal(parseVoiceCommand('start recipe').action, 'NEXT_STEP');
    assert.equal(parseVoiceCommand('start cooking').action, 'NEXT_STEP');
    assert.equal(parseVoiceCommand('start').action, 'NEXT_STEP');
    assert.equal(parseVoiceCommand('begin').action, 'NEXT_STEP');
    assert.equal(parseVoiceCommand('continue').action, 'NEXT_STEP');
    assert.equal(parseVoiceCommand('what is next').action, 'NEXT_STEP');
    assert.equal(parseVoiceCommand('done').action, 'NEXT_STEP');
  });

  await t.test('classifies PREVIOUS_STEP intents', () => {
    assert.equal(parseVoiceCommand('back').action, 'PREVIOUS_STEP');
    assert.equal(parseVoiceCommand('previous step').action, 'PREVIOUS_STEP');
    assert.equal(parseVoiceCommand('go back').action, 'PREVIOUS_STEP');
  });

  await t.test('classifies REPEAT_STEP intents', () => {
    assert.equal(parseVoiceCommand('repeat').action, 'REPEAT_STEP');
    assert.equal(parseVoiceCommand('repeat step').action, 'REPEAT_STEP');
    assert.equal(parseVoiceCommand('say that again').action, 'REPEAT_STEP');
    assert.equal(parseVoiceCommand('what was that').action, 'REPEAT_STEP');
  });

  await t.test('classifies JUMP_TO_STEP with target number', () => {
    const res = parseVoiceCommand('jump to step 4');
    assert.equal(res.action, 'JUMP_TO_STEP');
    assert.equal(res.payload?.stepIndex, 4);

    const res2 = parseVoiceCommand('go to step 2');
    assert.equal(res2.action, 'JUMP_TO_STEP');
    assert.equal(res2.payload?.stepIndex, 2);

    const res3 = parseVoiceCommand('step 3');
    assert.equal(res3.action, 'JUMP_TO_STEP');
    assert.equal(res3.payload?.stepIndex, 3);

    // Spoken sentences during narration must NOT trigger jump commands
    const notJump = parseVoiceCommand('Step 3. Melt the butter in a large skillet over medium heat.');
    assert.notEqual(notJump.action, 'JUMP_TO_STEP');
  });

  await t.test('classifies QUERY_INGREDIENT queries', () => {
    const cmd1 = parseVoiceCommand('how much butter do I need?');
    assert.equal(cmd1.action, 'QUERY_INGREDIENT');
    assert.equal(cmd1.payload?.ingredientName, 'butter');

    const cmd2 = parseVoiceCommand('how many eggs');
    assert.equal(cmd2.action, 'QUERY_INGREDIENT');
    assert.equal(cmd2.payload?.ingredientName, 'eggs');
  });

  await t.test('classifies STOP and interrupt intents', () => {
    assert.equal(parseVoiceCommand('stop').action, 'STOP');
    assert.equal(parseVoiceCommand('pause').action, 'STOP');
    assert.equal(parseVoiceCommand('be quiet').action, 'STOP');
    assert.equal(parseVoiceCommand('quiet').action, 'STOP');
    assert.equal(parseVoiceCommand('stop talking').action, 'STOP');
    assert.equal(parseVoiceCommand('silence').action, 'STOP');
    assert.equal(parseVoiceCommand('stop reading').action, 'STOP');
    assert.equal(parseVoiceCommand('please stop').action, 'STOP');
    assert.equal(parseVoiceCommand('preheat oven to 375 degrees stop').action, 'STOP');
  });
});
