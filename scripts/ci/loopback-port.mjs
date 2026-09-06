import { createServer } from 'node:net';

function listen(port = 0) {
  const server = createServer();
  return new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => accept(server));
  });
}

function close(server) {
  return new Promise((accept, reject) =>
    server.close((error) => (error ? reject(error) : accept())),
  );
}

export async function holdLoopbackPorts(count = 1) {
  if (!Number.isInteger(count) || count < 1) {
    throw Error('Need a positive port count.');
  }
  const servers = [];
  try {
    for (let i = 0; i < count; i++) servers.push(await listen(0));
    const ports = servers.map((server) => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw Error('Expected a TCP loopback port.');
      }
      return address.port;
    });
    return {
      ports,
      async release() {
        const held = servers.splice(0);
        await Promise.all(held.map(close));
      },
    };
  } catch (error) {
    await Promise.all(servers.map((server) => close(server).catch(() => {})));
    throw error;
  }
}
