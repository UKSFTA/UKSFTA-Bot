# Deployment & CI/CD Guide

## CI Pipeline (GitHub Actions)
The bot uses GitHub Actions for Continuous Integration. Every push to `main` or Pull Request triggers:
1. **Linting:** Enforces Biome standards.
2. **Security Audit:** Checks for vulnerable dependencies via `npm audit`.
3. **Unit Tests:** Executes Vitest suites.

## Secrets Management
For CI to pass and for the bot to run in production, ensure the following secrets/variables are configured in your environment:

### Required GitHub Secrets (for Actions)
*No secrets are currently required for the basic CI test suite as it uses mocks, but if integration tests are added, they will need Supabase credentials.*

### Production Environment (.env)
The following must be present on your hosting server:
- `DISCORD_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STEAM_API_KEY`
- `RCON_PASSWORD`

## Process Management
Use PM2 to maintain bot uptime:
```bash
# Start the bot
pm2 start ecosystem.config.js

# Monitor logs
pm2 logs uksf-bot

# Restart after updates
pm2 restart uksf-bot
```
