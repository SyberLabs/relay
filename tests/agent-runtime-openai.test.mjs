import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAIAgentsRuntime } from '../lib/agent-runtime-openai.ts';
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
  for (const call of calls)
    assert.match(call.url, /^https:\/\/api\.openai.com\//);
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
