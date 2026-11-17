import test from 'node:test';
import assert from 'node:assert/strict';
import { TimerEngine } from '../src/core/timer-engine.ts';

test('Timer Engine - Lifecycle and Virtual Clock', async (t) => {
  await t.test('starts a timer with positive duration', () => {
    const engine = new TimerEngine();
    const timer = engine.startTimer(300, 'Boil Pasta', 2);

    assert.equal(timer.durationSeconds, 300);
    assert.equal(timer.remainingSeconds, 300);
    assert.equal(timer.label, 'Boil Pasta');
    assert.equal(timer.stepIndex, 2);
    assert.equal(timer.isPaused, false);
    assert.equal(engine.getAllTimers().length, 1);
  });

  await t.test('throws on non-positive duration', () => {
    const engine = new TimerEngine();
    assert.throws(() => engine.startTimer(0), /greater than zero/);
    assert.throws(() => engine.startTimer(-10), /greater than zero/);
  });

  await t.test('pauses and resumes a timer', () => {
    const engine = new TimerEngine();
    const timer = engine.startTimer(60, 'Simmer');

    assert.equal(engine.pauseTimer(timer.id), true);
    assert.equal(engine.getTimer(timer.id)?.isPaused, true);

    // Ticking while paused does not decrement remaining time
    engine.tick(30);
    assert.equal(engine.getTimer(timer.id)?.remainingSeconds, 60);

    assert.equal(engine.resumeTimer(timer.id), true);
    assert.equal(engine.getTimer(timer.id)?.isPaused, false);

    // Now ticking decrements
    engine.tick(20);
    assert.equal(engine.getTimer(timer.id)?.remainingSeconds, 40);
  });

  await t.test('deterministically expires timer and fires listener', () => {
    const engine = new TimerEngine();
    const timer = engine.startTimer(10, 'Toast Garlic');

    let expiredFired = false;
    engine.onTimerExpired((t) => {
      if (t.id === timer.id) {
        expiredFired = true;
      }
    });

    const expiredMidway = engine.tick(5);
    assert.equal(expiredMidway.length, 0);
    assert.equal(expiredFired, false);
    assert.equal(engine.getTimer(timer.id)?.remainingSeconds, 5);

    const expiredEnd = engine.tick(5);
    assert.equal(expiredEnd.length, 1);
    assert.equal(expiredEnd[0].id, timer.id);
    assert.equal(expiredFired, true);
    assert.equal(engine.getAllTimers().length, 0);
  });

  await t.test('cancels active timer', () => {
    const engine = new TimerEngine();
    const timer = engine.startTimer(100, 'Roast');

    assert.equal(engine.cancelTimer(timer.id), true);
    assert.equal(engine.getAllTimers().length, 0);
    assert.equal(engine.getTimer(timer.id), undefined);
  });
});
