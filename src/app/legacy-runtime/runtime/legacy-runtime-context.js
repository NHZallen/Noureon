export function createLegacyRuntimeContext() {
  const bindings = new Map();

  const validateName = (name) => {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new TypeError('Legacy runtime binding name must be a non-empty string.');
    }
  };

  const register = (name, binding) => {
    validateName(name);
    if (bindings.has(name)) {
      throw new Error(`Legacy runtime binding "${name}" is already registered.`);
    }
    bindings.set(name, binding);
  };

  const registerLazyBinding = (name, getter) => {
    if (typeof getter !== 'function') {
      throw new TypeError(`Lazy legacy runtime binding "${name}" getter must be a function.`);
    }
    register(name, { getter, lazy: true });
  };

  const registerValueBinding = (name, value) => {
    register(name, { lazy: false, value });
  };

  const resolveOptionalBinding = (name, fallback) => {
    validateName(name);
    const binding = bindings.get(name);
    if (!binding) return fallback;
    return binding.lazy ? binding.getter() : binding.value;
  };

  const resolveBinding = (name) => {
    validateName(name);
    if (!bindings.has(name)) {
      throw new Error(`Legacy runtime binding "${name}" is not registered.`);
    }
    return resolveOptionalBinding(name);
  };

  return {
    registerLazyBinding,
    registerValueBinding,
    resolveBinding,
    resolveOptionalBinding
  };
}
