@AGENTS.md

## Auto-restart daemon after code changes

After any backend code change (`src/` files), immediately rebuild and restart the test daemon:

```bash
npm run build && npm link && CLICLAW_DIR=~/cliclaw-test cliclaw daemon stop && CLICLAW_DIR=~/cliclaw-test cliclaw daemon start
```

The test data directory is `~/cliclaw-test/` — always use that, never touch `~/cliclaw/`.