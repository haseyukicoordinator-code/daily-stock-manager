const STORAGE_KEY = "daily-stock-manager-items";
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const UNIT_OPTIONS = ["個", "本", "箱", "袋", "枚", "ロール", "パック", "セット", "ml", "L", "g", "kg"];

const sampleItems = [
  { id: createId(), name: "食器用洗剤", category: "洗剤", stock: 1, unit: "本", note: "詰め替え用を買う" },
  { id: createId(), name: "トイレットペーパー", category: "紙類", stock: 3, unit: "ロール", note: "12ロール入りを買う" },
  { id: createId(), name: "ティッシュ", category: "紙類", stock: 1, unit: "箱", note: "リビング用" },
  { id: createId(), name: "レトルトカレー", category: "食品ストック", stock: 3, unit: "個", note: "非常食として保管" }
];

const form = document.querySelector("#item-form");
const editIdInput = document.querySelector("#edit-id");
const nameInput = document.querySelector("#item-name");
const categoryInput = document.querySelector("#item-category");
const stockInput = document.querySelector("#item-stock");
const unitInput = document.querySelector("#item-unit");
const noteInput = document.querySelector("#item-note");
const voiceButton = document.querySelector("#voice-button");
const voiceButtonText = voiceButton.querySelector("span:last-child");
const voiceStatus = document.querySelector("#voice-status");
const itemList = document.querySelector("#item-list");
const emptyMessage = document.querySelector("#empty-message");
const totalCount = document.querySelector("#total-count");
const needCount = document.querySelector("#need-count");
const submitButton = document.querySelector("#submit-button");
const cancelEditButton = document.querySelector("#cancel-edit-button");

let items = loadItems();
let recognition = null;
let isListening = false;
let heardSpeech = false;
let recognitionHadError = false;

setupVoiceInput();
renderItems();

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const itemData = {
    name: nameInput.value.trim(),
    category: categoryInput.value,
    stock: Number(stockInput.value),
    unit: unitInput.value,
    note: noteInput.value.trim()
  };

  if (!itemData.name) {
    nameInput.focus();
    return;
  }

  const editId = editIdInput.value;

  if (editId) {
    items = items.map((item) => {
      if (item.id !== editId) {
        return item;
      }

      return {
        ...item,
        ...itemData
      };
    });

    setVoiceStatus("登録内容を更新しました。", "success");
  } else {
    items.unshift({
      id: createId(),
      ...itemData
    });

    setVoiceStatus("商品を追加しました。", "success");
  }

  saveItems();
  renderItems();
  resetForm();
});

cancelEditButton.addEventListener("click", () => {
  resetForm();
  setVoiceStatus("編集をキャンセルしました。", "");
});

itemList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");

  if (!button) {
    return;
  }

  const id = button.dataset.id;
  const action = button.dataset.action;

  if (action === "increase") {
    updateStock(id, 1);
  }

  if (action === "decrease") {
    updateStock(id, -1);
  }

  if (action === "edit") {
    startEdit(id);
  }

  if (action === "delete") {
    deleteItem(id);
  }
});

function setupVoiceInput() {
  if (!window.isSecureContext) {
    voiceButton.disabled = true;
    setVoiceStatus("音声入力はHTTPSで利用できます。", "error");
    return;
  }

  if (!SpeechRecognition) {
    voiceButton.disabled = true;
    setVoiceStatus("このブラウザは音声入力に対応していません。Chromeでお試しください。", "error");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "ja-JP";
  recognition.interimResults = true;
  recognition.continuous = false;

  voiceButton.addEventListener("click", () => {
    if (isListening) {
      recognition.stop();
      return;
    }

    startVoiceRecognition();
  });

  recognition.addEventListener("start", () => {
    isListening = true;
    heardSpeech = false;
    recognitionHadError = false;
    voiceButton.classList.add("listening");
    voiceButton.setAttribute("aria-pressed", "true");
    voiceButtonText.textContent = "認識を停止";
    setVoiceStatus("音声認識中です。商品名・在庫数・単位を話してください。", "listening");
  });

  recognition.addEventListener("result", (event) => {
    const transcript = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join("")
      .trim();

    if (!transcript) {
      return;
    }

    heardSpeech = true;
    setVoiceStatus(`認識中：「${transcript}」`, "listening");

    const lastResult = event.results[event.results.length - 1];

    if (lastResult.isFinal) {
      applyVoiceResult(transcript);
    }
  });

  recognition.addEventListener("error", (event) => {
    recognitionHadError = true;
    setVoiceStatus(getVoiceErrorMessage(event.error), "error");
  });

  recognition.addEventListener("end", () => {
    isListening = false;
    voiceButton.classList.remove("listening");
    voiceButton.setAttribute("aria-pressed", "false");
    voiceButtonText.textContent = "音声で入力";

    if (!heardSpeech && !recognitionHadError) {
      setVoiceStatus("音声を聞き取れませんでした。もう一度お試しください。", "error");
    }
  });
}

function startVoiceRecognition() {
  setVoiceStatus("マイクを起動しています…", "listening");

  try {
    recognition.start();
  } catch {
    setVoiceStatus("音声入力を開始できませんでした。少し待ってからもう一度お試しください。", "error");
  }
}

function applyVoiceResult(transcript) {
  const parsedItem = parseVoiceInput(transcript);

  if (!parsedItem.name) {
    setVoiceStatus("商品名を認識できませんでした。例：トイレットペーパー 3ロール", "error");
    return;
  }

  nameInput.value = parsedItem.name;

  if (parsedItem.stock !== null) {
    stockInput.value = String(parsedItem.stock);
  }

  if (parsedItem.unit) {
    unitInput.value = parsedItem.unit;
  }

  const suggestedCategory = suggestCategory(parsedItem.name);

  if (suggestedCategory) {
    categoryInput.value = suggestedCategory;
  }

  const unit = parsedItem.unit || unitInput.value;
  const stockMessage = parsedItem.stock === null
    ? "在庫数は選択してください。"
    : `在庫数を${parsedItem.stock}${unit}にしました。`;

  setVoiceStatus(`「${parsedItem.name}」を入力しました。内容を確認して追加してください。${stockMessage}`, "success");
  noteInput.focus();
}

function parseVoiceInput(transcript) {
  const normalizedTranscript = normalizeNumbers(transcript)
    .replace(/[、。]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const unitPattern = UNIT_OPTIONS.join("|");
  const countPattern = new RegExp(`([0-9]+)\\s*(${unitPattern})?`, "i");
  const countMatch = normalizedTranscript.match(countPattern);

  const stock = countMatch ? Math.min(Number(countMatch[1]), 20) : null;
  const unit = countMatch && countMatch[2] ? countMatch[2] : "";

  const name = normalizedTranscript
    .replace(countPattern, " ")
    .replace(/(商品名|品名|在庫数|在庫|ストック|数量|数|単位)/g, " ")
    .replace(/(追加|登録|買う|買って|買い足し|あります|です|お願い|して)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { name, stock, unit };
}

function normalizeNumbers(value) {
  const fullWidthNumbers = "０１２３４５６７８９";
  let result = value.replace(/[０-９]/g, (number) => fullWidthNumbers.indexOf(number));

  const japaneseNumbers = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10
  };

  Object.entries(japaneseNumbers).forEach(([jp, num]) => {
    result = result.replaceAll(jp, String(num));
  });

  return result;
}

function suggestCategory(name) {
  const categoryKeywords = [
    { category: "洗剤", keywords: ["洗剤", "柔軟剤", "漂白剤", "せっけん", "石鹸"] },
    { category: "掃除用品", keywords: ["スポンジ", "ブラシ", "シート", "ほうき", "雑巾", "掃除"] },
    { category: "キッチン用品", keywords: ["キッチンペーパー", "ラップ", "アルミホイル", "保存袋", "キッチン"] },
    { category: "紙類", keywords: ["トイレット", "ティッシュ", "ペーパー", "紙"] },
    { category: "衛生用品", keywords: ["マスク", "消毒", "歯ブラシ", "歯磨き", "綿棒"] },
    { category: "食品ストック", keywords: ["レトルト", "缶詰", "カレー", "米", "パスタ", "水"] }
  ];

  const matchedCategory = categoryKeywords.find(({ keywords }) =>
    keywords.some((keyword) => name.includes(keyword))
  );

  return matchedCategory ? matchedCategory.category : "";
}

function setVoiceStatus(message, type = "") {
  voiceStatus.textContent = message;
  voiceStatus.className = type ? `voice-status ${type}` : "voice-status";
}

function getVoiceErrorMessage(errorName) {
  const messages = {
    "not-allowed": "マイクの使用が許可されていません。ブラウザの設定でマイクを許可してください。",
    "no-speech": "音声を聞き取れませんでした。もう一度ゆっくり話してください。",
    "audio-capture": "マイクが見つかりません。端末のマイク設定を確認してください。",
    aborted: "音声入力を中止しました。もう一度マイクボタンを押すと再開できます。",
    network: "ネットワークの問題で音声認識に失敗しました。接続を確認してください。"
  };

  return messages[errorName] || "音声認識に失敗しました。もう一度お試しください。";
}

function startEdit(id) {
  const item = items.find((currentItem) => currentItem.id === id);

  if (!item) {
    return;
  }

  editIdInput.value = item.id;
  nameInput.value = item.name;
  categoryInput.value = item.category;
  stockInput.value = String(Math.min(Number(item.stock) || 0, 20));
  unitInput.value = item.unit || "個";
  noteInput.value = item.note || "";

  submitButton.textContent = "更新する";
  cancelEditButton.hidden = false;

  form.scrollIntoView({ behavior: "smooth", block: "start" });
  nameInput.focus();
}

function createId() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadItems() {
  const storedItems = localStorage.getItem(STORAGE_KEY);

  if (!storedItems) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleItems));
    return sampleItems;
  }

  try {
    const parsedItems = JSON.parse(storedItems);
    return Array.isArray(parsedItems) ? parsedItems.map(normalizeItem) : sampleItems;
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleItems));
    return sampleItems;
  }
}

function normalizeItem(item) {
  return {
    ...item,
    unit: UNIT_OPTIONS.includes(item.unit) ? item.unit : "個",
    stock: Math.min(Number(item.stock) || 0, 20)
  };
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function resetForm() {
  form.reset();
  editIdInput.value = "";
  stockInput.value = "1";
  unitInput.value = "個";
  submitButton.textContent = "追加する";
  cancelEditButton.hidden = true;
  nameInput.focus();
}

function renderItems() {
  itemList.innerHTML = "";

  totalCount.textContent = items.length;
  needCount.textContent = items.filter(isNeedRestock).length;
  emptyMessage.classList.toggle("show", items.length === 0);

  items.forEach((item) => {
    const itemElement = document.createElement("article");
    const needsRestock = isNeedRestock(item);

    itemElement.className = needsRestock ? "stock-item need-restock" : "stock-item";

    const statusText = needsRestock ? "買い足し必要" : "在庫OK";
    const statusClass = needsRestock ? "status-badge need" : "status-badge";
    const noteHtml = item.note ? `<p class="item-note">メモ：${escapeHtml(item.note)}</p>` : "";

    itemElement.innerHTML = `
      <div class="item-main">
        <div class="item-title-row">
          <h3>${escapeHtml(item.name)}</h3>
          <span class="category-badge">${escapeHtml(item.category)}</span>
        </div>

        <div class="stock-overview">
          <div>
            <span class="stock-label">現在</span>
            <strong class="stock-value">${formatQuantity(item.stock, item.unit)}</strong>
          </div>
          <span class="${statusClass}">${statusText}</span>
        </div>

        ${noteHtml}
      </div>

      <div class="item-actions" aria-label="${escapeHtml(item.name)}の操作">
        <button class="stock-button" type="button" data-action="decrease" data-id="${item.id}" ${item.stock === 0 ? "disabled" : ""}>−1</button>
        <button class="stock-button" type="button" data-action="increase" data-id="${item.id}">＋1</button>
        <button class="edit-button" type="button" data-action="edit" data-id="${item.id}">編集</button>
        <button class="delete-button" type="button" data-action="delete" data-id="${item.id}">削除</button>
      </div>
    `;

    itemList.appendChild(itemElement);
  });
}

function formatQuantity(value, unit) {
  return `${value}${unit}`;
}

function isNeedRestock(item) {
  return Number(item.stock) === 0;
}

function updateStock(id, amount) {
  items = items.map((item) => {
    if (item.id !== id) {
      return item;
    }

    return {
      ...item,
      stock: Math.max(0, Math.min(20, Number(item.stock) + amount))
    };
  });

  saveItems();
  renderItems();
}

function deleteItem(id) {
  const item = items.find((currentItem) => currentItem.id === id);

  if (!item || !confirm(`「${item.name}」を削除しますか？`)) {
    return;
  }

  items = items.filter((currentItem) => currentItem.id !== id);
  saveItems();
  renderItems();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
