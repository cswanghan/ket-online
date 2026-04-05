const STORAGE_KEY = 'ket-vocab-progress-v1';

const state = {
  deckId: window.VOCAB_DECKS[0].id,
  queue: [],
  index: 0,
  showMeaning: false,
  mode: 'flashcard',
  typingValue: '',
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

function getDeck(deckId = state.deckId) {
  return window.VOCAB_DECKS.find((item) => item.id === deckId) || window.VOCAB_DECKS[0];
}

function getDeckStats(deckId = state.deckId) {
  const deck = getDeck(deckId);
  const deckState = state.stats[deckId] || {};
  const learned = deck.words.filter((item) => deckState[item.word]?.learned).length;
  const reviewed = deck.words.reduce((sum, item) => sum + (deckState[item.word]?.seen || 0), 0);

  return {
    learned,
    reviewed,
    total: deck.words.length,
  };
}

function ensureDeckState(deckId, word) {
  state.stats[deckId] = state.stats[deckId] || {};
  state.stats[deckId][word] = state.stats[deckId][word] || { seen: 0, learned: false, streak: 0 };
  return state.stats[deckId][word];
}

function buildQueue(deckId = state.deckId) {
  const deck = getDeck(deckId);
  const deckState = state.stats[deckId] || {};

  const sorted = [...deck.words].sort((left, right) => {
    const leftState = deckState[left.word] || { learned: false, seen: 0, streak: 0 };
    const rightState = deckState[right.word] || { learned: false, seen: 0, streak: 0 };

    if (leftState.learned !== rightState.learned) return leftState.learned ? 1 : -1;
    if (leftState.streak !== rightState.streak) return leftState.streak - rightState.streak;
    return leftState.seen - rightState.seen;
  });

  state.queue = sorted;
  state.index = 0;
  state.showMeaning = false;
  state.typingValue = '';
}

function currentCard() {
  return state.queue[state.index] || null;
}

function maskWord(word) {
  if (word.length <= 3) return `${word[0]}${'_'.repeat(word.length - 1)}`;
  return `${word.slice(0, 1)}${'_'.repeat(word.length - 2)}${word.slice(-1)}`;
}

function renderDeckList() {
  const container = document.getElementById('deckList');
  container.innerHTML = window.VOCAB_DECKS.map((deck) => {
    const stats = getDeckStats(deck.id);
    const active = deck.id === state.deckId;
    return `
      <button class="deck-pill${active ? ' active' : ''}" data-deck-id="${deck.id}">
        <span class="deck-pill-label">${deck.examLabel}</span>
        <strong>${deck.title}</strong>
        <span>${stats.learned}/${stats.total} 掌握</span>
      </button>
    `;
  }).join('');

  container.querySelectorAll('[data-deck-id]').forEach((element) => {
    element.addEventListener('click', () => {
      state.deckId = element.getAttribute('data-deck-id');
      buildQueue();
      render();
    });
  });
}

function renderOverview() {
  const deck = getDeck();
  const stats = getDeckStats();
  document.getElementById('heroEyebrow').textContent = `${deck.examLabel} · ${deck.subtitle}`;
  document.getElementById('heroTitle').textContent = `${deck.title} Vocabulary Studio`;
  document.getElementById('heroDesc').textContent = deck.description;
  document.getElementById('overviewStats').innerHTML = `
    <div class="metric"><span class="metric-num">${stats.total}</span><span class="metric-label">词汇量</span></div>
    <div class="metric"><span class="metric-num">${stats.learned}</span><span class="metric-label">已掌握</span></div>
    <div class="metric"><span class="metric-num">${stats.reviewed}</span><span class="metric-label">复习次数</span></div>
  `;
}

function renderStage() {
  const deck = getDeck();
  const card = currentCard();
  const deckState = state.stats[state.deckId] || {};
  const progress = getDeckStats();
  const completed = state.index >= state.queue.length;
  const stage = document.getElementById('stage');

  document.getElementById('sessionMeta').innerHTML = completed
    ? `<span>${deck.examLabel}</span><span>Session Complete</span>`
    : `<span>${deck.examLabel}</span><span>${state.index + 1} / ${state.queue.length}</span>`;

  if (completed || !card) {
    stage.innerHTML = `
      <div class="session-complete">
        <h3>这一组已经刷完了</h3>
        <p>你已经完成本轮复习。可以重新开始一轮，或者切换到其他级别继续背。</p>
        <div class="complete-metrics">
          <span>${progress.learned}/${progress.total} 已掌握</span>
          <span>${progress.reviewed} 次复习</span>
        </div>
        <button class="primary-btn" id="restartDeckBtn">再来一轮</button>
      </div>
    `;
    document.getElementById('restartDeckBtn').addEventListener('click', () => {
      buildQueue();
      render();
    });
    return;
  }

  const cardState = deckState[card.word] || { seen: 0, learned: false, streak: 0 };
  const modeClass = state.mode === 'spelling' ? ' typing-mode' : '';

  stage.innerHTML = `
    <div class="card-shell${modeClass}" style="--deck-color:${deck.color}">
      <div class="card-topline">
        <span class="card-chip">${deck.subtitle}</span>
        <span class="card-state">${cardState.learned ? '熟悉' : '待巩固'} · streak ${cardState.streak}</span>
      </div>
      <div class="card-word-block">
        <div class="card-word">${state.mode === 'spelling' ? maskWord(card.word) : card.word}</div>
        <div class="card-phonetic">${card.phonetic}</div>
      </div>
      <div class="card-meaning${state.showMeaning ? ' reveal' : ''}">
        <div class="meaning-label">中文释义</div>
        <div class="meaning-value">${card.meaning}</div>
      </div>
      <div class="card-example">
        <div class="meaning-label">例句</div>
        <p>${card.example}</p>
      </div>
      <div class="typing-panel${state.mode === 'spelling' ? ' active' : ''}">
        <label for="spellingInput">拼写回忆</label>
        <input id="spellingInput" type="text" value="${escapeHtml(state.typingValue)}" placeholder="输入完整单词">
        <div class="typing-hint">先看音标和首尾字母，再尝试完整拼写。</div>
      </div>
    </div>
  `;

  if (state.mode === 'spelling') {
    const input = document.getElementById('spellingInput');
    input.focus();
    input.addEventListener('input', (event) => {
      state.typingValue = event.target.value;
    });
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderControls() {
  const card = currentCard();
  const controls = document.getElementById('controls');

  if (!card) {
    controls.innerHTML = '';
    return;
  }

  controls.innerHTML = `
    <button class="secondary-btn" id="toggleMeaningBtn">${state.showMeaning ? '收起释义' : '显示释义'}</button>
    <button class="secondary-btn" id="modeBtn">${state.mode === 'flashcard' ? '切换拼写模式' : '切回词卡模式'}</button>
    <button class="ghost-btn" id="againBtn">再看一次</button>
    <button class="primary-btn" id="knownBtn">${state.mode === 'spelling' ? '提交拼写' : '记住了'}</button>
  `;

  document.getElementById('toggleMeaningBtn').addEventListener('click', () => {
    state.showMeaning = !state.showMeaning;
    renderStage();
    renderControls();
  });

  document.getElementById('modeBtn').addEventListener('click', () => {
    state.mode = state.mode === 'flashcard' ? 'spelling' : 'flashcard';
    state.typingValue = '';
    renderStage();
    renderControls();
  });

  document.getElementById('againBtn').addEventListener('click', () => {
    markWord(false);
  });

  document.getElementById('knownBtn').addEventListener('click', () => {
    if (state.mode === 'spelling') {
      const typed = state.typingValue.trim().toLowerCase();
      if (typed !== card.word.toLowerCase()) {
        state.showMeaning = true;
        renderStage();
        renderControls();
        showToast(`拼写还差一点，正确答案是 ${card.word}`);
        markWord(false);
        return;
      }
    }
    markWord(true);
  });
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1800);
}

function markWord(learned) {
  const card = currentCard();
  if (!card) return;

  const itemState = ensureDeckState(state.deckId, card.word);
  itemState.seen += 1;
  itemState.streak = learned ? itemState.streak + 1 : 0;
  itemState.learned = learned ? itemState.streak >= 2 : false;
  saveProgress();

  if (!learned) {
    const againCard = state.queue.splice(state.index, 1)[0];
    const insertIndex = Math.min(state.index + 2, state.queue.length);
    state.queue.splice(insertIndex, 0, againCard);
  } else {
    state.index += 1;
  }

  state.showMeaning = false;
  state.typingValue = '';
  render();
}

function renderInsights() {
  const deck = getDeck();
  const cards = deck.words.slice(0, 3).map((item) => `
    <article class="insight-card">
      <div class="insight-word">${item.word}</div>
      <div class="insight-meaning">${item.meaning}</div>
      <p>${item.example}</p>
    </article>
  `).join('');
  document.getElementById('insights').innerHTML = cards;
}

function render() {
  renderDeckList();
  renderOverview();
  renderStage();
  renderControls();
  renderInsights();
}

document.addEventListener('DOMContentLoaded', () => {
  buildQueue();
  render();
});
