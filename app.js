// =====================
// CONSTANTES
// =====================

const MONTHS = [
  "Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre"
];

const BASE_CATEGORIES = [
  "Podcast","Documentaire","Film","Vidéo","Exposition","Livre","Article",
  "Interview","Musique","Image","Marque","Personnalité","Adresse","Site/application"
];

// Cache local (optionnel, juste pour fallback)
const STORAGE_KEY = "grandboard_entries_v2_cache";
const YEARS_KEY = "grandboard_years_v2";
const EXTRA_CATEGORIES_KEY = "grandboard_extra_categories_v2";

// =====================
// HELPERS localStorage
// =====================

function loadJSON(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// =====================
// STATE
// =====================

let entries = loadJSON(STORAGE_KEY, []);
let years = loadJSON(YEARS_KEY, []);
let extraCategories = loadJSON(EXTRA_CATEGORIES_KEY, []);

let filters = { category: "", theme1: "", theme2: "", month: "", year: "" };

// =====================
// DOM
// =====================

const yearTop = document.getElementById("currentYear");
const cardsGrid = document.getElementById("cardsGrid");
const selectedMonthLabel = document.getElementById("selectedMonthLabel");

const filterCategory = document.getElementById("filterCategory");
const filterTheme1 = document.getElementById("filterTheme1");
const filterTheme2 = document.getElementById("filterTheme2");
const filterYear = document.getElementById("filterYear");
const monthsContainer = document.getElementById("monthsContainer");
const applyFiltersBtn = document.getElementById("applyFilters");
const resetFiltersBtn = document.getElementById("resetFilters");

const modalBackdrop = document.getElementById("modalBackdrop");
const openAddFormBtn = document.getElementById("openAddForm");
const closeModalBtn = document.getElementById("closeModal");
const cancelFormBtn = document.getElementById("cancelForm");
const entryForm = document.getElementById("entryForm");

const fieldId = document.getElementById("entryId");
const fieldTitle = document.getElementById("title");
const fieldCategory = document.getElementById("category");
const fieldTheme1 = document.getElementById("theme1");
const fieldTheme2 = document.getElementById("theme2");
const fieldDescription = document.getElementById("description");
const fieldLink = document.getElementById("link");
const fieldMonth = document.getElementById("month");
const fieldYear = document.getElementById("year");
const fieldImageUrl = document.getElementById("imageUrl");
const fieldImageFile = document.getElementById("imageFile");
const modalTitle = document.getElementById("modalTitle");

// modal gestion années / catégories
const manageBackdrop = document.getElementById("manageBackdrop");
const openManageModalBtn = document.getElementById("openManageModal");
const closeManageModalBtn = document.getElementById("closeManageModal");
const cancelManageBtn = document.getElementById("cancelManage");
const manageYearSelect = document.getElementById("manageYearSelect");
const manageYearInput = document.getElementById("manageYearInput");
const addYearBtn = document.getElementById("addYearBtn");
const editYearBtn = document.getElementById("editYearBtn");
const deleteYearBtn = document.getElementById("deleteYearBtn");
const manageCategorySelect = document.getElementById("manageCategorySelect");
const manageCategoryInput = document.getElementById("manageCategoryInput");
const addCategoryBtn = document.getElementById("addCategoryBtn");
const editCategoryBtn = document.getElementById("editCategoryBtn");
const deleteCategoryBtn = document.getElementById("deleteCategoryBtn");

// =====================
// SUPABASE (table + storage)
// =====================

const TABLE_NAME = "Entries";
const BUCKET_NAME = "images";

// Upload image -> { publicUrl, path }
async function uploadImageToSupabase(file, entryId) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `entries/${entryId}-${Date.now()}.${ext}`;

  const { error: uploadError } = await window.sb
    .storage
    .from(BUCKET_NAME)
    .upload(path, file, { upsert: false });

  if (uploadError) throw uploadError;

  const { data } = window.sb.storage.from(BUCKET_NAME).getPublicUrl(path);
  return { publicUrl: data.publicUrl, path };
}

// Charge depuis Supabase (source de vérité)
async function loadSharedData() {
  try {
   const { data, error } = await window.sb
  .from("Entries")
  .select("*");

    if (error) throw error;

    entries = (data || []).map((row) => ({
      id: String(row.id),
      title: row.title || "",
      category: row.category || "",
      theme1: row.theme1 || "",
      theme2: row.theme2 || "",
      description: row.description || "",
      link: row.link || "",
      month: row.month || 1,
      year: row.year || new Date().getFullYear(),
      imageUrl: row.image_url || "",
      imagePath: row.image_path || ""
    }));

    saveJSON(STORAGE_KEY, entries);
  } catch (e) {
    console.error("Supabase load error, fallback localStorage:", JSON.stringify(e, null, 2));
    entries = loadJSON(STORAGE_KEY, []);
  }
}

// Upsert (create/update) dans Supabase
async function upsertEntryToSupabase(entry) {
  const row = {
    id: entry.id, // OBLIGATOIRE (id text PK)
    title: entry.title,
    category: entry.category,
    theme1: entry.theme1,
    theme2: entry.theme2,
    description: entry.description,
    link: entry.link,
    month: entry.month,
    year: entry.year,
    image_url: entry.imageUrl || "",
    image_path: entry.imagePath || ""
  };

  const { error } = await window.sb
    .from(TABLE_NAME)
    .upsert([row], { onConflict: "id" });

  if (error) throw error;
}

// Delete dans Supabase
async function deleteEntryFromSupabase(id) {
  const { error } = await window.sb
    .from(TABLE_NAME)
    .delete()
    .eq("id", id);

  if (error) throw error;
}

// =====================
// INIT
// =====================

async function init() {
  await loadSharedData();

  const now = new Date();
  yearTop.textContent = now.getFullYear();

  if (!years.includes(now.getFullYear())) years.push(now.getFullYear());
  entries.forEach((e) => {
    if (e.year && !years.includes(e.year)) years.push(e.year);
  });
  years.sort((a, b) => a - b);
  saveJSON(YEARS_KEY, years);

  // mois dans le formulaire
  fieldMonth.innerHTML = "";
  MONTHS.forEach((m, index) => {
    const opt = document.createElement("option");
    opt.value = index + 1;
    opt.textContent = m;
    fieldMonth.appendChild(opt);
  });

  // boutons mois filtres
  monthsContainer.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.textContent = "Voir tout";
  allBtn.className = "month-btn active";
  allBtn.dataset.value = "";
  monthsContainer.appendChild(allBtn);

  MONTHS.forEach((m, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "month-btn";
    btn.textContent = m;
    btn.dataset.value = String(i + 1);
    monthsContainer.appendChild(btn);
  });

  monthsContainer.addEventListener("click", (e) => {
    if (e.target.matches(".month-btn")) {
      document.querySelectorAll(".month-btn").forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");
      filters.month = e.target.dataset.value || "";
      updateMonthLabel();
      render();
    }
  });

  applyFiltersBtn.addEventListener("click", () => {
    filters.category = filterCategory.value;
    filters.theme1 = filterTheme1.value;
    filters.theme2 = filterTheme2.value;
    filters.year = filterYear.value;
    render();
  });

  resetFiltersBtn.addEventListener("click", () => {
    filters = { category: "", theme1: "", theme2: "", month: "", year: "" };
    filterCategory.value = "";
    filterTheme1.value = "";
    filterTheme2.value = "";
    filterYear.value = "";
    document.querySelectorAll(".month-btn").forEach((b) => b.classList.remove("active"));
    document.querySelector(".month-btn[data-value='']").classList.add("active");
    updateMonthLabel();
    render();
  });

  openAddFormBtn.addEventListener("click", openModalForCreate);
  closeModalBtn.addEventListener("click", closeModal);
  cancelFormBtn.addEventListener("click", closeModal);

  entryForm.addEventListener("submit", (e) => {
    e.preventDefault();
    saveFromForm();
  });

  // modal gestion catégories/années
  openManageModalBtn.addEventListener("click", openManageModal);
  closeManageModalBtn.addEventListener("click", closeManageModal);
  cancelManageBtn.addEventListener("click", closeManageModal);

  addYearBtn.addEventListener("click", handleAddYear);
  editYearBtn.addEventListener("click", handleEditYear);
  deleteYearBtn.addEventListener("click", handleDeleteYear);

  addCategoryBtn.addEventListener("click", handleAddCategory);
  editCategoryBtn.addEventListener("click", handleEditCategory);
  deleteCategoryBtn.addEventListener("click", handleDeleteCategory);

  refreshYearsSelects();
  refreshCategoriesList();
  refreshManageLists();
  refreshThemesFilters();
  updateMonthLabel();
  render();
}

// =====================
// UI HELPERS
// =====================

function updateMonthLabel() {
  if (!filters.month) selectedMonthLabel.textContent = "TOUT";
  else selectedMonthLabel.textContent = MONTHS[Number(filters.month) - 1].toUpperCase();
}

function refreshYearsSelects() {
  filterYear.innerHTML = '<option value="">Toutes les années</option>';
  years.slice().sort((a, b) => a - b).forEach((y) => {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    filterYear.appendChild(opt);
  });

  fieldYear.innerHTML = "";
  years.slice().sort((a, b) => a - b).forEach((y) => {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    fieldYear.appendChild(opt);
  });
}

function getAllCategories() {
  const set = new Set(BASE_CATEGORIES);
  extraCategories.forEach((c) => set.add(c));
  entries.forEach((e) => { if (e.category) set.add(e.category); });
  return [...set].sort((a, b) => a.localeCompare(b, "fr"));
}

function refreshCategoriesList() {
  const all = getAllCategories();
  const currentFilter = filterCategory.value;
  const currentForm = fieldCategory.value;

  filterCategory.innerHTML = '<option value="">Toutes les catégories</option>';
  all.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    filterCategory.appendChild(opt);
  });
  if (all.includes(currentFilter)) filterCategory.value = currentFilter;

  fieldCategory.innerHTML = "";
  all.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    fieldCategory.appendChild(opt);
  });
  if (all.includes(currentForm)) fieldCategory.value = currentForm;
}

function refreshManageLists() {
  manageYearSelect.innerHTML = "";
  years.slice().sort((a, b) => a - b).forEach((y) => {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    manageYearSelect.appendChild(opt);
  });

  const all = getAllCategories();
  manageCategorySelect.innerHTML = "";
  all.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    manageCategorySelect.appendChild(opt);
  });
}

// =====================
// RENDER
// =====================

function render() {
  cardsGrid.innerHTML = "";

  const filtered = entries.filter((e) => {
    if (filters.category && e.category !== filters.category) return false;
    if (filters.theme1 && e.theme1 !== filters.theme1) return false;
    if (filters.theme2 && e.theme2 !== filters.theme2) return false;
    if (filters.month && String(e.month) !== String(filters.month)) return false;
    if (filters.year && String(e.year) !== String(filters.year)) return false;
    return true;
  });

  if (filtered.length === 0) {
    const msg = document.createElement("p");
    msg.textContent = "Aucune entrée pour ces filtres pour le moment.";
    msg.style.color = "#ffffff";
    cardsGrid.appendChild(msg);
    return;
  }

  filtered.forEach((e) => {
    const card = document.createElement("article");
    card.className = `card card--${(e.category || "Sans_categorie").replace(" ", "_")}`;

    const header = document.createElement("div");
    header.className = "card-header";
    header.textContent = e.title || "Sans titre";
    card.appendChild(header);

    const image = document.createElement("div");
    image.className = "card-image";
    if (e.imageUrl) {
      const img = document.createElement("img");
      img.src = e.imageUrl;
      img.alt = e.title || "Image";
      image.appendChild(img);
    } else {
      image.textContent = "🏠";
    }
    card.appendChild(image);

    const body = document.createElement("div");
    body.className = "card-body";

    const tags = document.createElement("div");
    tags.className = "card-tags";

    const catTag = document.createElement("span");
    catTag.className = "tag-pill";
    catTag.textContent = e.category || "";
    tags.appendChild(catTag);

    if (e.theme1) {
      const t1 = document.createElement("span");
      t1.className = "tag-pill";
      t1.textContent = e.theme1.toUpperCase();
      tags.appendChild(t1);
    }
    if (e.theme2) {
      const t2 = document.createElement("span");
      t2.className = "tag-pill";
      t2.textContent = e.theme2.toUpperCase();
      tags.appendChild(t2);
    }

    body.appendChild(tags);

    if (e.description) {
      const desc = document.createElement("p");
      desc.className = "card-desc";
      desc.textContent = e.description;
      body.appendChild(desc);
    }

    if (e.link) {
      const link = document.createElement("a");
      link.className = "card-link";
      link.href = e.link;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = e.link;
      body.appendChild(link);
    }

    card.appendChild(body);

    const footer = document.createElement("div");
    footer.className = "card-footer";

    const dateSpan = document.createElement("span");
    const monthName = MONTHS[(e.month || 1) - 1] || "";
    dateSpan.textContent = `${monthName} ${e.year || ""}`;
    footer.appendChild(dateSpan);

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "card-btn";
    editBtn.textContent = "Éditer";
    editBtn.addEventListener("click", () => openModalForEdit(e.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "card-btn";
    deleteBtn.textContent = "Suppr.";
    deleteBtn.addEventListener("click", () => deleteEntry(e.id));

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    footer.appendChild(actions);
    card.appendChild(footer);

    cardsGrid.appendChild(card);
  });
}

// =====================
// MODAL
// =====================

function openModalForCreate() {
  const now = new Date();
  modalTitle.textContent = "Ajouter une entrée";
  entryForm.reset();
  fieldId.value = "";
  fieldMonth.value = String(now.getMonth() + 1);
  fieldYear.value = String(now.getFullYear());
  fieldImageFile.value = "";
  modalBackdrop.classList.add("open");
}

function openModalForEdit(id) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;

  modalTitle.textContent = "Modifier l'entrée";
  entryForm.reset();
  fieldId.value = entry.id;
  fieldTitle.value = entry.title || "";
  fieldCategory.value = entry.category || "";
  fieldTheme1.value = entry.theme1 || "";
  fieldTheme2.value = entry.theme2 || "";
  fieldDescription.value = entry.description || "";
  fieldLink.value = entry.link || "";
  fieldMonth.value = String(entry.month || "");
  fieldYear.value = String(entry.year || "");
  fieldImageUrl.value = entry.imageUrl || "";
  fieldImageFile.value = "";
  modalBackdrop.classList.add("open");
}

function closeModal() {
  modalBackdrop.classList.remove("open");
}

// =====================
// SAVE / DELETE
// =====================

function saveFromForm() {
  const id =
    fieldId.value ||
    (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));

  const existingIndex = entries.findIndex((e) => e.id === id);

  const chosenYear = Number(fieldYear.value);
  if (!years.includes(chosenYear)) {
    years.push(chosenYear);
    years.sort((a, b) => a - b);
    saveJSON(YEARS_KEY, years);
    refreshYearsSelects();
    refreshManageLists();
  }

  const base = {
    id,
    title: fieldTitle.value.trim(),
    category: fieldCategory.value.trim(),
    theme1: fieldTheme1.value.trim(),
    theme2: fieldTheme2.value.trim(),
    description: fieldDescription.value.trim().slice(0, 200),
    link: fieldLink.value.trim(),
    month: Number(fieldMonth.value),
    year: chosenYear,
    imageUrl: fieldImageUrl.value.trim(),
    imagePath: ""
  };

  const file = fieldImageFile.files[0];

  (async () => {
    try {
      if (file) {
        const uploaded = await uploadImageToSupabase(file, id);
        base.imageUrl = uploaded.publicUrl;
        base.imagePath = uploaded.path;
      }

      // UI instant
      if (existingIndex >= 0) entries[existingIndex] = base;
      else entries.push(base);
      saveJSON(STORAGE_KEY, entries);

      refreshThemesFilters();
      refreshCategoriesList();
      refreshManageLists();
      render();
      closeModal();

      // DB
      await upsertEntryToSupabase(base);

      // resync
      await loadSharedData();
      refreshThemesFilters();
      refreshCategoriesList();
      refreshManageLists();
      render();
    } catch (e) {
      console.error("Erreur sauvegarde:", e);
      alert("Impossible de sauvegarder en ligne.");
    }
  })();
}

function deleteEntry(id) {
  if (!confirm("Supprimer cette entrée ?")) return;

  (async () => {
    try {
      const removed = entries.find((e) => e.id === id);
      const imgPath = removed?.imagePath;

      // UI instant
      entries = entries.filter((e) => e.id !== id);
      saveJSON(STORAGE_KEY, entries);
      refreshThemesFilters();
      refreshCategoriesList();
      refreshManageLists();
      render();

      // DB
      await deleteEntryFromSupabase(id);

      // optionnel: supprimer aussi l'image
      if (imgPath) {
        await window.sb.storage.from(BUCKET_NAME).remove([imgPath]);
      }

      await loadSharedData();
      refreshThemesFilters();
      refreshCategoriesList();
      refreshManageLists();
      render();
    } catch (e) {
      console.error("Erreur suppression:", e);
      alert("Impossible de supprimer en ligne.");
    }
  })();
}

// =====================
// THEMES FILTERS
// =====================

function refreshThemesFilters() {
  const themes1 = new Set();
  const themes2 = new Set();

  entries.forEach((e) => {
    if (e.theme1) themes1.add(e.theme1);
    if (e.theme2) themes2.add(e.theme2);
  });

  const currentT1 = filterTheme1.value;
  const currentT2 = filterTheme2.value;

  filterTheme1.innerHTML = '<option value="">Tous les thèmes 1</option>';
  filterTheme2.innerHTML = '<option value="">Tous les thèmes 2</option>';

  [...themes1].sort((a, b) => a.localeCompare(b, "fr")).forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    filterTheme1.appendChild(opt);
  });

  [...themes2].sort((a, b) => a.localeCompare(b, "fr")).forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    filterTheme2.appendChild(opt);
  });

  filterTheme1.value = currentT1;
  filterTheme2.value = currentT2;
}

// =====================
// MANAGE MODAL
// =====================

function openManageModal() {
  refreshManageLists();
  manageBackdrop.classList.add("open");
}

function closeManageModal() {
  manageBackdrop.classList.remove("open");
}

// =====================
// YEARS HANDLERS
// =====================

function handleAddYear() {
  const val = Number(manageYearInput.value);
  if (!val) return;
  if (!years.includes(val)) {
    years.push(val);
    years.sort((a, b) => a - b);
    saveJSON(YEARS_KEY, years);
    refreshYearsSelects();
    refreshManageLists();
  }
  manageYearInput.value = "";
}

function handleEditYear() {
  const oldVal = Number(manageYearSelect.value);
  const newVal = Number(manageYearInput.value);
  if (!oldVal || !newVal) return;

  years = years.map((y) => (y === oldVal ? newVal : y));
  saveJSON(YEARS_KEY, years);

  entries.forEach((e) => { if (e.year === oldVal) e.year = newVal; });
  saveJSON(STORAGE_KEY, entries);

  refreshYearsSelects();
  refreshManageLists();
  render();
  manageYearInput.value = "";
}

function handleDeleteYear() {
  const val = Number(manageYearSelect.value);
  if (!val) return;

  const used = entries.some((e) => e.year === val);
  if (used) {
    alert("Cette année est utilisée par au moins une entrée. Modifie ou supprime ces entrées avant de supprimer l'année.");
    return;
  }

  if (!confirm(`Supprimer l'année ${val} ?`)) return;

  years = years.filter((y) => y !== val);
  saveJSON(YEARS_KEY, years);
  refreshYearsSelects();
  refreshManageLists();
}

// =====================
// CATEGORIES HANDLERS
// =====================

function handleAddCategory() {
  const val = manageCategoryInput.value.trim();
  if (!val) return;
  if (!extraCategories.includes(val) && !BASE_CATEGORIES.includes(val)) {
    extraCategories.push(val);
    saveJSON(EXTRA_CATEGORIES_KEY, extraCategories);
  }
  refreshCategoriesList();
  refreshManageLists();
  manageCategoryInput.value = "";
}

function handleEditCategory() {
  const oldCat = manageCategorySelect.value;
  const newCat = manageCategoryInput.value.trim();
  if (!oldCat || !newCat) return;

  extraCategories = extraCategories.map((c) => (c === oldCat ? newCat : c));
  saveJSON(EXTRA_CATEGORIES_KEY, extraCategories);

  entries.forEach((e) => { if (e.category === oldCat) e.category = newCat; });
  saveJSON(STORAGE_KEY, entries);

  refreshCategoriesList();
  refreshManageLists();
  render();
  manageCategoryInput.value = "";
}

function handleDeleteCategory() {
  const cat = manageCategorySelect.value;
  if (!cat) return;

  const used = entries.some((e) => e.category === cat);
  if (used) {
    alert("Cette catégorie est utilisée par au moins une entrée. Modifie ou supprime ces entrées avant de la supprimer.");
    return;
  }

  if (!confirm(`Supprimer la catégorie "${cat}" ?`)) return;

  extraCategories = extraCategories.filter((c) => c !== cat);
  saveJSON(EXTRA_CATEGORIES_KEY, extraCategories);

  refreshCategoriesList();
  refreshManageLists();
}

// =====================
// START
// =====================

init();
