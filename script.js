const STORAGE_KEY = "daily-stock-manager-items";

const sampleItems = [
  {
    id: createId(),
    name: "食器用洗剤",
    category: "洗剤",
    stock: 1,
    minimum: 2,
    note: "詰め替え用を買う"
  },
  {
    id: createId(),
    name: "トイレットペーパー",
    category: "紙類",
    stock: 6,
    minimum: 4,
    note: "12ロール入りをストック"
  },
  {
    id: createId(),
    name: "キッチンペーパー",
    category: "キッチン用品",
    stock: 1,
    minimum: 1,
    note: "残り1個になったら買い足し"
  },
  {
    id: createId(),
    name: "レトルトカレー",
    category: "食品ストック",
    stock: 3,
    minimum: 2,
    note: "非常食として保管"
  }
];

const form = document.querySelector("#item-form");
const nameInput = document.querySelector("#item-name");
const categoryInput = document.querySelector("#item-category");
const stockInput = document.querySelector("#item-stock");
const minimumInput = document.querySelector("#item-minimum");
const noteInput = document.querySelector("#item-note");
const itemList = document.querySelector("#item-list");
const emptyMessage = document.querySelector("#empty-message");
const totalCount = document.querySelector("#total-count");
const needCount = document.querySelector("#need-count");

let items = loadItems();
renderItems();

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const newItem = {
    id: createId(),
    name: nameInput.value.trim(),
    category: categoryInput.value,
    stock: Number(stockInput.value),
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
  form.reset();
  stockInput.value = 1;
  minimumInput.value = 1;
  nameInput.focus();
});

itemList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");

  if (!button) {
    return;
  }

  const id = button.dataset.id;
  const action = button.dataset.action;

  if (action === "increase") {
    changeStock(id, 1);
  }

  if (action === "decrease") {
    changeStock(id, -1);
  }

  if (action === "delete") {
    deleteItem(id);
  }
});

function createId() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadItems() {
  const storedItems = localStorage.getItem(STORAGE_KEY);

  if (!storedItems) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleItems));
    return sampleItems;
  }

  return JSON.parse(storedItems);
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function renderItems() {
  itemList.innerHTML = "";

  totalCount.textContent = items.length;
  needCount.textContent = items.filter(isNeedRestock).length;
  emptyMessage.classList.toggle("show", items.length === 0);

  items.forEach((item) => {
    const itemElement = document.createElement("article");
    itemElement.className = "stock-item";

    const statusText = isNeedRestock(item) ? "買い足し必要" : "在庫OK";
    const statusClass = isNeedRestock(item) ? "status-badge need" : "status-badge";
    const noteHtml = item.note ? `<p class="item-note">メモ：${escapeHtml(item.note)}</p>` : "";

    itemElement.innerHTML = `
      <div class="item-main">
        <div class="item-title-row">
          <h3>${escapeHtml(item.name)}</h3>
          <span class="category-badge">${escapeHtml(item.category)}</span>
          <span class="${statusClass}">${statusText}</span>
        </div>
        <p class="item-meta">
          <span>現在：${item.stock} 個</span>
          <span>最低：${item.minimum} 個</span>
        </p>
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

function isNeedRestock(item) {
  return item.stock <= item.minimum;
}

function changeStock(id, amount) {
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
