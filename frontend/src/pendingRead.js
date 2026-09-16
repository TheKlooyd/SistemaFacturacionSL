// Share concurrent reads for one tenant, not completed data: each later opening
// still obtains current prices and permissions from the server.
export function createPendingRead() {
  const pending = new Map();
  return function read(key, fetcher, { fresh = false } = {}) {
    if (!fresh && pending.has(key)) return pending.get(key);
    const request = Promise.resolve().then(fetcher).finally(() => {
      if (pending.get(key) === request) pending.delete(key);
    });
    pending.set(key, request);
    return request;
  };
}
