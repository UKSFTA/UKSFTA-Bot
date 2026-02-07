const CryptoJS = require('crypto-js');

/**
 * UTILITY: Clean names of ranks, callsigns, and medals
 */
function cleanName(name) {
  if (!name) return '';
  return name.toLowerCase()
    // Remove callsigns like [A1-1] or [ALPHA]
    .replace(/^\[.*?\]\s+/, '')
    // Remove common rank prefixes (UKSF style)
    .replace(
      /^(gen|maj gen|brig|col|lt col|maj|capt|lt|2lt|wo1|wo2|ssgt|csgt|sgt|cpl|lcpl|tpr|sig|rct|pte|am|as1|as2|po|cpo|cmdr|sqn ldr|flt lt|fg off|plt off|wg cdr)\.?\s+/i,
      '',
    )
    // Remove bracketed medals/qualifications at end
    .replace(/\s+\[.*?\]$/, '')
    .trim();
}

/**
 * UTILITY: Calculate BattlEye GUID from SteamID64
 */
function calculateBeGuid(steamId64) {
  if (!steamId64) return null;
  const hash = CryptoJS.MD5("BE" + steamId64).toString();
  return hash;
}

module.exports = {
  cleanName,
  calculateBeGuid
};
