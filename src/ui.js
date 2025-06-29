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
import Sortable from "https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/modular/sortable.esm.js";
import Fuse from "https://cdn.jsdelivr.net/npm/fuse.js@6.6.2/dist/fuse.esm.js";

const COMMON_INGREDIENTS = [
  "Flour","Sugar","Salt","Olive oil","Butter","Eggs",
  "Milk","Baking powder","Garlic","Onion","Tomato","Pepper",
  "Chicken breast","Ground beef","Rice","Pasta","Herbs","Spices"
];

const appId = typeof __app_id !== "undefined"
  ? __app_id
  : "default-recipe-app-id";

// 0) Populate datalist for ingredients
export function populateIngredientSuggestions() {
  const data = document.getElementById("ingredientSuggestions");
  if (!data) return;
  data.innerHTML = COMMON_INGREDIENTS
    .map(ing => `<option value="${ing}">`)
    .join("");
}
document.addEventListener("DOMContentLoaded", populateIngredientSuggestions);

// 1) Switch between Browse / Detail / Form
export function showView(viewIdToShow) {
  ["browseView","recipeDetailView","recipeFormView"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("view-active", id === viewIdToShow);
    el.classList.toggle("view-hidden", id !== viewIdToShow);
  });
  if (viewIdToShow === "browseView") loadBrowseViewRecipes();
}

// 2) Reset form & ingredients list
export function resetRecipeForm() {
  document.getElementById("recipeForm").reset();
  document.getElementById("recipeIdInput").value = "";
  window.currentIngredientsArray = [];
  renderIngredientList();
  document.getElementById("imagePreview").src = "#";
  document.getElementById("imagePreviewContainer").classList.add("hidden");
}

export function renderIngredientList() {
  const container = document.getElementById("ingredientListDisplay");
  container.innerHTML = "";
  (window.currentIngredientsArray || []).forEach((ing, idx) => {
    const div = document.createElement("div");
    div.className = "ingredient-item flex items-center justify-between bg-gray-100 p-2 pl-3 rounded-md text-sm";
    div.innerHTML = `
      <span>${ing}</span>
      <button title="Remove" class="ml-2 text-red-500 hover:text-red-700">&times;</button>
    `;
    div.querySelector("button").onclick = () => {
      window.currentIngredientsArray.splice(idx, 1);
      renderIngredientList();
    };
    container.appendChild(div);
  });
}

// 3) Highlight active category (including "favorites")
export function updateCategoryButtonStyles() {
  document.querySelectorAll(".category-filter-btn").forEach(btn => {
    btn.classList.toggle(
      "category-filter-btn-active",
      btn.dataset.category === window.currentCategoryFilter
    );
  });
}

// 4) Firestore listener
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
    snap => { window.lastRecipeSnapshot = snap; renderRecipes(); },
    err => showMessage(
      document.getElementById("errorMessage"),
      `Error fetching recipes: ${err.message}`,
      true
    )
  );
}

// 5) Toggle favorite flag in Firestore
export async function toggleFavorite(recipeId, newValue) {
  try {
    const ref = doc(db, `artifacts/${appId}/users/${window.userId}/recipes`, recipeId);
    await updateDoc(ref, { favorite: newValue });
  } catch (err) {
    showMessage(
      document.getElementById("errorMessage"),
      `Could not update favorite: ${err.message}`,
      true
    );
  }
}

// 6) Lazy‐load images observer
const imageObserver = new IntersectionObserver((entries, obs) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const img = entry.target;
    if (img.dataset.src) {
      img.src = img.dataset.src;
      delete img.dataset.src;
    }
    obs.unobserve(img);
  });
}, { rootMargin: '100px', threshold: 0.1 });

// 7) Render the grid with fuzzy search & favorites
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

  // build & filter
  let allRecipes = window.lastRecipeSnapshot.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
  // favorites filter
  if (window.currentCategoryFilter === "favorites") {
    allRecipes = allRecipes.filter(r => r.favorite);
  } else {
    allRecipes = allRecipes.filter(r =>
      window.currentCategoryFilter === "all" ||
      r.category === window.currentCategoryFilter
    );
  }
  // fuzzy search
  const term = (document.getElementById("headerSearchInput").value || "").trim();
  if (term) {
    const fuse = new Fuse(allRecipes, { keys:["title","tags"], threshold:0.3, ignoreLocation:true });
    allRecipes = fuse.search(term).map(r => r.item);
  }

  let found = 0;
  allRecipes.forEach((recipe, i) => {
    found++;
    const card = document.createElement("div");
    card.className = "recipe-card bg-white rounded-xl shadow-lg overflow-hidden cursor-pointer group relative";
    card.onclick = () => window.location.hash = `/recipe/${recipe.id}`;

    // image + shimmer
    const imgWrap = document.createElement("div");
    imgWrap.className = "recipe-thumb recipe-card-image-container relative";
    const shimmer = document.createElement("div");
    shimmer.className = "absolute inset-0 bg-slate-200 animate-pulse";
    imgWrap.appendChild(shimmer);

    const img = document.createElement("img");
    img.alt = recipe.title;
    img.className = "recipe-card-image hidden object-cover w-full h-full";
    img.loading = "lazy";
    img.onload = () => { shimmer.remove(); img.classList.remove("hidden"); };
    img.onerror = () => {
      shimmer.innerHTML = `
        <div class="flex items-center justify-center h-full text-slate-400">
          <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M4 16l4.586-4.586a2 2 0
                 012.828 0L16 16m-2-2 1.586-1.586
                 a2 2 0 012.828 0L20 14m-6-6h.01
                 M6 20h12a2 2 0 002-2V6a2 2 0
                 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
        </div>`;
    };
    if (i < 20) {
      img.src = recipe.imageUrl;
    } else {
      img.dataset.src = recipe.imageUrl;
      imageObserver.observe(img);
    }
    imgWrap.appendChild(img);
    card.appendChild(imgWrap);

    // favorite heart
    const favBtn = document.createElement("button");
    favBtn.innerHTML = recipe.favorite
      ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-white stroke-current stroke-2" fill="none" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
    favBtn.className = "absolute top-2 right-2 p-1 focus:outline-none";
    favBtn.onclick = e => {
      e.stopPropagation();
      toggleFavorite(recipe.id, !recipe.favorite);
    };
    card.appendChild(favBtn);

    // text overlay
    const content = document.createElement("div");
    content.className = "p-5 flex-grow flex flex-col";
    content.innerHTML = `
      <div class="transition-opacity duration-300 group-hover:opacity-0">
        <p class="text-xs font-semibold text-indigo-600 uppercase mb-1">
          ${recipe.category || "Uncategorized"}
        </p>
        <h3 class="text-xl font-bold text-gray-800">${recipe.title}</h3>
      </div>
      <div class="absolute bottom-0 left-0 p-5 text-white transition-opacity duration-300 opacity-0 
                  group-hover:opacity-100 pointer-events-none w-full">
        <p class="text-xs font-semibold uppercase tracking-wider">
          ${recipe.category || "Uncategorized"}
        </p>
        <h3 class="text-xl font-bold leading-tight">${recipe.title}</h3>
      </div>
    `;
    card.appendChild(content);

    grid.appendChild(card);
  });

  placeholder.style.display = found === 0 ? "block" : "none";
  if (found === 0) {
    placeholder.innerHTML = '<p class="text-center text-gray-500 py-8">No recipes found.</p>';
  }
}

// 8) Detail view
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
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16
           m-2-2l1.586-1.586a2 2 0 012.828 0L20 14
           m-6-6h.01M6 20h12a2 2 0 002-2V6
           a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
    </svg>`;

  try {
    const snap = await getDoc(
      doc(db, `artifacts/${appId}/users/${window.userId}/recipes`, recipeId)
    );
    if (!snap.exists()) {
      showMessage(document.getElementById("errorMessage"), "Recipe not found.", true);
      return showView("browseView");
    }
    const r = snap.data();
    document.getElementById("detailRecipeTitle").textContent = r.title;
    document.getElementById("detailRecipeCategory").textContent = r.category;
    if (r.imageUrl) {
      document.getElementById("detailImagePlaceholder").innerHTML = `
        <img src="${r.imageUrl}" alt="${r.title}" class="w-full h-full object-cover rounded-lg">`;
    }
    document.getElementById("detailRecipeIngredients").innerHTML =
      r.ingredients.map(i => `<li>${i}</li>`).join("");
    document.getElementById("detailRecipeDirections").innerHTML =
      r.directions.map(d => `<li>${d}</li>`).join("");
    if (r.tags?.length) {
      document.getElementById("detailRecipeTagsContainer").classList.remove("view-hidden");
      document.getElementById("detailRecipeTags").innerHTML =
        r.tags.map(t => `<span class="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm">${t}</span>`).join("");
    }
    if (r.notes?.trim()) {
      document.getElementById("detailRecipeNotesContainer").classList.remove("view-hidden");
      document.getElementById("detailRecipeNotes").innerHTML = marked.parse(r.notes);
    }
  } catch (err) {
    showMessage(
      document.getElementById("errorMessage"),
      `Error loading recipe: ${err.message}`,
      true
    );
  }
}

// 9) Populate edit form
export async function populateFormForEdit(recipeId) {
  try {
    const snap = await getDoc(
      doc(db, `artifacts/${appId}/users/${window.userId}/recipes`, recipeId)
    );
    if (!snap.exists()) {
      return showMessage(document.getElementById("errorMessage"), "Recipe not found for editing.", true);
    }
    const r = snap.data();
    resetRecipeForm();
    document.getElementById("recipeTitleInput").value    = r.title;
    document.getElementById("recipeCategoryInput").value = r.category;
    window.currentIngredientsArray = [...(r.ingredients || [])];
    renderIngredientList();
    document.getElementById("recipeDirectionsInput").value = r.directions.join("\n");
    document.getElementById("recipeNotesInput").value     = r.notes || "";
    document.getElementById("recipeTagsInput").value      = (r.tags || []).join(",");
    document.getElementById("recipeIdInput").value        = recipeId;
    document.getElementById("formTitle").textContent      = "Edit Recipe";
    if (r.imageUrl) {
      const prev = document.getElementById("imagePreview");
      prev.src = r.imageUrl;
      document.getElementById("imagePreviewContainer").classList.remove("hidden");
    }
    showView("recipeFormView");
  } catch (err) {
    showMessage(
      document.getElementById("errorMessage"),
      `Error loading for edit: ${err.message}`,
      true
    );
  }
}

// 10) Delete
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

// 11) Save form
export async function handleRecipeFormSubmit(event) {
  event.preventDefault();
  const titleValue    = document.getElementById("recipeTitleInput").value.trim();
  const categoryValue = document.getElementById("recipeCategoryInput").value;
  const directions    = document.getElementById("recipeDirectionsInput").value.trim();
  const notesValue    = document.getElementById("recipeNotesInput").value.trim();
  const tagsText      = document.getElementById("recipeTagsInput").value.trim();
  const recipeIdToEdit= document.getElementById("recipeIdInput").value;

  if (!titleValue || !categoryValue || (window.currentIngredientsArray||[]).length === 0 || !directions) {
    return showMessage(
      document.getElementById("errorMessage"),
      "Title, Category, at least one Ingredient, and Directions are required.",
      true
    );
  }

  const loadingEl = document.getElementById("loadingIndicator");
  loadingEl.classList.remove("hidden");

  try {
    let imageUrlToSave;
    const previewEl = document.getElementById("imagePreview");
    if (previewEl.src.startsWith("blob:")) {
      const file = document.getElementById("recipeImageInput").files[0];
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
      const toAdd = { ...data, userId: window.userId, createdAt: Timestamp.now(), favorite: false };
      if (imageUrlToSave) toAdd.imageUrl = imageUrlToSave;
      await addDoc(col, toAdd);
      showMessage(document.getElementById("successMessage"), "Recipe added successfully!");
    }

    resetRecipeForm();
    showView("browseView");
  } catch (err) {
    showMessage(
      document.getElementById("errorMessage"),
      `Error saving recipe: ${err.message}`,
      true
    );
  } finally {
    loadingEl.classList.add("hidden");
  }
}

// 12) Generic toast
export function showMessage(element, userMessage, isError = false, duration = 4000) {
  if (isError) console.error(userMessage);
  element.textContent = userMessage;
  element.className = `
    p-3 text-sm text-white rounded-lg fixed top-24 right-5 z-50 shadow-lg
    ${isError ? "bg-red-500" : "bg-green-500"}`.trim();
  element.classList.remove("hidden");
  setTimeout(() => element.classList.add("hidden"), duration);
}

// 13) Drag‐and‐drop for ingredients
document.addEventListener("DOMContentLoaded", () => {
  const listEl = document.getElementById("ingredientListDisplay");
  if (!listEl || !Sortable) return;
  new Sortable(listEl, {
    animation: 150,
    onEnd: evt => {
      const moved = window.currentIngredientsArray.splice(evt.oldIndex, 1)[0];
      window.currentIngredientsArray.splice(evt.newIndex, 0, moved);
      renderIngredientList();
    }
  });
});
