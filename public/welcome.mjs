// Today's welcome on the home page: the farm's forecast, the next four days and a joke, refreshed each NZ day.
const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  part: '<path d="M8 4v1.5M3.5 8.5H5M4.8 4.8l1 1M12.2 4.8l-1 1"/><path d="M5.3 11.3a3.5 3.5 0 1 1 6.2-2.9"/><path d="M8 20h9a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.5 1.5A3.3 3.3 0 0 0 8 20z"/>',
  cloud: '<path d="M7 19h10a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.6 1.7A3.7 3.7 0 0 0 7 19z"/>',
  fog: '<path d="M7 14h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.5"/><path d="M4 17h16M6 20.5h12"/>',
  drizzle: '<path d="M7 15h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 15z"/><path d="M9 18.5v.5M13 18.5v.5M17 18.5v.5"/>',
  rain: '<path d="M7 14h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 14z"/><path d="M8.5 17l-1 3M12.5 17l-1 3M16.5 17l-1 3"/>',
  showers: '<path d="M7 14h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 14z"/><path d="M9 17l-1 2.5M15 17l-1 2.5"/>',
  storm: '<path d="M7 14h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 14z"/><path d="M12.5 15l-2 3.5h3l-2 3.5"/>',
  snow: '<path d="M7 14h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 14z"/><path d="M9 18h.01M12 20h.01M15 18h.01"/>',
};
const icon = (name, label) => `<svg class="wx-icon" viewBox="0 0 24 24" role="img" aria-label="${label}">${ICONS[name] || ICONS.cloud}</svg>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

export async function loadWelcome() {
  try { const r = await fetch('/api/welcome', { cache: 'no-store' }); if (!r.ok) return null; const w = await r.json(); return w.days?.length ? w : null; }
  catch { return null; }
}

export function renderWelcome(root, w) {
  const [now, ...rest] = w.days;
  const extras = [now.rain >= 0.5 ? `${now.rain} mm of rain` : null, now.wind >= 28 ? `${now.windFrom} ${now.wind} km/h` : null].filter(Boolean).join(' · ');
  root.innerHTML = `
    <div class="welcome-today">
      <div class="eyebrow">Today in ${esc(w.place)}</div>
      <div class="welcome-now">${icon(now.icon, now.words)}<span class="welcome-temp">${now.max}°</span><span class="welcome-low">${now.min}°</span></div>
      <p class="welcome-words">${esc(cap(now.words))}${extras ? `<small>${esc(extras)}</small>` : ''}</p>
    </div>
    <ol class="welcome-days" aria-label="The next four days">${rest.map(d => `<li><span class="wx-day">${esc(d.weekday.slice(0, 3))}</span>${icon(d.icon, d.words)}<span class="wx-temps"><strong>${d.max}°</strong> ${d.min}°</span><span class="wx-rain">${d.rain >= 0.5 ? `${d.rain} mm` : '&nbsp;'}</span></li>`).join('')}</ol>
    <div class="welcome-joke"><div class="eyebrow">Today’s joke</div><p>${esc(w.joke)}</p><button type="button" class="welcome-play">▶ Hear today’s welcome</button></div>
    <a class="welcome-source" href="${esc(w.source.url)}" target="_blank" rel="noopener noreferrer">Forecast for the farm from ${esc(w.source.name)} ↗</a>`;
  root.hidden = false;
}

export const welcomeSpeech = (w, name) => `G’day${name ? ` ${name}` : ''}. ${w.spoken}`;
