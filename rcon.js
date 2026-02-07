const { exec, spawn } = require('node:child_process');
const util = require('node:util');
const execPromise = util.promisify(exec);
require('dotenv').config();

class RconManager {
  constructor() {
    this.host = process.env.STEAM_SERVER_IP || '127.0.0.1';
    this.port = parseInt(process.env.RCON_PORT, 10) || 2302;
    this.password = process.env.RCON_PASSWORD;
    this.listenerProcess = null;
  }

  /**
   * Executes a command via bercon-cli and returns the raw output or parsed JSON.
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
   * Starts a persistent listener that monitors server console/chat.
   * Emits events when specific patterns are found.
   */
  createListener(callback) {
    if (this.listenerProcess) return;

    console.log(`[RCON] Starting persistent listener on ${this.host}:${this.port}...`);
    
    // -x -1 tells bercon-cli to stay connected and repeat (effectively tailing the logs)
    // We use "players" as a dummy command to keep the connection open, 
    // but BattlEye will stream chat/logs regardless.
    this.listenerProcess = spawn('bercon-cli', [
      `--ip=${this.host}`,
      `--port=${this.port}`,
      `--password=${this.password}`,
      '--format=raw',
      '--repeat=-1',
      '--keepalive=30',
      '' // Empty command just to listen
    ]);

    this.listenerProcess.stdout.on('data', (data) => {
      const output = data.toString();
      // BattlEye Chat Format: (Side) Name: Message
      // Example: (Global) M. Barker: !verify
      callback(output);
    });

    this.listenerProcess.on('error', (err) => {
      console.error('[RCON] Listener Process Error:', err.message);
    });

    this.listenerProcess.on('close', (code) => {
      console.log(`[RCON] Listener Process closed with code ${code}. Restarting in 10s...`);
      this.listenerProcess = null;
      setTimeout(() => this.createListener(callback), 10000);
    });
  }

  /**
   * Fetches a list of players using bercon-cli's JSON format.
   */
  async getPlayers() {
    const response = await this.execute('players', 'json');
    if (response.startsWith('ERROR')) return [];

    try {
      console.log(`[RCON] Raw JSON: ${response}`);
      const data = JSON.parse(response);
      
      // bercon-cli JSON format for players usually looks like:
      // [
      //   { "id": 0, "name": "Matt", "player_id": "765...", "ip": "...", "ping": 45, "status": "OK" },
      //   ...
      // ]
      // Note: "player_id" is often the SteamID64 or BE GUID depending on server config.
      
      if (!Array.isArray(data)) return [];

      return data.map(p => {
        const id = p.player_id || p.id_string || p.guid || '';
        return {
          id: id,
          steamId: /^\d{17}$/.test(id) ? id : null,
          guid: id.length === 32 ? id : null,
          name: p.name || 'Unknown'
        };
      });
    } catch (e) {
      console.error('[RCON] JSON Parse Error:', e.message);
      // Fallback to raw parsing if JSON fails for some reason
      return this.parseRawPlayers(response);
    }
  }

  /**
   * Fallback parser for raw 'players' output
   */
  parseRawPlayers(raw) {
    const players = [];
    const lines = raw.split('\n');
    for (const line of lines) {
      const match = line.match(/^\d+\s+[\d\.]+:?\d*\s+\d+\s+([a-f0-9]+)\(OK\)\s+(.+)$/i);
      if (match) {
        const id = match[1];
        players.push({
          id: id,
          steamId: /^\d{17}$/.test(id) ? id : null,
          guid: id.length === 32 ? id : null,
          name: match[2].trim()
        });
      }
    }
    return players;
  }
}

module.exports = new RconManager();
