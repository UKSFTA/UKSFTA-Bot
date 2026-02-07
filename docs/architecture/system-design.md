# System Architecture

The UKSF Bot is built on a decoupled, cloud-native architecture designed for 24/7 tactical monitoring.

## Core Components

1. **Discord Intelligence:** Built on `discord.js` v14, handling all slash command interactions and UI rendering.
2. **BattlEye Bridge:** Utilizes `bercon-cli` to maintain a persistent RCON stream from the game server.
3. **Data Layer (Supabase):** Secure PostgreSQL backend for persistent identity mappings (Discord <-> Steam <-> Unit Commander).
4. **Rendering Engine:** Uses `node-canvas` and `Chart.js` to generate real-time graphical dossiers.

## Data Flow

- **Write:** Bot -> Supabase (via Service Role)
- **Read:** Website Build -> Supabase (via Service Role)
- **Command Stream:** Server -> bercon-cli -> Bot Listener
