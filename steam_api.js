const axios = require('axios');
require('dotenv').config();

/**
 * SteamAPI Client
 * Handles enrichment of player data using the Steam Web API.
 */
class SteamAPI {
  constructor() {
    this.apiKey = process.env.STEAM_API_KEY;
    this.baseUrl = 'https://api.steampowered.com';
    this.client = axios.create({
      baseURL: this.baseUrl,
      params: {
        key: this.apiKey,
      },
    });
  }

  /**
   * Fetches detailed profile information for a list of SteamIDs.
   * @param {string[]} steamIds - Array of 64-bit SteamIDs.
   * @returns {Promise<Object[]>} - Array of player profile objects.
   */
  async getPlayerSummaries(steamIds) {
    if (!this.apiKey) {
      console.warn('[SteamAPI] API Key missing. Skipping enrichment.');
      return [];
    }

    if (!steamIds || steamIds.length === 0) return [];

    try {
      const response = await this.client.get('/ISteamUser/GetPlayerSummaries/v0002/', {
        params: {
          steamids: steamIds.join(','),
        },
      });

      return response.data.response.players || [];
    } catch (error) {
      console.error('[SteamAPI] Error fetching player summaries:', error.message);
      return [];
    }
  }

  /**
   * Fetches server information from the IGameServersService.
   * @param {string} ip - Server IP address.
   * @returns {Promise<Object|null>} - Server object or null.
   */
  async getServerInfo(ip) {
    if (!this.apiKey) return null;

    try {
      const response = await this.client.get('/IGameServersService/GetServerList/v1/', {
        params: {
          filter: `addr\${ip}`,
        },
      });

      const servers = response.data.response.servers;
      return servers && servers.length > 0 ? servers[0] : null;
    } catch (error) {
      console.error('[SteamAPI] Error fetching server info:', error.message);
      return null;
    }
  }
}

module.exports = new SteamAPI();
