# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a JupyterLab extension called `pep723widget` that enables editing of PEP 723 inline script metadata in notebooks. It's built using the JupyterLab extension template v4.3.8 and consists of both a Python server extension and a TypeScript frontend extension.

## Development Commands

### Build Commands

```bash
# Development build (with source maps)
jlpm build

# Production build
jlpm build:prod

# Build only TypeScript library
jlpm build:lib

# Build only the lab extension
jlpm build:labextension
```

### Development Workflow

```bash
# Install in development mode
pip install -e ".[test]"
jupyter labextension develop . --overwrite
jupyter server extension enable pep723widget

# Watch for changes (run in separate terminals)
jlpm watch          # Watches TypeScript source
jupyter lab         # Run JupyterLab
```

### Testing

```bash
# Frontend tests (Jest)
jlpm test

# Python server tests
pytest -vv -r ap --cov pep723widget

# Integration tests (Playwright)
cd ui-tests && jlpm test
```

### Linting and Code Quality

```bash
# Run all linting
jlpm lint

# Individual linting tools
jlpm eslint         # TypeScript linting
jlpm prettier       # Code formatting
jlpm stylelint      # CSS linting

# Check only (no fixes)
jlpm lint:check
```

### Cleanup

```bash
jlpm clean          # Clean build artifacts
jlpm clean:all      # Clean everything including caches
```

## Architecture

### Frontend Extension

- **Entry point**: `src/index.ts` - JupyterLab plugin definition
- **API client**: `src/handler.ts` - Communicates with server extension
- **Plugin ID**: `pep723widget:plugin`
- Uses JupyterLab 4.x APIs (@jupyterlab/application, @jupyterlab/settingregistry)

### Server Extension

- **Entry point**: `pep723widget/handlers.py` - Tornado request handlers
- **API endpoint**: `/pep723widget/get-example` (currently example endpoint)
- Integrates with Jupyter Server using `APIHandler`

### Configuration

- **Settings schema**: `schema/plugin.json`
- **Server config**: `jupyter-config/server-config/pep723widget.json`
- **Extension output**: `pep723widget/labextension/` (built frontend assets)

## Code Style

### TypeScript

- Uses ESLint with TypeScript preset
- Prettier formatting with single quotes
- Interface naming convention: `I[A-Z]` (e.g., `IMyInterface`)
- Arrow functions preferred over function expressions

### Python

- Server extension follows Jupyter Server patterns
- Uses `@tornado.web.authenticated` decorator for API endpoints
- Test coverage with pytest-cov

## Key Files

- `package.json` - Frontend dependencies and scripts
- `pyproject.toml` - Python package configuration and build system
- `src/index.ts` - Main plugin registration
- `pep723widget/handlers.py` - Server-side request handlers
- `schema/plugin.json` - Settings schema definition

## Extension Installation Flow

1. Python package installs server extension
2. Frontend assets built to `pep723widget/labextension/`
3. JupyterLab discovers extension via `install.json`
4. Server extension auto-enabled via `jupyter-config/`
