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
    this.supabase = supabase;
    this.client = axios.create({
      baseURL: UC_BASE_URL,
      headers: {
        Authorization: `Bot ${UC_BOT_TOKEN}`,
        Accept: 'application/json',
      },
    });
  }

  /**
   * Identity Management via Unified Personnel Table
   */
  async saveLink(discordId, ucProfileId) {
    console.log(`[SUPABASE] Linking Discord:${discordId} to UC:${ucProfileId}`);
    const { error } = await supabase
      .from('personnel')
      .upsert(
        {
          discord_id: discordId,
          uc_profile_id: ucProfileId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'discord_id' },
      );

    if (error) console.error('[SUPABASE] saveLink Error:', error.message);
  }

  async saveSteamLink(discordId, steamId) {
    console.log(`[SUPABASE] Linking Discord:${discordId} to Steam:${steamId}`);
    const { error } = await supabase
      .from('personnel')
      .upsert(
        {
          discord_id: discordId,
          steam_id: steamId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'discord_id' },
      );

    if (error) console.error('[SUPABASE] saveSteamLink Error:', error.message);
  }

  async saveGuid(discordId, guid) {
    console.log(`[SUPABASE] Linking Discord:${discordId} to GUID:${guid}`);
    const { error } = await supabase
      .from('personnel')
      .upsert(
        {
          discord_id: discordId,
          be_guid: guid,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'discord_id' },
      );

    if (error) console.error('[SUPABASE] saveGuid Error:', error.message);
  }

  async getLinks() {
    const { data, error } = await supabase
      .from('personnel')
      .select('discord_id, uc_profile_id');
    if (error) {
      console.error('[SUPABASE] getLinks Error:', error.message);
      return {};
    }
    const mapping = {};
    data.forEach((row) => {
      if (row.uc_profile_id) mapping[row.discord_id] = row.uc_profile_id;
    });
    return mapping;
  }

  async getSteamLinks() {
    const { data, error } = await supabase
      .from('personnel')
      .select('discord_id, steam_id');
    if (error) {
      console.error('[SUPABASE] getSteamLinks Error:', error.message);
      return {};
    }
    const mapping = {};
    data.forEach((row) => {
      if (row.steam_id) mapping[row.discord_id] = row.steam_id;
    });
    return mapping;
  }

  async getGuidLinks() {
    const { data, error } = await supabase
      .from('personnel')
      .select('discord_id, be_guid');
    if (error) {
      console.error('[SUPABASE] getGuidLinks Error:', error.message);
      return {};
    }
    const mapping = {};
    data.forEach((row) => {
      if (row.be_guid) mapping[row.discord_id] = row.be_guid;
    });
    return mapping;
  }

  async removeLink(discordId) {
    // We don't delete the record, just clear the links to preserve personnel history
    const { error } = await supabase
      .from('personnel')
      .update({ uc_profile_id: null, steam_id: null })
      .eq('discord_id', discordId);
    return !error;
  }

  /**
   * Unit Commander API Methods
   */
  async submitAttendance(eventId, profileId, statusId) {
    if (DRY_RUN) return true;
    try {
      await this.client.post(`/attendance/event/${eventId}`, {
        profile_id: profileId,
        attendance_status_id: statusId,
      });
      return true;
    } catch (_error) {
      return false;
    }
  }

  async getProfile(profileId) {
    try {
      const response = await this.client.get(`/profiles/${profileId}`);
      return response.data;
    } catch (_error) {
      return null;
    }
  }

  async getProfiles() {
    try {
      const response = await this.client.get('/profiles');
      return response.data;
    } catch (_error) {
      return [];
    }
  }

  async getProfileByDiscordMember(member) {
    if (!member) return null;

    const { data: link } = await supabase
      .from('personnel')
      .select('uc_profile_id')
      .eq('discord_id', member.id)
      .single();

    if (link?.uc_profile_id) {
      const profile = await this.getProfile(link.uc_profile_id);
      if (
        profile &&
        (profile.status?.toUpperCase() === 'ACTIVE' || !profile.status)
      )
        return profile;
    }

    const profiles = await this.getProfiles();
    const discordName = member.displayName.toLowerCase();

    // STRICT FILTER: Only match against ACTIVE personnel
    const activeProfiles = profiles.filter((p) => {
      const status = p.status?.toUpperCase();
      return !status || status === 'ACTIVE';
    });

    return activeProfiles.find((p) => {
      const alias = p.alias.toLowerCase();
      if (alias === discordName) return true;
      const cleanedAlias = alias
        .replace(
          /^(gen|maj gen|brig|col|lt col|maj|capt|lt|2lt|wo1|wo2|ssgt|csgt|sgt|cpl|lcpl|tpr|sig|rct|pte|am|as1|as2|po|cpo|cmdr|sqn ldr|flt lt|fg off|plt off|wg cdr)\.?\s+/i,
          '',
        )
        .replace(/\s+\[.*?\]$/, '')
        .trim();
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
    } catch (_error) {
      return [];
    }
  }

  async getEvents() {
    try {
      const response = await this.client.get('/events');
      return response.data.filter((e) => e.status === 'ACTIVE');
    } catch (_error) {
      return [];
    }
  }

  async getAttendanceStatuses() {
    try {
      const response = await this.client.get('/attendance-status');
      return response.data;
    } catch (_error) {
      return [];
    }
  }

  async getAwards() {
    try {
      const response = await this.client.get('/awards');
      return response.data;
    } catch (_error) {
      return [];
    }
  }

  async getUnits() {
    try {
      const response = await this.client.get('/units');
      return response.data;
    } catch (_error) {
      return [];
    }
  }

  async getCampaigns() {
    try {
      const response = await this.client.get('/campaigns');
      return response.data;
    } catch (_error) {
      return [];
    }
  }

  async getAttendanceForProfile(profileId) {
    try {
      const response = await this.client.get(
        `/attendance/profile/${profileId}`,
      );
      return response.data;
    } catch (_error) {
      return [];
    }
  }

  /**
   * DIRECT PERSONNEL MANAGEMENT (Supabase)
   */
  async updatePersonnelRank(discordId, rankName, priority) {
    const { error } = await supabase
      .from('personnel')
      .update({
        rank: rankName,
        rank_priority: priority,
        updated_at: new Date().toISOString(),
      })
      .eq('discord_id', discordId);
    return !error;
  }

  async updatePersonnelStatus(discordId, status, lastSeen = null) {
    const updateData = { status, updated_at: new Date().toISOString() };
    if (lastSeen) updateData.last_seen = lastSeen;

    const { error } = await supabase
      .from('personnel')
      .update(updateData)
      .eq('discord_id', discordId);
    return !error;
  }
}

module.exports = new UnitCommanderAPI();
