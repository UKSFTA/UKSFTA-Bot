const {
  Client,
  GatewayIntentBits,
  Collection,
  ActivityType,
  MessageFlags,
} = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { GameDig: Gamedig } = require('gamedig');
const axios = require('axios');
require('dotenv').config();

// Core Modules
const ucApi = require('./modules/uc_api');
const rcon = require('./modules/rcon');
const _renderer = require('./modules/renderer');
const { cleanName, calculateBeGuid } = require('./utils/helpers');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Configuration
const COLORS = {
  MOD_PURPLE: 0x532a45,
  ARMY_RED: 0xe30613,
  INTEL_GREEN: 0x00ce7d,
  TAC_GRAY: 0x2b2d31,
};

const AUTO_ATTENDANCE_CONFIG = {
  server: {
    type: 'arma3',
    host: process.env.STEAM_SERVER_IP || '127.0.0.1',
    port: parseInt(process.env.STEAM_QUERY_PORT, 10) || 9046,
  },
  opTime: { day: 3, startHour: 19, endHour: 22 },
  minDurationMinutes: 60,
};

// State
client.commands = new Collection();
const activeDossiers = new Collection();
let sessionTracker = new Map();
try {
  if (fs.existsSync('./data/attendance_buffer.json')) {
    const data = fs.readFileSync('./data/attendance_buffer.json', 'utf8');
    sessionTracker = new Map(JSON.parse(data));
    console.log(`[SYSTEM] Restored ${sessionTracker.size} attendance records from buffer.`);
  }
} catch (e) {
  console.error('[SYSTEM] Failed to load attendance buffer:', e);
}

const inGameCommandCache = new Map();
let currentMission = { id: null, name: 'BOOTING', map: 'UNKNOWN', players: 0 };

/**
 * COMMAND LOADER
 */
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('name' in command && 'execute' in command) {
    client.commands.set(command.name, command);
  }
}

console.log(`[SYSTEM] Loaded ${client.commands.size} modular commands.`);

client.once('ready', () => {
  console.log(`[SYSTEM] TERMINAL ONLINE. LOGGED AS ${client.user.tag}`);
  client.user.setPresence({
    activities: [{ name: 'SECURE LINK // 18 SIG REGT', type: ActivityType.Custom }],
    status: 'online',
  });

  rcon.createListener((output) => handleInGameCommand(output));
  monitorGameServer(true); 
  setInterval(monitorGameServer, 5 * 60 * 1000);
});

// MONITOR: Personnel Departure (AWOL)
client.on('guildMemberRemove', async (member) => {
  console.log(`[MONITOR] Member left Discord: ${member.user.tag}. Marking as AWOL.`);
  await ucApi.supabase
    .from('personnel')
    .update({ status: 'AWOL', updated_at: new Date().toISOString() })
    .eq('discord_id', member.id);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isAutocomplete()) return await handleAutocomplete(interaction);
    
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction, COLORS, resolveIdentity, AUTO_ATTENDANCE_CONFIG);
    }

    if (interaction.isButton()) return await handleButton(interaction);
  } catch (error) {
    console.error(`[INTERACTION ERROR] ${interaction.commandName || 'Unknown'}:`, error);
    const errorMsg = { content: 'A critical error occurred while processing this request.', flags: [MessageFlags.Ephemeral] };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(errorMsg).catch(() => null);
    } else {
      await interaction.reply(errorMsg).catch(() => null);
    }
  }
});

/**
 * UNIFIED IDENTITY RESOLVER
 */
async function resolveIdentity(playerName) {
  let steamId = null;
  let beGuid = null;
  const cleanedTarget = cleanName(playerName);

  try {
    const state = await Gamedig.query({
      type: AUTO_ATTENDANCE_CONFIG.server.type,
      host: AUTO_ATTENDANCE_CONFIG.server.host,
      port: AUTO_ATTENDANCE_CONFIG.server.port,
    });
    
    const pMatch = state.players.find(p => cleanName(p.name) === cleanedTarget);
    if (pMatch) {
      const potentials = [pMatch.raw?.steamid, pMatch.raw?.guid, pMatch.raw?.id, pMatch.raw?.extra?.steamid];
      steamId = potentials.find(id => id && /^\d{17}$/.test(id.toString()));
      beGuid = pMatch.raw?.guid || pMatch.raw?.id;
    }
  } catch (_e) {}

  if (!steamId || !beGuid) {
    const rconPlayers = await rcon.getPlayers();
    const rMatch = rconPlayers.find(rp => cleanName(rp.name) === cleanedTarget);
    if (rMatch) {
      if (!steamId) steamId = rMatch.steamId;
      if (!beGuid) beGuid = rMatch.guid;
    }
  }

  if (!steamId && process.env.BATTLEMETRICS_API_KEY) {
    try {
      const bmSearch = await axios.get(
        `https://api.battlemetrics.com/players?filter[search]=${encodeURIComponent(playerName)}&include=identifier`,
        { headers: { 'Authorization': `Bearer ${process.env.BATTLEMETRICS_API_KEY}` } }
      );
      if (bmSearch.data?.included) {
        const sidObj = bmSearch.data.included.find(i => i.attributes?.type === 'steamID');
        if (sidObj) steamId = sidObj.attributes.identifier;
      }
    } catch (_e) {}
  }

  if (steamId && !beGuid) beGuid = calculateBeGuid(steamId);
  return { steamId, beGuid };
}

async function handleInGameCommand(output) {
  const chatMatch = output.match(/^\((Global|Side|Command|Group|Vehicle)\)\s+(.+?):\s+!(.+)$/i);
  if (chatMatch) {
    const [_, _channel, playerName, fullCmd] = chatMatch;
    const [command, ..._args] = fullCmd.trim().split(' ');
    
    const cmdKey = `${playerName}:${fullCmd}`;
    if (inGameCommandCache.has(cmdKey) && Date.now() - inGameCommandCache.get(cmdKey) < 2000) return;
    inGameCommandCache.set(cmdKey, Date.now());

    console.log(`[IN-GAME] Command: ${playerName} -> !${command}`);

    switch (command.toLowerCase()) {
      case 'verify':
        rcon.execute(`say -1 [BOT] Hello ${playerName}. To verify your identity, use the /verify command in Discord.`);
        break;
      case 'status': {
        const state = await Gamedig.query(AUTO_ATTENDANCE_CONFIG.server).catch(() => null);
        if (state) rcon.execute(`say -1 [BOT] Server Status: ${state.players.length}/${state.maxplayers} personnel. Map: ${state.map}`);
        break;
      }
      case 'sync': {
        const { steamId, beGuid } = await resolveIdentity(playerName);
        if (steamId || beGuid) {
          const { data: personnel } = await ucApi.supabase.from('personnel').select('discord_id, display_name, status');
          const matchedPerson = personnel?.find(p => {
            if (p.status && p.status !== 'ACTIVE') return false;
            return cleanName(p.display_name).includes(cleanName(playerName)) || cleanName(playerName).includes(cleanName(p.display_name));
          });
          if (matchedPerson) {
            if (steamId) await ucApi.saveSteamLink(matchedPerson.discord_id, steamId);
            if (beGuid) await ucApi.saveGuid(matchedPerson.discord_id, beGuid);
            rcon.execute(`say -1 [BOT] Identity Sync Successful: Linked ${playerName} to Discord.`);
          }
        }
        break;
      }
      case 'help':
        rcon.execute('say -1 [BOT] In-Game Commands: !status, !sync, !verify.');
        break;
    }
  }

  const missionMatch = output.match(/Mission\s+(.+?)\s+read\./i);
  if (missionMatch) await startMissionLogging(missionMatch[1]);
}

async function startMissionLogging(missionName) {
  if (currentMission.id) await ucApi.supabase.from('mission_logs').update({ ended_at: new Date().toISOString() }).eq('id', currentMission.id);
  const state = await Gamedig.query(AUTO_ATTENDANCE_CONFIG.server).catch(() => ({ map: 'UNKNOWN', players: [] }));
  const { data } = await ucApi.supabase.from('mission_logs').insert({ mission_name: missionName, map_name: state.map, player_count: state.players.length, started_at: new Date().toISOString() }).select().single();
  if (data) currentMission = { id: data.id, name: missionName, map: state.map, players: state.players.length };
}

async function handleAutocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  let choices = [];
  if (focused.name === 'event') {
    const events = await ucApi.getEvents();
    choices = events.map(e => ({ name: `${e.name} (${e.date})`, value: e.id.toString() }));
  } else if (focused.name === 'status' && interaction.commandName === 'attendance') {
    const statuses = await ucApi.getAttendanceStatuses();
    choices = statuses.map(s => ({ name: s.name, value: s.id.toString() }));
  } else if (focused.name === 'target' && interaction.commandName === 'rcon') {
    const rconPlayers = await rcon.getPlayers();
    choices = rconPlayers.map(p => ({ name: p.name, value: p.name }));
  } else if (focused.name === 'medal') {
    const awards = await ucApi.getAwards();
    choices = awards.map(a => ({ name: a.name, value: a.name }));
  } else if (focused.name === 'rank') {
    const ranks = await ucApi.getRanks();
    choices = ranks.map(r => ({ name: `${r.name} (${r.abbreviation})`, value: r.abbreviation }));
  }
  const filtered = choices.filter(c => c.name.toLowerCase().includes(focused.value.toLowerCase())).slice(0, 25);
  await interaction.respond(filtered);
}

async function handleButton(interaction) {
  const parts = interaction.customId.split(':');
  const action = parts[0];
  const id = parts[1];

  if (action === 'tab') {
    const state = activeDossiers.get(id);
    if (!state || interaction.user.id !== id.split('_')[1]) return interaction.reply({ content: 'SESSION EXPIRED.', flags: [MessageFlags.Ephemeral] });
    state.tab = parts[2];
    const dossierCmd = client.commands.get('dossier');
    const { embed, components, files } = await dossierCmd.renderTab(state.profile, state.target, 0, [], state.tab, id, COLORS);
    await interaction.update({ embeds: [embed], components, files });
  }

  if (action === 'confirm_auto' || action === 'discard_auto') {
    const attendanceCmd = client.commands.get('attendance');
    return attendanceCmd.execute(interaction, COLORS);
  }

  if (action === 'verify_confirm') {
    const ucProfileId = id;
    const steamId = parts[2] !== 'NONE' ? parts[2] : null;
    const beGuid = parts[3] !== 'NONE' ? parts[3] : null;
    await ucApi.saveLink(interaction.user.id, ucProfileId);
    let msg = 'UNIT COMMANDER LINK ESTABLISHED.';
    if (steamId) {
      await ucApi.saveSteamLink(interaction.user.id, steamId);
      msg += `\nSTEAM LINK ESTABLISHED (ID: ${steamId})`;
      const calculatedGuid = calculateBeGuid(steamId);
      if (calculatedGuid) await ucApi.saveGuid(interaction.user.id, calculatedGuid);
    }
    if (beGuid) {
      await ucApi.saveGuid(interaction.user.id, beGuid);
      msg += `\nGUID LINK ESTABLISHED (ID: ${beGuid.substring(0, 8)}...)`;
    }
    return interaction.update({ content: `${msg}\n\nWelcome to the network.`, embeds: [], components: [], files: [] });
  }

  if (action === 'verify_deny') return interaction.update({ content: 'IDENTIFICATION ABORTED.', embeds: [], components: [], files: [] });
}

async function monitorGameServer(forceLog = false) {
  const now = new Date();
  const isOpDay = now.getDay() === AUTO_ATTENDANCE_CONFIG.opTime.day;
  const isOpTime = now.getHours() >= AUTO_ATTENDANCE_CONFIG.opTime.startHour && now.getHours() < AUTO_ATTENDANCE_CONFIG.opTime.endHour;

  if (!forceLog && (!isOpDay || !isOpTime)) return;

  try {
    const state = await Gamedig.query(AUTO_ATTENDANCE_CONFIG.server);
    let sessionUpdated = false;

    for (const player of state.players) {
      const { steamId } = await resolveIdentity(player.name);
      if (steamId) {
        // 1. Update Live Status (Last Seen)
        await ucApi.supabase.from('personnel').update({ last_seen: now.toISOString(), status: 'ACTIVE', updated_at: now.toISOString() }).eq('steam_id', steamId);
        
        // 2. Track Session Duration (Only during Op Time)
        if (isOpDay && isOpTime) {
          const currentMinutes = sessionTracker.get(steamId) || 0;
          sessionTracker.set(steamId, currentMinutes + 5); // Assumes 5 min interval
          sessionUpdated = true;
        }
      }
    }

    if (sessionUpdated) {
      fs.writeFileSync('./data/attendance_buffer.json', JSON.stringify(Array.from(sessionTracker.entries())));
    }

  } catch (e) { console.error('[MONITOR] Error:', e.message); }
}

process.on('unhandledRejection', (r) => console.error('[CRITICAL] Unhandled Rejection:', r));
process.on('uncaughtException', (e) => console.error('[CRITICAL] Uncaught Exception:', e));

client.login(process.env.DISCORD_TOKEN);
