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
  showMessage
} from "./ui.js";

document.addEventListener("DOMContentLoaded", () => {
  // ── 1) Initialize router & default route ─────────
  initRouter();
  handleRoute();

  // ── 2) Auth watcher ───────────────────────────────
  onAuthStateChanged(auth, (user) => {
    const userInfoDiv    = document.getElementById("userInfo");
    const googleSignInBtn= document.getElementById("googleSignInBtn");
    const userNameSpan   = document.getElementById("userName");

    if (user) {
      // signed in
      window.userId = user.uid;
      userInfoDiv.classList.remove("hidden");
      googleSignInBtn.classList.add("hidden");
      userNameSpan.textContent = user.displayName || "User";
      loadBrowseViewRecipes();
    } else {
      // signed out
      window.userId = null;
      renderRecipes();  // clears the grid
      userInfoDiv.classList.add("hidden");
      googleSignInBtn.classList.remove("hidden");
    }
  });

  // ── 3) Hook up Sign-In / Sign-Out buttons ──────────
  document.getElementById("googleSignInBtn").onclick = () =>
    signInWithPopup(auth, new GoogleAuthProvider());

  document.getElementById("signOutBtn").onclick = () =>
    signOut(auth);

  // ── 4) Share & Print ──────────────────────────────
  document.getElementById("shareBtn")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(window.location.href);
    alert("Link copied!");
  });
  document.getElementById("printBtn")?.addEventListener("click", () => window.print());

  // ── 5) Theme toggle ───────────────────────────────
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  const moonSVG = `…`;  // your existing SVG strings
  const sunSVG  = `…`;
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
  // initial
  const savedTheme = localStorage.getItem("theme");
  const prefersDark= window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(savedTheme || (prefersDark ? "dark" : "light"));
  themeToggleBtn.onclick = () => {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    localStorage.setItem("theme", next);
    applyTheme(next);
  };

  // ── 6) Search inputs (header + mobile) ────────────
  const headerSearch = document.getElementById("headerSearchInput");
  const mobileSearch = document.getElementById("mobileSearchInput");
  function syncAndRender(e) {
    const val = e.target.value;
    headerSearch.value = mobileSearch.value = val;
    renderRecipes();
  }
  headerSearch.addEventListener("input", syncAndRender);
  mobileSearch.addEventListener("input", syncAndRender);

  // ── 7) Category filters ───────────────────────────
  document.querySelectorAll(".category-filter-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      window.currentCategoryFilter = btn.dataset.category;
      updateCategoryButtonStyles();
      renderRecipes();
    })
  );

  // ── 8) Ingredient list in form ───────────────────
  document.getElementById("addIngredientBtn").onclick = () => {
    const input = document.getElementById("newIngredientInput");
    const text  = input.value.trim();
    if (!text) return;
    window.currentIngredientsArray.push(text);
    input.value = "";
    renderIngredientList();
  };

  // ── 9) Recipe form submit ─────────────────────────
  document.getElementById("recipeForm").onsubmit = (e) => {
    e.preventDefault();
    // copy your existing handleRecipeFormSubmit() body here
  };

  // ── 10) Detail-view Edit & Delete ─────────────────
  document.getElementById("editRecipeBtn").onclick = () =>
    populateFormForEdit(window.currentRecipeIdInDetailView);

  document.getElementById("deleteRecipeBtn").onclick = () =>
    handleDeleteRecipe();

  // ── Final bootstrap ───────────────────────────────
  updateCategoryButtonStyles();
});
