// src/main.js

// ── Firebase & Auth Helpers ─────────────────────────
import {
  auth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut
} from "./firebase.js";

// ── Router ──────────────────────────────────────────
import { initRouter, handleRoute } from "./router.js";

// ── UI & Data Functions ─────────────────────────────
import {
  showView,
  loadBrowseViewRecipes,
  renderRecipes,
  navigateToRecipeDetail,
  resetRecipeForm,
  populateFormForEdit,
  handleDeleteRecipe,
  updateCategoryButtonStyles,
  renderIngredientList,
  showMessage,
  handleRecipeFormSubmit
} from "./ui.js";

document.querySelectorAll(".category-filter-btn").forEach(btn =>
  btn.addEventListener("click", () => {
    // whatever category that button carries
    window.currentCategoryFilter = btn.dataset.category;
    updateCategoryButtonStyles();
    renderRecipes();
  })
);

document.addEventListener("DOMContentLoaded", () => {
  // ── 1) Initialize router & default route ─────────
  initRouter();
  handleRoute();

  // ── 2) Auth watcher ───────────────────────────────
  const userInfoDiv     = document.getElementById("userInfo");
  const googleSignInBtn = document.getElementById("googleSignInBtn");
  const signOutBtn      = document.getElementById("signOutBtn");
  const userNameSpan    = document.getElementById("userName");

  onAuthStateChanged(auth, (user) => {
    if (user) {
      // signed in
      window.userId = user.uid;
      userInfoDiv.classList.remove("hidden");
      googleSignInBtn.classList.add("hidden");
      signOutBtn.classList.remove("hidden");
      userNameSpan.textContent = user.displayName || "User";
      loadBrowseViewRecipes();
    } else {
      // signed out
      window.userId = null;
      renderRecipes();  // clear grid
      userInfoDiv.classList.add("hidden");
      googleSignInBtn.classList.remove("hidden");
    }
  });

  // ── 3) Sign-In / Sign-Out buttons ─────────────────
  googleSignInBtn.onclick = () =>
    signInWithPopup(auth, new GoogleAuthProvider());
  signOutBtn.onclick = () =>
    signOut(auth);

  // ── 4) “Add New Recipe” & “Back to All” navigation ─
  document.getElementById("navigateToAddRecipeBtn").onclick = () => {
    if (!window.userId) {
      showMessage(
        document.getElementById("errorMessage"),
        "Please sign in to add recipes.",
        true
      );
      return;
    }
    resetRecipeForm();
    showView("recipeFormView");
  };
  document.getElementById("navigateToBrowseBtnDetail").onclick = () =>
    showView("browseView");
  document.getElementById("navigateToBrowseBtnForm").onclick = () =>
    showView("browseView");

  // ── 5) Share & Print ──────────────────────────────
  document.getElementById("shareBtn")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(window.location.href);
    alert("Link copied!");
  });
  document.getElementById("printBtn")?.addEventListener("click", () =>
    window.print()
  );

  // ── 6) Theme toggle ───────────────────────────────
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  const moonSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
    fill="currentColor" class="h-5 w-5">
    <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z"/>
  </svg>`;
  const sunSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
    fill="currentColor" class="h-5 w-5">
    <path d="M12 18a6 6 0 100-12 6 6 0 000 12z"/>
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
      d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.364-6.364l-1.414 1.414M6.05 17.95l-1.414 1.414M17.95 17.95l-1.414-1.414M6.05 6.05L4.636 7.464"/>
  </svg>`;

  function applyTheme(mode) {
    const root = document.documentElement;
    if (mode === "dark") {
      root.classList.add("dark");
      themeToggleBtn.innerHTML = sunSVG;
    } else {
      root.classList.remove("dark");
      themeToggleBtn.innerHTML = moonSVG;
    }
  }

  const savedTheme  = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(savedTheme || (prefersDark ? "dark" : "light"));

  themeToggleBtn.onclick = () => {
    const next = document.documentElement.classList.contains("dark")
      ? "light"
      : "dark";
    localStorage.setItem("theme", next);
    applyTheme(next);
  };

  // ── 7) Search inputs (header + mobile) ────────────
  const headerSearch = document.getElementById("headerSearchInput");
  const mobileSearch = document.getElementById("mobileSearchInput");
  function syncAndRender(e) {
    const val = e.target.value;
    headerSearch.value = mobileSearch.value = val;
    renderRecipes();
  }
  headerSearch.addEventListener("input", syncAndRender);
  mobileSearch.addEventListener("input", syncAndRender);

  // ── 8) Category filters ───────────────────────────
  document.querySelectorAll(".category-filter-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      window.currentCategoryFilter = btn.dataset.category;
      updateCategoryButtonStyles();
      renderRecipes();
    })
  );

  // ── 9) Ingredient list “Add” button ───────────────
  document.getElementById("addIngredientBtn").onclick = () => {
    const input = document.getElementById("newIngredientInput");
    const text  = input.value.trim();
    if (!text) return;
    window.currentIngredientsArray.push(text);
    input.value = "";
    renderIngredientList();
  };

  // ── 10) Recipe form submit ────────────────────────
  document.getElementById("recipeForm").onsubmit = handleRecipeFormSubmit;

  // ── 11) Detail-view Edit & Delete ─────────────────
  document.getElementById("editRecipeBtn").onclick = () =>
    populateFormForEdit(window.currentRecipeIdInDetailView);
  document.getElementById("deleteRecipeBtn").onclick = () =>
    handleDeleteRecipe();

  // ── Final bootstrap ───────────────────────────────
  updateCategoryButtonStyles();
});
