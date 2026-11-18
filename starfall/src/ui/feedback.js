// Feedback form: a floating button on every screen that opens a small dialog.
// Messages go to the Supabase `feedback` table (see supabase/schema.sql), which
// players can write to but not read; the owner reads it in the Supabase dashboard.
import { t } from '../i18n.js';
import { onlineConfig, sendFeedback } from '../net/online.js';

const KINDS = ['bug', 'idea', 'balance', 'praise', 'other'];
let getContext = () => ({});
let btn, dlg;

export function initFeedback(contextFn) {
  getContext = contextFn;
  btn = document.createElement('button');
  btn.id = 'fbBtn';
  btn.type = 'button';
  btn.addEventListener('click', open);
  document.body.appendChild(btn);

  dlg = document.createElement('dialog');
  dlg.id = 'fbDlg';
  dlg.addEventListener('close', () => { dlg.innerHTML = ''; });
  document.body.appendChild(dlg);
  refreshFeedback();
}

// Re-labels the button (language changes) and hides it when there is no backend.
export function refreshFeedback() {
  if (!btn) return;
  btn.textContent = `💬 ${t('feedback')}`;
  btn.hidden = !onlineConfig().ok;
}

function open() {
  const ctx = getContext();
  let name = ctx.playerName || '';
  try { name = name || localStorage.getItem('starfall.name') || ''; } catch {}
  dlg.innerHTML = `
    <form method="dialog" class="fb">
      <h3>${t('fbTitle')}</h3>
      <p class="muted small">${t('fbIntro')}</p>
      <div class="fbKinds">${KINDS.map((k, i) => `<label><input type="radio" name="kind" value="${k}" ${i === 0 ? 'checked' : ''}> ${t('fb_' + k)}</label>`).join('')}</div>
      <textarea name="message" rows="6" maxlength="4000" required placeholder="${t('fbPlaceholder')}"></textarea>
      <label>${t('yourName')} <input name="name" maxlength="40"></label>
      <div class="row fbBtns">
        <button type="button" class="mini" data-fb="cancel">${t('cancel')}</button>
        <button type="submit" class="primary" data-fb="send">${t('fbSend')}</button>
      </div>
      <p class="fbStatus small" aria-live="polite"></p>
    </form>`;
  const form = dlg.querySelector('form');
  form.elements.name.value = name;
  dlg.querySelector('[data-fb=cancel]').addEventListener('click', () => dlg.close());
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(form); });
  dlg.showModal();
  form.elements.message.focus();
}

async function submit(form) {
  const message = form.elements.message.value.trim();
  const status = form.querySelector('.fbStatus');
  if (!message) { form.elements.message.focus(); return; }
  const send = form.querySelector('[data-fb=send]');
  send.disabled = true;
  status.className = 'fbStatus small muted';
  status.textContent = '…';
  const ctx = getContext();
  try {
    await sendFeedback({
      kind: form.elements.kind.value,
      message,
      player_name: form.elements.name.value.trim().slice(0, 40) || null,
      game_id: ctx.onlineGameId || null,
      context: {
        screen: ctx.screen, view: ctx.view, mode: ctx.mode, turn: ctx.turn, player: ctx.playerId,
        localGame: ctx.localGameId, lang: document.documentElement.lang,
        ua: navigator.userAgent.slice(0, 300), w: innerWidth, h: innerHeight, url: location.pathname,
      },
    });
    status.className = 'fbStatus small ok';
    status.textContent = t('fbThanks');
    setTimeout(() => dlg.open && dlg.close(), 1400);
  } catch (e) {
    send.disabled = false;
    status.className = 'fbStatus small bad';
    status.textContent = `${t('fbError')} (${e.message})`;
  }
}
