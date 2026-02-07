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
    
    const config = {
      ip: this.host,
      port: this.port,
      rconPassword: this.password
    };

    this.bNode = new BattleNode(config);
    this.isConnected = false;
  }

  /**
   * Executes a command via bercon-cli (Best for structured output like players/bans)
   */
  async execute(command, format = 'raw') {
    if (!this.password) return 'ERROR: NO PASSWORD';
    const cmd = `bercon-cli --ip=${this.host} --port=${this.port} --password='${this.password}' --format=${format} "${command}"`;
    try {
      const { stdout, stderr } = await execPromise(cmd, { timeout: 5000 });
      return stdout.trim() || stderr.trim() || 'OK';
    } catch (error) {
      if (error.killed) return 'ERROR: Command timed out after 5s';
      return `ERROR: ${error.message}`;
    }
  }

  /**
   * Executes a command and waits for a specific pattern in the RCON stream.
   * Perfect for #perf which is asynchronous.
   */
  async executeAndCapture(command, pattern, timeout = 5000) {
    if (!this.isConnected) return await this.execute(command);

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.bNode.removeListener('message', listener);
        resolve('TIMEOUT: No response from server.');
      }, timeout);

      const listener = (msg) => {
        if (msg.match(pattern)) {
          clearTimeout(timer);
          this.bNode.removeListener('message', listener);
          resolve(msg);
        }
      };

      this.bNode.on('message', listener);
      this.bNode.sendCommand(command);
    });
  }

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
    } catch (e) { return []; }
  }

  createListener(callback) {
    if (this.isConnected) return;
    console.log(`[RCON] Initializing persistent stream on ${this.host}:${this.port}...`);
    this.bNode.removeAllListeners('message');
    this.bNode.removeAllListeners('disconnected');
    this.bNode.removeAllListeners('login');
    this.bNode.login();
    this.bNode.on('login', (err, success) => {
      if (err || !success) {
        this.isConnected = false;
        setTimeout(() => this.createListener(callback), 10000);
        return;
      }
      this.isConnected = true;
      console.log('[RCON] Persistent stream established.');
    });
    this.bNode.on('message', (message) => { callback(message); });
    this.bNode.on('disconnected', () => {
      this.isConnected = false;
      setTimeout(() => this.createListener(callback), 5000);
    });
  }
}

module.exports = new RconManager();
