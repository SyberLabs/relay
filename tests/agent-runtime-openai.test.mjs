import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertAgentsUrl,
  createOpenAIAgentsRuntime,
} from '../lib/agent-runtime-openai.ts';
import { AGENT_FUNCTION_TOOLS } from '../lib/agent-runtime-tools.ts';
import { AgentRuntimeRefusal } from '../lib/agent-runtime.ts';

void test('OpenAI adapter sends beta header, environment none, and replays tool_result on the same ids', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({
      url: String(url),
      method: init.method,
      headers: init.headers,
      body: init.body ? JSON.parse(init.body) : null,
    });
    if (String(url).endsWith('/agents/sessions') && init.method === 'POST') {
      return new Response(
        JSON.stringify({
          id: 'agt_fictional',
          status: 'requires_action',
          required_actions: [
            {
              type: 'function_call',
              turn_id: 'turn_9',
              call_id: 'call_9',
              name: 'relay_request_answer',
              arguments: { question: 'Work authorization?' },
            },
          ],
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    }
    if (String(url).includes('/events')) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(
      JSON.stringify({
        id: 'agt_fictional',
        status: 'requires_action',
        required_actions: [
          {
            type: 'function_call',
            turn_id: 'turn_9',
            call_id: 'call_9',
            name: 'relay_request_answer',
            arguments: { question: 'Work authorization?' },
          },
        ],
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  };
  const runtime = createOpenAIAgentsRuntime({
    apiKey: 'sk-fictional-key-1234567890',
    model: 'gpt-6-astra',
    fetch,
  });
  const started = await runtime.start({
    job_id: 'alice-0',
    text: 'Prepare this job.',
    tools: AGENT_FUNCTION_TOOLS,
    provider_session_id: '',
  });
  assert.equal(started.provider_session_id, 'agt_fictional');
  assert.equal(started.required_actions[0].turn_id, 'turn_9');
  assert.equal(calls[0].headers['OpenAI-Beta'], 'agents=v1');
  assert.equal(
    calls[0].headers.Authorization,
    'Bearer sk-fictional-key-1234567890',
  );
  assert.equal(calls[0].body.environment.type, 'none');
  assert.ok(!JSON.stringify(calls[0].body).includes('employer.example'));
  await runtime.returnToolResult(
    'agt_fictional',
    {
      turn_id: 'turn_9',
      call_id: 'call_9',
      success: true,
      output: '{"answer":"Yes"}',
    },
    '',
  );
  const event = calls.find((c) => String(c.url).includes('/events'));
  assert.equal(event.body.events[0].type, 'agent.session.input.tool_result');
  assert.equal(event.body.events[0].turn_id, 'turn_9');
  assert.equal(event.body.events[0].call_id, 'call_9');
  for (const call of calls) assertAgentsUrl(call.url);
});

void test('4xx from Agents API fails closed without retrying a side effect', async () => {
  let n = 0;
  const fetch = async () => {
    n += 1;
    return new Response(JSON.stringify({ error: 'no' }), { status: 401 });
  };
  const runtime = createOpenAIAgentsRuntime({
    apiKey: 'sk-fictional-key-1234567890',
    model: 'gpt-6-astra',
    fetch,
  });
  await assert.rejects(
    () =>
      runtime.start({
        job_id: 'alice-0',
        text: 'Prepare this job.',
        tools: AGENT_FUNCTION_TOOLS,
        provider_session_id: '',
      }),
    (err) => err instanceof AgentRuntimeRefusal && err.status === 502,
  );
  assert.equal(n, 1);
});

void test('lost POST response is not retried', async () => {
  let n = 0;
  const fetch = async (_url, init) => {
    n += 1;
    if (String(init.method).toUpperCase() === 'POST') {
      throw new TypeError('fetch failed');
    }
    return new Response(JSON.stringify({ id: 'agt_lost', status: 'idle' }), {
      headers: { 'content-type': 'application/json' },
    });
  };
  const runtime = createOpenAIAgentsRuntime({
    apiKey: 'sk-fictional-key-1234567890',
    model: 'gpt-6-astra',
    fetch,
  });
  await assert.rejects(
    () =>
      runtime.start({
        job_id: 'alice-0',
        text: 'Prepare this job.',
        tools: AGENT_FUNCTION_TOOLS,
        provider_session_id: '',
      }),
    (err) => err instanceof AgentRuntimeRefusal && err.status === 502,
  );
  assert.equal(n, 1);
});

void test('POST 5xx is not retried; GET retrieve still retries', async () => {
  let posts = 0;
  const postRuntime = createOpenAIAgentsRuntime({
    apiKey: 'sk-fictional-key-1234567890',
    model: 'gpt-6-astra',
    fetch: async (_url, init) => {
      if (String(init.method).toUpperCase() === 'POST') {
        posts += 1;
        return new Response(JSON.stringify({ error: 'unavailable' }), {
          status: 503,
        });
      }
      return new Response(JSON.stringify({ id: 'agt_x', status: 'idle' }), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  await assert.rejects(
    () =>
      postRuntime.start({
        job_id: 'alice-0',
        text: 'Prepare this job.',
        tools: AGENT_FUNCTION_TOOLS,
        provider_session_id: '',
      }),
    (err) => err instanceof AgentRuntimeRefusal && err.status === 502,
  );
  assert.equal(posts, 1);
  let gets = 0;
  const getRuntime = createOpenAIAgentsRuntime({
    apiKey: 'sk-fictional-key-1234567890',
    model: 'gpt-6-astra',
    fetch: async (_url, init) => {
      assert.equal(String(init.method).toUpperCase(), 'GET');
      gets += 1;
      if (gets < 3) {
        return new Response(JSON.stringify({ error: 'unavailable' }), {
          status: 503,
        });
      }
      return new Response(JSON.stringify({ id: 'agt_get', status: 'idle' }), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const state = await getRuntime.getState('agt_get', '');
  assert.equal(state.status, 'idle');
  assert.equal(gets, 3);
});

void test('OpenAI adapter polls GET until requires_action and never streams', async () => {
  const calls = [];
  let gets = 0;
  const fetch = async (url, init) => {
    calls.push({
      url: String(url),
      method: init.method,
      body: init.body ? JSON.parse(init.body) : null,
    });
    if (String(url).endsWith('/agents/sessions') && init.method === 'POST') {
      return new Response(
        JSON.stringify({ id: 'agt_poll', status: 'in_progress' }),
        { headers: { 'content-type': 'application/json' } },
      );
    }
    gets += 1;
    if (gets < 2) {
      return new Response(
        JSON.stringify({ id: 'agt_poll', status: 'in_progress' }),
        { headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({
        id: 'agt_poll',
        status: 'requires_action',
        required_actions: [
          {
            type: 'function_call',
            turn_id: 'turn_p',
            call_id: 'call_p',
            name: 'relay_request_answer',
            arguments: { question: 'Work authorization?' },
          },
        ],
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  };
  const runtime = createOpenAIAgentsRuntime({
    apiKey: 'sk-fictional-key-1234567890',
    model: 'gpt-6-astra',
    fetch,
    settleDelayMs: 0,
  });
  const started = await runtime.start({
    job_id: 'alice-0',
    text: 'Prepare this job.',
    tools: AGENT_FUNCTION_TOOLS,
    provider_session_id: '',
  });
  assert.equal(started.status, 'requires_action');
  assert.equal(started.required_actions[0].call_id, 'call_p');
  assert.equal(Object.hasOwn(calls[0].body, 'stream'), false);
  assert.equal(calls[0].body.environment.type, 'none');
  assert.equal(calls.filter((c) => c.method === 'GET').length, 2);
});

void test('Agents route refuses begin and never streams or hosts a sandbox', () => {
  const route = readFileSync('app/api/agents/route.ts', 'utf8');
  assert.match(route, /refuseUntrustedOrigin/);
  assert.match(route, /action === 'begin'/);
  assert.match(route, /action === 'sync'/);
  assert.match(route, /That action is not an agent capability/);
  const openai = readFileSync('lib/agent-runtime-openai.ts', 'utf8');
  assert.doesNotMatch(openai, /stream:\s*true/);
  assert.doesNotMatch(openai, /openai_hosted/);
  assert.doesNotMatch(openai, /self_hosted/);
  assert.match(openai, /v1\/agents\/sessions/);
  assert.match(openai, /assertAgentsUrl/);
  assert.doesNotMatch(openai, /employer\.example/);
});
