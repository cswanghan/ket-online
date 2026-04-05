const STORAGE_KEY = 'ket-vocab-progress-v2';
const MODE_LABELS = {
  flashcard: '词卡模式',
  spelling: '拼写模式',
  dictation: '听写模式',
  cloze: '例句挖空',
};

const state = {
  level: 'all',
  topic: 'all',
  mode: 'flashcard',
  queue: [],
  index: 0,
  reveal: false,
  answer: '',
  feedback: null,
  stats: loadProgress(),
};

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.stats));
}

function getWordState(item) {
  state.stats[item.word] = state.stats[item.word] || {
    seen: 0,
    streak: 0,
    mastered: false,
    wrong: 0,
  };
  return state.stats[item.word];
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

function filteredWords() {
  return window.VOCAB_LIBRARY.words.filter((item) => {
    const levelOk = state.level === 'all' || item.level === state.level;
    const topicOk = state.topic === 'all' || item.topic === state.topic;
    return levelOk && topicOk;
  });
}

function wordsForLevel(levelId = state.level) {
  return window.VOCAB_LIBRARY.words.filter((item) => levelId === 'all' || item.level === levelId);
}

function countMastered(words) {
  return words.filter((item) => getWordState(item).mastered).length;
}

function buildQueue() {
  const pool = filteredWords();
  state.queue = [...pool].sort((left, right) => {
    const leftState = getWordState(left);
    const rightState = getWordState(right);

    if (leftState.mastered !== rightState.mastered) return leftState.mastered ? 1 : -1;
    if (leftState.streak !== rightState.streak) return leftState.streak - rightState.streak;
    if (leftState.seen !== rightState.seen) return leftState.seen - rightState.seen;
    return left.word.localeCompare(right.word);
  });
  state.index = 0;
  state.answer = '';
  state.reveal = false;
  state.feedback = null;
}

function currentItem() {
  return state.queue[state.index] || null;
}

function maskWord(word) {
  if (word.length <= 4) return `${word[0]}${'_'.repeat(word.length - 1)}`;
  return `${word[0]}${'_'.repeat(word.length - 2)}${word[word.length - 1]}`;
}

function makeCloze(example, word) {
  const pattern = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return example.replace(pattern, '______');
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
    });
  });

  const topicContainer = document.getElementById('topicFilters');
  const availableWords = wordsForLevel();
  const topicCounts = new Map();

  availableWords.forEach((item) => {
    topicCounts.set(item.topic, (topicCounts.get(item.topic) || 0) + 1);
  });

  const topicButtons = [
    {
      id: 'all',
      label: 'All Topics',
      count: availableWords.length,
    },
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
    });
  });
}

function renderHero() {
  const words = filteredWords();
  const mastered = countMastered(words);
  const topicCount = state.topic === 'all'
    ? new Set(words.map((item) => item.topic)).size
    : 1;
  const levelMeta = getLevelMeta();
  const topicMeta = state.topic === 'all' ? null : getTopicMeta(state.topic);

  document.getElementById('heroEyebrow').textContent = topicMeta
    ? `${levelMeta.label} · ${topicMeta.label}`
    : `${levelMeta.label} · Cambridge Topic Vocabulary`;
  document.getElementById('heroTitle').textContent = topicMeta
    ? `${topicMeta.label} Word Studio`
    : 'Official Topic Vocabulary Studio';
  document.getElementById('heroDesc').textContent = topicMeta
    ? `当前筛选的是 ${topicMeta.label} 主题词。可以切换词卡、拼写、听写和例句挖空四种训练模式。`
    : `词汇按 Cambridge English 官方 A2 Key / B1 Preliminary 主题维度组织，支持按等级与主题筛选。`;

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
      <span>${topicMeta ? topicMeta.label : 'All Topics'}</span>
    `
    : `
      <span>${MODE_LABELS[state.mode]}</span>
      <span>${countMastered(words)} / ${words.length} 已掌握</span>
      <span>Ready for another round</span>
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
      <div class="subline">${item.level === 'a2-key' ? 'A2 Key' : 'B1 Preliminary'} · ${topicMeta.label}</div>
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
      <div class="headline">${item.meaning}</div>
      <div class="subline">${topicMeta.label} · 首尾提示 ${maskWord(item.word)}</div>
      <div class="example-card">
        <span class="section-label">语境提示</span>
        <p>${item.example}</p>
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
      <div class="subline">${topicMeta.label} · 听单词和例句后再输入</div>
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
        <p>${item.meaning}</p>
      </div>
    `;
  }

  if (state.mode === 'cloze') {
    body = `
      <div class="prompt-label">Cloze</div>
      <div class="headline">${item.meaning}</div>
      <div class="subline">${topicMeta.label} · 根据例句补全单词</div>
      <div class="example-card">
        <span class="section-label">例句挖空</span>
        <p>${makeCloze(item.example, item.word)}</p>
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
      </div>
      ${body}
    </div>
  `;

  if (state.mode === 'dictation') {
    document.getElementById('speakWordBtn').addEventListener('click', () => speakText(item.word));
    document.getElementById('speakSentenceBtn').addEventListener('click', () => speakText(item.example));
  }

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
    controls.innerHTML = `
      <button class="primary-btn" id="continueBtn">继续下一个</button>
    `;
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

  const wordState = getWordState(item);
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

function attachModeEvents() {
  document.querySelectorAll('[data-mode]').forEach((element) => {
    element.addEventListener('click', () => {
      state.mode = element.getAttribute('data-mode');
      state.answer = '';
      state.reveal = false;
      state.feedback = null;
      render();
    });
  });
}

function render() {
  renderFilters();
  renderHero();
  renderModeTabs();
  renderSessionMeta();
  renderStage();
  renderFeedback();
  renderControls();
  renderPreview();
}

document.addEventListener('DOMContentLoaded', () => {
  renderSources();
  attachModeEvents();
  buildQueue();
  render();
});
