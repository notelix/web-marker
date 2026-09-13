# Changelog

## 2.0.11 — 2026-09-13

- Use each root element's owner document and window, including iframe roots.
- Allow importing the library without a global browser document.
- Create temporary serialization styles in the correct document and remove them
  after use.
- Remove cached highlight state when a highlight is unpainted.
- Bound the normalized-text cache and handle text such as `__proto__` correctly.
- Keep diagnostic logging off by default; enable it with `debug: true`.
- Modernize the library build and bundle UUID generation, leaving no runtime
  package dependencies.

The package declares Node.js 20 or newer for its build/installation environment.
The browser-facing API and serialized highlight format remain compatible with
2.0.10.
