const TRACK_URLS = Object.entries(
  import.meta.glob('../assets/music/*.{ogg,mp3}', { eager: true, query: '?url', import: 'default' })
).sort(([a], [b]) => a.localeCompare(b)).map(([, url]) => url);

const FADE_MS = 3200;
const OVERLAP_S = 3.5;

class Music {
  constructor() {
    this.audio = null;
    this.other = null;
    this.on = false;
    this.volume = 0.4;
    this.order = [];
    this.at = 0;
    this.parked = false;
    this.fading = null;
    this.misses = 0;
  }

  #player() {
    const audio = new Audio();
    audio.preload = 'none';
    audio.addEventListener('timeupdate', () => {
      if (audio !== this.audio || this.fading) return;
      if (Number.isFinite(audio.duration) && audio.duration - audio.currentTime <= OVERLAP_S) this.#next();
    });
    audio.addEventListener('ended', () => { if (audio === this.audio && !this.fading) this.#next(); });
    audio.addEventListener('error', () => {
      if (audio !== this.audio) return;
      this.misses += 1;
      if (this.misses >= this.order.length) return;
      setTimeout(() => this.#next(), 4000);
    });
    audio.addEventListener('playing', () => { if (audio === this.audio) this.misses = 0; });
    return audio;
  }

  #ensure() {
    if (this.audio || !TRACK_URLS.length) return;
    this.audio = this.#player();
    this.other = this.#player();
    this.order = [...TRACK_URLS].sort(() => Math.random() - 0.5);
    this.at = -1;
  }

  prime() {
    if (!this.on) return;
    this.#ensure();
    if (!this.audio || this.audio.src) return;
    this.at = 0;
    this.audio.src = this.order[0];
    this.audio.volume = this.volume;
  }

  #next() {
    if (!this.on || this.parked || this.fading) return;
    this.at = (this.at + 1) % this.order.length;
    const outgoing = this.audio;
    const incoming = this.other;
    incoming.src = this.order[this.at];
    incoming.volume = 0;
    incoming.currentTime = 0;
    this.audio = incoming;
    this.other = outgoing;
    incoming.play().catch(() => {});

    const started = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - started) / FADE_MS);
      incoming.volume = this.volume * Math.sin(k * Math.PI / 2);
      outgoing.volume = this.volume * Math.cos(k * Math.PI / 2);
      if (k < 1 && !this.parked && this.on) { this.fading = requestAnimationFrame(step); return; }
      this.fading = null;
      outgoing.pause();
      outgoing.volume = this.volume;
      incoming.volume = this.volume;
    };
    this.fading = requestAnimationFrame(step);
  }

  poke() {
    if (!this.on || this.parked) return;
    this.#ensure();
    if (!this.audio) return;
    if (!this.audio.src) this.prime();
    if (!this.fading) this.audio.volume = this.volume;
    this.audio.play().catch(() => {});
  }

  setOn(on) {
    this.on = Boolean(on);
    if (!this.on) { this.#stopFade(); this.audio?.pause(); this.other?.pause(); }
    else this.poke();
  }

  setVolume(volume) {
    this.volume = Math.min(1, Math.max(0, Number(volume) || 0));
    if (this.audio && !this.fading) this.audio.volume = this.volume;
  }

  #stopFade() {
    if (this.fading) cancelAnimationFrame(this.fading);
    this.fading = null;
  }

  park() {
    this.parked = true;
    this.#stopFade();
    this.audio?.pause();
    this.other?.pause();
  }

  unpark() {
    this.parked = false;
    if (this.on && this.audio?.paused) { this.audio.volume = this.volume; this.audio.play().catch(() => {}); }
  }
}

export const music = new Music();
