import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceCommand, parseDurationSeconds, extractStepTimers } from '../src/voice/command-parser.ts';

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

  await t.test('classifies timer intents (SET_TIMER, CHECK_TIMER, CANCEL_TIMER)', () => {
    // Set timer
    const t1 = parseVoiceCommand('set a timer for 10 minutes');
    assert.equal(t1.action, 'SET_TIMER');
    assert.equal(t1.payload?.durationSeconds, 600);

    const t2 = parseVoiceCommand('set timer for 5 minutes');
    assert.equal(t2.action, 'SET_TIMER');
    assert.equal(t2.payload?.durationSeconds, 300);

    const t3 = parseVoiceCommand('set a 15 minute timer');
    assert.equal(t3.action, 'SET_TIMER');
    assert.equal(t3.payload?.durationSeconds, 900);

    const t4 = parseVoiceCommand('set timer for 1 minute 30 seconds');
    assert.equal(t4.action, 'SET_TIMER');
    assert.equal(t4.payload?.durationSeconds, 90);

    const t5 = parseVoiceCommand('set a timer for 45 seconds');
    assert.equal(t5.action, 'SET_TIMER');
    assert.equal(t5.payload?.durationSeconds, 45);

    const t6 = parseVoiceCommand('set a pasta timer for 8 minutes');
    assert.equal(t6.action, 'SET_TIMER');
    assert.equal(t6.payload?.durationSeconds, 480);
    assert.equal(t6.payload?.timerLabel, 'pasta');

    // Check timer
    assert.equal(parseVoiceCommand('check timer').action, 'CHECK_TIMER');
    assert.equal(parseVoiceCommand('how much time is left?').action, 'CHECK_TIMER');
    assert.equal(parseVoiceCommand('timer status').action, 'CHECK_TIMER');
    assert.equal(parseVoiceCommand('time left on timer').action, 'CHECK_TIMER');

    // Cancel timer
    assert.equal(parseVoiceCommand('cancel timer').action, 'CANCEL_TIMER');
    assert.equal(parseVoiceCommand('stop timer').action, 'CANCEL_TIMER');
    assert.equal(parseVoiceCommand('clear timer').action, 'CANCEL_TIMER');

    // Assistant TTS announcements and step text must NOT trigger timer creation
    assert.notEqual(parseVoiceCommand('Starting a 10 minutes Step 3 timer.').action, 'SET_TIMER');
    assert.notEqual(parseVoiceCommand('10 minute timer started.').action, 'SET_TIMER');
    assert.notEqual(parseVoiceCommand('Ding! Your 10 minute timer is done!').action, 'SET_TIMER');
    assert.notEqual(parseVoiceCommand('Step 3: Bake in preheated oven for 10 minutes.').action, 'SET_TIMER');
    assert.notEqual(parseVoiceCommand('Your pasta timer is done').action, 'SET_TIMER');
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

test('Kitchen Timer - Duration Parsing & Step Timer Extraction', async (t) => {
  await t.test('parseDurationSeconds handles multiple formats', () => {
    assert.equal(parseDurationSeconds('10 minutes'), 600);
    assert.equal(parseDurationSeconds('1 minute 30 seconds'), 90);
    assert.equal(parseDurationSeconds('45 seconds'), 45);
    assert.equal(parseDurationSeconds('1 hour'), 3600);
    assert.equal(parseDurationSeconds('1.5 hours'), 5400);
    assert.equal(parseDurationSeconds('half an hour'), 1800);
    assert.equal(parseDurationSeconds('quarter of an hour'), 900);
    assert.equal(parseDurationSeconds('ten minutes'), 600);
    assert.equal(parseDurationSeconds('five minutes'), 300);
    assert.equal(parseDurationSeconds('no numbers here'), null);
  });

  await t.test('extractStepTimers finds durations in cooking instructions', () => {
    const s1 = 'Bake in preheated oven for 20 to 25 minutes until golden brown.';
    const timers1 = extractStepTimers(s1);
    assert.equal(timers1.length, 2);
    assert.equal(timers1[0].durationSeconds, 1200);
    assert.equal(timers1[1].durationSeconds, 1500);

    const s2 = 'Simmer the tomato sauce over low heat for 15 minutes, stirring occasionally.';
    const timers2 = extractStepTimers(s2);
    assert.equal(timers2.length, 1);
    assert.equal(timers2[0].durationSeconds, 900);

    const s3 = 'Rest the pizza dough covered for 1 hour at room temperature.';
    const timers3 = extractStepTimers(s3);
    assert.equal(timers3.length, 1);
    assert.equal(timers3[0].durationSeconds, 3600);

    const s4 = 'Chop onions and garlic finely.';
    const timers4 = extractStepTimers(s4);
    assert.equal(timers4.length, 0);
  });
});
