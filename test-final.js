const ucApi = require('./uc_api');
const { GameDig: Gamedig } = require('gamedig');
require('dotenv').config();

function cleanName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/^\[.*?\]\s+/, '')
    .replace(/^(gen|maj gen|brig|col|lt col|maj|capt|lt|2lt|wo1|wo2|ssgt|csgt|sgt|cpl|lcpl|tpr|sig|rct|pte|am|as1|as2|po|cpo|cmdr|sqn ldr|flt lt|fg off|plt off|wg cdr)\.?\s+/i, '')
    .replace(/\s+\[.*?\]$/, '')
    .trim();
}

async function testFinalSync() {
  const playerName = 'SSgt. M. Barker';
  console.log(`Testing Sync for: ${playerName}`);

  // 1. Gamedig Lookup
  const state = await Gamedig.query({
    type: 'arma3',
    host: process.env.STEAM_SERVER_IP,
    port: parseInt(process.env.STEAM_QUERY_PORT, 10)
  }).catch(() => null);

  let steamId = null;
  if (state) {
    const pMatch = state.players.find(p => cleanName(p.name) === cleanName(playerName));
    console.log(`Gamedig Match: ${pMatch ? pMatch.name : 'NONE'}`);
    steamId = pMatch?.raw?.steamid || pMatch?.raw?.guid;
  }

  if (steamId) {
    console.log(`Detected ID: ${steamId}`);
    
    // 2. Personnel Lookup
    const { data: personnel } = await ucApi.supabase.from('personnel').select('*');
    const matched = personnel?.find(p => cleanName(p.display_name).includes(cleanName(playerName)) || cleanName(playerName).includes(cleanName(p.display_name)));

    if (matched) {
      console.log(`✅ SUCCESS: Found Database Match: ${matched.display_name} (${matched.discord_id})`);
    } else {
      console.log('❌ FAILURE: No database record found for this name.');
    }
  } else {
    console.log('❌ FAILURE: Server did not report ID.');
  }
  process.exit(0);
}

testFinalSync();
