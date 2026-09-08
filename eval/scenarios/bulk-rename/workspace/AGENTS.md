# Repository conventions

- ES modules, Node built-ins only. No dependencies, including glob libraries.
- Tests live in `test/` and run with `node --test`.
- User-facing output goes to stdout; diagnostics go to stderr.
