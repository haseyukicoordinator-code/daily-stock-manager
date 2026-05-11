const STORAGE_KEY = "daily-stock-manager-items";
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const UNIT_OPTIONS = ["個", "本", "箱", "袋", "枚", "ロール", "パック", "セット", "ml", "L", "g", "kg"];
const UNIT_ALIASES = {
  こ: "個",
  つ: "個",
  ほん: "本",
  はこ: "箱",
  ふくろ: "袋",
  まい: "枚",
  ろーる: "ロール",
  ぱっく: "パック",
  せっと: "セット",
  ミリ: "ml",
  ミリリットル: "ml",
  ｍｌ: "ml",
  リットル: "L",
  ｌ: "L",
  l: "L",
  グラム: "g",
  ｇ: "g",
  キロ: "kg",
  キログラム: "kg",
  ｋｇ: "kg"
};

const sampleItems = [
  {
    id: createId(),
    name: "食器用洗剤",
    category: "洗剤",
    stock: 1,
    unit: "本",
    minimum: 2,
    note: "詰め替え用を買う"
  },
  {
    id: createId(),
    name: "トイレットペーパー",
    category: "紙類",
    stock: 3,
    unit: "ロール",
    minimum: 4,
    note: "残り少なくなったら12ロール入りを買う"
  },
  {
    id: createId(),
    name: "ティッシュ",
    category: "紙類",
    stock: 1,
    unit: "箱",
    minimum: 2,
    note: "リビング用"
  },
  {
    id: createId(),
    name: "レトルトカレー",
    category: "食品ストック",
    stock: 3,
    unit: "個",
    minimum: 2,
    note: "非常食として保管"
  }
];

const form = document.querySelector("#item-form");
const nameInput = document.querySelector("#item-name");
const categoryInput = document.querySelector("#item-category");
const stockInput = document.querySelector("#item-stock");
const unitInput = document.querySelector("#item-unit");
const minimumInput = document.querySelector("#item-minimum");
const noteInput = document.querySelector("#item-note");
const voiceButton = document.querySelector("#voice-button");
const voiceButtonText = voiceButton.querySelector("span:last-child");
const voiceStatus = document.querySelector("#voice-status");
const itemList = document.querySelector("#item-list");
const emptyMessage = document.querySelector("#empty-message");
const totalCount = document.querySelector("#total-count");
const needCount = document.querySelector("#need-count");

let items = loadItems();
let recognition = null;
let isListening = false;
let heardSpeech = false;
let recognitionHadError = false;

setupVoiceInput();
registerServiceWorker();
renderItems();

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const newItem = {
    id: createId(),
    name: nameInput.value.trim(),
    category: categoryInput.value,
    stock: Number(stockInput.value),
    unit: unitInput.value,
    minimum: Number(minimumInput.value),
    note: noteInput.value.trim()
  };

  if (!newItem.name) {
    nameInput.focus();
    return;
  }

  items.unshift(newItem);
  saveItems();
  renderItems();
  resetForm();
  setVoiceStatus("商品を追加しました。続けて音声入力もできます。", "success");
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

  if (action === "delete") {
    deleteItem(id);
  }
});

function setupVoiceInput() {
  if (!window.isSecureContext) {
    voiceButton.disabled = true;
    setVoiceStatus("音声入力はHTTPSまたはlocalhostで利用できます。", "error");
    return;
  }

  if (!SpeechRecognition) {
    voiceButton.disabled = true;
    setVoiceStatus("このブラウザは音声入力に対応していません。ChromeやSafariなどでお試しください。", "error");
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
      setVoiceStatus("音声を聞き取れませんでした。もう一度マイクボタンを押して話してください。", "error");
    }
  });
}

function startVoiceRecognition() {
  setVoiceStatus("マイクを起動しています…", "listening");

  try {
    recognition.start();
  } catch (error) {
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
    stockInput.value = parsedItem.stock;
  }

  if (parsedItem.unit) {
    unitInput.value = parsedItem.unit;
  }

  if (parsedItem.minimum !== null) {
    minimumInput.value = parsedItem.minimum;
  }

  const suggestedCategory = suggestCategory(parsedItem.name);
  if (suggestedCategory) {
    categoryInput.value = suggestedCategory;
  }

  const stockMessage = parsedItem.stock === null
    ? "在庫数は手入力してください。"
    : `在庫数を${parsedItem.stock}${parsedItem.unit || unitInput.value}にしました。`;
  const minimumMessage = parsedItem.minimum === null ? "" : ` 最低必要数を${parsedItem.minimum}${parsedItem.unit || unitInput.value}にしました。`;
  setVoiceStatus(`「${parsedItem.name}」を入力しました。内容を確認して追加してください。${stockMessage}${minimumMessage}`, "success");
  minimumInput.focus();
}

function parseVoiceInput(transcript) {
  const normalizedTranscript = normalizeNumbers(transcript)
    .replace(/[、。]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const unitPattern = getUnitPattern();
  const countPattern = new RegExp(`([0-9]+(?:\\.[0-9]+)?)\\s*(${unitPattern})?`, "i");
  const minimumPattern = new RegExp(`(最低必要数|最低|最小|必要)\\s*(は|が|を|:|：)?\\s*([0-9]+(?:\\.[0-9]+)?)\\s*(${unitPattern})?`, "i");
  const minimumMatch = normalizedTranscript.match(minimumPattern);
  const minimum = minimumMatch ? Number(minimumMatch[3]) : null;
  const textWithoutMinimum = normalizedTranscript.replace(minimumPattern, " ");
  const countMatch = textWithoutMinimum.match(countPattern);
  const stock = countMatch ? Number(countMatch[1]) : null;
  const unit = normalizeUnit((countMatch && countMatch[2]) || (minimumMatch && minimumMatch[4]) || "");
  const name = textWithoutMinimum
    .replace(/(商品名|品名|在庫数|在庫|ストック|数量|数|単位)\s*(は|が|を|:|：)?/g, " ")
    .replace(countPattern, " ")
    .replace(/(追加|登録|買う|買って|買い足し|あります|です|お願い|して)/g, " ")
    .replace(/(^|\s)(を|は|が|の|で)(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(を|は|が|の|で)+/, "")
    .replace(/(を|は|が|の|で)+$/, "")
    .trim();

  return { name, stock, unit, minimum };
}

function getUnitPattern() {
  return [...UNIT_OPTIONS, ...Object.keys(UNIT_ALIASES)]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
}

function normalizeUnit(unit) {
  return UNIT_ALIASES[unit] || unit || "";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeNumbers(value) {
  const fullWidthNumbers = "０１２３４５６７８９";
  const halfWidthValue = value.replace(/[０-９]/g, (number) => fullWidthNumbers.indexOf(number));

  return halfWidthValue.replace(/[一二三四五六七八九十]+/g, (numberText) => {
    const number = parseJapaneseNumber(numberText);
    return number === null ? numberText : String(number);
  });
}

function parseJapaneseNumber(numberText) {
  const numberMap = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  };

  if (numberText === "十") {
    return 10;
  }

  if (numberText.includes("十")) {
    const [tensText, onesText] = numberText.split("十");
    const tens = tensText ? numberMap[tensText] : 1;
    const ones = onesText ? numberMap[onesText] : 0;

    if (!tens || ones === undefined) {
      return null;
    }

    return tens * 10 + ones;
  }

  return numberMap[numberText] || null;
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

  const matchedCategory = categoryKeywords.find(({ keywords }) => keywords.some((keyword) => name.includes(keyword)));
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
  } catch (error) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleItems));
    return sampleItems;
  }
}

function normalizeItem(item) {
  return {
    ...item,
    unit: UNIT_OPTIONS.includes(item.unit) ? item.unit : "個",
    stock: Number(item.stock) || 0,
    minimum: Number(item.minimum) || 0
  };
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function resetForm() {
  form.reset();
  stockInput.value = 1;
  unitInput.value = "個";
  minimumInput.value = 1;
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
          <div>
            <span class="stock-label">最低</span>
            <strong class="minimum-value">${formatQuantity(item.minimum, item.unit)}</strong>
          </div>
          <span class="${statusClass}">${statusText}</span>
        </div>
        ${noteHtml}
      </div>
      <div class="item-actions" aria-label="${escapeHtml(item.name)}の操作">
        <button class="stock-button" type="button" data-action="decrease" data-id="${item.id}" ${item.stock === 0 ? "disabled" : ""}>−1</button>
        <button class="stock-button" type="button" data-action="increase" data-id="${item.id}">＋1</button>
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
  return item.stock <= item.minimum;
}

function updateStock(id, amount) {
  items = items.map((item) => {
    if (item.id !== id) {
      return item;
    }

    return {
      ...item,
      stock: Math.max(0, item.stock + amount)
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

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js");
  });
}
