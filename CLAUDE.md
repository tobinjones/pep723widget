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
# Run all linting (REQUIRED before committing)
jlpm lint

# Individual linting tools
jlpm eslint         # TypeScript linting
jlpm prettier       # Code formatting
jlpm stylelint      # CSS linting

# Check only (no fixes)
jlpm lint:check
```

**IMPORTANT**: Always run `jlpm lint` before committing code. The CI uses `jlpm lint:check` which will fail if code is not properly formatted. Running `jlpm lint` auto-fixes formatting issues that `jlpm lint:check` only detects.

### Cleanup

```bash
jlpm clean          # Clean build artifacts
jlpm clean:all      # Clean everything including caches
```

### Git Workflow

Feature Development

1. Create feature branch: git checkout -b feature/feature-name
2. Implement changes: Follow development workflow above
3. Pre-commit verification:
   jlpm lint # Auto-fix formatting
   jlpm build # Verify build
   pytest -vv -r ap --cov pep723widget # Test server
4. Commit:
   git commit -m "Commit message"
5. Push and create PR: git push -u origin feature/feature-name
6. Use GitHub CLI: gh pr create --title "Title" --body "Description"

## Architecture

### Frontend Extension

- Entry point: src/index.ts - JupyterLab plugin definition and DocumentWidget
- Plugin ID: pep723widget:plugin
- Document factory: Creates PEP 723 viewer accessible via "Open With" menu
- Dependencies: @jupyterlab/application, @jupyterlab/settingregistry, @jupyterlab/docregistry, @lumino/widgets

### Server Extension

- Entry point: `pep723widget/handlers.py` - Tornado request handlers
- API endpoints:
  - /pep723widget/add-dependency - Add dependencies using uv add --script
- Integration: Jupyter Server using APIHandler with @tornado.web.authenticated
- Dependencies: uv package for reliable executable location

### Configuration

- Settings schema: `schema/plugin.json`
- Server config: `jupyter-config/server-config/pep723widget.json`
- Extension output: `pep723widget/labextension/` (built frontend assets)

## PEP 723 Technical Specifications

Canonical Regex Pattern

### Python regex (multiline mode)

(?m)^# /// (?P<type>[a-zA-Z0-9-]+)$\s(?P<content>(^#(| .*)$\s)+)^# ///$

Validation Requirements

- Position: PEP 723 metadata must be in first cell only
- Cell type: First cell must be a code cell
- Content purity: First cell must contain only PEP 723 metadata and whitespace
- Format:
  - Start: # /// script (or other valid type)
  - Content: # (empty) or # content (with content)
  - End: # ///

### Example Valid Metadata

# /// script

# requires-python = "~=3.12.0"

# dependencies = [

# "rich",

# "requests>=2.25.0",

# ]

# ///

## Security and Dependencies

### Critical Dependencies

- uv: Python package manager for dependency management
  - Usage: uv.find_uv_bin() for reliable executable location
  - Purpose: Execute uv add --script commands securely

### Security Patterns

- Temporary directories: Use the tempfile library to manage temporary files
- Subprocess execution: Controlled execution with proper error handling
- Authentication: All API endpoints use @tornado.web.authenticated

### Secure subprocess execution

uv_bin = uv.find_uv_bin() # Use uv.find_uv_bin(), not PATH lookup
result = subprocess.run([uv_bin, "add", "--script", temp_py_file, dependency],
capture_output=True, text=True, cwd=temp_dir)

## Code Style

### TypeScript

- Uses ESLint with TypeScript preset
- Prettier formatting with single quotes
- Interface naming convention: `I[A-Z]` (e.g., `IMyInterface`)
- Arrow functions preferred over function expressions
- Error handling: Use error instanceof Error for proper type checking

### Python

- Server extension follows Jupyter Server patterns
- Uses @tornado.web.authenticated decorator for API endpoints
- Test coverage with pytest-cov

## Key Files

- `package.json` - Frontend dependencies and scripts
- `pyproject.toml` - Python package configuration and build system
- `src/index.ts` - Main plugin registration and DocumentWidget implementation
- `pep723widget/handlers.py` - Server-side request handlers including dependency management
- `schema/plugin.json` - Settings schema definition
- `style/base.css` - Component styling with JupyterLab theme integration

## Extension Installation Flow

1. Python package installs server extension
2. Frontend assets built to `pep723widget/labextension/`
3. JupyterLab discovers extension via `install.json`
4. Server extension auto-enabled via `jupyter-config/`
