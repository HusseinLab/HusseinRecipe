// router.js
import { navigateToRecipeDetail, resetRecipeForm, showView } from "./ui.js";

export function handleRoute() {
  const [route, param] = window.location.hash.slice(1).split("/").filter(Boolean);
  switch (route) {
    case "recipe":
     // only go to detail if we already know who’s signed in:
     if (param && window.userId) {
       navigateToRecipeDetail(param);
       showView("recipeDetailView");
       return;
     }
     // otherwise fall back to browse:
     showView("browseView");
      return;
    
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
