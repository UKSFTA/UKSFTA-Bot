const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Collection,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActivityType,
  MessageFlags,
  PermissionFlagsBits,
  AttachmentBuilder,
} = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { GameDig: Gamedig } = require('gamedig');
const axios = require('axios');
require('dotenv').config();
const ucApi = require('./uc_api');
const steamApi = require('./steam_api');
const rcon = require('./rcon');
const renderer = require('./renderer');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Configuration
const _UNIT_TAG = 'UKSF';
const COLORS = {
  MOD_PURPLE: 0x532a45,
  ARMY_RED: 0xe30613,
  INTEL_GREEN: 0x00ce7d,
  TAC_GRAY: 0x2b2d31,
};

// Automated Attendance Config
const AUTO_ATTENDANCE_CONFIG = {
  server: {
    type: 'arma3', // or 'dayz' etc
    host: process.env.STEAM_SERVER_IP || '127.0.0.1',
    port: parseInt(process.env.STEAM_QUERY_PORT, 10) || 9046,
  },
  opTime: {
    day: 3, // Wednesday
    startHour: 19, // 19:00
    endHour: 22, // 22:00
  },
  minDurationMinutes: 60,
};

// State
const operations = new Collection();
const activeDossiers = new Collection();
const sessionTracker = new Map(); // steamId -> { firstSeen: Date, lastSeen: Date, totalMinutes: 0 }
let currentMission = { id: null, name: 'BOOTING', map: 'UNKNOWN', players: 0 };

client.once('ready', () => {
  console.log(`[SYSTEM] TERMINAL ONLINE. LOGGED AS ${client.user.tag}`);
  client.user.setPresence({
    activities: [
      { name: 'SECURE LINK // 18 SIG REGT', type: ActivityType.Custom },
    ],
    status: 'online',
  });

  // Start RCON Listener for in-game commands
  rcon.createListener((output) => {
    handleInGameCommand(output);
  });

  // Perform initial startup diagnostic
  console.log('[SYSTEM] PERFORMING INITIAL SERVER DIAGNOSTIC...');
  monitorGameServer(true); 

  // Start Automated Attendance Monitor
  setInterval(monitorGameServer, 5 * 60 * 1000); // Every 5 minutes
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
  if (interaction.isAutocomplete()) return handleAutocomplete(interaction);
  if (interaction.isChatInputCommand()) return handleChatInput(interaction);
  if (interaction.isButton()) return handleButton(interaction);
});

async function handleInGameCommand(output) {
  // 1. CHAT COMMANDS
  const chatMatch = output.match(/^\((Global|Side|Command|Group|Vehicle)\)\s+(.+?):\s+!(.+)$/i);
  if (chatMatch) {
    const [_, channel, playerName, fullCmd] = chatMatch;
    const [command, ..._args] = fullCmd.trim().split(' ');
    
    console.log(`[IN-GAME] Command: ${playerName} -> !${command}`);

    switch (command.toLowerCase()) {
      case 'verify':
        rcon.execute(`say -1 [BOT] Hello ${playerName}. To verify your identity, use the /verify command in Discord.`);
        break;
      case 'status': {
        const state = await Gamedig.query({
          type: AUTO_ATTENDANCE_CONFIG.server.type,
          host: AUTO_ATTENDANCE_CONFIG.server.host,
          port: AUTO_ATTENDANCE_CONFIG.server.port,
        }).catch(() => null);
        if (state) {
          rcon.execute(`say -1 [BOT] Server Status: ${state.players.length}/${state.maxplayers} personnel. Map: ${state.map}`);
        }
        break;
      }
      case 'sync':
        rcon.execute(`say -1 [BOT] ${playerName}, syncing... Check Discord for confirmation.`);
        break;
    }
  }

  // 2. ENGINE LOGS (Mission Detection)
  // BattlEye Mission Change Pattern: "Mission [Name] read."
  const missionMatch = output.match(/Mission\s+(.+?)\s+read\./i);
  if (missionMatch) {
    const missionName = missionMatch[1];
    await startMissionLogging(missionName);
  }
}

/**
 * MISSION LOGGING ENGINE
 */
async function startMissionLogging(missionName) {
  // Close previous mission
  if (currentMission.id) {
    await ucApi.supabase
      .from('mission_logs')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', currentMission.id);
  }

  console.log(`[MISSION] New deployment detected: ${missionName}`);

  // Query server for map info
  const state = await Gamedig.query({
    type: AUTO_ATTENDANCE_CONFIG.server.type,
    host: AUTO_ATTENDANCE_CONFIG.server.host,
    port: AUTO_ATTENDANCE_CONFIG.server.port,
  }).catch(() => ({ map: 'UNKNOWN', players: [] }));

  const { data, error } = await ucApi.supabase
    .from('mission_logs')
    .insert({
      mission_name: missionName,
      map_name: state.map,
      player_count: state.players.length,
      started_at: new Date().toISOString()
    })
    .select()
    .single();

  if (!error && data) {
    currentMission = {
      id: data.id,
      name: missionName,
      map: state.map,
      players: state.players.length
    };
  }
}

/**
 * PERSONNEL MANAGEMENT HANDLER
 */
async function handlePersonnel(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const target = interaction.options.getMember('member');

  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: 'ACCESS DENIED.', flags: [MessageFlags.Ephemeral] });
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  switch (subcommand) {
    case 'promote': {
      const rankAbbrev = interaction.options.getString('rank');
      const ranks = await ucApi.getRanks();
      const match = ranks.find(r => r.abbreviation.toLowerCase() === rankAbbrev.toLowerCase());
      
      if (!match) return interaction.editReply(`ERROR: Rank '${rankAbbrev}' not found in registry.`);

      // Update UC
      const profile = await ucApi.getProfileByDiscordMember(target);
      if (profile) await ucApi.updateRank(profile.id, match.id);

      // Update Supabase
      await ucApi.updatePersonnelRank(target.id, match.name, match.order || 99);

      const embed = new EmbedBuilder()
        .setColor(COLORS.INTEL_GREEN)
        .setTitle('PERSONNEL ACTION: PROMOTION')
        .setDescription(`**${target.displayName}** has been promoted to **${match.name}**.`)
        .setFooter({ text: 'DATABASE SYNCHRONIZED' });

      return interaction.editReply({ embeds: [embed] });
    }

    case 'discharge': {
      const type = interaction.options.getString('type');
      const reason = interaction.options.getString('reason');

      await ucApi.updatePersonnelStatus(target.id, `DISCHARGED (${type})`);

      const embed = new EmbedBuilder()
        .setColor(COLORS.ARMY_RED)
        .setTitle('PERSONNEL ACTION: DISCHARGE')
        .setDescription(`**${target.displayName}** has been discharged from the unit.\n**TYPE:** ${type}\n**REASON:** ${reason}`)
        .setFooter({ text: 'RECORD ARCHIVED' });

      return interaction.editReply({ embeds: [embed] });
    }

    case 'info': {
      const { data, error } = await ucApi.supabase
        .from('personnel')
        .select('*')
        .eq('discord_id', target.id)
        .single();

      if (error || !data) return interaction.editReply('ERROR: No database record found for this member.');

      const embed = new EmbedBuilder()
        .setColor(COLORS.TAC_GRAY)
        .setTitle(`DATABASE RECORD: ${data.display_name || target.displayName}`)
        .addFields(
          { name: 'STATUS', value: `\`${data.status || 'ACTIVE'}\``, inline: true },
          { name: 'RANK', value: `\`${data.rank || 'RCT'}\``, inline: true },
          { name: 'CALLSIGN', value: `\`${data.callsign || 'N/A'}\``, inline: true },
          { name: 'STEAM_ID', value: `\`${data.steam_id || 'NOT LINKED'}\``, inline: false },
          { name: 'LAST SEEN', value: data.last_seen ? `<t:${Math.floor(new Date(data.last_seen).getTime() / 1000)}:R>` : 'NEVER', inline: true },
          { name: 'JOINED', value: data.joined_at || 'N/A', inline: true }
        );

      return interaction.editReply({ embeds: [embed] });
    }
  }
}

/**
 * MISSION HISTORY HANDLER
 */
async function handleMission(interaction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const { data, error } = await ucApi.supabase
    .from('mission_logs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(5);

  if (error || !data) return interaction.editReply('ERROR: Unable to retrieve operational history.');

  const embed = new EmbedBuilder()
    .setColor(COLORS.TAC_GRAY)
    .setTitle('OPERATIONAL HISTORY // AFTER ACTION LOGS')
    .setDescription(
      data.map(m => {
        const start = new Date(m.started_at);
        const end = m.ended_at ? new Date(m.ended_at) : null;
        const duration = end ? Math.floor((end - start) / 60000) : 'ACTIVE';
        return `• **${m.mission_name}**\n  Map: \`${m.map_name}\` | Duration: \`${duration}m\` | Personnel: \`${m.player_count}\``;
      }).join('\n\n') || '*No operational records found.*'
    )
    .setFooter({ text: 'RESTRICTED ACCESS // 18 SIG REGT' });

  await interaction.editReply({ embeds: [embed] });
}
  const { commandName } = interaction;

  switch (commandName) {
    case 'dossier':
      return startDossier(interaction);
    case 'verify':
      return handleVerify(interaction);
    case 'steam':
      return handleSteamLink(interaction);
    case 'sop':
      return handleSOPSearch(interaction);
    case 'link':
      return handleLink(interaction);
    case 'unlink':
      return handleUnlink(interaction);
    case 'award':
      return handleAward(interaction);
    case 'promotion':
      return handlePersonnel(interaction);
    case 'personnel':
      return handlePersonnel(interaction);
    case 'attendance':
      return handleAttendance(interaction);
    case 'op':
      return handleOp(interaction);
    case 'rcon':
      return handleRcon(interaction);
    case 'status':
      return handleStatus(interaction);
    case 'sync':
      return handleSync(interaction);
    default:
      console.warn(`[SYSTEM] UNKNOWN CMD: ${commandName}`);
  }
}

  switch (commandName) {
    case 'dossier':
      return startDossier(interaction);
    case 'verify':
      return handleVerify(interaction);
    case 'steam':
      return handleSteamLink(interaction);
    case 'sop':
      return handleSOPSearch(interaction);
    case 'link':
      return handleLink(interaction);
    case 'unlink':
      return handleUnlink(interaction);
    case 'award':
      return handleAward(interaction);
    case 'promotion':
      return handlePromotion(interaction);
    case 'attendance':
      return handleAttendance(interaction);
    case 'op':
      return handleOp(interaction);
    case 'personnel':
      return handlePersonnel(interaction);
    case 'mission':
      return handleMission(interaction);
    case 'rcon':
      return handleRcon(interaction);
    case 'status':
      return handleStatus(interaction);
    case 'sync':
      return handleSync(interaction);
    default:
      console.warn(`[SYSTEM] UNKNOWN CMD: ${commandName}`);
  }
}

/**
 * AUTO-SYNC STEAM IDENTITY
 */
async function handleSync(interaction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  
  try {
    const state = await Gamedig.query({
      type: AUTO_ATTENDANCE_CONFIG.server.type,
      host: AUTO_ATTENDANCE_CONFIG.server.host,
      port: AUTO_ATTENDANCE_CONFIG.server.port,
    });

    const targetName = cleanName(interaction.member.displayName);
    const player = state.players.find(p => 
      cleanName(p.name).includes(targetName) || 
      targetName.includes(cleanName(p.name))
    );

    if (!player) {
      return interaction.editReply({ 
        content: 'ERROR: I COULD NOT LOCATE YOU ON THE SERVER. ENSURE YOU ARE LOGGED IN AND YOUR DISCORD NAME MATCHES YOUR IN-GAME NAME.' 
      });
    }

    let steamId = player.raw?.steamid;

    // FALLBACK: Try RCON if Gamedig failed to get SteamID
    if (!steamId || !/^\d{17}$/.test(steamId)) {
      console.log(`[SYNC] Gamedig failed SteamID for ${player.name}, attempting RCON fallback...`);
      const rconPlayers = await rcon.getPlayers();
      const rconMatch = rconPlayers.find(rp => 
        cleanName(rp.name) === targetName || 
        cleanName(rp.name) === cleanName(player.name)
      );
      
      if (rconMatch?.steamId) {
        steamId = rconMatch.steamId;
        console.log(`[SYNC] RCON Success: Found SteamID ${steamId} for ${player.name}`);
      }
    }

    if (!steamId || !/^\d{17}$/.test(steamId)) {
      return interaction.editReply({ 
        content: `I FOUND YOU AS **${player.name}**, BUT THE SERVER IS NOT REPORTING YOUR STEAMID64 (VIA QUERY OR RCON). PLEASE USE \`/steam\` TO LINK MANUALLY.` 
      });
    }

    ucApi.saveSteamLink(interaction.user.id, steamId);

    const embed = new EmbedBuilder()
      .setColor(COLORS.INTEL_GREEN)
      .setTitle('IDENTITY SYNCHRONIZED')
      .setDescription(`I have detected your Steam identity via the live server link.
**PLAYER:** ${player.name}
**STEAMID:** \`${steamId}\`

Automated attendance tracking is now active for your account.`)
      .setFooter({ text: 'TRANSMISSION SEALED // 18 SIG REGT' });

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('[SYNC] Error:', error.message);
    await interaction.editReply({ content: 'CRITICAL ERROR DURING IDENTITY SYNC.' });
  }
}

/**
 * SERVER STATUS REPORT
 */
async function handleStatus(interaction) {
  await interaction.deferReply();

  try {
    const state = await Gamedig.query({
      type: AUTO_ATTENDANCE_CONFIG.server.type,
      host: AUTO_ATTENDANCE_CONFIG.server.host,
      port: AUTO_ATTENDANCE_CONFIG.server.port,
    });

    const embed = new EmbedBuilder()
      .setColor(COLORS.INTEL_GREEN)
      .setTitle(`SERVER STATUS: ${state.name}`)
      .addFields(
        { name: 'MAP', value: `\`${state.map}\``, inline: true },
        { name: 'PLAYERS', value: `\`${state.players.length} / ${state.maxplayers}\``, inline: true },
        { name: 'PING', value: `\`${state.ping}ms\``, inline: true },
      )
      .setTimestamp();

    const steamLinks = ucApi.getSteamLinks();
    const profiles = await ucApi.getProfiles();

    if (state.players.length > 0) {
      const playerLines = await Promise.all(state.players.map(async (p) => {
        const steamId = p.raw?.steamid;
        let ucProfile = null;

        if (steamId) {
          const discordId = Object.keys(steamLinks).find(key => steamLinks[key] === steamId);
          if (discordId) {
            ucProfile = await ucApi.getProfileByDiscordMember({ id: discordId, displayName: p.name });
          }
        }

        if (!ucProfile) {
          // Fallback to name matching
          ucProfile = profiles.find(pr => 
            pr.alias.toLowerCase() === p.name.toLowerCase() ||
            p.name.toLowerCase().includes(pr.alias.toLowerCase())
          );
        }

        const statusLabel = ucProfile ? `[${ucProfile.rank?.abbreviation || 'RCT'}] ${ucProfile.alias}` : 'UNREGISTERED';
        return `• **${p.name}** → \`${statusLabel}\``;
      }));

      embed.addFields({ name: 'ACTIVE PERSONNEL', value: playerLines.join('\n').substring(0, 1024) });
    } else {
      embed.addFields({ name: 'ACTIVE PERSONNEL', value: '*No personnel detected on station.*' });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[STATUS] Query failed:', error.message);
    await interaction.editReply({ content: 'ERROR: UNABLE TO REACH GAME SERVER.' });
  }
}

/**
 * RCON COMMAND EXECUTION
 */
async function handleRcon(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: 'ACCESS DENIED: ADMINISTRATOR PRIVILEGES REQUIRED.',
      flags: [MessageFlags.Ephemeral],
    });
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const command = interaction.options.getString('command');

  console.log(`[RCON] Executing manual command for ${interaction.user.tag}: ${command}`);
  const response = await rcon.execute(command);

  const embed = new EmbedBuilder()
    .setColor(COLORS.TAC_GRAY)
    .setTitle('RCON TERMINAL OUTPUT')
    .setDescription(`\`\`\`\n${response.substring(0, 1900)}\n\`\`\``)
    .setFooter({ text: `COMMAND: ${command}` });

  await interaction.editReply({ embeds: [embed] });
}

/**
 * STEAM LINKING
 */
async function handleSteamLink(interaction) {
  const steamId = interaction.options.getString('steam_id');

  // MANUAL LINK
  if (steamId) {
    if (!/^\d{17}$/.test(steamId)) {
      return interaction.reply({
        content: 'ERROR: INVALID STEAMID64. MUST BE 17 DIGITS.',
        flags: [MessageFlags.Ephemeral],
      });
    }

    ucApi.saveSteamLink(interaction.user.id, steamId);

    const embed = new EmbedBuilder()
      .setColor(COLORS.INTEL_GREEN)
      .setTitle('STEAM LINK ESTABLISHED')
      .setDescription(`Your Discord identity is now manually mapped to SteamID: \`${steamId}\`.
Automated attendance tracking is now active for this account.`)
      .setFooter({ text: 'TRANSMISSION SEALED // 18 SIG REGT' });

    return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
  }

  // SOFT LINK (AUTO-DETECT)
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  
  try {
    const state = await Gamedig.query({
      type: AUTO_ATTENDANCE_CONFIG.server.type,
      host: AUTO_ATTENDANCE_CONFIG.server.host,
      port: AUTO_ATTENDANCE_CONFIG.server.port,
    });

    const targetName = cleanName(interaction.member.displayName);
    
    // Improved matching logic: Try exact cleaned match first, then partial
    let player = state.players.find(p => cleanName(p.name) === targetName);
    if (!player) {
      player = state.players.find(p => 
        cleanName(p.name).includes(targetName) || 
        targetName.includes(cleanName(p.name))
      );
    }

    if (!player) {
      return interaction.editReply({ 
        content: `### ❌ SOFT LINK FAILED
I could not locate a player matching "**${interaction.member.displayName}**" on the server.
        
**Troubleshooting:**
1. Ensure you are currently **online** on the game server.
2. Ensure your in-game name matches your Discord nickname (Ranks and callsigns are ignored).
3. If this continues to fail, find your **SteamID64** manually.

**How to find your SteamID64:**
1. Visit [SteamDB Calculator](https://steamdb.info/calculator/)
2. Paste your profile URL and look for the **SteamID64** (a 17-digit number starting with 765).
3. Run: \`/steam steam_id:YOUR_17_DIGIT_ID\`` 
      });
    }

    const detectedId = player.raw?.steamid;
    if (!detectedId || !/^\d{17}$/.test(detectedId)) {
      return interaction.editReply({ 
        content: `I found you as **${player.name}**, but the server did not report a valid SteamID. Please link manually.` 
      });
    }

    ucApi.saveSteamLink(interaction.user.id, detectedId);

    const embed = new EmbedBuilder()
      .setColor(COLORS.INTEL_GREEN)
      .setTitle('STEAM LINK AUTO-DETECTED')
      .setDescription(`I have successfully identified you on the field.
**PLAYER:** ${player.name}
**STEAMID:** \`${detectedId}\`

Link confirmed. Automated attendance tracking is active.`)
      .setFooter({ text: 'TRANSMISSION SEALED // 18 SIG REGT' });

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('[STEAM] Soft Link Error:', error.message);
    await interaction.editReply({ content: 'ERROR: UNABLE TO CONTACT GAME SERVER FOR AUTO-DETECTION.' });
  }
}

/**
 * AUTOMATED ATTENDANCE MONITOR
 */
async function monitorGameServer(forceLog = false) {
  const now = new Date();

  // Only monitor during Operation Windows
  const isOpDay = now.getDay() === AUTO_ATTENDANCE_CONFIG.opTime.day;
  const isOpTime =
    now.getHours() >= AUTO_ATTENDANCE_CONFIG.opTime.startHour &&
    now.getHours() < AUTO_ATTENDANCE_CONFIG.opTime.endHour;

  if (!forceLog && (!isOpDay || !isOpTime)) {
    // If op just ended, process final attendance
    if (
      sessionTracker.size > 0 &&
      isOpDay &&
      now.getHours() === AUTO_ATTENDANCE_CONFIG.opTime.endHour
    ) {
      console.log('[SYSTEM] OP WINDOW CLOSED. FINALIZING ATTENDANCE...');
      await finalizeOpAttendance();
    }
    return;
  }

  try {
    const state = await Gamedig.query({
      type: AUTO_ATTENDANCE_CONFIG.server.type,
      host: AUTO_ATTENDANCE_CONFIG.server.host,
      port: AUTO_ATTENDANCE_CONFIG.server.port,
    });

    // Try to get RCON data for better identification
    const rconPlayers = await rcon.getPlayers();
    if (rconPlayers.length > 0) {
      console.log(`[MONITOR] RCON fetched ${rconPlayers.length} active sessions.`);
    }

    console.log(
      `[MONITOR] Server: ${state.name} | Players: ${state.players.length}/${state.maxplayers}`,
    );

    const _steamIds = state.players
      .map((p) => p.raw?.steamid)
      .filter((id) => id && /^\d{17}$/.test(id));

    // IDENTITY RESOLUTION
    const localSteamLinks = ucApi.getSteamLinks(); 
    const allKnownSteamIds = Object.values(localSteamLinks);
    
    let memberSteamProfiles = [];
    if (allKnownSteamIds.length > 0) {
      memberSteamProfiles = await steamApi.getPlayerSummaries(allKnownSteamIds);
    }

    // Identity Resolution Loop
    for (const player of state.players) {
      let steamId = player.raw?.steamid || 'UNKNOWN';
      let resolutionMethod = "GAMEDIG";
      
      // ... (resolution logic)

      if (steamId !== 'UNKNOWN') {
        // UPDATE LAST SEEN & ACTIVITY
        await ucApi.supabase
          .from('personnel')
          .update({ 
            last_seen: now.toISOString(), 
            status: 'ACTIVE', // Reset to active if they play
            updated_at: now.toISOString() 
          })
          .eq('steam_id', steamId);

        if (isOpDay && isOpTime) {
          // ... (existing session tracker logic)
        }
      } else {
        // DYNAMIC WHITELIST LOGIC
        const WHITELIST_ENABLED = process.env.DYNAMIC_WHITELIST === 'true';
        if (WHITELIST_ENABLED) {
           console.log(`[WHITELIST] Unregistered player detected: ${player.name}. Preparing kick sequence...`);
           // rcon.execute(`kick "${player.name}" [BOT] UKSF Authorization Required.`);
        }
      }
    }

    // INACTIVITY CLEANUP (Daily check)
    if (now.getHours() === 3 && now.getMinutes() < 5) {
      const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)).toISOString();
      console.log(`[MONITOR] Running inactivity audit (Seen before ${thirtyDaysAgo})...`);
      
      await ucApi.supabase
        .from('personnel')
        .update({ status: 'INACTIVE' })
        .lt('last_seen', thirtyDaysAgo)
        .eq('status', 'ACTIVE');
    }
  } catch (e) {
    console.error('[MONITOR] Server Query Failed:', e.message);
  }
}

async function finalizeOpAttendance() {
  const steamLinks = ucApi.getSteamLinks();
  const events = await ucApi.getEvents();
  const today = new Date().toISOString().split('T')[0];
  const activeEvent = events.find((e) => e.date === today);

  if (!activeEvent) {
    console.warn(
      '[SYSTEM] No UC Event found for today. Cannot log auto-attendance.',
    );
    sessionTracker.clear();
    return;
  }

  const statuses = await ucApi.getAttendanceStatuses();
  const attendedStatus = statuses.find(
    (s) =>
      s.name.toLowerCase() === 'attending' ||
      s.name.toLowerCase() === 'attended',
  );

  for (const [steamId, session] of sessionTracker) {
    if (session.minutes >= AUTO_ATTENDANCE_CONFIG.minDurationMinutes) {
      const discordId = Object.keys(steamLinks).find(
        (key) => steamLinks[key] === steamId,
      );
      if (discordId) {
        const profile = await ucApi.getProfileByDiscordMember({
          id: discordId,
          displayName: '',
        });
        if (profile) {
          console.log(
            `[SYSTEM] AUTO-ATTENDANCE: ${profile.alias} (${session.minutes} mins)`,
          );
          await ucApi.submitAttendance(
            activeEvent.id,
            profile.id,
            attendedStatus.id,
          );
        }
      }
    }
  }
  sessionTracker.clear();
}

/**
 * DOSSIER SYSTEM v2 (Interactive Terminal)
 */
async function startDossier(interaction) {
  await interaction.deferReply();
  const target = interaction.options.getMember('member') || interaction.member;
  const profile = await ucApi.getProfileByDiscordMember(target);

  if (!profile) {
    return interaction.editReply({
      content: `ACCESS DENIED: NO ACTIVE PERSONNEL RECORD FOR '${target.displayName}'`,
      flags: [MessageFlags.Ephemeral],
    });
  }

  const deployments = await getDeploymentCount(profile.id);
  const attendance = await ucApi.getAttendanceForProfile(profile.id);

  // Store state for navigation
  const dossierId = `dossier_${interaction.user.id}_${target.id}`;
  activeDossiers.set(dossierId, {
    profile,
    target,
    deployments,
    attendance,
    tab: 'summary',
  });

  const { embed, components, files } = await renderDossierTab(dossierId);
  await interaction.editReply({ embeds: [embed], components, files });
}

async function renderDossierTab(dossierId) {
  const state = activeDossiers.get(dossierId);
  const { profile, target, deployments, attendance, tab } = state;

  const rank = profile.rank?.name || 'RECRUIT';
  const unit = profile.unit?.name || 'UKSF DIRECTORATE';
  const status = profile.status?.toUpperCase() || 'ACTIVE';

  const embed = new EmbedBuilder()
    .setColor(status === 'ACTIVE' ? COLORS.INTEL_GREEN : COLORS.ARMY_RED)
    .setAuthor({
      name: `UKSF PERSONNEL FILE // ${target.user.username.toUpperCase()}`,
      iconURL:
        'https://raw.githubusercontent.com/co-analysis/govukhugo/master/static/images/govuk-crest.png',
    })
    .setFooter({
      text: `SECURE TERMINAL // TAB: ${tab.toUpperCase()} // SESSION: ${dossierId.substring(0, 12)}`,
    })
    .setTimestamp();

  const files = [];

  if (tab === 'summary') {
    const idCardBuffer = await renderer.renderIDCard(
      profile,
      rank,
      deployments,
    );
    const attachment = new AttachmentBuilder(idCardBuffer, {
      name: 'idcard.png',
    });
    files.push(attachment);

    embed
      .setTitle(`${rank.toUpperCase()} ${profile.alias.toUpperCase()}`)
      .setDescription(
        `>>> **CURRENT ASSIGNMENT:** ${unit}\n**POSTING:** ${profile.position?.name || 'ACTIVE DUTY'}`,
      )
      .setImage('attachment://idcard.png')
      .addFields(
        { name: 'IDENTIFIER', value: `\`${target.user.id}\``, inline: true },
        { name: 'STATUS', value: `\`${status}\``, inline: true },
        {
          name: 'ENLISTED',
          value: `\`${new Date(profile.created_at).toLocaleDateString('en-GB')}\``,
          inline: true,
        },
      );
  } else if (tab === 'history') {
    const chartBuffer = await renderer.renderActivityChart(attendance);
    const attachment = new AttachmentBuilder(chartBuffer, {
      name: 'activity.png',
    });
    files.push(attachment);

    const last5 =
      attendance
        .slice(0, 5)
        .map(
          (a) =>
            `• \`${new Date(a.event?.date || a.date).toLocaleDateString('en-GB')}\` - **${a.event?.name || a.campaignEvent?.name}**`,
        )
        .join('\n') || 'No records found.';

    embed
      .setTitle(`OPERATIONAL HISTORY // ${profile.alias.toUpperCase()}`)
      .setDescription(`**TOTAL DEPLOYMENTS:** \`${deployments}\``)
      .setImage('attachment://activity.png')
      .addFields({ name: 'RECENT DEPLOYMENTS', value: last5 });
  } else if (tab === 'awards') {
    const awards =
      profile.awards
        ?.map(
          (a) =>
            `**${a.name || a.award?.name}**\n*${a.citation || 'No citation archived.'}*`,
        )
        .join('\n\n') || 'No official commendations.';
    embed
      .setTitle(`COMMENDATIONS & AWARDS // ${profile.alias.toUpperCase()}`)
      .setDescription(awards);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tab:${dossierId}:summary`)
      .setLabel('SUMMARY')
      .setStyle(
        tab === 'summary' ? ButtonStyle.Primary : ButtonStyle.Secondary,
      ),
    new ButtonBuilder()
      .setCustomId(`tab:${dossierId}:history`)
      .setLabel('HISTORY')
      .setStyle(
        tab === 'history' ? ButtonStyle.Primary : ButtonStyle.Secondary,
      ),
    new ButtonBuilder()
      .setCustomId(`tab:${dossierId}:awards`)
      .setLabel('AWARDS')
      .setStyle(tab === 'awards' ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );

  return { embed, components: [row], files };
}

/**
 * SOP SEARCH SYSTEM
 */
async function handleSOPSearch(interaction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const query = interaction.options.getString('query').toLowerCase();

  const sopPath = path.join(__dirname, '..', 'content', 'rsis', 'sop');
  const files = getAllFiles(sopPath).filter((f) => f.endsWith('.md'));

  let result = null;
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.toLowerCase().includes(query)) {
      const title = content.match(/title: "(.*?)"/)?.[1] || path.basename(file);
      result = {
        title,
        content: `${content.replace(/---[\s\S]*?---/, '').substring(0, 800)}...`,
        path: file,
      };
      break;
    }
  }

  if (result) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.INTEL_GREEN)
      .setTitle(`SOP REFERENCE: ${result.title}`)
      .setDescription(result.content)
      .setFooter({ text: 'RESTRICTED // UKSF DOCTRINE' });
    await interaction.editReply({ embeds: [embed] });
  } else {
    await interaction.editReply({
      content: `NO SOP MATCHING '${query}' FOUND IN ARCHIVES.`,
    });
  }
}

/**
 * VERIFICATION v2 (Graphical)
 */
async function handleVerify(interaction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const target = interaction.member;
  
  // 1. UC Profile Soft Link
  const profile = await ucApi.getProfileByDiscordMember(target);
  if (!profile) {
    return interaction.editReply({
      content: 'ERROR: No matching Unit Commander personnel file found. Ensure your Discord nickname matches your official alias.',
    });
  }

  // 2. Steam Soft Link (Check Live Presence)
  let steamLinkData = null;
  let presenceMsg = '';
  
  try {
    const state = await Gamedig.query({
      type: AUTO_ATTENDANCE_CONFIG.server.type,
      host: AUTO_ATTENDANCE_CONFIG.server.host,
      port: AUTO_ATTENDANCE_CONFIG.server.port,
    });
    
    // Check if user is already linked
        const existingLinks = ucApi.getSteamLinks();
        if (existingLinks[interaction.user.id]) {
          presenceMsg = '\n✅ **STEAM LINK:** ALREADY ACTIVE';
        } else {
          // Find on server
          const targetName = cleanName(interaction.member.displayName);
          const player = state.players.find(p => 
            cleanName(p.name).includes(targetName) || 
            targetName.includes(cleanName(p.name))
          );
          
          if (player?.raw?.steamid) {
            steamLinkData = player.raw.steamid;
            presenceMsg = `\n✅ **STEAM LINK:** DETECTED ON SERVER AS **${player.name}**`;
          } else if (player) {
    
              // RCON Fallback for Verify
              const rconPlayers = await rcon.getPlayers();
              const rconMatch = rconPlayers.find(rp => cleanName(rp.name) === targetName);
              if (rconMatch?.steamId) {
                steamLinkData = rconMatch.steamId;
                presenceMsg = `\n✅ **STEAM LINK:** DETECTED VIA RCON AS **${player.name}**`;
              } else {
                presenceMsg = '\n⚠️ **STEAM LINK:** DETECTED BUT NO ID REPORTED (Use /steam manually)';
              }
            }
       else {
        presenceMsg = '\n⚠️ **STEAM LINK:** NOT DETECTED ON SERVER (Connect to auto-link)';
      }
    }
  } catch (_e) {
    presenceMsg = '\n⚠️ **STEAM LINK:** SERVER OFFLINE';
  }

  const deployments = await getDeploymentCount(profile.id);
  const idCardBuffer = await renderer.renderIDCard(
    profile,
    profile.rank?.name || 'RECRUIT',
    deployments,
  );
  
  const attachment = new AttachmentBuilder(idCardBuffer, { name: 'idcard.png' });

  const embed = new EmbedBuilder()
    .setColor(COLORS.TAC_GRAY)
    .setTitle('IDENTITY VERIFICATION TERMINAL')
    .setDescription(
      `>>> **PERSONNEL RECORD FOUND.**\nReview the ID card below. Confirm if this is your official file.\n${presenceMsg}`
    )
    .setImage('attachment://idcard.png')
    .setFooter({ text: 'UKSF SECURE LINK // 18 SIG REGT' });

  // Store data in customId for the button handler (UC ID + Steam ID)
  // Format: verify_confirm:UC_ID:STEAM_ID
  const confirmId = `verify_confirm:${profile.id}${steamLinkData ? `:${steamLinkData}` : ''}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmId)
      .setLabel('CONFIRM & LINK ALL')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`verify_deny`)
      .setLabel('ABORT')
      .setStyle(ButtonStyle.Danger),
  );

  await interaction.editReply({
    embeds: [embed],
    components: [row],
    files: [attachment],
  });
}

/**
 * DEPLOYMENT LOGIC (Improved)
 */
async function getDeploymentCount(profileId) {
  let attendance = await ucApi.getAttendanceForProfile(profileId);
  let statuses = await ucApi.getAttendanceStatuses();

  if (attendance?.data) attendance = attendance.data;
  if (statuses?.data) statuses = statuses.data;
  if (!Array.isArray(attendance) || !Array.isArray(statuses)) return 0;

  const attendedStatus = statuses.find(
    (s) =>
      s.name.toLowerCase() === 'attending' ||
      s.name.toLowerCase() === 'attended',
  );
  if (!attendedStatus) return 0;

  const now = new Date();
  return attendance.filter((r) => {
    const sid =
      r.attendanceId || r.attendance_status_id || r.status_id || r.status?.id;
    if (sid !== attendedStatus.id) return false;
    const dStr = r.event?.date || r.date;
    return dStr ? new Date(dStr) <= now : true;
  }).length;
}

/**
 * BUTTON HANDLER
 */
async function handleButton(interaction) {
  const parts = interaction.customId.split(':');
  const action = parts[0];
  const id = parts[1]; // Dossier ID or UC Profile ID
  const value = parts[2]; // Tab or SteamID

  if (action === 'tab') {
    const state = activeDossiers.get(id);
    if (!state || interaction.user.id !== id.split('_')[1]) {
      return interaction.reply({
        content: 'SESSION EXPIRED OR UNAUTHORIZED.',
        flags: [MessageFlags.Ephemeral],
      });
    }
    state.tab = value;
    const { embed, components, files } = await renderDossierTab(id);
    await interaction.update({ embeds: [embed], components, files });
  }

  if (action === 'verify_confirm') {
    const ucProfileId = id;
    const steamId = value; // Might be undefined

    ucApi.saveLink(interaction.user.id, ucProfileId);
    let msg = '✅ **UNIT COMMANDER LINK ESTABLISHED.**';

    if (steamId) {
      ucApi.saveSteamLink(interaction.user.id, steamId);
      msg += `\n✅ **STEAM LINK ESTABLISHED** (ID: \`${steamId}\`)`;
    }

    return interaction.update({
      content: `${msg}\n\nWelcome to the network.`,
      embeds: [],
      components: [],
      files: [],
    });
  }

  if (action === 'verify_deny') {
    return interaction.update({
      content: '❌ **IDENTIFICATION ABORTED.**',
      embeds: [],
      components: [],
      files: [],
    });
  }
}

async function handleAward(interaction) {
  await interaction.deferReply();
  const target = interaction.options.getMember('member');
  const medalKey = interaction.options.getString('medal');
  const citation = interaction.options.getString('citation');

  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.editReply({
      content: 'ACCESS DENIED.',
      flags: [MessageFlags.Ephemeral],
    });
  }

  const profile = await ucApi.getProfileByDiscordMember(target);
  if (!profile)
    return interaction.editReply({
      content: 'PROFILE NOT FOUND.',
      flags: [MessageFlags.Ephemeral],
    });

  const officialAwards = await ucApi.getAwards();
  const matchingAward = officialAwards.find((a) =>
    a.name.toLowerCase().includes(medalKey.toLowerCase()),
  );

  if (matchingAward) {
    await ucApi.assignAward(profile.id, matchingAward.id, citation);
  }

  const awardEmbed = new EmbedBuilder()
    .setColor(COLORS.INTEL_GREEN)
    .setTitle('DIRECTORATE ORDER // COMMENDATION [TEST MODE]')
    .setDescription(
      `The following member has been cited for exceptional merit (SIMULATED):`,
    )
    .addFields(
      { name: 'MEMBER', value: `${target}`, inline: true },
      {
        name: 'AWARD',
        value: `**${matchingAward?.name || medalKey}**`,
        inline: true,
      },
      { name: 'CITATION', value: citation },
    )
    .setFooter({ text: 'TRANSMISSION AUTHENTICATED // DRY_RUN ACTIVE' })
    .setTimestamp();

  await interaction.editReply({ embeds: [awardEmbed] });
}

async function handlePromotion(interaction) {
  await interaction.deferReply();
  const target = interaction.options.getMember('member');
  const newRankAbbrev = interaction.options.getString('rank');

  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.editReply({
      content: 'ACCESS DENIED.',
      flags: [MessageFlags.Ephemeral],
    });
  }

  const profile = await ucApi.getProfileByDiscordMember(target);
  if (!profile)
    return interaction.editReply({
      content: 'MEMBER PROFILE NOT FOUND.',
      flags: [MessageFlags.Ephemeral],
    });

  const officialRanks = await ucApi.getRanks();
  const matchingRank = officialRanks.find(
    (r) =>
      r.abbreviation.toLowerCase() === newRankAbbrev.toLowerCase() ||
      r.name.toLowerCase().includes(newRankAbbrev.toLowerCase()),
  );

  if (matchingRank) {
    await ucApi.updateRank(profile.id, matchingRank.id);
  }

  const promoEmbed = new EmbedBuilder()
    .setColor(COLORS.ARMY_RED)
    .setTitle('ADMINISTRATIVE ORDER // PROMOTION [TEST MODE]')
    .setDescription(
      `The UKSF Directorate has authorised the following change in rank (SIMULATED):`,
    )
    .addFields(
      { name: 'MEMBER', value: `${target}`, inline: true },
      {
        name: 'NEW RANK',
        value: `**${matchingRank?.name || newRankAbbrev}**`,
        inline: true,
      },
    )
    .setFooter({ text: 'TRANSMISSION AUTHENTICATED // DRY_RUN ACTIVE' })
    .setTimestamp();

  await interaction.editReply({ embeds: [promoEmbed] });
}

async function handleLink(interaction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const target = interaction.options.getMember('member');
  const ucId = interaction.options.getString('uc_id');

  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.editReply({ content: 'ACCESS DENIED.' });
  }

  const profile = await ucApi.getProfile(ucId);
  if (!profile)
    return interaction.editReply({ content: 'UC PROFILE NOT FOUND.' });

  ucApi.saveLink(target.id, ucId);
  await interaction.editReply({
    content: `DATA LINK ESTABLISHED FOR **${target.displayName}**.`,
  });
}

async function handleUnlink(interaction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const target = interaction.options.getMember('member') || interaction.member;

  if (
    target.id !== interaction.user.id &&
    !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
  ) {
    return interaction.editReply({ content: 'ACCESS DENIED.' });
  }

  const success = ucApi.removeLink(target.id);
  await interaction.editReply({
    content: success
      ? `DATA LINK REMOVED FOR **${target.displayName}**.`
      : 'NO LINK FOUND.',
  });
}

async function handleAttendance(interaction) {
  await interaction.deferReply();
  const opId = interaction.options.getString('op_id');
  const action = interaction.options.getString('action');
  const op = operations.get(opId);

  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageEvents)) {
    return interaction.editReply({
      content: 'ACCESS DENIED.',
      flags: [MessageFlags.Ephemeral],
    });
  }

  if (!op)
    return interaction.editReply({
      content: 'OP NOT FOUND.',
      flags: [MessageFlags.Ephemeral],
    });

  if (action === 'log') {
    const list = op.signedOn.map((u) => `• ${u.name}`).join('\n') || 'None.';
    const embed = new EmbedBuilder()
      .setTitle('OP ATTENDANCE')
      .setDescription(list)
      .setColor(COLORS.INTEL_GREEN);
    await interaction.editReply({ embeds: [embed] });
  } else if (action === 'export') {
    // Basic Hugo export
    const reportPath = path.join(
      __dirname,
      '..',
      'content',
      'rsis',
      'reports',
      `${op.name.toLowerCase().replace(/\s+/g, '-')}.md`,
    );
    const fm = `---
title: "AAR: ${op.name}"
date: ${new Date().toISOString().split('T')[0]}
attendance:
${op.signedOn.map((u) => `  - "${u.name}"`).join('\n')}
---
`;
    fs.writeFileSync(reportPath, `${fm}## AAR // ${op.name}`);
    await interaction.editReply({ content: 'MISSION ARCHIVED.' });
  }
}

async function handleOp(interaction) {
  if (interaction.options.getSubcommand() === 'create') {
    await interaction.deferReply();
    let name = interaction.options.getString('name');
    let date = interaction.options.getString('date');
    let type = interaction.options.getString('type') || 'Deployment';
    const ucEventId = interaction.options.getString('uc_event');

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageEvents)) {
      return interaction.editReply({
        content: 'ACCESS DENIED.',
        flags: [MessageFlags.Ephemeral],
      });
    }

    if (ucEventId) {
      const events = await ucApi.getEvents();
      const event = events.find((e) => e.id.toString() === ucEventId);
      if (event) {
        name = event.name;
        date = `${event.date} ${event.time}`;
        type = 'Official UC Event';
      }
    }

    if (!name || !date)
      return interaction.editReply({
        content: 'NAME/DATE REQUIRED.',
        flags: [MessageFlags.Ephemeral],
      });

    const opId = `op-${Date.now()}`;
    operations.set(opId, {
      name,
      date,
      type,
      signedOn: [],
      away: [],
      late: [],
    });

    const embed = new EmbedBuilder()
      .setColor(COLORS.INTEL_GREEN)
      .setTitle(`OPERATION ORDER // ${name.toUpperCase()}`)
      .setDescription(`**TYPE:** ${type}\n**DATE/TIME:** ${date} Z`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`accept:${opId}`)
        .setLabel('SIGNED ON')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`decline:${opId}`)
        .setLabel('AWAY')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`late:${opId}`)
        .setLabel('LATE')
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  }
}

async function handleAutocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  let choices = [];

  if (focused.name === 'uc_event') {
    const events = await ucApi.getEvents();
    choices = events.map((e) => ({
      name: `${e.name} (${e.date})`,
      value: e.id.toString(),
    }));
  } else if (focused.name === 'medal') {
    const awards = await ucApi.getAwards();
    choices = awards.map((a) => ({ name: a.name, value: a.name }));
  } else if (focused.name === 'rank') {
    const ranks = await ucApi.getRanks();
    choices = ranks.map((r) => ({
      name: `${r.name} (${r.abbreviation})`,
      value: r.abbreviation,
    }));
  }

  const filtered = choices
    .filter((c) => c.name.toLowerCase().includes(focused.value.toLowerCase()))
    .slice(0, 25);
  await interaction.respond(filtered);
}

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];
  files.forEach((file) => {
    if (fs.statSync(`${dirPath}/${file}`).isDirectory()) {
      arrayOfFiles = getAllFiles(`${dirPath}/${file}`, arrayOfFiles);
    } else {
      arrayOfFiles.push(path.join(dirPath, '/', file));
    }
  });
  return arrayOfFiles;
}

/**
 * UTILITY: Clean names of ranks, callsigns, and medals
 */
function cleanName(name) {
  if (!name) return '';
  return name.toLowerCase()
    // Remove callsigns like [A1-1] or [ALPHA]
    .replace(/^\[.*?\]\s+/, '')
    // Remove common rank prefixes (UKSF style)
    .replace(
      /^(gen|maj gen|brig|col|lt col|maj|capt|lt|2lt|wo1|wo2|ssgt|csgt|sgt|cpl|lcpl|tpr|sig|rct|pte|am|as1|as2|po|cpo|cmdr|sqn ldr|flt lt|fg off|plt off|wg cdr)\.?\s+/i,
      '',
    )
    // Remove bracketed medals/qualifications at end
    .replace(/\s+\[.*?\]$/, '')
    .trim();
}

client.login(process.env.DISCORD_TOKEN);
