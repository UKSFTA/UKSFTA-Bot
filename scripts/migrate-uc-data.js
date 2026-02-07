const ucApi = require('../src/modules/uc_api');
require('dotenv').config();

async function migrate() {
  console.log('--- STARTING FULL UC DATA MIGRATION ---');

  // 1. RANKS
  console.log('[MIGRATE] Syncing Ranks...');
  const ranks = await ucApi.getRanks();
  if (ranks.length > 0) {
    const mappedRanks = ranks.map(r => ({
      id: r.id.toString(),
      name: r.name,
      abbreviation: r.abbreviation,
      rank_order: r.order || 99
    }));
    await ucApi.supabase.from('ranks').upsert(mappedRanks);
  }

  // 2. AWARDS
  console.log('[MIGRATE] Syncing Awards...');
  const awards = await ucApi.getAwards();
  if (awards.length > 0) {
    const mappedAwards = awards.map(a => ({
      id: a.id.toString(),
      name: a.name,
      image_url: a.image_url,
      description: a.description
    }));
    await ucApi.supabase.from('awards').upsert(mappedAwards);
  }

  // 3. UNITS
  console.log('[MIGRATE] Syncing Units...');
  const units = await ucApi.getUnits();
  if (units.length > 0) {
    const mappedUnits = units.map(u => ({
      id: u.id.toString(),
      name: u.name,
      parent_id: u.parent_id?.toString(),
      description: u.description
    }));
    await ucApi.supabase.from('units').upsert(mappedUnits);
  }

  // 4. EVENTS
  console.log('[MIGRATE] Syncing Events...');
  const events = await ucApi.getEvents();
  if (events.length > 0) {
    const mappedEvents = events.map(e => ({
      id: e.id.toString(),
      name: e.name,
      type: e.type,
      date: e.date,
      time: e.time,
      status: e.status
    }));
    await ucApi.supabase.from('events').upsert(mappedEvents);
  }

  // 5. DEEP PERSONNEL SYNC (Awards & Attendance)
  console.log('[MIGRATE] Starting Deep Personnel Sync...');
  const profiles = await ucApi.getProfiles();
  const personnelLinks = await ucApi.getLinks(); // discord_id -> uc_profile_id

  for (const profile of profiles) {
    // Find the discord_id for this UC profile
    const discordId = Object.keys(personnelLinks).find(did => personnelLinks[did] === profile.id.toString());
    if (!discordId) continue;

    console.log(`[MIGRATE] Processing history for: ${profile.alias}`);

    // SYNC AWARDS
    if (profile.awards && profile.awards.length > 0) {
      const pAwards = profile.awards.map(pa => ({
        discord_id: discordId,
        award_id: pa.id.toString(),
        citation: pa.pivot?.citation || '',
        awarded_at: pa.pivot?.created_at?.split('T')[0]
      }));
      await ucApi.supabase.from('personnel_awards').upsert(pAwards);
    }

    // SYNC ATTENDANCE
    const attendance = await ucApi.getAttendanceForProfile(profile.id);
    if (attendance && attendance.length > 0) {
      const pAttendance = attendance.map(att => ({
        event_id: att.event_id?.toString() || att.campaign_event_id?.toString(),
        discord_id: discordId,
        status_id: att.attendance_status_id?.toString(),
        updated_at: att.updated_at
      })).filter(a => a.event_id); // Filter out records without valid event IDs
      
      if (pAttendance.length > 0) {
        await ucApi.supabase.from('attendance').upsert(pAttendance);
      }
    }
  }

  console.log('--- MIGRATION COMPLETE ---');
  process.exit(0);
}

migrate();
