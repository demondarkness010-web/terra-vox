// A year that rolls like an odometer: each digit is a column of 0-9 that
// slides to its value, so only the digits that changed move. Its width
// follows the tempo (Anybody's width axis, 75% at 80 BPM to 130% at 160 BPM),
// so faster music literally reads wider. Decorative: aria-hidden, the year is
// always in text elsewhere.

export function createOdometer(el) {
  el.classList.add('odometer');
  el.setAttribute('aria-hidden', 'true');
  let wheels = [];
  let value = '';

  // Digits get a rolling wheel; anything else (":", ".", "+", a month name)
  // is a fixed glyph, so the same odometer shows "2014", "21:20" or "+6.2".
  let shape = '';

  function build(text) {
    wheels = [...text].map((ch) => {
      if (!/[0-9]/.test(ch)) {
        const glyph = document.createElement('span');
        glyph.className = 'glyph';
        glyph.textContent = ch;
        return glyph;
      }
      const wheel = document.createElement('span');
      wheel.className = 'wheel';
      const strip = document.createElement('span');
      strip.className = 'wheel-strip';
      for (let d = 0; d <= 9; d++) {
        const digit = document.createElement('span');
        digit.textContent = String(d);
        strip.append(digit);
      }
      wheel.append(strip);
      return wheel;
    });
    el.replaceChildren(...wheels);
  }

  function set(next, { instant = false } = {}) {
    const text = String(next);
    if (text === value) return;
    const nextShape = text.replace(/[0-9]/g, '0');
    if (nextShape !== shape) { build(text); shape = nextShape; instant = true; }
    el.classList.toggle('is-instant', instant);
    [...text].forEach((ch, i) => {
      if (/[0-9]/.test(ch)) wheels[i].firstChild.style.transform = `translateY(${-Number(ch) * 10}%)`;
    });
    if (instant) requestAnimationFrame(() => el.classList.remove('is-instant'));
    value = text;
  }

  function stretch(bpm) {
    const t = (Math.min(160, Math.max(80, bpm)) - 80) / 80;
    el.style.fontStretch = `${Math.round(75 + t * 55)}%`;
  }

  return { set, stretch };
}
