// Browser shim for Buffer when not present
const MockBuffer = globalThis.Buffer || {
  isBuffer: () => false,
  from: (val) => new Uint8Array(typeof val === 'string' ? new TextEncoder().encode(val) : val),
  alloc: (size) => new Uint8Array(size),
};

export const Buffer = MockBuffer;
export default { Buffer: MockBuffer };
