// main.js
import { auth, marked } from "./firebase.js";
import { initRouter, handleRoute } from "./router.js";
import { showView, loadBrowseViewRecipes, renderRecipes, navigateToRecipeDetail, resetRecipeForm } from "./ui.js";

document.addEventListener("DOMContentLoaded", () => {
  // 1) Initialize router
  initRouter();
  handleRoute();

  // 2) Auth watcher
  onAuthStateChanged(auth, user => { /* …as before… call showView/loadBrowseView …*/ });

  // 3) Hook up buttons & forms
  document.getElementById("shareBtn")?.addEventListener("click", /*…*/);
  document.getElementById("printBtn")?.addEventListener("click", () => window.print());
  // theme toggle
  // navigateToAddRecipeBtn, signIn/out, search inputs, category buttons, form submit, etc.
});
