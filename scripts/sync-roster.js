const { Client, GatewayIntentBits } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  try {
    await client.login(TOKEN);
    const guild = await client.guilds.fetch(GUILD_ID);
    const members = await guild.members.fetch();

    console.log(
      `[SYNC] Successfully fetched ${members.size} members from Discord.`,
    );

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
        if (orderIndex !== -1 && orderIndex < rankPriority) {
          rank = RANK_MAP[roleName];
          rankPriority = orderIndex;
        }
      }

      const callsignMatch = member.displayName.match(/\[(.*?)\]/);
      const callsign = callsignMatch ? callsignMatch[1] : 'N/A';

      personnel.push({
        discord_id: member.id,
        username: member.user.username,
        display_name: member.displayName,
        rank: rank,
        rank_priority: rankPriority,
        callsign: callsign,
        joined_at: member.joinedAt
          ? member.joinedAt.toISOString().split('T')[0]
          : null,
        updated_at: new Date().toISOString(),
      });
    });

    console.log(
      `[SUPABASE] Upserting ${personnel.length} records to personnel...`,
    );

    // We do this in batches to avoid payload limits if the unit is large
    const batchSize = 100;
    for (let i = 0; i < personnel.length; i += batchSize) {
      const batch = personnel.slice(i, i + batchSize);
      const { error } = await supabase
        .from('personnel')
        .upsert(batch, { onConflict: 'discord_id' });

      if (error) {
        console.error(`[SUPABASE] Batch error: ${error.message}`);
      }
    }

    console.log('[SYNC] Roster sync to Supabase complete.');
  } catch (error) {
    console.error('[SYNC] Critical Failure:', error.message);
  } finally {
    client.destroy();
  }
}

syncRoster();
