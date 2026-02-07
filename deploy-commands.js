const axios = require('axios');
require('dotenv').config();

const commands = [
  {
    name: 'dossier',
    description: 'Retrieve tactical service record for a member.',
    options: [{ name: 'member', type: 6, description: 'The member to investigate', required: true }]
  },
  {
    name: 'personnel',
    description: 'Manage unit personnel records.',
    default_member_permissions: '8',
    options: [
      {
        name: 'promote',
        type: 1,
        description: 'Promote or demote a member.',
        options: [
          { name: 'member', type: 6, description: 'The member to update', required: true },
          { name: 'rank', type: 3, description: 'New rank abbreviation', required: true, autocomplete: true }
        ]
      },
      {
        name: 'discharge',
        type: 1,
        description: 'Discharge a member from service.',
        options: [
          { name: 'member', type: 6, description: 'The member to discharge', required: true },
          { name: 'type', type: 3, description: 'Discharge type', required: true, choices: [
            { name: 'Honorable', value: 'HONORABLE' }, { name: 'Dishonorable', value: 'DISHONORABLE' },
            { name: 'Medical', value: 'MEDICAL' }, { name: 'Administrative', value: 'AWOL' }
          ]},
          { name: 'reason', type: 3, description: 'Reason', required: true }
        ]
      },
      {
        name: 'info',
        type: 1,
        description: 'View detailed database record.',
        options: [{ name: 'member', type: 6, description: 'The member', required: true }]
      }
    ]
  },
  {
    name: 'rcon',
    description: 'Game server administrative tools.',
    default_member_permissions: '8',
    options: [
      {
        name: 'cmd',
        type: 1,
        description: 'Execute common RCON commands.',
        options: [
          { name: 'action', type: 3, description: 'The action to perform', required: true, choices: [
            { name: 'List Players', value: 'players' }, { name: 'List Admins', value: 'admins' },
            { name: 'Server FPS', value: 'fps' }, { name: 'Lock Server', value: 'lock' },
            { name: 'Unlock Server', value: 'unlock' }, { name: 'List Bans', value: 'bans' }
          ]}
        ]
      },
      {
        name: 'player',
        type: 1,
        description: 'Management actions against specific players.',
        options: [
          { name: 'action', type: 3, description: 'Action', required: true, choices: [{ name: 'Kick', value: 'kick' }, { name: 'Ban', value: 'ban' }] },
          { name: 'target', type: 3, description: 'The player', required: true, autocomplete: true },
          { name: 'reason', type: 3, description: 'Reason', required: false },
          { name: 'duration', type: 4, description: 'Ban duration (mins)', required: false }
        ]
      },
      {
        name: 'say',
        type: 1,
        description: 'Broadcast a global message.',
        options: [{ name: 'message', type: 3, description: 'Message text', required: true }]
      },
      {
        name: 'raw',
        type: 1,
        description: 'Execute a raw string command.',
        options: [{ name: 'command', type: 3, description: 'The raw command', required: true }]
      }
    ]
  },
  { name: 'status', description: 'Real-time game server status.' },
  { name: 'mission', description: 'Operational history.', options: [{ name: 'recent', type: 1, description: 'Last 5 missions' }] },
  { name: 'steam', description: 'Link SteamID.', options: [{ name: 'steam_id', type: 3, description: 'SteamID64', required: false }] },
  { name: 'verify', description: 'Unified identity setup.' },
  { name: 'sync', description: 'Auto-detect Steam link.' },
  { name: 'help', description: 'Command reference.' }
];

async function deploy() {
  console.log(`[SIGNALS] TARGET GUILD: ${process.env.DISCORD_GUILD_ID}`);
  const url = `https://discord.com/api/v10/applications/${process.env.CLIENT_ID}/guilds/${process.env.DISCORD_GUILD_ID}/commands`;
  
  try {
    const response = await axios.put(url, commands, {
      headers: {
        Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10s timeout to prevent hanging
    });
    console.log(`[SIGNALS] SUCCESS: ${response.data.length} COMMANDS LIVE.`);
    process.exit(0);
  } catch (error) {
    if (error.response?.status === 429) {
      console.error(`[SIGNALS] RATE LIMITED: Discord is blocking updates for another ${error.response.data.retry_after} seconds.`);
    } else if (error.response?.data?.code === 30034) {
      console.error('[SIGNALS] QUOTA EXCEEDED: You have hit the Discord limit of 200 command updates today.');
      console.error('This limit will reset in approximately 24 hours.');
    } else {
      console.error('[SIGNALS] DEPLOYMENT FAILED:');
      console.error(error.response?.data || error.message);
    }
    process.exit(1);
  }
}

deploy();
