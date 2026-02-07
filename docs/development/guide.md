# Development Guide

## Local Environment

1. **Node.js:** v20 or higher required.
2. **BattlEye:** `bercon-cli` must be in your system PATH.
3. **Database:** You must have access to the UKSFTA Supabase project.

## Quality Standards

- **Linting:** We use Biome. Run `npm run lint`.
- **Testing:** We use Vitest. Run `npm run test`.
- **Signing:** ALL commits must be GPG signed with `-S`.

## Adding Commands

1. Define the command structure in `deploy-commands.js`.
2. Add the logic handler in `index.js`.
3. If necessary, add a mocked test in `bot.test.mjs`.
4. Deploy to Discord using `npm run deploy`.
