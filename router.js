// router.js
import { navigateToRecipeDetail, resetRecipeForm, showView } from "./ui.js";

export function handleRoute() {
  const [route, param] = window.location.hash.slice(1).split("/").filter(Boolean);
  switch (route) {
    case "recipe":
      if (param) {
        navigateToRecipeDetail(param);
        showView("recipeDetailView");
        return;
      }
      break;
    case "add":
      resetRecipeForm();
      showView("recipeFormView");
      return;
  }
  showView("browseView");
}

// bootstrap listener (no need to wrap in DOMContentLoaded—main.js will do that)
export function initRouter() {
  window.addEventListener("hashchange",  handleRoute);
  // we'll also call handleRoute() once on startup from main.js
}
