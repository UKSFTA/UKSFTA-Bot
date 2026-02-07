const { REST, Routes } = require('discord.js');
require('dotenv').config();

const commands = [
  {
    name: 'dossier',
    description: 'Retrieve tactical service record for a member.',
    options: [
      {
        name: 'member',
        type: 6, // USER
        description: 'The member to investigate',
        required: true,
      },
    ],
  },
  {
    name: 'op',
    description: 'Operational orders and management.',
    options: [
      {
        name: 'create',
        type: 1, // SUB_COMMAND
        description: 'Create a new Operation Order (OPORD).',
        options: [
          {
            name: 'name',
            type: 3,
            description: 'Operation Name (Manual override)',
            required: false,
          },
          {
            name: 'date',
            type: 3,
            description: 'DD/MM/YYYY HH:MM (Manual override)',
            required: false,
          },
          {
            name: 'type',
            type: 3,
            description: 'Campaign / One-off / Training',
            required: false,
          },
          {
            name: 'uc_event',
            type: 3,
            description: 'Link to a Unit Commander Event',
            required: false,
            autocomplete: true,
          },
        ],
      },
    ],
  },
  {
    name: 'promotion',
    description: 'Process a rank promotion or demotion.',
    options: [
      {
        name: 'member',
        type: 6,
        description: 'The member to update',
        required: true,
      },
      {
        name: 'rank',
        type: 3,
        description: 'New rank (Manual or Autocomplete)',
        required: true,
        autocomplete: true,
      },
    ],
  },
  {
    name: 'award',
    description: 'Grant a tactical award or commendation to a member.',
    options: [
      {
        name: 'member',
        type: 6,
        description: 'The recipient',
        required: true,
      },
      {
        name: 'medal',
        type: 3,
        description: 'Award Title (Manual or Autocomplete)',
        required: true,
        autocomplete: true,
      },
      {
        name: 'citation',
        type: 3,
        description: 'The reason for the award',
        required: true,
      },
    ],
  },
  {
    name: 'attendance',
    description: 'Log attendance for a completed operation.',
    options: [
      {
        name: 'op_id',
        type: 3,
        description: 'The identifier of the operation',
        required: true,
      },
      {
        name: 'action',
        type: 3,
        description: 'Log or Export',
        required: true,
        choices: [
          { name: 'Log Present Members', value: 'log' },
          { name: 'Export to Intel System', value: 'export' },
        ],
      },
    ],
  },
  {
    name: 'link',
    description: 'Link a Discord member to their Unit Commander profile.',
    options: [
      {
        name: 'member',
        type: 6,
        description: 'The Discord member',
        required: true,
      },
      {
        name: 'uc_id',
        type: 3,
        description: 'The Unit Commander Profile ID (Found in UC URL)',
        required: true,
      },
    ],
  },
  {
    name: 'steam',
    description: 'Link your Steam ID for automated attendance tracking.',
    options: [
      {
        name: 'steam_id',
        type: 3,
        description: 'Your SteamID64. Leave empty to auto-detect from active server session.',
        required: false,
      },
    ],
  },
  {
    name: 'verify',
    description:
      'Attempt to automatically link your Discord account to Unit Commander.',
  },
  {
    name: 'unlink',
    description: 'Remove the link between a Discord member and Unit Commander.',
    options: [
      {
        name: 'member',
        type: 6,
        description: 'The member to unlink (Admin only)',
        required: false,
      },
    ],
  },
  {
    name: 'rcon',
    description: 'Execute an RCON command on the game server.',
    default_member_permissions: '8', // ADMINISTRATOR
    options: [
      {
        name: 'command',
        type: 3,
        description: 'The command to execute (e.g., "players", "kick 0")',
        required: true,
      },
    ],
  },
  {
    name: 'status',
    description: 'Get the real-time status of the UKSF game server.',
  },
  {
    name: 'sync',
    description: 'Automatically link your SteamID by detecting your current game session.',
  },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(
      `[SIGNALS] INITIALIZING DEPLOYMENT TO GUILD: ${process.env.DISCORD_GUILD_ID}`,
    );
    console.log(`[SIGNALS] CLIENT IDENTIFIER: ${process.env.CLIENT_ID}`);

    // First, clear existing commands to force a fresh sync
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.DISCORD_GUILD_ID,
      ),
      { body: [] },
    );
    console.log('[SIGNALS] PREVIOUS COMMAND CACHE CLEARED.');

    // Now deploy the new set
    const data = await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.DISCORD_GUILD_ID,
      ),
      { body: commands },
    );

    console.log(
      `[SIGNALS] SUCCESS: ${data.length} COMMANDS SYNCHRONIZED WITH DISCORD.`,
    );
  } catch (error) {
    console.error('[SIGNALS] DEPLOYMENT CRITICAL FAILURE:', error);
  }
})();
