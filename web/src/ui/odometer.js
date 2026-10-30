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

  function build(length) {
    wheels = Array.from({ length }, () => {
      const wheel = document.createElement('span');
      wheel.className = 'wheel';
      const strip = document.createElement('span');
      strip.className = 'strip';
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
    if (text.length !== wheels.length) { build(text.length); instant = true; }
    el.classList.toggle('is-instant', instant);
    [...text].forEach((ch, i) => {
      wheels[i].firstChild.style.transform = `translateY(${-Number(ch) * 10}%)`;
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
