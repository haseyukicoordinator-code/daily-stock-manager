const STORAGE_KEY = "daily-stock-manager-items";

const itemForm = document.getElementById("item-form");
const itemList = document.getElementById("item-list");
const emptyMessage = document.getElementById("empty-message");

const totalCount = document.getElementById("total-count");
const needCount = document.getElementById("need-count");

const voiceButton = document.getElementById("voice-button");
const voiceStatus = document.getElementById("voice-status");

const items = loadItems();

renderItems();

itemForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const item = {
    id: crypto.randomUUID(),
    name: document.getElementById("item-name").value.trim(),
    category: document.getElementById("item-category").value,
    stock: Number(document.getElementById("item-stock").value),
    minimum: Number(document.getElementById("item-minimum").value),
    note: document.getElementById("item-note").value.trim(),
  };

  items.push(item);

  saveItems();
  renderItems();

  itemForm.reset();

  document.getElementById("item-stock").value = 1;
  document.getElementById("item-minimum").value = 1;
});

function renderItems() {
  itemList.innerHTML = "";

  if (items.length === 0) {
    emptyMessage.style.display = "block";
  } else {
    emptyMessage.style.display = "none";
  }

  let shortageCount = 0;

  items.forEach((item) => {
    if (item.stock <= item.minimum) {
      shortageCount++;
    }

    const card = document.createElement("article");
    card.className = "item-card";

    card.innerHTML = `
      <div class="item-header">
        <div>
          <h3>${escapeHtml(item.name)}</h3>
          <p class="category">${escapeHtml(item.category)}</p>
        </div>
      </div>

      <div class="stock-row">
        <button class="stock-button decrease">−1</button>
        <span class="stock-value">${item.stock}</span>
        <button class="stock-button increase">＋1</button>
      </div>

      <p class="minimum">
        最低必要数：${item.minimum}
      </p>

      ${
        item.note
          ? `<p class="note">${escapeHtml(item.note)}</p>`
          : ""
      }

      <button class="delete-button">
        削除
      </button>
    `;

    card.querySelector(".increase").addEventListener("click", () => {
      item.stock++;
      saveItems();
      renderItems();
    });

    card.querySelector(".decrease").addEventListener("click", () => {
      if (item.stock > 0) {
        item.stock--;
      }

      saveItems();
      renderItems();
    });

    card.querySelector(".delete-button").addEventListener("click", () => {
      const index = items.findIndex((target) => target.id === item.id);

      if (index >= 0) {
        items.splice(index, 1);
      }

      saveItems();
      renderItems();
    });

    itemList.appendChild(card);
  });

  totalCount.textContent = items.length;
  needCount.textContent = shortageCount;
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function loadItems() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return [];
  }

  try {
    return JSON.parse(saved);
  } catch {
    return [];
  }
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/* =========================
   音声入力
========================= */

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
  const recognition = new SpeechRecognition();

  recognition.lang = "ja-JP";
  recognition.interimResults = false;
  recognition.continuous = false;

  voiceButton.addEventListener("click", () => {
    recognition.start();

    voiceStatus.textContent =
      "音声を認識中です…";

    voiceButton.disabled = true;
  });

  recognition.addEventListener("result", (event) => {
    const transcript =
      event.results[0][0].transcript;

    voiceStatus.textContent =
      `認識結果：「${transcript}」`;

    applyVoiceInput(transcript);
  });

  recognition.addEventListener("end", () => {
    voiceButton.disabled = false;
  });

  recognition.addEventListener("error", () => {
    voiceStatus.textContent =
      "音声認識に失敗しました。";
  });
} else {
  voiceStatus.textContent =
    "このブラウザは音声入力に対応していません。";
}

function applyVoiceInput(text) {
  const numberMatch = text.match(/\d+/);

  const stock = numberMatch
    ? Number(numberMatch[0])
    : 1;

  const name = text
    .replace(/\d+/g, "")
    .replace(/個|本|つ/g, "")
    .replace(/追加/g, "")
    .trim();

  if (name) {
    document.getElementById("item-name").value =
      name;
  }

  document.getElementById("item-stock").value =
    stock;
}
