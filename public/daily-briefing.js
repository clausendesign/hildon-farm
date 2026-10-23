import { readProfile } from './farm-profile.mjs';
import { voice, bindVoiceToggle } from './farm-voice.mjs';
import { mountProfile } from './profile-ui.mjs';
import { answerQuestion, briefingScript, nzDate, speciesName, isOld, upcomingEvents } from './briefing-answers.mjs';

export function initBriefing({ getBrief }) {
  const $ = selector => document.querySelector(selector);
  const log = $('#conversation'), input = $('#question'), status = $('#question-status'), audioStatus = $('#audio-status');
  let context = {}, firstLoad = true, reading = false, answering = false;
  const setup = mountProfile();
  bindVoiceToggle($('#voice-toggle'), audioStatus);
  function personalise() {
    const { name } = readProfile();
    $('#briefing-greeting').textContent = name ? `Your catch-up, ${name}.` : 'A quick catch-up.';
    $('#change-name').textContent = name ? `Calling you ${name} · change` : 'Change your name';
  }
  personalise();
  window.addEventListener('farm-profile', personalise);
  $('#change-name').addEventListener('click', () => setup.open());
  function sourceLinks(ids, parent) {
    const brief = getBrief();
    const row = document.createElement('div'); row.className = 'sources-row';
    [...new Set(ids)].forEach(id => {
      const source = brief.sources.find(s => s.id === id);
      if (!source) return;
      try {
        const url = new URL(source.url); if (url.protocol !== 'https:') return;
        const link = document.createElement('a'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.textContent = `${source.publisher} ↗`; link.title = source.title; row.append(link);
      } catch { /* Invalid publisher links are not displayed. */ }
    });
    if (row.childNodes.length) parent.append(row);
  }
  function appendMessage(text, role, refs = []) {
    log.querySelector('.chat-empty')?.remove();
    const message = document.createElement('div'); message.className = `chat-message ${role}`;
    const speaker = document.createElement('span'); speaker.className = 'speaker'; speaker.textContent = role === 'user' ? readProfile().name || 'You' : 'From your briefing'; message.append(speaker);
    text.split('\n\n').filter(Boolean).forEach(paragraph => { const p = document.createElement('p'); p.textContent = paragraph; message.append(p); });
    if (role === 'assistant') {
      sourceLinks(refs, message);
      const replay = document.createElement('button'); replay.type = 'button'; replay.className = 'replay-answer'; replay.textContent = '▶ Hear this answer';
      replay.addEventListener('click', () => { voice.setEnabled(true); voice.speak(text); }); message.append(replay);
    }
    log.append(message);
    // Keep the conversation bounded while preserving the current question context.
    while (log.children.length > 30) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
    $('#clear-chat').hidden = false;
  }
  function suggestions(questions) {
    const row = $('#suggested-questions'); row.replaceChildren();
    questions.forEach(question => { const button = document.createElement('button'); button.type = 'button'; button.textContent = question; button.addEventListener('click', () => ask(question)); row.append(button); });
  }
  function ask(question) {
    const brief = getBrief();
    if (!brief || answering) return;
    const clean = String(question).trim().slice(0, 500); if (!clean) return;
    answering = true; voice.stop(); reading = false; status.textContent = '';
    appendMessage(clean, 'user'); input.value = '';
    const answer = answerQuestion(brief, clean, context);
    context = { species: answer.species, intent: answer.intent };
    appendMessage(answer.text, 'assistant', answer.sourceIds); suggestions(answer.suggestions);
    answering = false;
    if (voice.enabled) voice.speak(answer.text);
  }
  $('#question-form').addEventListener('submit', event => { event.preventDefault(); ask(input.value); });
  document.querySelectorAll('[data-question]').forEach(button => button.addEventListener('click', () => ask(button.dataset.question)));
  $('#ask-voice').addEventListener('click', () => {
    if (voice.listening) { voice.stopListening(); status.textContent = 'Microphone stopped.'; return; }
    voice.setEnabled(true); reading = false;
    voice.listen({ onStatus: text => { status.textContent = text; }, onPartial: text => { input.value = text.slice(0, 500); }, onResult: text => { input.value = text; ask(text); } });
  });
  $('#clear-chat').addEventListener('click', () => {
    voice.stop(); context = {}; log.replaceChildren(); input.value = ''; status.textContent = 'Ready for a new question.';
    $('#clear-chat').hidden = true; suggestions(['When is the next sale?', 'What are lambs doing?', 'What prices have been reported?']); input.focus();
  });
  voice.addEventListener('state', event => {
    const state = event.detail;
    $('#ask-voice').setAttribute('aria-pressed', String(state.listening));
    $('#ask-voice span').textContent = state.listening ? '■ Stop listening' : 'Ask by voice';
    if (state.status) { audioStatus.hidden = false; audioStatus.textContent = state.status; }
    $('#listen').textContent = reading && state.speaking ? '■ Stop briefing' : '▶ Listen to briefing';
    $('#listen').setAttribute('aria-pressed', String(reading && state.speaking));
  });
  function read() {
    const brief = getBrief(); if (!brief) return;
    if (reading) { reading = false; voice.stopSpeaking(); audioStatus.textContent = 'Playback stopped.'; return; }
    voice.setEnabled(true); reading = true;
    audioStatus.hidden = false; audioStatus.textContent = 'Starting your briefing…';
    $('#listen').textContent = '■ Cancel playback';
    voice.speak(briefingScript(brief, readProfile().name)).then(result => {
      reading = false; $('#listen').textContent = '▶ Listen to briefing'; $('#listen').setAttribute('aria-pressed', 'false');
      if (result === 'finished') audioStatus.textContent = 'That’s the briefing. Ask a question below whenever you’re ready.';
      if (result === 'blocked' || result === 'unavailable') {
        audioStatus.textContent = 'Tap Listen to briefing to start the voice. You can also play the original radio report below.';
        if (result === 'unavailable' && !$('#original-report').hidden) $('#original-report').open = true;
      }
    });
  }
  $('#listen').addEventListener('click', read);
  document.addEventListener('play', event => {
    if (event.target.tagName === 'AUDIO') { reading = false; voice.stop(); document.querySelectorAll('audio').forEach(audio => { if (audio !== event.target) audio.pause(); }); audioStatus.textContent = 'Playing the original publisher report.'; }
  }, true);
  $('#report-audio').addEventListener('error', () => { audioStatus.hidden = false; audioStatus.textContent = 'The original audio could not load. Open the report link below to listen on the publisher’s website.'; });
  function render(brief) {
    $('#listen').disabled = false; input.disabled = false; $('#send-question').disabled = false; $('#ask-voice').disabled = false;
    const summary = $('#daily-summary'); summary.replaceChildren();
    ['cattle', 'lambs', 'sheep'].forEach((stock, index) => {
      const item = brief.briefs.filter(b => b.species === stock).sort((a, b) => String(b.evidenceDate).localeCompare(String(a.evidenceDate)))[0];
      const row = document.createElement('article'); row.className = 'summary-item';
      const number = document.createElement('span'); number.className = 'summary-index'; number.textContent = `0${index + 1}`;
      const content = document.createElement('div'), title = document.createElement('h3'), text = document.createElement('p'), meta = document.createElement('small');
      title.textContent = speciesName(stock);
      text.textContent = item?.summary || 'No fresh commentary is saved for sheep yet. Ask about the next sale or outlook.';
      meta.textContent = item ? `${item.scope || item.yard} · ${item.historicalContext || isOld(item.evidenceDate) ? 'Historical context · ' : ''}Published ${nzDate(item.evidenceDate)}` : 'Evidence still building';
      const button = document.createElement('button'); button.type = 'button'; button.textContent = `Ask about ${stock}`; button.addEventListener('click', () => { context = {}; ask(`What are ${stock} doing?`); $('#ask-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      content.append(title, text, meta, button); row.append(number, content); summary.append(row);
    });
    const next = upcomingEvents(brief)[0], sale = $('#next-sale'); sale.hidden = !next; sale.replaceChildren();
    if (next) {
      const label = document.createElement('strong'); label.textContent = 'Next in the saved calendar';
      const text = document.createElement('div'); text.textContent = `${next.title} · ${nzDate(next.date, { weekday: 'short' })} · ${next.time || 'Time not reported'} NZ`;
      const askButton = document.createElement('button'); askButton.textContent = 'What’s the outlook?'; askButton.addEventListener('click', () => { context = { species: next.species }; ask('What is the outlook?'); $('#ask-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      sale.append(label, text, askButton);
    }
    if (firstLoad) {
      firstLoad = false;
      if (!setup.dialog.open && voice.enabled && new URLSearchParams(location.search).has('listen')) read();
    }
  }
  return { render };
}
