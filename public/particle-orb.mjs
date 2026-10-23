// A rotating sphere of particles that breathes with the voice and spreads into a ring while getting ready.
const COLOURS = ['#fbffe9', '#deedb3', '#deedb3', '#b9d98f', '#ac7d32'];

export function createParticleOrb(canvas, getState, { count = 520 } = {}) {
  const ctx = canvas.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const golden = Math.PI * (3 - Math.sqrt(5));
  // Evenly spread points on a unit sphere, each with a home on the ring as well.
  const points = Array.from({ length: count }, (_, i) => {
    const y = 1 - (i / (count - 1)) * 2, r = Math.sqrt(1 - y * y), a = golden * i;
    return { x: Math.cos(a) * r, y, z: Math.sin(a) * r, ring: (i / count) * Math.PI * 2, colour: COLOURS[i % COLOURS.length], seed: Math.random() * Math.PI * 2 };
  });
  let frame = 0, spin = 0, level = 0, spread = 0, last = performance.now();

  function resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2), { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function draw(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    const { mode, level: target = 0 } = getState();
    const { width, height } = canvas.getBoundingClientRect();
    const size = Math.min(width, height) / 2;
    level += ((mode === 'speaking' ? target : 0) - level) * Math.min(dt * 14, 1);
    spread += ((mode === 'connecting' ? 1 : 0) - spread) * Math.min(dt * 4, 1);
    spin += dt * (still ? 0.08 : mode === 'speaking' ? 0.6 : mode === 'listening' ? 0.45 : 0.25);
    const t = now / 1000;
    const breath = still ? 1 : 1 + 0.03 * Math.sin(t * 1.6) + (mode === 'listening' ? 0.05 * Math.sin(t * 5) : 0);
    const radius = size * 0.62 * breath * (1 + level * 0.22);
    const cos = Math.cos(spin), sin = Math.sin(spin), tilt = 0.35;
    ctx.clearRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, size);
    glow.addColorStop(0, `rgba(222,237,179,${0.14 + level * 0.2})`); glow.addColorStop(1, 'rgba(222,237,179,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    for (const p of points) {
      // Rotate about the vertical axis, then tip the sphere towards the viewer.
      let x = p.x * cos - p.z * sin, z = p.x * sin + p.z * cos, y = p.y;
      const y2 = y * Math.cos(tilt) - z * Math.sin(tilt); z = y * Math.sin(tilt) + z * Math.cos(tilt); y = y2;
      const wobble = mode === 'listening' && !still ? 1 + 0.04 * Math.sin(t * 6 + p.seed) : 1;
      const ringAngle = p.ring + spin * 0.8;
      x = x * wobble * (1 - spread) + Math.cos(ringAngle) * 1.15 * spread;
      y = y * wobble * (1 - spread) + Math.sin(ringAngle) * 1.15 * spread;
      z = z * (1 - spread);
      const depth = (z + 1.6) / 2.6, scale = 4 / (4 - z);
      ctx.globalAlpha = 0.25 + depth * 0.75;
      ctx.fillStyle = p.colour;
      ctx.beginPath();
      ctx.arc(width / 2 + x * radius * scale, height / 2 + y * radius * scale, (0.7 + depth * 1.5) * (size / 100), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    frame = requestAnimationFrame(draw);
  }

  return {
    start() { if (frame) return; resize(); last = performance.now(); frame = requestAnimationFrame(draw); addEventListener('resize', resize); },
    stop() { cancelAnimationFrame(frame); frame = 0; removeEventListener('resize', resize); },
  };
}
