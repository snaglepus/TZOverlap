import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { registerServiceWorker } from '../../src/lib/updates.js';

/** A fake ServiceWorker: a state and the messages posted to it. */
class FakeWorker extends EventTarget {
  /** @param {string} state */
  constructor(state) {
    super();
    this.state = state;
    /** @type {unknown[]} */
    this.messages = [];
  }

  /** @param {unknown} message */
  postMessage(message) {
    this.messages.push(message);
  }

  /** @param {string} state */
  setState(state) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeRegistration extends EventTarget {
  /** @param {{ waiting?: FakeWorker | null }} [options] */
  constructor({ waiting = null } = {}) {
    super();
    /** @type {FakeWorker | null} */
    this.waiting = waiting;
    /** @type {FakeWorker | null} */
    this.installing = null;
  }

  /** A new worker starts installing. @param {FakeWorker} worker */
  found(worker) {
    this.installing = worker;
    this.dispatchEvent(new Event('updatefound'));
  }
}

class FakeContainer extends EventTarget {
  /**
   * @param {{ controller?: unknown, registration?: FakeRegistration, reject?: boolean }} [options]
   */
  constructor({ controller = null, registration = new FakeRegistration(), reject = false } = {}) {
    super();
    this.controller = controller;
    this.registration = registration;
    this.reject = reject;
    /** @type {string[]} */
    this.registered = [];
  }

  /** @param {string} url */
  register(url) {
    this.registered.push(url);
    return this.reject ? Promise.reject(new Error('blocked')) : Promise.resolve(this.registration);
  }
}

/**
 * Registers with spies for the update callback and reload.
 * @param {FakeContainer | undefined} container
 * @param {string | null} [url]
 */
async function setup(container, url = './sw.js') {
  /** @type {(() => void)[]} */
  const offers = [];
  let reloads = 0;
  await registerServiceWorker({
    container,
    url,
    onUpdateReady: (apply) => offers.push(apply),
    reload: () => {
      reloads += 1;
    },
  });
  return { offers, reloads: () => reloads };
}

describe('registerServiceWorker', () => {
  it('does nothing without a container', async () => {
    const { offers } = await setup(undefined);
    assert.equal(offers.length, 0);
  });

  it('does not register without a URL', async () => {
    const container = new FakeContainer();
    await setup(container, null);
    assert.deepEqual(container.registered, []);
  });

  it('registers the URL it is given', async () => {
    const container = new FakeContainer();
    await setup(container);
    assert.deepEqual(container.registered, ['./sw.js']);
  });

  it('swallows a rejected register without throwing or offering an update', async () => {
    const container = new FakeContainer({ reject: true, controller: {} });
    const { offers, reloads } = await setup(container);
    assert.equal(offers.length, 0);
    assert.equal(reloads(), 0);
  });

  it('swallows a register that throws synchronously', async () => {
    const container = new FakeContainer();
    container.register = () => {
      throw new Error('SecurityError');
    };
    await assert.doesNotReject(setup(container));
  });

  it('offers an update when a worker is already waiting and the page is controlled', async () => {
    const waiting = new FakeWorker('installed');
    const container = new FakeContainer({
      controller: {},
      registration: new FakeRegistration({ waiting }),
    });
    const { offers } = await setup(container);
    assert.equal(offers.length, 1);
  });

  it('offers an update when a new worker finishes installing under a controller', async () => {
    const registration = new FakeRegistration();
    const container = new FakeContainer({ controller: {}, registration });
    const { offers } = await setup(container);
    assert.equal(offers.length, 0);
    const worker = new FakeWorker('installing');
    registration.found(worker);
    worker.setState('installed');
    assert.equal(offers.length, 1);
  });

  it('offers only once', async () => {
    const waiting = new FakeWorker('installed');
    const registration = new FakeRegistration({ waiting });
    const container = new FakeContainer({ controller: {}, registration });
    const { offers } = await setup(container);
    const worker = new FakeWorker('installing');
    registration.found(worker);
    worker.setState('installed');
    assert.equal(offers.length, 1);
  });

  it('does not offer an update on a first install without a controller', async () => {
    const registration = new FakeRegistration();
    const container = new FakeContainer({ controller: null, registration });
    const { offers } = await setup(container);
    const worker = new FakeWorker('installing');
    registration.found(worker);
    worker.setState('installed');
    worker.setState('activated');
    assert.equal(offers.length, 0);
  });

  it('does not offer a waiting worker without a controller', async () => {
    const container = new FakeContainer({
      controller: null,
      registration: new FakeRegistration({ waiting: new FakeWorker('installed') }),
    });
    const { offers } = await setup(container);
    assert.equal(offers.length, 0);
  });

  it('apply posts SKIP_WAITING to the waiting worker and does not reload yet', async () => {
    const waiting = new FakeWorker('installed');
    const container = new FakeContainer({
      controller: {},
      registration: new FakeRegistration({ waiting }),
    });
    const { offers, reloads } = await setup(container);
    offers[0]?.();
    assert.deepEqual(waiting.messages, [{ type: 'SKIP_WAITING' }]);
    assert.equal(reloads(), 0);
  });

  it('apply reloads directly when no worker is waiting any more', async () => {
    const registration = new FakeRegistration({ waiting: new FakeWorker('installed') });
    const container = new FakeContainer({ controller: {}, registration });
    const { offers, reloads } = await setup(container);
    registration.waiting = null;
    offers[0]?.();
    assert.equal(reloads(), 1);
    container.dispatchEvent(new Event('controllerchange'));
    assert.equal(reloads(), 1);
  });

  it('ignores a controllerchange that this page did not ask for', async () => {
    const container = new FakeContainer({
      controller: {},
      registration: new FakeRegistration({ waiting: new FakeWorker('installed') }),
    });
    const { reloads } = await setup(container);
    container.dispatchEvent(new Event('controllerchange'));
    assert.equal(reloads(), 0);
  });

  it('reloads exactly once on controllerchange after apply', async () => {
    const container = new FakeContainer({
      controller: {},
      registration: new FakeRegistration({ waiting: new FakeWorker('installed') }),
    });
    const { offers, reloads } = await setup(container);
    offers[0]?.();
    container.dispatchEvent(new Event('controllerchange'));
    container.dispatchEvent(new Event('controllerchange'));
    assert.equal(reloads(), 1);
  });
});
