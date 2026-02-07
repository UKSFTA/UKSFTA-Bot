# UKSF Taskforce Alpha - Tactical Operations Bot

Production-grade Discord bot for UKSF Taskforce Alpha (UKSF-TA) server management, RCON integration, and personnel tracking.

## Features

- **Identity Verification:** Single-click linking between Discord, Steam, and Unit Commander via Supabase.
- **RCON Terminal:** Secure in-Discord terminal for game server management.
- **Live Status:** Real-time personnel status and server diagnostics.
- **Automated Attendance:** Background monitoring of game sessions with identity resolution.
- **Graphical Dossiers:** Dynamic generation of personnel ID cards and activity charts.

## Infrastructure

- **Engine:** Node.js v20+
- **Database:** Supabase (PostgreSQL)
- **External APIs:** Steam, Unit Commander, Battlemetrics
- **Protocol:** BattlEye RCON (via `bercon-cli`)

## Setup

1. **Environment:**
   ```bash
   cp .env.example .env
   # Populate .env with your credentials
   ```

2. **Dependencies:**
   Ensure `bercon-cli` is installed on your system.
   ```bash
   npm install
   ```

## Command Reference

### Discord Commands (Slash)
- `/verify`: Unified setup. Links Discord, Steam, and Unit Commander via Supabase.
- `/status`: Real-time server diagnostics and active personnel list.
- `/sync`: Auto-detect SteamID from active server session.
- `/rcon <cmd>`: Admin only. Execute BattlEye RCON commands directly.
- `/dossier <member>`: View tactical service record, ID card, and activity history.
- `/promotion <member> <rank>`: Admin only. Process rank changes.
- `/award <member> <medal> <citation>`: Admin only. Grant official commendations.

### In-Game Commands (BattlEye Chat)
- `!verify`: Instructions on how to link accounts via Discord.
- `!status`: Direct in-game broadcast of server population and map info.
- `!sync`: Acknowledgment of identity synchronization request.

## Development

- **Linting:** `npm run lint`
- **Formatting:** `npm run format`
- **Testing:** `npm run test`

## Security

This repository enforces strict cryptographic standards:
- All commits MUST be GPG signed.
- No secrets are stored in the repository (enforced via `.gitignore`).
- Supabase Service Role keys must be restricted to backend runtimes.
