const { createCanvas, loadImage } = require('canvas');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

const width = 600;
const height = 350;
const chartWidth = 500;
const chartHeight = 250;

/**
 * Helper to draw image with 'cover' aspect ratio
 */
function drawImageCover(ctx, img, x, y, w, h) {
  const offsetX = 0.5;
  const offsetY = 0.5;
  let iw = img.width,
    ih = img.height,
    r = Math.min(w / iw, h / ih),
    nw = iw * r, // new prop. width
    nh = ih * r, // new prop. height
    cx,
    cy,
    cw,
    ch,
    ar = 1;

  // decide which gap to fill
  if (nw < w) ar = w / nw;
  if (Math.abs(ar - 1) < 1e-14 && nh < h) ar = h / nh; // fix precision issues
  nw *= ar;
  nh *= ar;

  // calc source rectangle
  cw = iw / (nw / w);
  ch = ih / (nh / h);

  cx = (iw - cw) * offsetX;
  cy = (ih - ch) * offsetY;

  // make sure source rectangle is valid
  if (cx < 0) cx = 0;
  if (cy < 0) cy = 0;
  if (cw > iw) cw = iw;
  if (ch > ih) ch = ih;

  ctx.drawImage(img, cx, cy, cw, ch, x, y, w, h);
}

/**
 * Renders a professional, realistic Military ID Card
 */
async function renderIDCard(profile, rank, deployments) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 1. Background Base
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, width, height);

  // 2. Subtle Texture (Noise)
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const alpha = Math.random() * 0.05;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillRect(x, y, 1, 1);
  }

  // 3. Header Styling
  ctx.fillStyle = '#532a45'; // MOD Purple
  ctx.fillRect(0, 0, width, 5);
  ctx.fillRect(0, 55, width, 2);

  // 4. Logo / Crest
  try {
    const crest = await loadImage('https://raw.githubusercontent.com/co-analysis/govukhugo/master/static/images/govuk-crest.png');
    ctx.globalAlpha = 0.8;
    ctx.drawImage(crest, 20, 10, 35, 35);
    ctx.globalAlpha = 1.0;
  } catch (_e) {}

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('UNITED KINGDOM SPECIAL FORCES', 65, 35);

  // 5. Photo Box
  ctx.fillStyle = '#000';
  ctx.fillRect(30, 85, 170, 210);
  
  // Security Hologram Overlay behind photo
  ctx.strokeStyle = 'rgba(0, 206, 125, 0.2)';
  ctx.lineWidth = 1;
  for(let i=0; i<170; i+=10) {
    ctx.beginPath();
    ctx.moveTo(30+i, 85);
    ctx.lineTo(30+i, 295);
    ctx.stroke();
  }

  try {
    const avatarUrl = profile.avatar_url || 'https://raw.githubusercontent.com/co-analysis/govukhugo/master/static/images/govuk-crest.png';
    const avatar = await loadImage(avatarUrl);
    drawImageCover(ctx, avatar, 30, 85, 170, 210);
  } catch (_e) {
    ctx.fillStyle = '#333';
    ctx.font = '12px monospace';
    ctx.fillText('IMAGE_NOT_AVAILABLE', 50, 190);
  }
  
  // Photo Border
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 85, 170, 210);

  // 6. Member Data
  ctx.fillStyle = '#00ce7d'; // Intel Green
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText(profile.alias.toUpperCase(), 220, 115);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(rank.toUpperCase(), 220, 140);

  ctx.font = '13px monospace';
  ctx.fillStyle = '#aaa';
  const dataY = 180;
  const lineSpacing = 22;
  
  ctx.fillText('SERVICE NO:', 220, dataY);
  ctx.fillStyle = '#fff';
  ctx.fillText(`UKSF-${profile.id.toString().padStart(6, '0')}`, 320, dataY);

  ctx.fillStyle = '#aaa';
  ctx.fillText('ASSIGNMENT:', 220, dataY + lineSpacing);
  ctx.fillStyle = '#fff';
  ctx.fillText(profile.unit?.name || 'DSF_DIRECTORATE', 320, dataY + lineSpacing);

  ctx.fillStyle = '#aaa';
  ctx.fillText('STATUS:', 220, dataY + lineSpacing * 2);
  ctx.fillStyle = '#00ce7d';
  ctx.fillText('ACTIVE_DUTY', 320, dataY + lineSpacing * 2);

  ctx.fillStyle = '#aaa';
  ctx.fillText('OPS_COUNT:', 220, dataY + lineSpacing * 3);
  ctx.fillStyle = '#fff';
  ctx.fillText(deployments.toString().padStart(3, '0'), 320, dataY + lineSpacing * 3);

  // 7. Security Features
  // Microchip
  ctx.fillStyle = '#c5a059'; // Gold
  ctx.fillRect(520, 80, 50, 40);
  ctx.strokeStyle = '#8a6d3b';
  ctx.lineWidth = 1;
  ctx.strokeRect(520, 80, 50, 40);
  for(let i=0; i<4; i++) {
    ctx.beginPath();
    ctx.moveTo(520, 80 + i*10);
    ctx.lineTo(570, 80 + i*10);
    ctx.stroke();
  }

  // Barcode
  ctx.fillStyle = '#fff';
  for(let i=0; i<150; i+= Math.random() * 5 + 1) {
    const w = Math.random() * 3 + 1;
    ctx.fillRect(220 + i, 280, w, 30);
  }

  // 8. Signature
  ctx.font = 'italic 14px serif';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('C. P. Marshall', 450, 260); // Generic signatory
  ctx.font = '10px monospace';
  ctx.fillText('AUTHORISING OFFICER', 450, 275);

  // 9. Footer Security String
  ctx.fillStyle = '#444';
  ctx.font = '9px monospace';
  const hash = Buffer.from(profile.id.toString()).toString('hex').toUpperCase().substring(0, 24);
  ctx.fillText(`ID_VERIFICATION_TOKEN: ${hash}`, 30, height - 15);

  return canvas.toBuffer('image/png');
}

/**
 * Renders a clean operational activity chart
 */
async function renderActivityChart(attendance) {
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ 
    width: chartWidth, 
    height: chartHeight, 
    backgroundColour: '#1a1a1a' 
  });
  
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const last6Months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    last6Months.push({ 
      month: months[d.getMonth()], 
      count: 0, 
      key: `${d.getFullYear()}-${d.getMonth()}` 
    });
  }

  attendance.forEach(record => {
    const d = new Date(record.event?.date || record.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const entry = last6Months.find(m => m.key === key);
    if (entry) entry.count++;
  });

  const configuration = {
    type: 'line',
    data: {
      labels: last6Months.map(m => m.month),
      datasets: [{
        label: 'OPERATIONAL TEMPO',
        data: last6Months.map(m => m.count),
        fill: true,
        backgroundColor: 'rgba(0, 206, 125, 0.1)',
        borderColor: '#00ce7d',
        borderWidth: 2,
        pointBackgroundColor: '#00ce7d',
        tension: 0.3
      }]
    },
    options: {
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { 
          grid: { color: '#333' }, 
          ticks: { color: '#888', font: { family: 'monospace' } },
          beginAtZero: true
        },
        x: { 
          grid: { display: false }, 
          ticks: { color: '#888', font: { family: 'monospace' } } 
        }
      }
    }
  };

  return chartJSNodeCanvas.renderToBuffer(configuration);
}

module.exports = { renderIDCard, renderActivityChart };