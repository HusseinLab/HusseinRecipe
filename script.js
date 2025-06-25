// All 'import' statements MUST be at the top level of the module.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, query, orderBy, onSnapshot, doc, getDoc, addDoc, updateDoc, deleteDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// The rest of the application logic is wrapped in DOMContentLoaded
// to ensure the HTML page is fully loaded before we try to find elements.
document.addEventListener('DOMContentLoaded', () => {

    console.log("SCRIPT: DOMContentLoaded - Event fired. Initializing application.");

    // --- Global Variables ---
    let app, auth, db, storage;
    let userId = null;
    let recipesUnsubscribe = null;
    let currentRecipeIdInDetailView = null;
    window.lastRecipeSnapshot = null;
    let currentIngredientsArray = [];
    let currentCategoryFilter = 'all'; // Default filter
    let selectedImageFile = null;

    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-recipe-app-id';

    const firebaseConfig = {
        apiKey: "AIzaSyBiV-BFHLVy0EbKIl9gnt2j-QsLUyvkZvs",
        authDomain: "my-personal-recipe-book-8b55d.firebaseapp.com",
        projectId: "my-personal-recipe-book-8b55d",
        storageBucket: "my-personal-recipe-book-8b55d.appspot.com",
        messagingSenderId: "932879383972",
        appId: "1:932879383972:web:aa977406634fa061485531",
        measurementId: "G-ZWP1BKDXY4"
    };

    // --- UI Elements ---
    const authStatusDiv = document.getElementById('authStatus');
    const googleSignInBtn = document.getElementById('googleSignInBtn');
    const userInfoDiv = document.getElementById('userInfo');
    const userNameSpan = document.getElementById('userName');
    const signOutBtn = document.getElementById('signOutBtn');
    const navigateToAddRecipeBtn = document.getElementById('navigateToAddRecipeBtn');
    const navigateToBrowseBtnDetail = document.getElementById('navigateToBrowseBtnDetail');
    const navigateToBrowseBtnForm = document.getElementById('navigateToBrowseBtnForm');
    const recipeForm = document.getElementById('recipeForm');
    const recipeTitleInput = document.getElementById('recipeTitleInput');
    const recipeCategoryInput = document.getElementById('recipeCategoryInput');
    const recipeImageInput = document.getElementById('recipeImageInput');
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');
    const imagePreview = document.getElementById('imagePreview');
    const removeImageBtn = document.getElementById('removeImageBtn');
    const recipeDirectionsInput = document.getElementById('recipeDirectionsInput');
    const recipeNotesInput = document.getElementById('recipeNotesInput');
    const recipeTagsInput = document.getElementById('recipeTagsInput');
    const formTitle = document.getElementById('formTitle');
    const recipeIdInput = document.getElementById('recipeIdInput');
    const newIngredientInput = document.getElementById('newIngredientInput');
    const addIngredientBtn = document.getElementById('addIngredientBtn');
    const ingredientListDisplay = document.getElementById('ingredientListDisplay');
    const successMessageDiv = document.getElementById('successMessage');
    const errorMessageDiv = document.getElementById('errorMessage');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const recipesGridContainer = document.getElementById('recipesGridContainer');
    const recipesGridPlaceholder = document.getElementById('recipesGridPlaceholder');
    const headerSearchInput = document.getElementById('headerSearchInput');
    const mobileSearchInput = document.getElementById('mobileSearchInput');
    const detailRecipeTitle = document.getElementById('detailRecipeTitle');
    const detailRecipeCategory = document.getElementById('detailRecipeCategory');
    const detailRecipeTags = document.getElementById('detailRecipeTags');
    const detailRecipeIngredients = document.getElementById('detailRecipeIngredients');
    const detailRecipeDirections = document.getElementById('detailRecipeDirections');
    const detailRecipeNotesContainer = document.getElementById('detailRecipeNotesContainer');
    const detailRecipeNotes = document.getElementById('detailRecipeNotes');
    const detailImagePlaceholder = document.getElementById('detailImagePlaceholder');
    const editRecipeBtn = document.getElementById('editRecipeBtn');
    const deleteRecipeBtn = document.getElementById('deleteRecipeBtn');
    const views = ['browseView', 'recipeDetailView', 'recipeFormView'];

    // --- FUNCTION DEFINITIONS ---

    function showView(viewIdToShow) {
        views.forEach(viewId => {
            const viewElement = document.getElementById(viewId);
            if (viewElement) {
                viewElement.classList.toggle('view-active', viewId === viewIdToShow);
                viewElement.classList.toggle('view-hidden', viewId !== viewIdToShow);
            }
        });
        if (viewIdToShow === 'browseView' && typeof loadBrowseViewRecipes === 'function') {
            loadBrowseViewRecipes();
        }
    }

    function showMessage(element, userMessage, isError = false, duration = 4000, error = null) {
        if (!element) return;
        if (isError && error) console.error(`User Message: "${userMessage}" \nDetailed Error:`, error);
        
        element.textContent = userMessage;
        element.classList.remove('hidden');
        element.className = `p-3 text-sm text-white rounded-lg fixed top-24 right-5 z-50 shadow-lg ${isError ? 'bg-red-500' : 'bg-green-500'}`;
        
        setTimeout(() => {
            element.classList.add('hidden');
        }, duration);
    }

    function getFriendlyFirebaseErrorMessage(error) {
        let message = "An unexpected error occurred. Please try again.";
        if (!error || !error.code) return message;
        switch (error.code) {
            case 'auth/user-cancelled': case 'auth/popup-closed-by-user': return "Sign-in was cancelled.";
            case 'auth/network-request-failed': return "Network error. Please check your internet connection.";
            case 'firestore/permission-denied': return "You do not have permission to perform this action.";
            default: return error.message || message;
        }
    }
    
    function updateCategoryButtonStyles() {
        document.querySelectorAll('.category-filter-btn').forEach(button => {
            button.classList.toggle('category-filter-btn-active', button.dataset.category === currentCategoryFilter);
        });
    }

    function resetRecipeForm() {
        if (recipeForm) recipeForm.reset();
        if (recipeIdInput) recipeIdInput.value = '';
        currentIngredientsArray = [];
        if (typeof renderIngredientList === 'function') renderIngredientList();
        selectedImageFile = null;
        if (recipeImageInput) recipeImageInput.value = '';
        if (imagePreview) imagePreview.src = '#';
        if (imagePreviewContainer) imagePreviewContainer.classList.add('hidden');
    }

    async function handleGoogleSignIn() {
        if (!auth) { showMessage(errorMessageDiv, "Auth service not ready.", true); return; }
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            showMessage(successMessageDiv, `Welcome, ${result.user.displayName}!`);
        } catch (error) {
            showMessage(errorMessageDiv, getFriendlyFirebaseErrorMessage(error), true, error);
        }
    }

    async function handleSignOut() {
        try {
            await signOut(auth);
            showMessage(successMessageDiv, "You have been signed out.");
        } catch (error) {
            showMessage(errorMessageDiv, getFriendlyFirebaseErrorMessage(error), true, error);
        }
    }

    function renderIngredientList() {
        if (!ingredientListDisplay) return;
        ingredientListDisplay.innerHTML = '';
        currentIngredientsArray.forEach((ingredient, index) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'flex items-center justify-between bg-gray-100 p-2 pl-3 rounded-md text-sm';
            itemDiv.innerHTML = `<span>${ingredient}</span><button type="button" title="Remove ingredient" class="ml-2 text-red-500 hover:text-red-700 font-bold text-lg leading-none px-1">&times;</button>`;
            itemDiv.querySelector('button').addEventListener('click', () => {
                currentIngredientsArray.splice(index, 1);
                renderIngredientList();
            });
            ingredientListDisplay.appendChild(itemDiv);
        });
    }

    function loadBrowseViewRecipes() {
        if (!userId) return;
        if (recipesUnsubscribe) {
            renderRecipes(); // Just re-render if we already have a listener
            return;
        }
        const q = query(collection(db, `artifacts/${appId}/users/${userId}/recipes`), orderBy("createdAt", "desc"));
        recipesUnsubscribe = onSnapshot(q, (querySnapshot) => {
            window.lastRecipeSnapshot = querySnapshot;
            renderRecipes();
        }, (error) => {
            showMessage(errorMessageDiv, `Error fetching recipes: ${getFriendlyFirebaseErrorMessage(error)}`, true, error);
        });
    }

    function renderRecipes() {
        if (!recipesGridContainer || !recipesGridPlaceholder) return;
        if (!window.lastRecipeSnapshot || !userId) {
            recipesGridContainer.innerHTML = '';
            recipesGridPlaceholder.style.display = 'block';
            recipesGridPlaceholder.innerHTML = userId ? '<p class="text-center text-gray-500 py-8 col-span-full">Loading recipes...</p>' : '<p class="text-center text-gray-500 py-8 col-span-full">Please sign in to see recipes.</p>';
            return;
        }

        recipesGridContainer.innerHTML = '';
        let recipesFound = 0;
        const searchTerm = (headerSearchInput.value || "").toLowerCase().trim();

        window.lastRecipeSnapshot.forEach(doc => {
            const recipe = doc.data();
            const recipeId = doc.id;
             if (currentCategoryFilter !== 'all' && recipe.category !== currentCategoryFilter) {
                 return;
             }

            const isMatch = searchTerm === "" ||
                (recipe.title && recipe.title.toLowerCase().includes(searchTerm)) ||
                (recipe.tags && recipe.tags.some(tag => tag.toLowerCase().includes(searchTerm)));

            if (isMatch) {
                recipesFound++;
                const card = document.createElement('div');
                card.className = 'bg-white rounded-xl shadow-lg overflow-hidden transform hover:scale-105 transition-transform duration-300 ease-in-out cursor-pointer flex flex-col group';
                card.dataset.id = recipeId;
                card.addEventListener('click', () => navigateToRecipeDetail(recipeId));
                card.innerHTML = `
                    <div class="h-48 w-full bg-slate-200 flex items-center justify-center text-slate-400">
                        ${recipe.imageUrl ? `<img src="${recipe.imageUrl}" alt="${recipe.title}" class="w-full h-full object-cover">` : `<svg class="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>`}
                    </div>
                    <div class="p-5 flex-grow">
                        <p class="text-xs font-semibold text-indigo-600 uppercase mb-1">${recipe.category || 'Uncategorized'}</p>
                        <h3 class="text-xl font-bold text-gray-800">${recipe.title || 'Untitled Recipe'}</h3>
                    </div>`;
                recipesGridContainer.appendChild(card);
            }
        });
        
        recipesGridPlaceholder.style.display = recipesFound > 0 ? 'none' : 'block';
        if(recipesFound === 0) {
            recipesGridPlaceholder.innerHTML = '<p class="text-center text-gray-500 py-8 col-span-full">No recipes found matching your criteria.</p>';
        }
    }
    
    async function navigateToRecipeDetail(recipeId) {
        if (!userId) return;
        currentRecipeIdInDetailView = recipeId;
        showView('recipeDetailView');
        
        detailRecipeTitle.textContent = "Loading...";
        detailRecipeCategory.textContent = "";
        detailRecipeIngredients.innerHTML = "";
        detailRecipeDirections.innerHTML = "";
        
        try {
            const docSnap = await getDoc(doc(db, `artifacts/${appId}/users/${userId}/recipes`, recipeId));
            if (docSnap.exists()) {
                const recipe = docSnap.data();
                detailRecipeTitle.textContent = recipe.title;
                detailRecipeCategory.textContent = recipe.category;
                detailRecipeIngredients.innerHTML = (recipe.ingredients || []).map(ing => `<li>${ing}</li>`).join('');
                detailRecipeDirections.innerHTML = (recipe.directions || []).map(dir => `<li>${dir}</li>`).join('');
                // etc.
            } else {
                showMessage(errorMessageDiv, "Recipe not found.", true);
                showView('browseView');
            }
        } catch(error) {
            showMessage(errorMessageDiv, getFriendlyFirebaseErrorMessage(error), true, error);
        }
    }

    // Define other functions like handleDeleteRecipe, handleRecipeFormSubmit, etc. before they are called by listeners...
    // These should be complete and correct from previous steps.

    // --- MAIN EXECUTION LOGIC ---
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        storage = getStorage(app);
        console.log("Firebase Initialized Successfully.");

        onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid;
                userInfoDiv.classList.remove('hidden');
                userInfoDiv.classList.add('flex');
                googleSignInBtn.classList.add('hidden');
                userNameSpan.textContent = user.displayName || "User";
                if (recipesUnsubscribe) recipesUnsubscribe(); // Clean up old listener
                recipesUnsubscribe = null;
                loadBrowseViewRecipes();
            } else {
                userId = null;
                if (recipesUnsubscribe) {
                    recipesUnsubscribe();
                    recipesUnsubscribe = null;
                }
                userInfoDiv.classList.add('hidden');
                userInfoDiv.classList.remove('flex');
                googleSignInBtn.classList.remove('hidden');
                window.lastRecipeSnapshot = null;
                renderRecipes();
            }
        });

        // --- Attach All Event Listeners ---
        googleSignInBtn.addEventListener('click', handleGoogleSignIn);
        signOutBtn.addEventListener('click', handleSignOut);
        
        navigateToAddRecipeBtn.addEventListener('click', () => {
            if (!userId) { showMessage(errorMessageDiv, "Please sign in to add recipes.", true); return; }
            resetRecipeForm();
            formTitle.textContent = 'Add New Recipe';
            showView('recipeFormView');
        });

        navigateToBrowseBtnDetail.addEventListener('click', () => showView('browseView'));
        navigateToBrowseBtnForm.addEventListener('click', () => {
             resetRecipeForm();
             showView('browseView');
        });
        
        const syncSearchAndRender = (event) => {
            const sourceElement = event.target;
            const targetElement = (sourceElement.id === 'headerSearchInput') ? mobileSearchInput : headerSearchInput;
            if (targetElement && targetElement.value !== sourceElement.value) {
                targetElement.value = sourceElement.value;
            }
            renderRecipes();
        };
        headerSearchInput.addEventListener('input', syncSearchAndRender);
        mobileSearchInput.addEventListener('input', syncSearchAndRender);
        
        document.querySelectorAll('.category-filter-btn').forEach(button => {
            button.addEventListener('click', () => {
                currentCategoryFilter = button.dataset.category;
                updateCategoryButtonStyles();
                renderRecipes();
            });
        });

        // Add other listeners for form submission, ingredient adding, etc. here

        // --- Initial State ---
        updateCategoryButtonStyles();
        showView('browseView');

    } catch (error) {
        console.error("CRITICAL ERROR in application startup:", error);
        alert("A critical error occurred on page load. The application may not work correctly. See console for details.");
    }
});
