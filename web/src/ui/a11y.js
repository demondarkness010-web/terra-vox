// Accessibility plumbing shared by the whole app.
//
//   createAnnouncer(el)        polite screen-reader announcements for events
//                              (theme chosen, duet on, paused ...)
//   installShortcuts(list)     one keyboard map for the app; every action is
//                              also a visible, focusable control, so keys are
//                              a shortcut, never the only way in
//   createHelpDialog(...)      the "Keyboard shortcuts" dialog (? key),
//                              generated from the same list so it can't drift
//
// Principles used throughout Terra Vox: sound is the primary channel and the
// visuals are optional; nothing is mouse-only; every control has a name; no
// information is carried by colour alone (ear tags and ✓/✗ carry text too).

export function createAnnouncer(el) {
  let timer = null;
  return function announce(text) {
    // Clear first so repeating the same sentence is still read.
    clearTimeout(timer);
    el.textContent = '';
    timer = setTimeout(() => { el.textContent = text; }, 40);
  };
}

const isTypingTarget = (t) => {
  const tag = t?.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return true;
  return tag === 'INPUT' && !['range', 'button', 'checkbox', 'radio'].includes(t.type);
};

/**
 * shortcuts: [{ keys: ['d'], label: 'Duet on/off', run(e), when?(), allowOnButtons? }]
 * Single-character keys are matched case-insensitively. Space is ignored on
 * buttons (where it already means "press this") unless allowOnButtons.
 */
export function installShortcuts(shortcuts) {
  function onKey(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTypingTarget(e.target) || document.querySelector('dialog[open]')) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const hit = shortcuts.find((s) => s.keys.includes(key) && (!s.when || s.when()));
    if (!hit) return;
    const onButton = e.target?.tagName === 'BUTTON' || e.target?.getAttribute?.('role') === 'tab';
    if ((key === ' ' || key === 'Enter') && onButton && !hit.allowOnButtons) return;
    e.preventDefault();
    hit.run(e);
  }
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}

const KEY_NAMES = { ' ': 'Space', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', Enter: 'Enter', Home: 'Home', End: 'End' };

export function createHelpDialog(dialog, openers, groups) {
  const body = dialog.querySelector('.help-body');
  body.replaceChildren(...groups.map(({ title, items }) => {
    const section = document.createElement('section');
    const h = document.createElement('h3');
    h.textContent = title;
    const dl = document.createElement('dl');
    items.forEach(({ keys, label }) => {
      const dt = document.createElement('dt');
      dt.innerHTML = keys.map((k) => `<kbd>${KEY_NAMES[k] ?? k.toUpperCase()}</kbd>`).join(' ');
      const dd = document.createElement('dd');
      dd.textContent = label;
      dl.append(dt, dd);
    });
    section.append(h, dl);
    return section;
  }));

  let returnTo = null;
  function open() {
    if (dialog.open) return;
    returnTo = document.activeElement;
    dialog.showModal();
  }
  function close() { if (dialog.open) dialog.close(); }
  dialog.addEventListener('close', () => returnTo?.focus?.());
  dialog.querySelector('[data-close]')?.addEventListener('click', close);
  openers.forEach((b) => b.addEventListener('click', open));
  return { open, close, get isOpen() { return dialog.open; } };
}
