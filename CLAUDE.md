# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Running the Server
```bash
# Start the complete development stack
python dev.py

# Or run the backend only
cd server && uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Running the React Client
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Dependencies
```bash
# Sync Python dependencies
uv sync --project server

# Install React dependencies
cd client && npm install
```

### Environment Setup
```bash
# Copy environment template and configure
cp .env.example .env
# Edit the .env file with appropriate values (AUTH_TOKEN, etc.)
```

## Notes and Guidelines
- Use npm as the package manager.
- 静态资源通过后端 `/assets` 端点提供，nginx 负责代理转发

## Architecture Overview

(Rest of the existing content remains the same)
