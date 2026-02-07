const { exec } = require('node:child_process');
const util = require('node:util');
const execPromise = util.promisify(exec);
const BattleNode = require('battle-node');
require('dotenv').config();

class RconManager {
  constructor() {
    this.host = process.env.STEAM_SERVER_IP || '127.0.0.1';
    this.port = parseInt(process.env.RCON_PORT, 10) || 2302;
    this.password = process.env.RCON_PASSWORD;
    
    // Persistent Listener Client Configuration
    const config = {
      ip: this.host,
      port: this.port,
      rconPassword: this.password
    };

    this.bNode = new BattleNode(config);
    this.isConnected = false;
  }

  /**
   * Executes a command via bercon-cli (for structured JSON output)
   */
  async execute(command, format = 'raw') {
    if (!this.password) return 'ERROR: NO PASSWORD';
    const cmd = `bercon-cli --ip=${this.host} --port=${this.port} --password='${this.password}' --format=${format} "${command}"`;
    try {
      const { stdout, stderr } = await execPromise(cmd);
      return stdout.trim() || stderr.trim();
    } catch (error) {
      return `ERROR: ${error.message}`;
    }
  }

  /**
   * Fetches structured player list via bercon-cli JSON
   */
  async getPlayers() {
    const response = await this.execute('players', 'json');
    if (response.startsWith('ERROR')) return [];

    try {
      const data = JSON.parse(response);
      if (!Array.isArray(data)) return [];

      return data.map(p => {
        const id = p.player_id || p.id_string || p.guid || p.id || '';
        return {
          id: id,
          steamId: /^\d{17}$/.test(id.toString()) ? id.toString() : null,
          guid: id.toString().length === 32 ? id.toString() : null,
          name: p.name || 'Unknown'
        };
      });
    } catch (e) {
      return [];
    }
  }

  /**
   * Starts a persistent UDP listener for real-time chat and logs
   */
  createListener(callback) {
    if (this.isConnected) {
        console.log('[RCON] Listener already connected. Skipping.');
        return;
    }

    console.log(`[RCON] Initializing persistent stream on ${this.host}:${this.port}...`);

    // CLEANUP: Kill any ghost listeners to prevent double replies
    this.bNode.removeAllListeners('message');
    this.bNode.removeAllListeners('disconnected');
    this.bNode.removeAllListeners('login');

    this.bNode.login();

    this.bNode.on('login', (err, success) => {
      if (err || !success) {
        console.error('[RCON] Stream login failed. Retrying in 10s...');
        this.isConnected = false;
        setTimeout(() => this.createListener(callback), 10000);
        return;
      }
      this.isConnected = true;
      console.log('[RCON] Persistent stream established.');
    });

    // Capture all console output (including chat)
    this.bNode.on('message', (message) => {
      callback(message);
    });

    this.bNode.on('disconnected', () => {
      console.warn('[RCON] Stream disconnected. Reconnecting in 5s...');
      this.isConnected = false;
      setTimeout(() => this.createListener(callback), 5000);
    });
  }
}

module.exports = new RconManager();
