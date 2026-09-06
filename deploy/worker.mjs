import app from '../dist/server/index.js';
import { handleRequest } from './handler.mjs';

const worker = {
  fetch(request, env, context) {
    return handleRequest(request, env, context, app);
  },
};
export default worker;
