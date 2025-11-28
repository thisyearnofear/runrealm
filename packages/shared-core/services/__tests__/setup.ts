// Jest setup file to ensure Jest types are available and mock browser globals

// Mock window object for Node.js test environment
if (typeof global.window === "undefined") {
  (global as any).window = {
    setInterval: (fn: () => void, delay: number) => {
      return setInterval(fn, delay);
    },
    clearInterval: (id: number) => {
      clearInterval(id);
    },
  };

  // Mock RunRealm global object
  (global as any).window.RunRealm = {
    services: {},
  };
}
