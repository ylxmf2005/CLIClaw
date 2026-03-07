# Troubleshooting

## Common issues

| Symptom | Likely cause | Fix |
|--------|--------------|-----|
| `error: ... connect ... daemon.sock` | Daemon not running | `cliclaw daemon start --token <admin-token>` |
| You lost the agent token | Tokens are printed once | Reset local state and run `cliclaw setup` again |
| Cannot send to `channel:telegram:...` | Agent not bound to Telegram | `cliclaw agent set --token <admin-token> --name <agent> --bind-adapter-type telegram --bind-adapter-token <bot-token>` |
| Telegram bot doesn’t respond | Bot not bound or daemon not running | Bind the bot + ensure daemon is running |
| Messages seem “stuck” | Daemon not running, or scheduled for the future | Check daemon status/logs; verify `--deliver-at` |

## Useful commands

```bash
cliclaw daemon status --token <admin-token>
cliclaw agent list --token <admin-token>
```

## Logs and reset

| Item | Path |
|------|------|
| Daemon log | `~/cliclaw/.daemon/daemon.log` |
| Archived daemon logs | `~/cliclaw/.daemon/log_history/` |

## Migrating from legacy `~/.cliclaw`

Older versions used `~/.cliclaw/` with internal files directly in that directory.

New versions use `~/cliclaw/` with internal files under `~/cliclaw/.daemon/`.

Migration (preserve state):

```bash
# Stop the daemon first (use the admin token you saved)
cliclaw daemon stop --token <admin-token>

# Move the old root into the new root location
mv ~/.cliclaw ~/cliclaw

# Create the new internal directory and move internal state into it
mkdir -p ~/cliclaw/.daemon
mv ~/cliclaw/cliclaw.db* ~/cliclaw/.daemon/
mv ~/cliclaw/daemon.* ~/cliclaw/.daemon/
mv ~/cliclaw/log_history ~/cliclaw/.daemon/ || true

# Start again
cliclaw daemon start --token <admin-token>
```

Full reset (wipes local state):

```bash
cliclaw daemon stop --token <admin-token>
rm -rf ~/cliclaw
cliclaw setup
```

Advanced: if you set `CLICLAW_DIR`, reset that directory instead.
