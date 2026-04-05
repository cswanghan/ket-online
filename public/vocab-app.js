const STORAGE_KEY = 'ket-vocab-progress-v3';
const LEGACY_STORAGE_KEYS = ['ket-vocab-progress-v2'];
const DAILY_TARGET = 20;
const SYNC_DEBOUNCE_MS = 1200;
const MODE_LABELS = {
  flashcard: '词卡模式',
  spelling: '拼写模式',
  dictation: '听写模式',
  cloze: '例句挖空',
};

const state = {
  level: 'all',
  topic: 'all',
  focus: 'all',
  onlyUnmastered: false,
  randomOrder: false,
  audioOnly: false,
  mode: 'flashcard',
  queue: [],
  index: 0,
  reveal: false,
  answer: '',
  feedback: null,
  stats: {},
  libraryWords: [],
  wordByKey: new Map(),
  uniqueWordKeyMap: new Map(),
  auth: {
    token: localStorage.getItem('token') || '',
    user: loadJson('user'),
    status: 'guest',
    message: '未登录，进度仅保存在当前浏览器。',
    syncing: false,
    lastSyncedAt: null,
  },
  pendingSyncKeys: new Set(),
  syncTimer: null,
};

function trackEvent(name, meta, eventGroup) {
  window.KETAnalytics?.track(name, { meta, eventGroup });
}

function loadJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function safeInt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function normalizeTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date(0).toISOString();
}

function normalizeWordLookup(value) {
  return String(value || '').trim().toLowerCase();
}

function makeWordKey(item) {
  return `${item.topic}::${item.word.toLowerCase()}`;
}

function normalizeStoredEntry(raw, fallback = {}) {
  return {
    word: raw.word || fallback.word || '',
    topic: raw.topic || fallback.topic || '',
    seen: safeInt(raw.seen),
    streak: safeInt(raw.streak),
    mastered: Boolean(raw.mastered),
    wrong: safeInt(raw.wrong),
    favorite: Boolean(raw.favorite),
    updatedAt: normalizeTimestamp(raw.updatedAt),
  };
}

function mergeEntry(localEntry, cloudEntry, fallback = {}) {
  const local = normalizeStoredEntry(localEntry || {}, fallback);
  const cloud = normalizeStoredEntry(cloudEntry || {}, fallback);
  const localTime = Date.parse(local.updatedAt);
  const cloudTime = Date.parse(cloud.updatedAt);
  const latest = localTime >= cloudTime ? local : cloud;

  return {
    word: latest.word || fallback.word || '',
    topic: latest.topic || fallback.topic || '',
    seen: Math.max(local.seen, cloud.seen),
    streak: latest.streak,
    mastered: latest.mastered,
    wrong: Math.max(local.wrong, cloud.wrong),
    favorite: latest.favorite,
    updatedAt: latest.updatedAt || normalizeTimestamp(),
  };
}

function entryEquals(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function prepareLibrary() {
  const words = window.VOCAB_LIBRARY.words.map((item) => ({ ...item, key: makeWordKey(item) }));
  const counts = new Map();

  words.forEach((item) => {
    const lookup = normalizeWordLookup(item.word);
    counts.set(lookup, (counts.get(lookup) || 0) + 1);
    state.wordByKey.set(item.key, item);
  });

  words.forEach((item) => {
    const lookup = normalizeWordLookup(item.word);
    if (counts.get(lookup) === 1) {
      state.uniqueWordKeyMap.set(lookup, item.key);
    }
  });

  state.libraryWords = words;
}

function migrateProgress(rawProgress) {
  const next = {};
  Object.entries(rawProgress || {}).forEach(([rawKey, rawValue]) => {
    const mappedKey = state.wordByKey.has(rawKey)
      ? rawKey
      : state.uniqueWordKeyMap.get(normalizeWordLookup(rawKey));

    if (!mappedKey) return;
    const item = state.wordByKey.get(mappedKey);
    const normalized = normalizeStoredEntry(rawValue || {}, item);
    next[mappedKey] = next[mappedKey]
      ? mergeEntry(next[mappedKey], normalized, item)
      : normalized;
  });
  return next;
}

function loadProgress() {
  const merged = {};
  const sources = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];

  sources.forEach((key) => {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || '{}');
      const migrated = migrateProgress(raw);
      Object.entries(migrated).forEach(([wordKey, entry]) => {
        const item = state.wordByKey.get(wordKey);
        merged[wordKey] = merged[wordKey]
          ? mergeEntry(merged[wordKey], entry, item)
          : normalizeStoredEntry(entry, item);
      });
    } catch {
      // ignore broken local cache
    }
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  LEGACY_STORAGE_KEYS.forEach((key) => {
    if (key !== STORAGE_KEY) localStorage.removeItem(key);
  });

  return merged;
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.stats));
}

function focusLabel() {
  if (state.focus === 'wrong') return '错词本';
  if (state.focus === 'favorites') return '收藏夹';
  if (state.focus === 'daily') return '每日 20 词';
  return '全部词池';
}

function getWordState(item) {
  state.stats[item.key] = state.stats[item.key] || normalizeStoredEntry({}, item);
  return state.stats[item.key];
}

function touchWordState(item) {
  const wordState = getWordState(item);
  wordState.word = item.word;
  wordState.topic = item.topic;
  wordState.updatedAt = new Date().toISOString();
  return wordState;
}

function normalizeAnswer(value) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getLevelMeta(id = state.level) {
  return window.VOCAB_LIBRARY.levels.find((item) => item.id === id) || window.VOCAB_LIBRARY.levels[0];
}

function getTopicMeta(id) {
  return window.VOCAB_LIBRARY.topics.find((item) => item.id === id);
}

function getBasePool() {
  return state.libraryWords.filter((item) => {
    const levelOk = state.level === 'all' || item.level === state.level;
    const topicOk = state.topic === 'all' || item.topic === state.topic;
    const masteryOk = !state.onlyUnmastered || !getWordState(item).mastered;
    return levelOk && topicOk && masteryOk;
  });
}

function getDailyWords(pool = getBasePool()) {
  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...pool].sort((left, right) => {
    const leftState = getWordState(left);
    const rightState = getWordState(right);

    if (leftState.mastered !== rightState.mastered) return leftState.mastered ? 1 : -1;
    if (leftState.wrong !== rightState.wrong) return rightState.wrong - leftState.wrong;
    if (leftState.seen !== rightState.seen) return leftState.seen - rightState.seen;
    if (leftState.streak !== rightState.streak) return leftState.streak - rightState.streak;

    const leftHash = hashString(`${today}:${left.key}`);
    const rightHash = hashString(`${today}:${right.key}`);
    if (leftHash !== rightHash) return leftHash - rightHash;
    return left.word.localeCompare(right.word);
  });

  return sorted.slice(0, Math.min(DAILY_TARGET, sorted.length));
}

function filteredWords() {
  const pool = getBasePool();
  if (state.focus === 'wrong') return pool.filter((item) => getWordState(item).wrong > 0);
  if (state.focus === 'favorites') return pool.filter((item) => getWordState(item).favorite);
  if (state.focus === 'daily') return getDailyWords(pool);
  return pool;
}

function wordsForLevel(levelId = state.level) {
  return state.libraryWords.filter((item) => levelId === 'all' || item.level === levelId);
}

function countMastered(words) {
  return words.filter((item) => getWordState(item).mastered).length;
}

function buildQueue() {
  const pool = filteredWords();
  const sorted = [...pool].sort((left, right) => {
    const leftState = getWordState(left);
    const rightState = getWordState(right);

    if (leftState.mastered !== rightState.mastered) return leftState.mastered ? 1 : -1;
    if (leftState.streak !== rightState.streak) return leftState.streak - rightState.streak;
    if (leftState.seen !== rightState.seen) return leftState.seen - rightState.seen;
    return left.word.localeCompare(right.word);
  });
  state.queue = state.randomOrder ? shuffle(sorted) : sorted;
  state.index = 0;
  state.answer = '';
  state.reveal = false;
  state.feedback = null;
}

function shuffle(list) {
  const output = [...list];
  for (let i = output.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}

function currentItem() {
  return state.queue[state.index] || null;
}

function maskWord(word) {
  if (word.length <= 4) return `${word[0]}${'_'.repeat(Math.max(0, word.length - 1))}`;
  return `${word[0]}${'_'.repeat(word.length - 2)}${word[word.length - 1]}`;
}

function makeCloze(example, word) {
  const pattern = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return example.replace(pattern, '______');
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function speakText(text) {
  if (!('speechSynthesis' in window)) {
    showToast('当前浏览器不支持语音播放');
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-GB';
  utterance.rate = 0.92;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find((voice) => /en-GB/i.test(voice.lang))
    || voices.find((voice) => /British|UK/i.test(voice.name))
    || voices.find((voice) => /en/i.test(voice.lang));
  if (preferred) utterance.voice = preferred;
  window.speechSynthesis.speak(utterance);
}

function renderFilters() {
  const levelContainer = document.getElementById('levelFilters');
  levelContainer.innerHTML = window.VOCAB_LIBRARY.levels.map((level) => `
    <button class="filter-btn${state.level === level.id ? ' active' : ''}" data-level-id="${level.id}">
      <span>${level.shortLabel}</span>
      <strong>${level.label}</strong>
    </button>
  `).join('');

  levelContainer.querySelectorAll('[data-level-id]').forEach((element) => {
    element.addEventListener('click', () => {
      state.level = element.getAttribute('data-level-id');
      state.topic = 'all';
      buildQueue();
      render();
      trackEvent('vocab_filter_change', { filter: 'level', value: state.level });
    });
  });

  const topicContainer = document.getElementById('topicFilters');
  const availableWords = wordsForLevel();
  const topicCounts = new Map();

  availableWords.forEach((item) => {
    topicCounts.set(item.topic, (topicCounts.get(item.topic) || 0) + 1);
  });

  const topicButtons = [
    { id: 'all', label: 'All Topics', count: availableWords.length },
    ...window.VOCAB_LIBRARY.topics
      .filter((topic) => topicCounts.get(topic.id))
      .map((topic) => ({
        id: topic.id,
        label: topic.label,
        count: topicCounts.get(topic.id),
      })),
  ];

  topicContainer.innerHTML = topicButtons.map((topic) => `
    <button class="topic-chip${state.topic === topic.id ? ' active' : ''}" data-topic-id="${topic.id}">
      <span>${topic.label}</span>
      <strong>${topic.count}</strong>
    </button>
  `).join('');

  topicContainer.querySelectorAll('[data-topic-id]').forEach((element) => {
    element.addEventListener('click', () => {
      state.topic = element.getAttribute('data-topic-id');
      buildQueue();
      render();
      trackEvent('vocab_filter_change', { filter: 'topic', value: state.topic });
    });
  });

  const focusContainer = document.getElementById('focusFilters');
  const currentPool = getBasePool();
  const wrongCount = currentPool.filter((item) => getWordState(item).wrong > 0).length;
  const favCount = currentPool.filter((item) => getWordState(item).favorite).length;
  const dailyCount = getDailyWords(currentPool).length;
  const focusItems = [
    { id: 'all', label: '全部词池', desc: `${currentPool.length} 个词` },
    { id: 'daily', label: '每日 20 词', desc: `${dailyCount} 个词` },
    { id: 'wrong', label: '错词本', desc: `${wrongCount} 个词` },
    { id: 'favorites', label: '收藏夹', desc: `${favCount} 个词` },
  ];

  focusContainer.innerHTML = focusItems.map((item) => `
    <button class="focus-chip${state.focus === item.id ? ' active' : ''}" data-focus-id="${item.id}">
      <strong>${item.label}</strong>
      <span>${item.desc}</span>
    </button>
  `).join('');

  focusContainer.querySelectorAll('[data-focus-id]').forEach((element) => {
    element.addEventListener('click', () => {
      state.focus = element.getAttribute('data-focus-id');
      buildQueue();
      render();
      trackEvent('vocab_filter_change', { filter: 'focus', value: state.focus });
    });
  });

  const toggle = document.getElementById('onlyUnmasteredToggle');
  toggle.checked = state.onlyUnmastered;
  toggle.onchange = () => {
    state.onlyUnmastered = toggle.checked;
    buildQueue();
    render();
    trackEvent('vocab_filter_change', { filter: 'only_unmastered', value: state.onlyUnmastered });
  };

  const randomToggle = document.getElementById('randomOrderToggle');
  randomToggle.checked = state.randomOrder;
  randomToggle.onchange = () => {
    state.randomOrder = randomToggle.checked;
    buildQueue();
    render();
    trackEvent('vocab_filter_change', { filter: 'random_order', value: state.randomOrder });
  };

  const audioToggle = document.getElementById('audioOnlyToggle');
  audioToggle.checked = state.audioOnly;
  audioToggle.onchange = () => {
    state.audioOnly = audioToggle.checked;
    state.answer = '';
    state.reveal = false;
    state.feedback = null;
    render();
    trackEvent('vocab_filter_change', { filter: 'audio_only', value: state.audioOnly });
  };
}

function renderSyncCard() {
  const card = document.getElementById('syncCard');
  const username = state.auth.user?.username || '游客';
  const timeText = state.auth.lastSyncedAt ? formatTime(state.auth.lastSyncedAt) : '尚未同步';
  const badge = state.auth.syncing
    ? '同步中'
    : state.auth.status === 'ready'
      ? '云端已连接'
      : state.auth.status === 'error'
        ? '同步异常'
        : '本地模式';

  card.innerHTML = `
    <div class="status-row">
      <h3 class="section-title" style="margin:0;">Progress Sync</h3>
      <span class="status-badge-pill">${badge}</span>
    </div>
    <p class="status-note">${state.auth.message}</p>
    <div class="status-row">
      <span class="status-note">账号：${escapeHtml(username)}</span>
      ${state.auth.status === 'ready'
        ? `<span class="status-note">最近同步：${timeText}</span>`
        : '<a class="status-link" href="login.html">登录后同步</a>'}
    </div>
  `;
}

function renderDailyCard() {
  const card = document.getElementById('dailyCard');
  const dailyWords = getDailyWords();
  const mastered = countMastered(dailyWords);
  const wrong = dailyWords.filter((item) => getWordState(item).wrong > 0).length;

  card.innerHTML = `
    <div class="status-row">
      <h3 class="section-title" style="margin:0;">Daily Plan</h3>
      <span class="status-badge-pill">${new Date().toISOString().slice(5, 10)}</span>
    </div>
    <div class="daily-stats">
      <div class="daily-stat">
        <strong>${dailyWords.length}</strong>
        <span>今日计划词数</span>
      </div>
      <div class="daily-stat">
        <strong>${mastered}</strong>
        <span>今日已掌握</span>
      </div>
      <div class="daily-stat">
        <strong>${wrong}</strong>
        <span>需复习词数</span>
      </div>
      <div class="daily-stat">
        <strong>${DAILY_TARGET}</strong>
        <span>默认每日目标</span>
      </div>
    </div>
    <button class="daily-btn" id="dailyFocusBtn">${state.focus === 'daily' ? '正在训练今日计划' : '切到每日 20 词'}</button>
  `;

  document.getElementById('dailyFocusBtn').addEventListener('click', () => {
    state.focus = 'daily';
    buildQueue();
    render();
    trackEvent('vocab_daily_focus', { size: getDailyWords().length });
  });
}

function renderHero() {
  const words = filteredWords();
  const mastered = countMastered(words);
  const topicCount = state.topic === 'all'
    ? new Set(words.map((item) => item.topic)).size
    : (words.length ? 1 : 0);
  const levelMeta = getLevelMeta();
  const topicMeta = state.topic === 'all' ? null : getTopicMeta(state.topic);

  document.getElementById('heroEyebrow').textContent = topicMeta
    ? `${levelMeta.label} · ${topicMeta.label}`
    : `${levelMeta.label} · Cambridge Topic Vocabulary`;
  document.getElementById('heroTitle').textContent = state.focus === 'daily'
    ? 'Today’s 20 Words'
    : topicMeta
      ? `${topicMeta.label} Word Studio`
      : 'Official Topic Vocabulary Studio';
  document.getElementById('heroDesc').textContent = state.focus === 'daily'
    ? `系统会按今日日期、当前等级/主题和你的掌握情况，优先挑出 ${DAILY_TARGET} 个值得复习的单词。`
    : topicMeta
      ? `当前筛选的是 ${topicMeta.label} 主题词。可以切换词卡、拼写、听写和例句挖空四种训练模式。`
      : '词汇按 Cambridge English 官方 A2 Key / B1 Preliminary 主题维度组织，支持主题筛选、每日计划和云端同步。';

  document.getElementById('overviewStats').innerHTML = `
    <div class="metric"><span class="metric-num">${words.length}</span><span class="metric-label">筛选词数</span></div>
    <div class="metric"><span class="metric-num">${mastered}</span><span class="metric-label">已掌握</span></div>
    <div class="metric"><span class="metric-num">${topicCount}</span><span class="metric-label">主题数</span></div>
  `;
}

function renderModeTabs() {
  document.querySelectorAll('[data-mode]').forEach((element) => {
    element.classList.toggle('active', element.getAttribute('data-mode') === state.mode);
  });
}

function renderSessionMeta() {
  const words = filteredWords();
  const item = currentItem();
  const topicMeta = item ? getTopicMeta(item.topic) : getTopicMeta(state.topic);
  document.getElementById('sessionMeta').innerHTML = item
    ? `
      <span>${MODE_LABELS[state.mode]}</span>
      <span>${state.index + 1} / ${state.queue.length}</span>
      <span>${topicMeta ? topicMeta.label : 'All Topics'} · ${focusLabel()}</span>
    `
    : `
      <span>${MODE_LABELS[state.mode]}</span>
      <span>${countMastered(words)} / ${words.length} 已掌握</span>
      <span>${focusLabel()} · Ready for another round</span>
    `;
}

function renderStage() {
  const stage = document.getElementById('stage');
  const item = currentItem();
  const words = filteredWords();

  if (!words.length) {
    stage.innerHTML = `
      <div class="result-card">
        <h3>当前筛选没有词条</h3>
        <p>换一个等级或主题试试，或者回到 All Topics 模式继续刷词。</p>
      </div>
    `;
    return;
  }

  if (!item) {
    stage.innerHTML = `
      <div class="result-card">
        <h3>这轮已经完成</h3>
        <p>当前筛选下的词已经过完一轮。你可以重新开始，或者切换到其他主题继续复习。</p>
        <button class="primary-btn" id="restartBtn">重新开始本轮</button>
      </div>
    `;
    document.getElementById('restartBtn').addEventListener('click', () => {
      buildQueue();
      render();
    });
    return;
  }

  const wordState = getWordState(item);
  const topicMeta = getTopicMeta(item.topic);
  let body = '';

  if (state.mode === 'flashcard') {
    body = `
      <div class="prompt-label">Flashcard</div>
      <div class="headline">${item.word}</div>
      <div class="subline">${item.level === 'a2-key' ? 'A2 Key' : 'B1 Preliminary'} · ${topicMeta.label} · British audio ready</div>
      <div class="tool-row">
        <button class="secondary-btn" id="speakWordBtn">英式发音</button>
        <button class="secondary-btn" id="speakSentenceBtn">朗读例句</button>
      </div>
      <div class="meaning-card${state.reveal ? ' reveal' : ''}">
        <span class="section-label">中文释义</span>
        <strong>${item.meaning}</strong>
      </div>
      <div class="example-card">
        <span class="section-label">例句</span>
        <p>${item.example}</p>
      </div>
    `;
  }

  if (state.mode === 'spelling') {
    body = `
      <div class="prompt-label">Spell It</div>
      <div class="headline">${state.audioOnly ? 'Listen, then spell' : item.meaning}</div>
      <div class="subline">${topicMeta.label} · ${state.audioOnly ? '纯听模式已开启' : `首尾提示 ${maskWord(item.word)}`}</div>
      <div class="tool-row">
        <button class="secondary-btn" id="speakWordBtn">播放单词</button>
        <button class="secondary-btn" id="speakSentenceBtn">播放例句</button>
      </div>
      <div class="example-card">
        <span class="section-label">语境提示</span>
        <p>${state.audioOnly ? '先听发音，再尝试拼写。' : item.example}</p>
      </div>
      <div class="input-card">
        <label for="answerInput">写出英文单词</label>
        <input id="answerInput" type="text" value="${escapeHtml(state.answer)}" placeholder="Type the word">
      </div>
    `;
  }

  if (state.mode === 'dictation') {
    body = `
      <div class="prompt-label">Dictation</div>
      <div class="headline">Listen and type</div>
      <div class="subline">${topicMeta.label} · ${state.audioOnly ? '纯听模式：无文字提示' : '听单词和例句后再输入'}</div>
      <div class="tool-row">
        <button class="secondary-btn" id="speakWordBtn">播放单词</button>
        <button class="secondary-btn" id="speakSentenceBtn">播放例句</button>
      </div>
      <div class="input-card">
        <label for="answerInput">听写输入</label>
        <input id="answerInput" type="text" value="${escapeHtml(state.answer)}" placeholder="Type what you hear">
      </div>
      <div class="meaning-card${state.reveal ? ' reveal' : ''}">
        <span class="section-label">答案提示</span>
        <strong>${item.word}</strong>
        <p>${state.audioOnly ? item.example : item.meaning}</p>
      </div>
    `;
  }

  if (state.mode === 'cloze') {
    body = `
      <div class="prompt-label">Cloze</div>
      <div class="headline">${state.audioOnly ? 'Listen and complete' : item.meaning}</div>
      <div class="subline">${topicMeta.label} · ${state.audioOnly ? '先听例句，再填写单词' : '根据例句补全单词'}</div>
      <div class="tool-row">
        <button class="secondary-btn" id="speakSentenceBtn">播放例句</button>
      </div>
      <div class="example-card">
        <span class="section-label">例句挖空</span>
        <p>${state.audioOnly ? '文字提示已隐藏，请先播放例句。' : makeCloze(item.example, item.word)}</p>
      </div>
      <div class="input-card">
        <label for="answerInput">填入英文单词</label>
        <input id="answerInput" type="text" value="${escapeHtml(state.answer)}" placeholder="Fill in the blank">
      </div>
    `;
  }

  stage.innerHTML = `
    <div class="word-stage" data-mode="${state.mode}">
      <div class="stage-topline">
        <span class="topic-badge">${topicMeta.label}</span>
        <span class="status-badge">${wordState.mastered ? '熟词' : '待巩固'} · streak ${wordState.streak}</span>
        <div class="stage-actions">
          <button class="mini-btn${wordState.favorite ? ' active' : ''}" id="favoriteBtn">${wordState.favorite ? '已收藏' : '收藏'}</button>
        </div>
      </div>
      ${body}
    </div>
  `;

  document.getElementById('favoriteBtn').addEventListener('click', () => {
    const nextState = touchWordState(item);
    nextState.favorite = !nextState.favorite;
    saveProgress();
    scheduleCloudSync([item.key]);
    render();
    trackEvent('vocab_favorite_toggle', { word: item.word, topic: item.topic, favorite: nextState.favorite });
  });

  const speakWordBtn = document.getElementById('speakWordBtn');
  const speakSentenceBtn = document.getElementById('speakSentenceBtn');
  if (speakWordBtn) speakWordBtn.addEventListener('click', () => speakText(item.word));
  if (speakSentenceBtn) speakSentenceBtn.addEventListener('click', () => speakText(item.example));

  const input = document.getElementById('answerInput');
  if (input) {
    input.focus();
    input.addEventListener('input', (event) => {
      state.answer = event.target.value;
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (!state.feedback) submitTypingAnswer();
      }
    });
  }
}

function renderFeedback() {
  const box = document.getElementById('feedbackBox');
  if (!state.feedback) {
    box.innerHTML = '';
    box.className = 'feedback-box';
    return;
  }

  box.className = `feedback-box ${state.feedback.correct ? 'correct' : 'wrong'}`;
  box.innerHTML = `
    <strong>${state.feedback.correct ? '答对了' : '这次没答对'}</strong>
    <span>${state.feedback.message}</span>
  `;
}

function renderControls() {
  const controls = document.getElementById('controls');
  const item = currentItem();

  if (!item) {
    controls.innerHTML = '';
    return;
  }

  if (state.feedback) {
    controls.innerHTML = '<button class="primary-btn" id="continueBtn">继续下一个</button>';
    document.getElementById('continueBtn').addEventListener('click', () => {
      commitProgress(state.feedback.correct);
    });
    return;
  }

  if (state.mode === 'flashcard') {
    controls.innerHTML = `
      <button class="secondary-btn" id="toggleMeaningBtn">${state.reveal ? '收起释义' : '显示释义'}</button>
      <button class="ghost-btn" id="againBtn">再看一次</button>
      <button class="primary-btn" id="knownBtn">记住了</button>
    `;
    document.getElementById('toggleMeaningBtn').addEventListener('click', () => {
      state.reveal = !state.reveal;
      renderStage();
      renderControls();
      trackEvent('vocab_reveal_toggle', { mode: state.mode, reveal: state.reveal });
    });
    document.getElementById('againBtn').addEventListener('click', () => {
      commitProgress(false);
    });
    document.getElementById('knownBtn').addEventListener('click', () => {
      commitProgress(true);
    });
    return;
  }

  controls.innerHTML = `
    <button class="secondary-btn" id="revealBtn">直接看答案</button>
    <button class="ghost-btn" id="againBtn">不会，稍后再来</button>
    <button class="primary-btn" id="submitBtn">提交答案</button>
  `;

  document.getElementById('revealBtn').addEventListener('click', () => {
    state.reveal = true;
    state.feedback = {
      correct: false,
      message: `正确答案是 ${item.word}，意思是“${item.meaning}”。`,
    };
    renderStage();
    renderFeedback();
    renderControls();
    trackEvent('vocab_reveal_answer', { mode: state.mode, word: item.word, topic: item.topic });
  });

  document.getElementById('againBtn').addEventListener('click', () => {
    commitProgress(false);
  });

  document.getElementById('submitBtn').addEventListener('click', () => {
    submitTypingAnswer();
  });
}

function submitTypingAnswer() {
  const item = currentItem();
  if (!item) return;

  const expected = normalizeAnswer(item.word);
  const actual = normalizeAnswer(state.answer);
  const correct = actual === expected;
  state.reveal = true;
  state.feedback = correct
    ? { correct: true, message: `正确答案就是 ${item.word}。继续保持。` }
    : { correct: false, message: `正确答案是 ${item.word}，意思是“${item.meaning}”。` };

  renderStage();
  renderFeedback();
  renderControls();
}

function commitProgress(correct) {
  const item = currentItem();
  if (!item) return;

  const wordState = touchWordState(item);
  wordState.seen += 1;
  if (correct) {
    wordState.streak += 1;
    wordState.mastered = wordState.streak >= 2;
  } else {
    wordState.streak = 0;
    wordState.mastered = false;
    wordState.wrong += 1;
  }
  saveProgress();
  scheduleCloudSync([item.key]);

  if (correct) {
    state.index += 1;
  } else {
    const retryItem = state.queue.splice(state.index, 1)[0];
    const insertIndex = Math.min(state.index + 2, state.queue.length);
    state.queue.splice(insertIndex, 0, retryItem);
  }

  state.answer = '';
  state.reveal = false;
  state.feedback = null;
  render();
}

function renderPreview() {
  const preview = document.getElementById('previewGrid');
  const words = filteredWords().slice(0, 6);
  preview.innerHTML = words.map((item) => `
    <article class="preview-card">
      <div class="preview-word">${item.word}</div>
      <div class="preview-meta">${item.level === 'a2-key' ? 'A2 Key' : 'B1 Preliminary'} · ${getTopicMeta(item.topic).label}</div>
      <p>${item.meaning}</p>
    </article>
  `).join('');
}

function renderSources() {
  document.getElementById('sourceLinks').innerHTML = window.VOCAB_LIBRARY.sourceLinks.map((item) => `
    <a href="${item.url}" target="_blank" rel="noreferrer">${item.label}</a>
  `).join('');
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1800);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '刚刚';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function attachModeEvents() {
  document.querySelectorAll('[data-mode]').forEach((element) => {
    element.addEventListener('click', () => {
      state.mode = element.getAttribute('data-mode');
      state.answer = '';
      state.reveal = false;
      state.feedback = null;
      render();
      trackEvent('vocab_mode_change', { mode: state.mode });
    });
  });
}

function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (state.auth.token) headers.set('Authorization', `Bearer ${state.auth.token}`);
  return fetch(path, { ...options, headers });
}

async function verifyAuth() {
  if (!state.auth.token) {
    state.auth.status = 'guest';
    state.auth.message = '未登录，进度仅保存在当前浏览器。';
    return false;
  }

  try {
    const response = await apiFetch('/api/auth/me');
    if (!response.ok) throw new Error('unauthorized');
    const data = await response.json();
    state.auth.user = data.user || state.auth.user;
    if (state.auth.user) {
      localStorage.setItem('user', JSON.stringify(state.auth.user));
    }
    state.auth.status = 'ready';
    state.auth.message = `已连接云端进度，同步账号 ${state.auth.user?.username || ''}。`;
    trackEvent('vocab_sync_ready', { user: state.auth.user?.username || '' });
    return true;
  } catch {
    state.auth.status = 'guest';
    state.auth.message = '登录已失效，已切回本地模式。';
    state.auth.token = '';
    state.auth.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    trackEvent('vocab_sync_guest');
    return false;
  }
}

async function pullCloudProgress() {
  const response = await apiFetch('/api/vocab/progress');
  if (!response.ok) throw new Error('sync failed');

  const data = await response.json();
  const cloudProgress = migrateProgress(data.progress || {});
  const merged = {};
  const syncBack = {};
  const keys = new Set([...Object.keys(state.stats), ...Object.keys(cloudProgress)]);

  keys.forEach((wordKey) => {
    const item = state.wordByKey.get(wordKey);
    if (!item) return;
    const nextEntry = mergeEntry(state.stats[wordKey], cloudProgress[wordKey], item);
    merged[wordKey] = nextEntry;
    if (!entryEquals(nextEntry, cloudProgress[wordKey] ? normalizeStoredEntry(cloudProgress[wordKey], item) : null)) {
      syncBack[wordKey] = nextEntry;
    }
  });

  state.stats = merged;
  saveProgress();
  state.auth.lastSyncedAt = data.syncedAt || new Date().toISOString();
  state.auth.message = `已同步 ${Object.keys(merged).length} 个词条。`;

  if (Object.keys(syncBack).length) {
    await pushProgress(syncBack, true);
  }
}

function scheduleCloudSync(keys) {
  if (state.auth.status !== 'ready') return;
  keys.forEach((key) => state.pendingSyncKeys.add(key));
  state.auth.message = '本地进度已更新，等待同步...';
  renderSyncCard();

  clearTimeout(state.syncTimer);
  state.syncTimer = setTimeout(() => {
    flushCloudSync();
  }, SYNC_DEBOUNCE_MS);
}

async function flushCloudSync() {
  if (state.auth.status !== 'ready' || state.auth.syncing || !state.pendingSyncKeys.size) return;

  const payload = {};
  Array.from(state.pendingSyncKeys).forEach((key) => {
    if (state.stats[key]) payload[key] = state.stats[key];
  });
  state.pendingSyncKeys.clear();
  await pushProgress(payload, false);
}

async function pushProgress(progressMap, silent) {
  if (state.auth.status !== 'ready' || !Object.keys(progressMap).length) return;

  try {
    state.auth.syncing = true;
    renderSyncCard();
    const response = await apiFetch('/api/vocab/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ progress: progressMap }),
    });

    if (!response.ok) throw new Error('sync failed');
    const data = await response.json();
    state.auth.status = 'ready';
    state.auth.lastSyncedAt = data.syncedAt || new Date().toISOString();
    state.auth.message = `云端已保存 ${data.saved || 0} 条更新。`;
    if (!silent) showToast('云端进度已同步');
  } catch {
    state.auth.status = 'ready';
    state.auth.message = '云端同步失败，进度仍已保存在本地。';
    trackEvent('vocab_sync_failed', { pending: Object.keys(progressMap).length }, 'error');
    if (!silent) showToast('同步失败，已保留本地记录');
  } finally {
    state.auth.syncing = false;
    renderSyncCard();
  }
}

async function initCloudSync() {
  const valid = await verifyAuth();
  renderSyncCard();
  if (!valid) return;

  try {
    await pullCloudProgress();
  } catch {
    state.auth.status = 'ready';
    state.auth.message = '已登录，但云端进度暂时不可用。';
    trackEvent('vocab_sync_failed', { stage: 'initial_pull' }, 'error');
    renderSyncCard();
  }
}

function render() {
  renderFilters();
  renderSyncCard();
  renderDailyCard();
  renderHero();
  renderModeTabs();
  renderSessionMeta();
  renderStage();
  renderFeedback();
  renderControls();
  renderPreview();
}

document.addEventListener('DOMContentLoaded', async () => {
  prepareLibrary();
  state.stats = loadProgress();
  renderSources();
  attachModeEvents();
  buildQueue();
  trackEvent('vocab_session_start', {
    totalWords: state.libraryWords.length,
    hasLocalProgress: Object.keys(state.stats).length > 0,
  });
  render();
  await initCloudSync();
  buildQueue();
  render();
});
