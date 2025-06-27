// src/ui.js

import {
  db,
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  storageRef,
  uploadBytesResumable,
  getDownloadURL,
  marked
} from "./firebase.js";

const COMMON_INGREDIENTS = [
  "Flour","Sugar","Salt","Olive oil","Butter","Eggs",
  "Milk","Baking powder","Garlic","Onion","Tomato","Pepper",
  "Chicken breast","Ground beef","Rice","Pasta","Herbs","Spices"
];

const appId = typeof __app_id !== "undefined"
  ? __app_id
  : "default-recipe-app-id";

export function populateIngredientSuggestions() {
  const data = document.getElementById("ingredientSuggestions");
  if (!data) return;
  data.innerHTML = COMMON_INGREDIENTS
    .map(ing => `<option value="${ing}">`)
    .join("");
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.ingredient-item:not(.dragging)')];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

document.addEventListener("DOMContentLoaded", () => {
  populateIngredientSuggestions();
  const container = document.getElementById("ingredientListDisplay");
  if (container) {
    container.addEventListener("dragover", e => {
      e.preventDefault();
      const dragging = container.querySelector('.dragging');
      const afterElement = getDragAfterElement(container, e.clientY);
      if (!afterElement) {
        container.appendChild(dragging);
      } else {
        container.insertBefore(dragging, afterElement);
      }
    });
    container.addEventListener("drop", () => {
      window.currentIngredientsArray = Array.from(container.children)
        .map(div => div.querySelector('span').textContent);
    });
  }
});

export function showView(viewIdToShow) {
  ["browseView","recipeDetailView","recipeFormView"].forEach((viewId) => {
    const el = document.getElementById(viewId);
    if (!el) return;
    el.classList.toggle("view-active", viewId === viewIdToShow);
    el.classList.toggle("view-hidden", viewId !== viewIdToShow);
  });
  if (viewIdToShow === "browseView") {
    loadBrowseViewRecipes();
  }
}

export function resetRecipeForm() {
  const form = document.getElementById("recipeForm");
  form.reset();
  document.getElementById("recipeIdInput").value = "";
  window.currentIngredientsArray = [];
  renderIngredientList();
  const preview = document.getElementById("imagePreview");
  preview.src = "#";
  document.getElementById("imagePreviewContainer").classList.add("hidden");
}

export function renderIngredientList() {
  const container = document.getElementById("ingredientListDisplay");
  container.innerHTML = "";
  (window.currentIngredientsArray || []).forEach((ing, idx) => {
    const div = document.createElement("div");
    div.draggable = true;
    div.className = "ingredient-item flex items-center justify-between bg-gray-100 p-2 pl-3 rounded-md text-sm";
    div.innerHTML = `<span>${ing}</span><button title="Remove" class="ml-2 text-red-500 hover:text-red-700">&times;</button>`;
    div.addEventListener("dragstart", () => div.classList.add("dragging"));
    div.addEventListener("dragend", () => div.classList.remove("dragging"));
    div.querySelector("button").onclick = () => {
      window.currentIngredientsArray.splice(idx, 1);
      renderIngredientList();
    };
    container.appendChild(div);
  });
}

const ingredientListEl = document.getElementById("ingredientListDisplay");
if (ingredientListEl && window.Sortable) {
  new Sortable(ingredientListEl, {
    animation: 150,
    onEnd: (evt) => {
      // idx: new index, oldIndex: previous index
      const moved = window.currentIngredientsArray.splice(evt.oldIndex, 1)[0];
      window.currentIngredientsArray.splice(evt.newIndex, 0, moved);
      renderIngredientList();
    }
  });
}

export function updateCategoryButtonStyles() {
  document.querySelectorAll(".category-filter-btn").forEach((btn) => {
    btn.classList.toggle(
      "category-filter-btn-active",
      btn.dataset.category === window.currentCategoryFilter
    );
  });
}

export function loadBrowseViewRecipes() {
  if (!window.userId) return;
  if (window.recipesUnsubscribe) {
    renderRecipes();
    return;
  }
  const q = query(
    collection(db, `artifacts/${appId}/users/${window.userId}/recipes`),
    orderBy("createdAt", "desc")
  );
  window.recipesUnsubscribe = onSnapshot(
    q,
    (snap) => {
      window.lastRecipeSnapshot = snap;
      renderRecipes();
    },
    (err) => {
      showMessage(
        document.getElementById("errorMessage"),
        `Error fetching recipes: ${err.message}`,
        true
      );
    }
  );
}

export function renderRecipes() {
  const grid = document.getElementById("recipesGridContainer");
  const placeholder = document.getElementById("recipesGridPlaceholder");
  if (!grid || !placeholder) return;
  grid.querySelectorAll(".recipe-card").forEach(c => c.remove());
  if (!window.lastRecipeSnapshot || !window.userId) {
    placeholder.style.display = "block";
    placeholder.innerHTML = window.userId
      ? ''
      : '<p class="text-center text-gray-500 py-8">Please sign in to see recipes.</p>';
    return;
  }
  const allRecipes = window.lastRecipeSnapshot.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
  let filtered = allRecipes.filter(r =>
    window.currentCategoryFilter === "all" || r.category === window.currentCategoryFilter
  );
  const term = (document.getElementById("headerSearchInput").value || "").trim();
  if (term) {
    const fuse = new Fuse(filtered, {
      keys: ["title", "tags"],
      threshold: 0.3,
      ignoreLocation: true
    });
    filtered = fuse.search(term).map(res => res.item);
  }
  let found = 0;
  filtered.forEach(recipe => {
    found++;
    const card = document.createElement("div");
    card.className = "recipe-card bg-white rounded-xl shadow-lg overflow-hidden cursor-pointer group relative";
    card.onclick = () => window.location.hash = `/recipe/${recipe.id}`;
    const imgWrap = document.createElement("div");
    imgWrap.className = "recipe-thumb recipe-card-image-container relative";
    if (recipe.imageUrl) {
      const shimmer = document.createElement("div");
      shimmer.className = "absolute inset-0 bg-slate-200 animate-pulse";
      imgWrap.appendChild(shimmer);
      const img = document.createElement("img");
      img.src = recipe.imageUrl;
      img.alt = recipe.title;
      img.className = "recipe-card-image hidden object-cover w-full h-full";
      img.onload = () => {
        shimmer.remove();
        img.classList.remove("hidden");
      };
      img.onerror = () => {
        shimmer.innerHTML = `<div class="flex items-center justify-center h-full text-slate-400">
          <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2 1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
        </div>`;
      };
      imgWrap.appendChild(img);
    } else {
      imgWrap.innerHTML = `<div class="w-full h-full flex items-center justify-center bg-slate-200">
        <svg class="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2 1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
      </div>`;
    }
    const content = document.createElement("div");
    content.className = "p-5 flex-grow flex flex-col";
    const original = document.createElement("div");
    original.className = "transition-opacity duration-300 group-hover:opacity-0";
    original.innerHTML = `
      <p class="text-xs font-semibold text-indigo-600 uppercase mb-1">${recipe.category || "Uncategorized"}</p>
      <h3 class="text-xl font-bold text-gray-800">${recipe.title}</h3>
    `;
    const hoverText = document.createElement("div");
    hoverText.className = "absolute bottom-0 left-0 p-5 text-white transition-opacity duration-300 opacity-0 group-hover:opacity-100 pointer-events-none w-full";
    hoverText.innerHTML = `
      <p class="text-xs font-semibold uppercase tracking-wider">${recipe.category || "Uncategorized"}</p>
      <h3 class="text-xl font-bold leading-tight">${recipe.title}</h3>
    `;
    content.appendChild(original);
    card.appendChild(imgWrap);
    card.appendChild(content);
    card.appendChild(hoverText);
    grid.appendChild(card);
  });
  placeholder.style.display = found === 0 ? "block" : "none";
  if (found === 0) {
    placeholder.innerHTML = '<p class="text-center text-gray-500 py-8">No recipes found.</p>';
  }
}

export async function navigateToRecipeDetail(recipeId) {
  window.currentRecipeIdInDetailView = recipeId;
  document.getElementById("detailRecipeTitle").textContent = "Loading…";
  document.getElementById("detailRecipeCategory").textContent = "";
  document.getElementById("detailRecipeTags").innerHTML = "";
  document.getElementById("detailRecipeIngredients").innerHTML = "";
  document.getElementById("detailRecipeDirections").innerHTML = "";
  document.getElementById("detailRecipeNotes").textContent = "";
  document.getElementById("detailRecipeNotesContainer").classList.add("view-hidden");
  document.getElementById("detailRecipeTagsContainer").classList.add("view-hidden");
  document.getElementById("detailImagePlaceholder").innerHTML = `
    <svg class="w-16 h-16 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
    </svg>`;
  try {
    const snap = await getDoc(
      doc(db, `artifacts/${appId}/users/${window.userId}/recipes`, recipeId)
    );
    if (!snap.exists()) {
      showMessage(document.getElementById("errorMessage"), "Recipe not found.", true);
      showView("browseView");
      return;
    }
    const r = snap.data();
    document.getElementById("detailRecipeTitle").textContent = r.title;
    document.getElementById("detailRecipeCategory").textContent = r.category;
    if (r.imageUrl) {
      document.getElementById("detailImagePlaceholder").innerHTML = `<img src="${r.imageUrl}" alt="${r.title}" class="w-full h-full object-cover rounded-lg">`;
    }
    document.getElementById("detailRecipeIngredients").innerHTML = r.ingredients.map(i => `<li>${i}</li>`).join("");
    document.getElementById("detailRecipeDirections").innerHTML = r.directions.map(d => `<li>${d}</li>`).join("");
    if (r.tags?.length) {
      document.getElementById("detailRecipeTagsContainer").classList.remove("view-hidden");
      document.getElementById("detailRecipeTags").innerHTML = r.tags.map(t => `<span class="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm">${t}</span>`).join("");
    }
    if (r.notes?.trim()) {
      document.getElementById("detailRecipeNotesContainer").classList.remove("view-hidden");
      document.getElementById("detailRecipeNotes").innerHTML = marked.parse(r.notes);
    }
  } catch (err) {
    showMessage(document.getElementById("errorMessage"), `Error loading recipe: ${err.message}`, true);
  }
}

export async function populateFormForEdit(recipeId) {
  try {
    const snap = await getDoc(
      doc(db, `artifacts/${appId}/users/${window.userId}/recipes`, recipeId)
    );
    if (!snap.exists()) {
      showMessage(document.getElementById("errorMessage"), "Recipe not found for editing.", true);
      return;
    }
    const r = snap.data();
    resetRecipeForm();
    document.getElementById("recipeTitleInput").value = r.title;
    document.getElementById("recipeCategoryInput").value = r.category;
    window.currentIngredientsArray = [...(r.ingredients || [])];
    renderIngredientList();
    document.getElementById("recipeDirectionsInput").value = r.directions.join("\n");
    document.getElementById("recipeNotesInput").value = r.notes || "";
    document.getElementById("recipeTagsInput").value = (r.tags || []).join(",");
    document.getElementById("recipeIdInput").value = recipeId;
    document.getElementById("formTitle").textContent = "Edit Recipe";
    if (r.imageUrl) {
      const prev = document.getElementById("imagePreview");
      prev.src = r.imageUrl;
      document.getElementById("imagePreviewContainer").classList.remove("hidden");
    }
    showView("recipeFormView");
  } catch (err) {
    showMessage(document.getElementById("errorMessage"), `Error loading for edit: ${err.message}`, true);
  }
}

export async function handleDeleteRecipe() {
  const id = window.currentRecipeIdInDetailView;
  if (!id) return;
  const title = document.getElementById("detailRecipeTitle").textContent;
  if (!confirm(`Delete "${title}" permanently?`)) return;
  try {
    await deleteDoc(doc(db, `artifacts/${appId}/users/${window.userId}/recipes`, id));
    showMessage(document.getElementById("successMessage"), `Deleted "${title}".`);
    showView("browseView");
  } catch (err) {
    showMessage(document.getElementById("errorMessage"), `Delete failed: ${err.message}`, true);
  }
}

export async function handleRecipeFormSubmit(event) {
  event.preventDefault();
  const titleValue    = document.getElementById("recipeTitleInput").value.trim();
  const categoryValue = document.getElementById("recipeCategoryInput").value;
  const directions    = document.getElementById("recipeDirectionsInput").value.trim();
  const notesValue    = document.getElementById("recipeNotesInput").value.trim();
  const tagsText      = document.getElementById("recipeTagsInput").value.trim();
  const recipeIdToEdit= document.getElementById("recipeIdInput").value;
  if (!titleValue || !categoryValue || (window.currentIngredientsArray||[]).length === 0 || !directions) {
    showMessage(document.getElementById("errorMessage"), "Title, Category, at least one Ingredient, and Directions are required.", true);
    return;
  }
  const loadingEl = document.getElementById("loadingIndicator");
  loadingEl.classList.remove("hidden");
  try {
    let imageUrlToSave;
    const previewEl = document.getElementById("imagePreview");
    if (previewEl.src.startsWith("blob:")) {
      const fileInput = document.getElementById("recipeImageInput");
      const file = fileInput.files[0];
      const imageName = `${window.userId}_${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
      const ref = storageRef(storage, `recipe_images/${window.userId}/${imageName}`);
      const uploadTask = uploadBytesResumable(ref, file);
      await new Promise((res, rej) => uploadTask.on("state_changed", null, rej, res));
      imageUrlToSave = await getDownloadURL(uploadTask.snapshot.ref);
    } else if (recipeIdToEdit) {
      imageUrlToSave = previewEl.src.startsWith("http") ? previewEl.src : null;
    }
    const data = {
      title: titleValue,
      category: categoryValue,
      ingredients: [...window.currentIngredientsArray],
      directions: directions.split("\n").map(s => s.trim()).filter(Boolean),
      notes: notesValue,
      tags: tagsText.split(",").map(s => s.trim()).filter(Boolean)
    };
    const col = collection(db, `artifacts/${appId}/users/${window.userId}/recipes`);
    if (recipeIdToEdit) {
      const toUpdate = { ...data, lastUpdatedAt: Timestamp.now() };
      if (imageUrlToSave !== undefined) toUpdate.imageUrl = imageUrlToSave;
      await updateDoc(doc(col, recipeIdToEdit), toUpdate);
      showMessage(document.getElementById("successMessage"), "Recipe updated successfully!");
    } else {
      const toAdd = { ...data, userId: window.userId, createdAt: Timestamp.now() };
      if (imageUrlToSave) toAdd.imageUrl = imageUrlToSave;
      await addDoc(col, toAdd);
      showMessage(document.getElementById("successMessage"), "Recipe added successfully!");
    }
    resetRecipeForm();
    showView("browseView");
  } catch (err) {
    showMessage(document.getElementById("errorMessage"), `Error saving recipe: ${err.message}`, true);
  } finally {
    loadingEl.classList.add("hidden");
  }
}

export function showMessage(element, userMessage, isError = false, duration = 4000) {
  if (isError) console.error(userMessage);
  element.textContent = userMessage;
  element.className = `p-3 text-sm text-white rounded-lg fixed top-24 right-5 z-50 shadow-lg ${isError ? "bg-red-500" : "bg-green-500"}`;
  element.classList.remove("hidden");
  setTimeout(() => element.classList.add("hidden"), duration);
}
