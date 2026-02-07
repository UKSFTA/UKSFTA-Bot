const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const ROSTER_PATH = path.join(__dirname, '..', 'data', 'roster.json');

// Rank mapping: Role Name -> Display Rank
const RANK_MAP = {
  General: 'Gen',
  'Major General': 'Maj Gen',
  Brigadier: 'Brig',
  Colonel: 'Col',
  'Lieutenant Colonel': 'Lt Col',
  Major: 'Maj',
  Captain: 'Capt',
  Lieutenant: 'Lt',
  '2nd Lieutenant': '2Lt',
  'Warrant Officer Class 1': 'WO1',
  'Warrant Officer Class 2': 'WO2',
  'Staff Sergeant': 'SSgt',
  Sergeant: 'Sgt',
  Corporal: 'Cpl',
  'Lance Corporal': 'LCpl',
  Trooper: 'Tpr',
  Signaller: 'Sig',
};

async function syncRoster() {
  if (!TOKEN || !GUILD_ID) {
    console.error('Error: DISCORD_TOKEN or GUILD_ID not found in .env');
    process.exit(1);
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildPresences,
    ],
  });

  try {
    await client.login(TOKEN);
    const guild = await client.guilds.fetch(GUILD_ID);
    const members = await guild.members.fetch();

    console.log(`Successfully fetched ${members.size} members from Discord.`);

    const personnel = [];

    members.forEach((member) => {
      // Skip bots
      if (member.user.bot) return;

      // Find highest rank role
      const roles = member.roles.cache.map((r) => r.name);
      let rank = 'Recruit';
      let rankPriority = 99; // Default to lowest priority

      const rankOrder = Object.keys(RANK_MAP);

      for (const roleName of roles) {
        const orderIndex = rankOrder.indexOf(roleName);
        // Lower index = Higher rank (e.g., General is 0)
        if (orderIndex !== -1 && orderIndex < rankPriority) {
          rank = RANK_MAP[roleName];
          rankPriority = orderIndex;
        }
      }

      // Extract callsign from nickname if present (e.g., "[C1-1] Matt")
      const callsignMatch = member.displayName.match(/\[(.*?)\]/);
      const callsign = callsignMatch ? callsignMatch[1] : 'N/A';

      personnel.push({
        id: member.id,
        username: member.user.username,
        displayName: member.displayName,
        rank: rank,
        rankPriority: rankPriority,
        callsign: callsign,
        joinedAt: member.joinedAt.toISOString().split('T')[0],
      });
    });

    // Sort by rank priority (Higher rank = lower priority number)
    personnel.sort((a, b) => a.rankPriority - b.rankPriority);

    // Read current roster to preserve branches metadata
    const currentRoster = JSON.parse(fs.readFileSync(ROSTER_PATH, 'utf8'));
    currentRoster.personnel = personnel;
    currentRoster.lastUpdated = new Date().toISOString();

    fs.writeFileSync(ROSTER_PATH, JSON.stringify(currentRoster, null, 2));
    console.log(`Roster synced successfully to ${ROSTER_PATH}`);
  } catch (error) {
    console.error('Sync failed:', error);
  } finally {
    client.destroy();
  }
}

syncRoster();
