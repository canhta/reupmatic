import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceLifecycle } from '../../dist-node/electron/runtime/workspace-lifecycle.js';

function fakeWire() {
  const handlers = new Map();
  const wire = (name, handler) => handlers.set(name, handler);
  wire.call = (name, input) => handlers.get(name)(input);
  return wire;
}

function fakeWindow() {
  let closeListener;
  return {
    destroyed: false,
    on(event, listener) {
      if (event === 'close') closeListener = listener;
    },
    destroy() {
      this.destroyed = true;
    },
    isDestroyed() {
      return this.destroyed;
    },
    triggerClose() {
      const event = { prevented: false, preventDefault: () => (event.prevented = true) };
      closeListener(event);
      return event;
    },
  };
}

function participant(name, { activeCount = 0, order, delayMs = 0 } = {}) {
  return {
    activeCount,
    closed: false,
    async close() {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      this.closed = true;
      order?.push(name);
    },
  };
}

function admission(name, order) {
  return {
    begun: false,
    beginClose() {
      this.begun = true;
      order?.push(name);
    },
  };
}

function baseConfig(overrides = {}) {
  return {
    wire: fakeWire(),
    steps: [],
    recoveryFlush: async () => true,
    confirm: async () => 'save',
    ...overrides,
  };
}

test('clean close: nothing dirty, nothing active, no confirmation dialog shown', async () => {
  let quitAsked = false;
  const p = participant('a');
  const wire = fakeWire();
  const lifecycle = createWorkspaceLifecycle(
    baseConfig({
      wire,
      steps: [{ kind: 'participants', participants: [p] }],
      confirm: async (kind) => {
        if (kind === 'quit') quitAsked = true;
        return 'save';
      },
    }),
  );
  const win = fakeWindow();
  lifecycle.attach(win);
  const event = win.triggerClose();

  assert.equal(event.prevented, true, 'close is always intercepted first');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(quitAsked, false, 'a non-busy close must not prompt to quit');
  assert.equal(p.closed, true);
  assert.equal(win.destroyed, true);
});

test('dirty close: session-dirty makes the window busy and shows the quit confirmation', async () => {
  let quitAsked = false;
  const p = participant('a');
  const wire = fakeWire();
  const lifecycle = createWorkspaceLifecycle(
    baseConfig({
      wire,
      steps: [{ kind: 'participants', participants: [p] }],
      confirm: async (kind) => {
        if (kind === 'quit') quitAsked = true;
        return 'save';
      },
    }),
  );
  wire.call('session-dirty', { dirty: true });
  const win = fakeWindow();
  lifecycle.attach(win);
  win.triggerClose();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(quitAsked, true, 'a dirty close must prompt to quit');
  assert.equal(p.closed, true);
  assert.equal(win.destroyed, true);
});

test('quit context: dirty and running are reported to confirm() as received', async () => {
  const seen = [];
  const busy = participant('busy', { activeCount: 2 });
  const wire = fakeWire();
  const lifecycle = createWorkspaceLifecycle(
    baseConfig({
      wire,
      steps: [{ kind: 'participants', participants: [busy] }],
      confirm: async (kind, _language, context) => {
        seen.push({ kind, ...context });
        return 'cancel';
      },
    }),
  );
  wire.call('session-dirty', { dirty: true });
  const win = fakeWindow();
  lifecycle.attach(win);
  win.triggerClose();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(seen, [{ kind: 'quit', dirty: true, running: true }]);
});

test('"discard" on the quit prompt skips the recovery flush entirely and still closes', async () => {
  let flushCalls = 0;
  const p = participant('a');
  const wire = fakeWire();
  const lifecycle = createWorkspaceLifecycle(
    baseConfig({
      wire,
      steps: [{ kind: 'participants', participants: [p] }],
      recoveryFlush: async () => {
        flushCalls++;
        return true;
      },
      confirm: async (kind) => (kind === 'quit' ? 'discard' : 'save'),
    }),
  );
  wire.call('session-dirty', { dirty: true });
  const win = fakeWindow();
  lifecycle.attach(win);
  win.triggerClose();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(flushCalls, 0, 'discarding must not flush the recovery draft');
  assert.equal(p.closed, true);
  assert.equal(win.destroyed, true);
});

test('an active participant also blocks a silent close, even when not dirty', async () => {
  let quitAsked = false;
  const busy = participant('busy', { activeCount: 1 });
  const wire = fakeWire();
  const lifecycle = createWorkspaceLifecycle(
    baseConfig({
      wire,
      steps: [{ kind: 'participants', participants: [busy] }],
      confirm: async (kind) => {
        if (kind === 'quit') quitAsked = true;
        return 'cancel';
      },
    }),
  );
  const win = fakeWindow();
  lifecycle.attach(win);
  win.triggerClose();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(quitAsked, true);
  assert.equal(win.destroyed, false, 'declining the quit prompt must not close the window');
});

test('failed recovery flush, user chooses to stay: the window is not destroyed and can be retried', async () => {
  let flushCalls = 0;
  const p = participant('a');
  const lifecycle = createWorkspaceLifecycle(
    baseConfig({
      steps: [{ kind: 'participants', participants: [p] }],
      recoveryFlush: async () => {
        flushCalls++;
        return false;
      },
      confirm: async (kind) => (kind === 'recovery-flush-failed' ? 'cancel' : 'save'),
    }),
  );
  const win = fakeWindow();
  lifecycle.attach(win);
  win.triggerClose();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(flushCalls, 1);
  assert.equal(win.destroyed, false);
  assert.equal(p.closed, false);

  win.triggerClose();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(flushCalls, 2, 'a rejected close attempt can be retried from scratch');
});

test('failed recovery flush, user chooses to quit without the latest changes: the sequence still runs', async () => {
  const p = participant('a');
  const lifecycle = createWorkspaceLifecycle(
    baseConfig({
      steps: [{ kind: 'participants', participants: [p] }],
      recoveryFlush: async () => false,
      confirm: async () => 'discard',
    }),
  );
  const win = fakeWindow();
  lifecycle.attach(win);
  win.triggerClose();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(p.closed, true);
  assert.equal(win.destroyed, true);
});

test('duplicate close attempts while a decision is pending do not re-run recovery flush', async () => {
  let flushCalls = 0;
  let resolveFlush;
  const flushGate = new Promise((resolve) => (resolveFlush = resolve));
  const p = participant('a');
  const lifecycle = createWorkspaceLifecycle(
    baseConfig({
      steps: [{ kind: 'participants', participants: [p] }],
      recoveryFlush: async () => {
        flushCalls++;
        await flushGate;
        return true;
      },
    }),
  );
  const win = fakeWindow();
  lifecycle.attach(win);
  win.triggerClose();
  win.triggerClose();
  win.triggerClose();
  resolveFlush();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(flushCalls, 1, 'a close attempt already in flight must not start a second one');
  assert.equal(win.destroyed, true);
});

test('close-event handling after the window is already closing is a no-op', async () => {
  const p = participant('a');
  const lifecycle = createWorkspaceLifecycle(
    baseConfig({ steps: [{ kind: 'participants', participants: [p] }] }),
  );
  const win = fakeWindow();
  lifecycle.attach(win);
  win.triggerClose();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(win.destroyed, true);

  const second = win.triggerClose();
  assert.equal(
    second.prevented,
    false,
    'once actually closing, the handler lets the event through',
  );
});

test('shutdown ordering: admission runs first, stages run in order, and a stage waits for its own participants', async () => {
  const order = [];
  const batchAdmit = admission('batch-begin', order);
  const libraryAdmit = admission('library-begin', order);
  const slow = participant('slow-folder', { order, delayMs: 20 });
  const fast = participant('fast-settings', { order });
  const secondStage = participant('renderer', { order });
  const solo = participant('catalog', { order });
  const finalStage = participant('batch-close', { order });

  const lifecycle = createWorkspaceLifecycle(
    baseConfig({
      steps: [
        { kind: 'admission', participants: [batchAdmit, libraryAdmit] },
        { kind: 'participants', participants: [slow, fast] },
        { kind: 'participants', participants: [secondStage] },
        { kind: 'action', run: () => order.push('drain') },
        { kind: 'participant', participant: solo },
      ],
      finalClose: finalStage,
    }),
  );
  const win = fakeWindow();
  lifecycle.attach(win);
  win.triggerClose();
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.deepEqual(
    order.slice(0, 2).sort(),
    ['batch-begin', 'library-begin'],
    'admission participants run before any close stage',
  );
  const stage1 = order.slice(2, 4).sort();
  assert.deepEqual(stage1, ['fast-settings', 'slow-folder']);
  assert.deepEqual(
    order.slice(4),
    ['renderer', 'drain', 'catalog', 'batch-close'],
    'later stages only start once every earlier-stage participant has finished closing, and ' +
      'finalClose runs last of all',
  );
  assert.equal(win.destroyed, true);
});

test('a solo participant or action step failing stops the rest of the sequence, including finalClose and destroying the window', async () => {
  const order = [];
  const soloFailure = {
    activeCount: 0,
    async close() {
      order.push('solo-failed');
      throw new Error('boom');
    },
  };
  const neverReached = participant('never-reached', { order });
  const lifecycle = createWorkspaceLifecycle(
    baseConfig({
      steps: [{ kind: 'participant', participant: soloFailure }],
      finalClose: neverReached,
    }),
  );
  const win = fakeWindow();
  lifecycle.attach(win);
  win.triggerClose();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(order, ['solo-failed']);
  assert.equal(neverReached.closed, false, 'finalClose never runs once an earlier step throws');
  assert.equal(win.destroyed, false, 'the window is not destroyed if a solo step throws');
});

test('within a concurrent participants stage, one member failing does not stop its siblings or later steps', async () => {
  const order = [];
  const failing = {
    activeCount: 0,
    async close() {
      order.push('failing');
      throw new Error('boom');
    },
  };
  const sibling = participant('sibling', { order });
  const later = participant('later', { order });
  const lifecycle = createWorkspaceLifecycle(
    baseConfig({
      steps: [
        { kind: 'participants', participants: [failing, sibling] },
        { kind: 'participants', participants: [later] },
      ],
    }),
  );
  const win = fakeWindow();
  lifecycle.attach(win);
  win.triggerClose();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(sibling.closed, true);
  assert.equal(later.closed, true);
  assert.equal(win.destroyed, true, 'the window is still destroyed even if a participant failed');
});

test('the lifecycle registers session-dirty and ui-locale handlers that return null replies', () => {
  const wire = fakeWire();
  createWorkspaceLifecycle(baseConfig({ wire }));
  assert.equal(wire.call('session-dirty', { dirty: true }), null);
  assert.equal(wire.call('ui-locale', { language: 'vi' }), null);
});
