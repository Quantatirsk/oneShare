# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Running the Server
```bash
# Run the server directly with Python
python main.py

# Or use uvicorn for development
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Using the dedicated server script
python server.py
```

### Running the React Client
```bash
# Install dependencies
pnpm install

# Start development server
pnpm run dev

# Build for production
pnpm run build

# Preview production build
pnpm run preview
```

### Dependencies
```bash
# Install Python dependencies
cd server && pip install -r requirements.txt

# Install React dependencies
cd client && pnpm install
```

### Environment Setup
```bash
# Copy environment template and configure
cp server/env.example server/.env
# Edit the .env file with appropriate values (AUTH_TOKEN, etc.)
```

## Notes and Guidelines
- Always use pnpm instead of npm
- 静态资源通过后端 `/assets` 端点提供，nginx 负责代理转发

## Architecture Overview

(Rest of the existing content remains the same)