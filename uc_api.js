const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const UC_COMMUNITY_ID = process.env.UNIT_COMMANDER_COMMUNITY_ID;
const UC_BOT_TOKEN = process.env.UNIT_COMMANDER_BOT_TOKEN;
const UC_BASE_URL = `https://api.unitcommander.co.uk/community/${UC_COMMUNITY_ID}`;

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use Service Role for backend writes
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Safety flag for testing
const DRY_RUN = false;

/**
 * Encapsulates Unit Commander and Supabase Data Logic
 */
class UnitCommanderAPI {
  constructor() {
    this.client = axios.create({
      baseURL: UC_BASE_URL,
      headers: {
        Authorization: `Bot ${UC_BOT_TOKEN}`,
        Accept: 'application/json',
      },
    });
  }

  /**
   * Identity Management via Supabase
   */
  async saveLink(discordId, ucProfileId) {
    console.log(`[SUPABASE] Linking Discord:${discordId} to UC:${ucProfileId}`);
    const { error } = await supabase
      .from('personnel_links')
      .upsert({ discord_id: discordId, uc_profile_id: ucProfileId }, { onConflict: 'discord_id' });
    
    if (error) console.error('[SUPABASE] saveLink Error:', error.message);
  }

  async saveSteamLink(discordId, steamId) {
    console.log(`[SUPABASE] Linking Discord:${discordId} to Steam:${steamId}`);
    const { error } = await supabase
      .from('personnel_links')
      .upsert({ discord_id: discordId, steam_id: steamId }, { onConflict: 'discord_id' });
    
    if (error) console.error('[SUPABASE] saveSteamLink Error:', error.message);
  }

  async getLinks() {
    const { data, error } = await supabase.from('personnel_links').select('*');
    if (error) {
      console.error('[SUPABASE] getLinks Error:', error.message);
      return [];
    }
    // Convert to old format for compatibility if needed, 
    // but better to use the array directly.
    const mapping = {};
    data.forEach(row => {
      if (row.uc_profile_id) mapping[row.discord_id] = row.uc_profile_id;
    });
    return mapping;
  }

  async getSteamLinks() {
    const { data, error } = await supabase.from('personnel_links').select('discord_id, steam_id');
    if (error) {
      console.error('[SUPABASE] getSteamLinks Error:', error.message);
      return {};
    }
    const mapping = {};
    data.forEach(row => {
      if (row.steam_id) mapping[row.discord_id] = row.steam_id;
    });
    return mapping;
  }

  async removeLink(discordId) {
    const { error } = await supabase.from('personnel_links').delete().eq('discord_id', discordId);
    return !error;
  }

  /**
   * Unit Commander API Methods
   */
  async submitAttendance(eventId, profileId, statusId) {
    if (DRY_RUN) {
      console.log(`[DRY-RUN] Attendance: Event:${eventId}, Profile:${profileId}`);
      return true;
    }
    try {
      await this.client.post(`/attendance/event/${eventId}`, {
        profile_id: profileId,
        attendance_status_id: statusId,
      });
      return true;
    } catch (error) {
      console.error('UC API Error (submitAttendance):', error.message);
      return false;
    }
  }

  async getProfile(profileId) {
    try {
      const response = await this.client.get(`/profiles/${profileId}`);
      return response.data;
    } catch (error) {
      return null;
    }
  }

  async getProfiles() {
    try {
      const response = await this.client.get('/profiles');
      return response.data;
    } catch (error) {
      return [];
    }
  }

  async getProfileByDiscordMember(member) {
    if (!member) return null;
    
    const { data: link } = await supabase
      .from('personnel_links')
      .select('uc_profile_id')
      .eq('discord_id', member.id)
      .single();

    if (link?.uc_profile_id) {
      const profile = await this.getProfile(link.uc_profile_id);
      if (profile) {
        const status = profile.status?.toUpperCase();
        if (status === 'ACTIVE' || !status) return profile;
      }
    }

    // Advanced tactical name matching
    const profiles = await this.getProfiles();
    const discordName = member.displayName.toLowerCase();
    
    // Strict filter: Must be ACTIVE.
    const activeProfiles = profiles.filter((p) => {
      const status = p.status?.toUpperCase();
      return !status || status === 'ACTIVE';
    });

    return activeProfiles.find((p) => {
      const alias = p.alias.toLowerCase();

      // 1. Exact match
      if (alias === discordName) return true;

      // 2. Clean the UC alias
      const cleanedAlias = alias
        .replace(
          /^(gen|maj gen|brig|col|lt col|maj|capt|lt|2lt|wo1|wo2|ssgt|csgt|sgt|cpl|lcpl|tpr|sig|rct|pte|am|as1|as2|po|cpo|cmdr|sqn ldr|flt lt|fg off|plt off|wg cdr)\.?\s+/i,
          '',
        )
        .replace(/\s+\[.*?\]$/, '')
        .trim();

      // 3. Clean the Discord name
      const cleanedDiscord = discordName.replace(/^\[.*?\]\s+/, '').trim();

      return (
        cleanedAlias === cleanedDiscord ||
        alias.includes(cleanedDiscord) ||
        discordName.includes(cleanedAlias)
      );
    });
  }

  async getRanks() {
    try {
      const response = await this.client.get('/ranks');
      return response.data;
    } catch (error) {
      return [];
    }
  }

  async getEvents() {
    try {
      const response = await this.client.get('/events');
      return response.data.filter(e => e.status === 'ACTIVE');
    } catch (error) {
      return [];
    }
  }

  async getAttendanceStatuses() {
    try {
      const response = await this.client.get('/attendance-status');
      return response.data;
    } catch (error) {
      return [];
    }
  }

  async getAttendanceForProfile(profileId) {
    try {
      const response = await this.client.get(`/attendance/profile/${profileId}`);
      return response.data;
    } catch (error) {
      return [];
    }
  }
}

module.exports = new UnitCommanderAPI();
