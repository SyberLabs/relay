import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RELAY_WEBMCP_WORKFLOW_TOOLS,
  browserAgentToolsCopy,
  webMcpCapability,
} from '../lib/webmcp.ts';

void test('WebMCP is missing when the host has no registerTool', () => {
  assert.deepEqual(webMcpCapability({}), {
    available: false,
    source: null,
    context: null,
  });
  assert.equal(
    webMcpCapability({
      document: { modelContext: {} },
      navigator: { modelContext: { registerTool: 'not a function' } },
    }).available,
    false,
  );
  assert.equal(
    webMcpCapability({ document: null, navigator: 'not an object' }).available,
    false,
  );
});

void test('prefers document.modelContext when registerTool is present', () => {
  const documentContext = { registerTool() {} };
  const found = webMcpCapability({
    document: { modelContext: documentContext },
    navigator: { modelContext: { registerTool() {} } },
  });
  assert.equal(found.available, true);
  assert.equal(found.source, 'document');
  assert.equal(found.context, documentContext);
});

void test('falls back to navigator.modelContext only when document cannot register', () => {
  const navigatorContext = { registerTool() {} };
  const found = webMcpCapability({
    document: { modelContext: {} },
    navigator: { modelContext: navigatorContext },
  });
  assert.equal(found.available, true);
  assert.equal(found.source, 'navigator');
  assert.equal(found.context, navigatorContext);
});

void test('available copy lists workflow tools and does not claim production readiness', () => {
  const copy = browserAgentToolsCopy(true);
  assert.match(copy, /^Browser agent tools: available/);
  for (const name of RELAY_WEBMCP_WORKFLOW_TOOLS)
    assert.match(copy, new RegExp(name));
  assert.deepEqual(
    [...RELAY_WEBMCP_WORKFLOW_TOOLS],
    ['relay_read_workspace', 'relay_preview_import', 'relay_stage_draft'],
  );
  assert.doesNotMatch(copy, /production ready/i);
  assert.doesNotMatch(copy, /—/);
});

void test('missing copy names the host gap without pretending tools work', () => {
  const copy = browserAgentToolsCopy(false);
  assert.match(copy, /not available in this browser \(WebMCP missing\)/);
  assert.doesNotMatch(copy, /available\./);
  assert.doesNotMatch(copy, /production ready/i);
  assert.doesNotMatch(copy, /—/);
});

void test('agent tools and connections use the shared detector', () => {
  const tools = readFileSync('app/agent-tools.ts', 'utf8');
  const connections = readFileSync('app/connections.tsx', 'utf8');
  assert.match(tools, /webMcpCapability/);
  assert.match(connections, /browserAgentToolsCopy/);
  assert.match(connections, /webMcpCapability/);
});
