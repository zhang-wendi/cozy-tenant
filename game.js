/* ============ My Cozy Tenant · 核心玩法 ============ */
(() => {
  /* ---------- 配置 ---------- */
  const MAX_LEVEL = 12;
  const BASE_FAVOR = 5;        // 基础好感/次
  const CRIT_RATE = 0.05;      // 暴击概率
  const CRIT_FAVOR = 50;       // 暴击好感
  const COMBO_KEEP = 1500;     // 连击维持窗口(ms)
  const COMBO_BREAK = 2000;    // 连击断档(ms)

  // 连击档位：[次数, 倍率]
  const COMBO_TIERS = [
    [50, 2.0],
    [25, 1.5],
    [10, 1.2],
  ];

  // 升级消耗：cost(n) = 60 + 40(n-1) + 10(n-1)^2（n 为当前等级）
  const levelCost = (n) => 60 + 40 * (n - 1) + 10 * (n - 1) * (n - 1);

  const PHOTOS = [
    { file: 'assets/photo_1.jpg', level: 2, title: 'Cozy Selfie' },
    { file: 'assets/photo_2.jpg', level: 4, title: 'Diwali Nights' },
    { file: 'assets/photo_3.jpg', level: 6, title: 'Terrace Party' },
    { file: 'assets/photo_4.jpg', level: 8, title: 'Morning Run' },
    { file: 'assets/photo_5.jpg', level: 10, title: 'Emerald Evening' },
    { file: 'assets/photo_6.jpg', level: 12, title: 'Monsoon Romance' },
  ];

  /* 台词分四层：害羞 → 暧昧 → 亲密 → 告白 */
  const LINES = [
    [
      "H-hi… I'm Anaya. Thanks for the room!",
      'The chai here tastes like home~',
      "You're… staring a little, landlord-ji~",
      'Room 204 is perfect. Main khush hoon!',
    ],
    [
      'Arre! You again? Hehe, I don\'t mind~',
      'Want to share some chai with me?',
      "You're my favorite landlord, you know?",
      'Achha listen… nothing. Just wanted attention~',
    ],
    [
      'Honestly… I feel at home because of you.',
      'Stay for one more cup of chai? Please?',
      'My heart does a little dhol when you\'re around~',
      "Don't tell anyone… but I wait for you to visit.",
    ],
    [
      "I don't want to be just your tenant anymore…",
      'Room 204 — forever and always~',
    ],
  ];
  const tierOf = (lv) => (lv <= 3 ? 0 : lv <= 7 ? 1 : lv <= 11 ? 2 : 3);

  /* ---------- DOM ---------- */
  const $ = (id) => document.getElementById(id);
  const els = {
    lvBadge: $('lvBadge'), favorFill: $('favorFill'), favorNum: $('favorNum'),
    muteBtn: $('muteBtn'), arch: $('arch'), hearts: $('hearts'), flare: $('flare'),
    bubble: $('bubble'),
    comboChip: $('comboChip'), comboNum: $('comboNum'), comboMul: $('comboMul'),
    tapBtn: $('tapBtn'), galleryBtn: $('galleryBtn'), galleryDot: $('galleryDot'),
    galleryOverlay: $('galleryOverlay'), photoGrid: $('photoGrid'),
    galleryCount: $('galleryCount'), galleryClose: $('galleryClose'),
    viewer: $('viewer'), viewerImg: $('viewerImg'), viewerTitle: $('viewerTitle'),
    viewerClose: $('viewerClose'), replayFinaleBtn: $('replayFinaleBtn'),
    banner: $('banner'), bannerTitle: $('bannerTitle'), bannerSub: $('bannerSub'),
    confetti: $('confetti'), toast: $('toast'),
  };

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  /* ---------- 存档 ---------- */
  const DEFAULT_SAVE = {
    favor: 0, level: 1, taps: 0,
    photos: [false, false, false, false, false, false],
    finaleSeen: false,
  };

  function loadSave() {
    try {
      return { ...DEFAULT_SAVE, ...JSON.parse(localStorage.getItem('cozyTenantSave') || '{}') };
    } catch {
      return { ...DEFAULT_SAVE };
    }
  }

  let save = loadSave();
  const persist = () => localStorage.setItem('cozyTenantSave', JSON.stringify(save));

  /* ---------- 视频池（交叉淡化 + 自动回 idle） ---------- */
  const videos = {};
  document.querySelectorAll('.arch [data-video]').forEach((v) => {
    videos[v.dataset.video] = v;
  });
  let activeVideo = null;
  let reactionTimer = null;

  function showVideo(name, { flare = false } = {}) {
    const next = videos[name];
    if (!next) return;
    if (flare) retrigger(els.flare, 'go');
    if (name !== 'idle') next.currentTime = 0;
    next.play().catch(() => {});
    next.classList.add('active');
    const old = activeVideo;
    activeVideo = next;
    if (old && old !== next) {
      setTimeout(() => {
        if (activeVideo !== old) {
          old.classList.remove('active');
          old.pause();
        }
      }, 400);
    }
  }

  function react(name, dur) {
    clearTimeout(reactionTimer);
    showVideo(name, { flare: true });
    reactionTimer = setTimeout(() => showVideo('idle'), dur);
  }

  ['happy', 'finale'].forEach((n) => {
    videos[n].addEventListener('ended', () => {
      if (activeVideo === videos[n]) showVideo('idle');
    });
  });

  function retrigger(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /* ---------- 顶栏渲染 ---------- */
  function renderTop() {
    els.lvBadge.textContent = 'Lv ' + save.level;
    if (save.level >= MAX_LEVEL) {
      els.favorFill.style.width = '100%';
      els.favorNum.textContent = save.favor + ' · MAX';
    } else {
      const cost = levelCost(save.level);
      els.favorFill.style.width = Math.min(100, (save.favor / cost) * 100) + '%';
      els.favorNum.textContent = save.favor + ' / ' + cost;
    }
  }

  /* ---------- 气泡台词 ---------- */
  function say(text, { voice = false } = {}) {
    els.bubble.textContent = text;
    if (voice) AudioFX.speak(text);
  }

  function tierLine(voice = false) {
    say(pick(LINES[tierOf(save.level)]), { voice });
  }

  /* ---------- 点击粒子 ---------- */
  function spawnHeart({ gold = false } = {}) {
    const h = document.createElement('span');
    h.className = 'heart-pop' + (gold ? ' gold' : '');
    h.textContent = gold ? '💖' : pick(['💖', '💕', '❤️', '💗']);
    h.style.left = 28 + Math.random() * 44 + '%';
    h.style.top = 26 + Math.random() * 34 + '%';
    els.hearts.appendChild(h);
    setTimeout(() => h.remove(), 950);
  }

  function spawnFloat(n, { crit = false } = {}) {
    const f = document.createElement('span');
    f.className = 'favor-float' + (crit ? ' crit' : '');
    f.textContent = (crit ? 'CRIT +' : '+') + n;
    f.style.left = 40 + Math.random() * 20 + '%';
    f.style.top = 44 + Math.random() * 14 + '%';
    els.hearts.appendChild(f);
    setTimeout(() => f.remove(), 850);
  }

  /* ---------- 连击 ---------- */
  let combo = 0;
  let lastTap = 0;
  let comboBreakTimer = null;
  let lastTier = 0;

  const comboMulOf = (c) => {
    for (const [min, mul] of COMBO_TIERS) if (c >= min) return mul;
    return 1.0;
  };

  function renderCombo() {
    if (combo >= 3) {
      els.comboChip.hidden = false;
      els.comboNum.textContent = combo;
      els.comboMul.textContent = 'x' + comboMulOf(combo).toFixed(1);
    } else {
      els.comboChip.hidden = true;
    }
  }

  /* ---------- 升级 / 写真 / 结局 ---------- */
  function checkLevelUps() {
    let leveled = false;
    while (save.level < MAX_LEVEL && save.favor >= levelCost(save.level)) {
      save.favor -= levelCost(save.level);
      save.level++;
      leveled = true;
      onLevelUp();
    }
    if (leveled) persist();
    renderTop();
  }

  function onLevelUp() {
    AudioFX.sfx.levelUp();
    react('happy', 9200);

    // 写真解锁（含满级 L12 的最后一张）
    PHOTOS.forEach((p, i) => {
      if (save.level >= p.level && !save.photos[i]) {
        save.photos[i] = true;
        newPhotos.add(i);
        setTimeout(() => {
          AudioFX.sfx.shutter();
          toast('📸 New photo: ' + p.title);
          els.galleryDot.hidden = false;
        }, 900);
      }
    });
    renderGallery();

    if (save.level >= MAX_LEVEL) {
      onFinale();
      return;
    }

    showBanner('Level ' + save.level + '!', 'Anaya likes you a little more~', 1800);
    tierLine(true);
  }

  let finaleLock = false;

  function onFinale() {
    if (finaleLock) return;
    finaleLock = true;
    save.finaleSeen = true;
    persist();
    say("I don't want to be just your tenant anymore…", { voice: true });
    clearTimeout(reactionTimer);
    showVideo('finale', { flare: true });
    AudioFX.sfx.finale();

    setTimeout(() => {
      showBanner('She said YES!', 'Room 204 · forever', 3200);
      confettiBurst();
      say('Room 204 — forever and always~', { voice: true });
      els.replayFinaleBtn.hidden = false;
    }, 2600);
    setTimeout(() => { finaleLock = false; }, 10000);
  }

  /* ---------- 相册 ---------- */
  const newPhotos = new Set();

  function renderGallery() {
    els.photoGrid.innerHTML = '';
    let cnt = 0;
    PHOTOS.forEach((p, i) => {
      const unlocked = save.photos[i];
      if (unlocked) cnt++;
      const card = document.createElement('div');
      card.className = 'photo-card ' + (unlocked ? 'unlocked' : 'locked');
      const img = document.createElement('img');
      img.src = p.file;
      img.alt = p.title;
      img.draggable = false;
      card.appendChild(img);
      if (!unlocked) {
        const lock = document.createElement('div');
        lock.className = 'lock';
        lock.innerHTML = '<span class="lock-ico">🔒</span>Reach Lv ' + p.level;
        card.appendChild(lock);
      } else if (newPhotos.has(i)) {
        const tag = document.createElement('span');
        tag.className = 'new-tag';
        tag.textContent = 'NEW';
        card.appendChild(tag);
      }
      if (unlocked) {
        card.addEventListener('click', () => {
          newPhotos.delete(i);
          els.viewerImg.src = p.file;
          els.viewerTitle.textContent = p.title;
          els.viewer.hidden = false;
          AudioFX.sfx.shutter();
          renderGallery();
          if (!newPhotos.size) els.galleryDot.hidden = true;
        });
      }
      els.photoGrid.appendChild(card);
    });
    els.galleryCount.textContent = cnt + '/' + PHOTOS.length;
    if (!newPhotos.size) els.galleryDot.hidden = true;
  }

  function openGallery() {
    renderGallery();
    els.galleryOverlay.hidden = false;
    els.replayFinaleBtn.hidden = !save.finaleSeen;
  }

  /* ---------- 横幅 / toast / 彩带 ---------- */
  let bannerTimer = null;

  function showBanner(title, sub, dur = 1800) {
    els.bannerTitle.textContent = title;
    els.bannerSub.textContent = sub;
    els.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => els.banner.classList.remove('show'), dur);
  }

  let toastTimer = null;

  function toast(text) {
    els.toast.textContent = text;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
  }

  function confettiBurst() {
    const colors = ['#f2b135', '#e2743b', '#ff5c8a', '#7dc95e', '#fdf3e3'];
    for (let i = 0; i < 46; i++) {
      const c = document.createElement('i');
      c.style.left = Math.random() * 100 + '%';
      c.style.background = pick(colors);
      c.style.animationDuration = 1.8 + Math.random() * 1.6 + 's';
      c.style.animationDelay = Math.random() * 0.9 + 's';
      c.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
      els.confetti.appendChild(c);
      setTimeout(() => c.remove(), 4200);
    }
  }

  /* ---------- 点击核心 ---------- */
  function doTap(ev) {
    const now = Date.now();
    if (now - lastTap < COMBO_KEEP) {
      combo++;
    } else {
      combo = 1;
    }
    lastTap = now;

    const tier = combo >= 50 ? 3 : combo >= 25 ? 2 : combo >= 10 ? 1 : 0;
    if (tier > lastTier) AudioFX.sfx.comboUp();
    lastTier = tier;

    clearTimeout(comboBreakTimer);
    comboBreakTimer = setTimeout(() => {
      combo = 0;
      lastTier = 0;
      renderCombo();
    }, COMBO_BREAK);

    // 数值结算
    const crit = Math.random() < CRIT_RATE;
    let gain;
    if (crit) {
      gain = CRIT_FAVOR;
      AudioFX.sfx.crit();
      spawnHeart({ gold: true });
      spawnFloat(gain, { crit: true });
    } else {
      gain = Math.round(BASE_FAVOR * comboMulOf(combo));
      AudioFX.sfx.tap(tier);
      spawnHeart();
      spawnFloat(gain);
    }

    save.favor += gain;
    save.taps++;
    persist(); // 每次点击实时存档，防刷新丢进度
    renderCombo();
    checkLevelUps();

    // 偶尔换台词（升级时已单独处理）
    if (save.taps % 8 === 0) tierLine(save.taps % 24 === 0);
  }

  /* ---------- 事件绑定 ---------- */
  els.tapBtn.addEventListener('click', doTap);
  els.arch.addEventListener('click', doTap);

  els.muteBtn.addEventListener('click', () => {
    const m = AudioFX.toggleMute();
    els.muteBtn.textContent = m ? '🔇' : '🔊';
  });

  els.galleryBtn.addEventListener('click', openGallery);
  els.galleryClose.addEventListener('click', () => (els.galleryOverlay.hidden = true));
  els.viewerClose.addEventListener('click', () => (els.viewer.hidden = true));
  els.viewer.addEventListener('click', (e) => {
    if (e.target === els.viewer) els.viewer.hidden = true;
  });

  els.replayFinaleBtn.addEventListener('click', () => {
    els.galleryOverlay.hidden = true;
    onFinale();
  });

  /* ---------- 启动 ---------- */
  if (AudioFX.isMuted()) els.muteBtn.textContent = '🔇';
  renderTop();
  renderGallery();
  showVideo('idle');
  if (save.finaleSeen) els.replayFinaleBtn.hidden = false;
  tierLine();
})();
