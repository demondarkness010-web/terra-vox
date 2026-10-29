import * as Tone from 'tone';

const status = document.getElementById('status');
status.textContent = `Tone.js ${Tone.version} loaded. Audio context: ${Tone.getContext().state}.`;
