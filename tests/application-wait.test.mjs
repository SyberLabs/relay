import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPLICATION_WAIT_ARM_MS,
  APPLICATION_WAIT_DEFAULT_MS,
  APPLICATION_WAIT_MAX_MS,
  APPLICATION_WAIT_MAX_REQUESTS,
  APPLICATION_WAIT_POLL_MS,
  ApplicationWaitRefusal,
  createApplicationWait,
} from '../lib/application-wait.ts';

const pin = {
  job: 'job-a',
  preparation_revision: 'rev-1',
  id: 'op-1',
  digest: 'd'.repeat(64),
  actor: 'Fictional applying agent',
};

function abortError() {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function deferred() {
  let resolve;
  const promise = new Promise((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
}

function snapshot(extra = {}) {
  return {
    viewer: 'owner-a',
    job_id: pin.job,
    preparation_revision: pin.preparation_revision,
    destination: 'https://employer.example/jobs/a',
    fields: [
      { label: 'Full name', filled: true, unknown: false, value: 'Avery' },
    ],
    files: [],
    ready: true,
    armed: true,
    operation_id: pin.id,
    digest: pin.digest,
    state: 'proposed',
    accept_enabled: true,
    recorded_result: null,
    recorded_receipt: null,
    ...extra,
  };
}

function parseRefusal(error) {
  assert.equal(error instanceof ApplicationWaitRefusal, true);
  return JSON.parse(error.message);
}

async function rejected(promise) {
  return promise.then(
    () => null,
    (error) => error,
  );
}

function createClock() {
  let now = 0;
  return {
    now: () => now,
    sleep(ms, signal) {
      if (signal.aborted) return Promise.reject(abortError());
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          now += ms;
          resolve();
        }, 0);
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(abortError());
          },
          { once: true },
        );
      });
    },
    setNow(value) {
      now = value;
    },
  };
}

function io(clock, handlers) {
  const calls = [];
  return {
    calls,
    maxMs: handlers.maxMs,
    maxRequests: handlers.maxRequests,
    readWorkspace: async (signal) => {
      calls.push(['workspace']);
      if (handlers.workspace) return handlers.workspace(signal);
      return { viewer: 'owner-a', jobs: [] };
    },
    inspect: async (job, signal) => {
      calls.push(['inspect', job]);
      return handlers.inspect(job, calls, signal);
    },
    arm: async (body, signal) => {
      calls.push(['arm', body]);
      if (!handlers.arm) throw new Error('unexpected arm');
      return handlers.arm(body, calls, signal);
    },
    now: clock.now,
    sleep: clock.sleep,
  };
}

void test('wait bounds stay inside gateway presence and poll contracts', () => {
  assert.equal(APPLICATION_WAIT_POLL_MS, 3_000);
  assert.equal(APPLICATION_WAIT_ARM_MS, 12_000);
  assert.equal(APPLICATION_WAIT_DEFAULT_MS, 40_000);
  assert.equal(APPLICATION_WAIT_MAX_MS, 300_000);
  assert.equal(APPLICATION_WAIT_MAX_REQUESTS, 126);
});

void test('already authorized returns the pinned operation without arming', async () => {
  const fake = io(createClock(), {
    inspect: async () =>
      snapshot({ state: 'authorized', accept_enabled: false }),
  });
  const result = await createApplicationWait(fake).wait(pin);
  assert.deepEqual(result, {
    authorized: true,
    viewer: 'owner-a',
    job: pin.job,
    preparation_revision: pin.preparation_revision,
    id: pin.id,
    digest: pin.digest,
    state: 'authorized',
  });
  assert.deepEqual(
    fake.calls.map((row) => row[0]),
    ['workspace', 'inspect'],
  );
});

void test('polls until authorized and reuses the pinned viewer on arm', async () => {
  let inspects = 0;
  const fake = io(createClock(), {
    inspect: async () => {
      inspects += 1;
      if (inspects === 1)
        return snapshot({ armed: false, accept_enabled: false });
      if (inspects === 2) return snapshot();
      return snapshot({ state: 'authorized', accept_enabled: false });
    },
    arm: async (body) => {
      assert.equal(body.viewer, 'owner-a');
      assert.equal(body.job, pin.job);
      assert.equal(body.preparation_revision, pin.preparation_revision);
      assert.equal(body.id, pin.id);
      assert.equal(body.actor, pin.actor);
      assert.equal(body.action, 'arm');
      assert.equal(Object.hasOwn(body, 'digest'), false);
      return snapshot();
    },
  });
  const result = await createApplicationWait(fake).wait(pin);
  assert.equal(result.authorized, true);
  assert.equal(result.viewer, 'owner-a');
  assert.deepEqual(fake.calls[0], ['workspace']);
  assert.equal(fake.calls.filter((row) => row[0] === 'workspace').length, 1);
  assert.equal(fake.calls[2][0], 'arm');
  assert.equal(
    fake.calls.some((row) => row[0] === 'begin'),
    false,
  );
});

void test('does not renew an already-armed pin faster than 12 seconds', async () => {
  const clock = createClock();
  const fake = io(clock, {
    inspect: async () => {
      if (clock.now() > APPLICATION_WAIT_ARM_MS)
        return snapshot({ state: 'authorized', accept_enabled: false });
      return snapshot();
    },
    arm: async () => snapshot(),
  });
  await createApplicationWait(fake).wait(pin);
  const arms = fake.calls.filter((row) => row[0] === 'arm');
  assert.equal(arms.length, 1);
  const inspectsBeforeArm = fake.calls
    .slice(
      0,
      fake.calls.findIndex((row) => row[0] === 'arm'),
    )
    .filter((row) => row[0] === 'inspect').length;
  assert.equal(
    inspectsBeforeArm,
    APPLICATION_WAIT_ARM_MS / APPLICATION_WAIT_POLL_MS + 1,
  );
});

void test('arms immediately when presence has already expired', async () => {
  let inspects = 0;
  const fake = io(createClock(), {
    inspect: async () => {
      inspects += 1;
      if (inspects === 1)
        return snapshot({ armed: false, accept_enabled: false });
      return snapshot({ state: 'authorized', accept_enabled: false });
    },
    arm: async () => snapshot(),
  });
  await createApplicationWait(fake).wait(pin);
  assert.equal(fake.calls[2][0], 'arm');
  assert.equal(fake.calls.filter((row) => row[0] === 'arm').length, 1);
});

void test('changed preparation revision stops without substituting a new token', async () => {
  let inspects = 0;
  const fake = io(createClock(), {
    inspect: async () => {
      inspects += 1;
      if (inspects === 1) return snapshot();
      return snapshot({ preparation_revision: 'rev-2' });
    },
  });
  const body = parseRefusal(
    await rejected(createApplicationWait(fake).wait(pin)),
  );
  assert.equal(body.code, 'wait_pin_changed');
  assert.match(body.error, /changed/i);
  assert.equal(fake.calls.filter((row) => row[0] === 'arm').length, 0);
});

void test('viewer change stops without further arms', async () => {
  let inspects = 0;
  const fake = io(createClock(), {
    inspect: async () => {
      inspects += 1;
      if (inspects === 1) return snapshot();
      return snapshot({ viewer: 'owner-b' });
    },
  });
  const body = parseRefusal(
    await rejected(createApplicationWait(fake).wait(pin)),
  );
  assert.equal(body.code, 'wait_viewer_changed');
});

void test('changed operation or digest stops', async () => {
  const fake = io(createClock(), {
    inspect: async () => snapshot({ operation_id: 'op-other' }),
  });
  const body = parseRefusal(
    await rejected(createApplicationWait(fake).wait(pin)),
  );
  assert.equal(body.code, 'wait_pin_changed');
});

void test('cancellation stops without beginning', async () => {
  const fake = io(createClock(), {
    inspect: async () =>
      snapshot({ state: 'cancelled', armed: false, accept_enabled: false }),
  });
  const body = parseRefusal(
    await rejected(createApplicationWait(fake).wait(pin)),
  );
  assert.equal(body.code, 'wait_cancelled');
  assert.equal(
    fake.calls.some((row) => row[0] === 'arm'),
    false,
  );
});

void test('executing is lost begin: stop and do not take over the permit', async () => {
  const fake = io(createClock(), {
    inspect: async () =>
      snapshot({ state: 'executing', armed: false, accept_enabled: false }),
  });
  const body = parseRefusal(
    await rejected(createApplicationWait(fake).wait(pin)),
  );
  assert.equal(body.code, 'wait_executing');
  assert.match(body.error, /not submit again/i);
});

void test('uncertain terminal outcome preserves recorded receipt metadata', async () => {
  const fake = io(createClock(), {
    inspect: async () =>
      snapshot({
        state: 'uncertain',
        armed: false,
        accept_enabled: false,
        recorded_result: 'uncertain',
        recorded_receipt: 'Captcha after fill; no confirmation.',
      }),
  });
  const body = parseRefusal(
    await rejected(createApplicationWait(fake).wait(pin)),
  );
  assert.equal(body.code, 'wait_terminal');
  assert.equal(body.state, 'uncertain');
  assert.equal(body.recorded_result, 'uncertain');
  assert.equal(body.recorded_receipt, 'Captcha after fill; no confirmation.');
});

void test('quota refusal metadata is preserved and inspect is not retried', async () => {
  const fake = io(createClock(), {
    inspect: async () => {
      throw new Error(
        JSON.stringify({
          error: 'Fictional quota refusal.',
          status: 429,
          code: 'usage_limit',
          retry_after: '60',
        }),
      );
    },
  });
  const body = parseRefusal(
    await rejected(createApplicationWait(fake).wait(pin)),
  );
  assert.equal(body.status, 429);
  assert.equal(body.code, 'usage_limit');
  assert.equal(body.retry_after, '60');
  assert.equal(body.error, 'Fictional quota refusal.');
  assert.equal(fake.calls.filter((row) => row[0] === 'inspect').length, 1);
  assert.equal(fake.calls.filter((row) => row[0] === 'arm').length, 0);
});

void test('arm refusal is not retried', async () => {
  const fake = io(createClock(), {
    inspect: async () => snapshot({ armed: false, accept_enabled: false }),
    arm: async () => {
      throw new Error(
        JSON.stringify({
          error: 'Preparation changed. Inspect saved work before arming.',
          status: 409,
        }),
      );
    },
  });
  const body = parseRefusal(
    await rejected(createApplicationWait(fake).wait(pin)),
  );
  assert.equal(body.status, 409);
  assert.equal(fake.calls.filter((row) => row[0] === 'arm').length, 1);
});

void test('malformed inspect stops', async () => {
  const fake = io(createClock(), {
    inspect: async () => ({ viewer: 'owner-a' }),
  });
  const body = parseRefusal(
    await rejected(createApplicationWait(fake).wait(pin)),
  );
  assert.equal(body.code, 'wait_malformed');
});

void test('duplicate waiter in the same tab is refused and the first wait still completes', async () => {
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  let inspects = 0;
  const fake = io(createClock(), {
    inspect: async () => {
      inspects += 1;
      if (inspects === 1) {
        await blocked;
        return snapshot();
      }
      return snapshot({ state: 'authorized', accept_enabled: false });
    },
  });
  const waiter = createApplicationWait(fake);
  const first = waiter.wait(pin);
  await new Promise((resolve) => setImmediate(resolve));
  const secondBody = parseRefusal(await rejected(waiter.wait(pin)));
  assert.equal(secondBody.code, 'wait_busy');
  release();
  const result = await first;
  assert.equal(result.authorized, true);
});

void test('unmount aborts an in-flight wait', async () => {
  const parent = new AbortController();
  const fake = io(createClock(), {
    inspect: async () => snapshot(),
  });
  const waiter = createApplicationWait(fake, parent.signal);
  const pending = waiter.wait(pin);
  await new Promise((resolve) => setImmediate(resolve));
  parent.abort();
  const body = parseRefusal(await rejected(pending));
  assert.equal(body.code, 'wait_aborted');
});

void test(
  'timeout stops after the bounded duration',
  { timeout: 2_000 },
  async () => {
    const clock = createClock();
    const fake = io(clock, {
      inspect: async () => snapshot(),
    });
    fake.sleep = async (ms, signal) => {
      if (signal.aborted) throw abortError();
      if (ms === APPLICATION_WAIT_POLL_MS)
        clock.setNow(APPLICATION_WAIT_DEFAULT_MS);
    };
    const body = parseRefusal(
      await rejected(createApplicationWait(fake).wait(pin)),
    );
    assert.equal(body.code, 'wait_timeout');
    assert.equal(fake.calls.filter((row) => row[0] === 'inspect').length, 1);
  },
);

void test(
  'wait_ms shortens the bound without retrying inspect',
  { timeout: 2_000 },
  async () => {
    const clock = createClock();
    const fake = io(clock, {
      inspect: async () => snapshot(),
    });
    const body = parseRefusal(
      await rejected(
        createApplicationWait(fake).wait({ ...pin, wait_ms: 1_000 }),
      ),
    );
    assert.equal(body.code, 'wait_timeout');
    assert.equal(fake.calls.filter((row) => row[0] === 'inspect').length, 1);
  },
);

void test(
  'wait_ms above five minutes or non-integer is refused before IO',
  { timeout: 2_000 },
  async () => {
    const fake = io(createClock(), {
      inspect: async () => snapshot(),
    });
    for (const wait_ms of [0, -1, 300_001, 40_000.5, '40000']) {
      const body = parseRefusal(
        await rejected(createApplicationWait(fake).wait({ ...pin, wait_ms })),
      );
      assert.equal(body.code, 'wait_malformed');
    }
    assert.equal(fake.calls.length, 0);
  },
);

void test('request cap stops without another inspect', async () => {
  const fake = io(createClock(), {
    maxRequests: 1,
    inspect: async () => snapshot(),
  });
  const body = parseRefusal(
    await rejected(createApplicationWait(fake).wait(pin)),
  );
  assert.equal(body.code, 'wait_budget');
  assert.equal(fake.calls.filter((row) => row[0] === 'inspect').length, 0);
});

void test(
  'abort during inspect ignores a late authorized snapshot',
  { timeout: 2_000 },
  async () => {
    const parent = new AbortController();
    const late = deferred();
    const fake = io(createClock(), {
      inspect: async (_job, _calls, signal) => {
        assert.equal(signal instanceof AbortSignal, true);
        queueMicrotask(() => parent.abort());
        return late.promise;
      },
    });
    const pending = rejected(
      createApplicationWait(fake, parent.signal).wait(pin),
    );
    await new Promise((resolve) => setImmediate(resolve));
    late.resolve(snapshot({ state: 'authorized', accept_enabled: false }));
    const body = parseRefusal(await pending);
    assert.equal(body.code, 'wait_aborted');
  },
);

void test(
  'deadline during inspect ignores a late authorized snapshot',
  { timeout: 2_000 },
  async () => {
    const clock = createClock();
    const late = deferred();
    const fake = io(clock, {
      inspect: async () => {
        clock.setNow(APPLICATION_WAIT_DEFAULT_MS);
        return late.promise;
      },
    });
    const pending = rejected(createApplicationWait(fake).wait(pin));
    await new Promise((resolve) => setImmediate(resolve));
    late.resolve(snapshot({ state: 'authorized', accept_enabled: false }));
    const body = parseRefusal(await pending);
    assert.equal(body.code, 'wait_timeout');
  },
);

void test(
  'abort of a hung inspect settles and releases the waiter',
  { timeout: 2_000 },
  async () => {
    const parent = new AbortController();
    let hang = true;
    const fake = {
      readWorkspace: async () => ({ viewer: 'owner-a', jobs: [] }),
      inspect: async () => {
        if (hang) return new Promise(() => {});
        return snapshot({ state: 'authorized', accept_enabled: false });
      },
      arm: async () => {
        throw new Error('unexpected arm');
      },
    };
    const waiter = createApplicationWait(fake, parent.signal);
    const pending = rejected(waiter.wait(pin));
    await new Promise((resolve) => setImmediate(resolve));
    parent.abort();
    const body = parseRefusal(await pending);
    assert.equal(body.code, 'wait_aborted');
    hang = false;
    const again = parseRefusal(await rejected(waiter.wait(pin)));
    assert.equal(again.code, 'wait_aborted');
    assert.notEqual(again.code, 'wait_busy');
  },
);

void test(
  'deadline of a hung inspect settles without authorization',
  { timeout: 2_000 },
  async () => {
    const clock = createClock();
    let hang = true;
    const fake = io(clock, {
      inspect: async () => {
        if (hang) return new Promise(() => {});
        return snapshot({ state: 'authorized', accept_enabled: false });
      },
    });
    const waiter = createApplicationWait(fake);
    const body = parseRefusal(await rejected(waiter.wait(pin)));
    assert.equal(body.code, 'wait_timeout');
    assert.equal(fake.calls.filter((row) => row[0] === 'inspect').length, 1);
    hang = false;
    const again = await waiter.wait(pin);
    assert.equal(again.authorized, true);
  },
);

void test(
  'inherited nearly-expired arm renews as soon as presence drops',
  { timeout: 2_000 },
  async () => {
    const clock = createClock();
    let inspects = 0;
    const fake = io(clock, {
      inspect: async () => {
        inspects += 1;
        if (inspects === 1) return snapshot();
        if (inspects === 2)
          return snapshot({ armed: false, accept_enabled: false });
        return snapshot({ state: 'authorized', accept_enabled: false });
      },
      arm: async () => snapshot({ state: 'authorized', accept_enabled: false }),
    });
    const result = await createApplicationWait(fake).wait(pin);
    assert.equal(result.authorized, true);
    const armAt = fake.calls.findIndex((row) => row[0] === 'arm');
    assert.equal(armAt >= 0, true);
    assert.equal(
      fake.calls.slice(0, armAt).filter((row) => row[0] === 'inspect').length,
      2,
    );
    assert.equal(clock.now() < APPLICATION_WAIT_ARM_MS, true);
  },
);

void test(
  'wait_ms 20 times out during poll without waiting a full 3s interval',
  { timeout: 2_000 },
  async () => {
    const started = Date.now();
    const fake = {
      readWorkspace: async () => ({ viewer: 'owner-a', jobs: [] }),
      inspect: async () => snapshot(),
      arm: async () => {
        throw new Error('unexpected arm');
      },
    };
    const body = parseRefusal(
      await rejected(createApplicationWait(fake).wait({ ...pin, wait_ms: 20 })),
    );
    const elapsed = Date.now() - started;
    assert.equal(body.code, 'wait_timeout');
    assert.ok(
      elapsed < APPLICATION_WAIT_POLL_MS,
      `settled in ${elapsed}ms, expected under ${APPLICATION_WAIT_POLL_MS}ms`,
    );
  },
);
