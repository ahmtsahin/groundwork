# Repository conventions

- ES modules only, Node built-ins only. Do not add dependencies.
- Tests live in `test/` and run with `node --test`.
- Keep the CSV column order stable; downstream imports depend on it.
