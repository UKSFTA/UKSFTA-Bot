const crypto = require('node:crypto');

function test(sid) {
    console.log(`Testing Formulas for SteamID: ${sid}`);
    
    // 1. MD5 of string
    console.log('MD5(sid):', crypto.createHash('md5').update(sid).digest('hex'));
    
    // 2. MD5 of "BE" + string
    console.log('MD5("BE"+sid):', crypto.createHash('md5').update(`BE${sid}`).digest('hex'));
    
    // 3. Binary (Little Endian)
    try {
        const bufLE = Buffer.alloc(8);
        bufLE.writeBigUInt64LE(BigInt(sid));
        console.log('MD5(Binary LE):', crypto.createHash('md5').update(bufLE).digest('hex'));
    } catch(_e) { console.log('LE Failed'); }
    
    // 4. Binary (Big Endian)
    try {
        const bufBE = Buffer.alloc(8);
        bufBE.writeBigUInt64BE(BigInt(sid));
        console.log('MD5(Binary BE):', crypto.createHash('md5').update(bufBE).digest('hex'));
    } catch(_e) { console.log('BE Failed'); }

    console.log('Target: 42b58e8817ac13c349ec5ad287e91a35');
}

test('76561198173473125');
