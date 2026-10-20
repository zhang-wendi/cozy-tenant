/* ============ My Cozy Tenant · 音频引擎 ============ */
/* BGM 与全部音效由 WebAudio 实时合成（无需音频文件）：   */
/* bansuri 长笛 + tanpura 低音 + 轻 tabla 节奏，88 BPM。   */
/* 英文女声台词使用浏览器内置 SpeechSynthesis。           */
window.AudioFX = (() => {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  let muted = localStorage.getItem('cozyTenantMuted') === '1';
  let bgmStarted = false;
  let schedulerTimer = null;
  let nextNoteTime = 0;
  let step = 0;
  let duckUntil = 0;

  const BPM = 88;
  const BEAT = 60 / BPM; // 一拍时长
  const STEP = BEAT / 2; // 八分音符

  /* C 大调五声音阶（欢快舒缓） */
  const F = {
    C3: 130.81, G3: 196.0,
    C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0, A4: 440.0,
    C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99,
  };

  /* 4 小节旋律（32 个八分音符，null=休止） */
  const MELODY = [
    F.E4, null, F.G4, F.A4, F.G4, null, F.E4, F.D4,
    F.C4, null, F.D4, F.E4, F.D4, null, null, null,
    F.E4, null, F.G4, F.A4, F.C5, null, F.D5, F.C5,
    F.A4, null, F.G4, F.E4, F.C4, null, null, null,
  ];

  /* keherwa 节奏（4/4）：dhi dhi na dhi na dhi na na → 1 重 2 轻 */
  const TABLA = [1, 0.5, 0.25, 0.6, 0.3, 0.55, 0.25, 0.35];

  /* ---------- 基础设施 ---------- */
  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.4;
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.85;
    sfxBus.connect(master);
    return ctx;
  }

  function startAudio() {
    const c = ensureCtx();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    if (!bgmStarted && c.state === 'running') startBGM();
  }

  ['pointerdown', 'click', 'touchend', 'keydown'].forEach((ev) =>
    document.addEventListener(ev, startAudio, { capture: true })
  );

  window.addEventListener('load', () => {
    startAudio();
    if (!ctx || ctx.state !== 'running') showHint();
  });

  function showHint() {
    if (muted) return;
    const el = document.getElementById('audioHint');
    if (el) el.hidden = false;
  }

  function hideHint() {
    const el = document.getElementById('audioHint');
    if (el) el.hidden = true;
  }

  ctx_hook_state();
  function ctx_hook_state() {
    // AudioContext 挂起→恢复的瞬间补启 BGM
    const t = setInterval(() => {
      if (ctx && ctx.state === 'running') {
        hideHint();
        if (!bgmStarted) startBGM();
        clearInterval(t);
      }
    }, 400);
  }

  /* ---------- BGM 合成 ---------- */
  function startBGM() {
    if (bgmStarted) return;
    bgmStarted = true;
    nextNoteTime = ctx.currentTime + 0.1;
    step = 0;
    startDrone();
    schedulerTimer = setInterval(schedule, 180);
  }

  /* tanpura 式持续低音（Sa–Pa） */
  function startDrone() {
    [[F.C3, 0], [F.G3, 0.35]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0;
      // 缓慢呼吸包络
      lfo.frequency.value = 0.08 + Math.random() * 0.05;
      lfoGain.gain.value = 0.03;
      lfo.connect(lfoGain).connect(gain.gain);
      osc.connect(gain).connect(musicBus);
      gain.gain.setTargetAtTime(0.05, ctx.currentTime + delay, 1.2);
      osc.start();
      lfo.start();
    });
  }

  function schedule() {
    while (nextNoteTime < ctx.currentTime + 0.4) {
      playStep(step, nextNoteTime);
      nextNoteTime += STEP;
      step = (step + 1) % MELODY.length;
    }
    // ducking 恢复
    if (ctx.currentTime > duckUntil) {
      musicBus.gain.setTargetAtTime(0.4, ctx.currentTime, 0.4);
    }
  }

  function playStep(i, t) {
    const note = MELODY[i];
    if (note) bansuri(note, t, STEP * 1.8);
    if (i % 4 === 0 || i % 8 === 4) tabla(TABLA[i % 8], t); // 轻 tabla 打点
  }

  /* bansuri 长笛音色：三角波 + 颤音 + 低通 */
  function bansuri(freq, t, dur) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    const vib = ctx.createOscillator();
    const vibG = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    vib.frequency.value = 5;
    vibG.gain.value = freq * 0.006;
    vib.connect(vibG).connect(osc.frequency);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.16, t + 0.04);
    gain.gain.setTargetAtTime(0, t + dur * 0.6, 0.12);
    osc.connect(lp).connect(gain).connect(musicBus);
    osc.start(t);
    vib.start(t);
    osc.stop(t + dur + 0.3);
    vib.stop(t + dur + 0.3);
  }

  /* tabla 式打点：正弦下坠 + 噪声瞬态 */
  function tabla(vel, t) {
    if (!vel) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.09);
    gain.gain.setValueAtTime(vel * 0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain).connect(musicBus);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  /* ---------- SFX ---------- */
  function blip(freq, t, dur, type = 'sine', vol = 0.25, slide = 0) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  const sfx = {
    tap(comboTier = 0) {
      if (!ctx) return;
      const t = ctx.currentTime;
      blip(520 + comboTier * 60, t, 0.09, 'sine', 0.22, 300);
    },
    crit() {
      if (!ctx) return;
      const t = ctx.currentTime;
      [1046, 1318, 1568, 2093].forEach((f, i) => blip(f, t + i * 0.05, 0.25, 'sine', 0.16));
    },
    comboUp() {
      if (!ctx) return;
      const t = ctx.currentTime;
      [523, 659, 784].forEach((f, i) => blip(f, t + i * 0.06, 0.14, 'triangle', 0.2));
    },
    levelUp() {
      if (!ctx) return;
      const t = ctx.currentTime;
      [523, 587, 659, 784, 1046].forEach((f, i) => blip(f, t + i * 0.09, 0.3, 'triangle', 0.24));
      blip(1568, t + 0.5, 0.5, 'sine', 0.18);
    },
    shutter() {
      if (!ctx) return;
      const t = ctx.currentTime;
      blip(2400, t, 0.03, 'square', 0.12);
      blip(1600, t + 0.05, 0.04, 'square', 0.1);
    },
    finale() {
      if (!ctx) return;
      const t = ctx.currentTime;
      // 大调和弦铺垫 + 上行琶音
      [261, 329, 392].forEach((f) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.14, t + 0.15);
        gain.gain.setTargetAtTime(0, t + 2.4, 0.5);
        osc.connect(gain).connect(sfxBus);
        osc.start(t);
        osc.stop(t + 3.5);
      });
      [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => blip(f, t + 0.3 + i * 0.12, 0.4, 'sine', 0.2));
    },
  };

  /* ---------- 台词语音（浏览器 TTS） ---------- */
  let voice = null;
  function pickVoice() {
    const vs = speechSynthesis.getVoices();
    if (!vs.length) return;
    voice =
      vs.find((v) => /en[-_]IN/i.test(v.lang)) ||
      vs.find((v) => /female|zira|samantha|google us english/i.test(v.name)) ||
      vs[0];
  }
  if ('speechSynthesis' in window) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }

  function speak(text) {
    if (muted || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[~♡]/g, ''));
      if (voice) u.voice = voice;
      u.lang = 'en-IN';
      u.rate = 1.02;
      u.pitch = 1.15;
      u.volume = 0.9;
      speechSynthesis.speak(u);
      // 说话时压低 BGM
      if (ctx) {
        duckUntil = ctx.currentTime + Math.min(4, text.length * 0.06 + 1);
        musicBus.gain.setTargetAtTime(0.12, ctx.currentTime, 0.15);
      }
    } catch { /* 忽略 TTS 异常 */ }
  }

  /* ---------- 对外接口 ---------- */
  function toggleMute() {
    muted = !muted;
    localStorage.setItem('cozyTenantMuted', muted ? '1' : '0');
    if (master) master.gain.value = muted ? 0 : 1;
    if (muted && 'speechSynthesis' in window) speechSynthesis.cancel();
    return muted;
  }

  return {
    startAudio,
    toggleMute,
    isMuted: () => muted,
    sfx,
    speak,
  };
})();
