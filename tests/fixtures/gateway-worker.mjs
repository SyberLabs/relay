import app from '../../dist/server/index.js';
import { importJWK } from 'jose';
import { handleRequest } from '../../deploy/handler.mjs';

// This fixture is excluded from the release artifact and is never a deploy entry.
const testWorker = {
  async fetch(request, env, context) {
    const key = await importJWK(JSON.parse(env.RELAY_TEST_JWK), 'RS256');
    return handleRequest(request, env, context, app, key);
  },
};
export default testWorker;
