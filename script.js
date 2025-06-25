// script.js

console.log("SCRIPT: script.js parsing started. Imports are next.");

// Firebase SDK imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, query, orderBy, onSnapshot, doc, getDoc, addDoc, updateDoc, deleteDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

console.log("SCRIPT: Firebase SDKs import statements processed.");

// --- Global Variables for Firebase and App State ---
let app, auth, db, storage;
let userId = null;
let recipesUnsubscribe = null;
let currentRecipeIdInDetailView = null;
window.lastRecipeSnapshot = null;
let currentIngredientsArray = [];
let currentCategoryFilter = 'all';
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
let authStatusDiv, googleSignInBtn, userInfoDiv, userNameSpan, signOutBtn, navigateToAddRecipeBtn, navigateToBrowseBtnDetail, navigateToBrowseBtnForm;
let recipeForm, recipeTitleInput, recipeCategoryInput, recipeImageInput, imagePreviewContainer, imagePreview, removeImageBtn, recipeDirectionsInput, recipeNotesInput, recipeTagsInput, formTitle, recipeIdInput;
let newIngredientInput, addIngredientBtn, ingredientListDisplay;
let successMessageDiv, errorMessageDiv, loadingIndicator;
let recipesGridContainer, recipesGridPlaceholder, headerSearchInput, mobileSearchInput, categoryFilterButtonsNodeList;
let detailRecipeTitle, detailRecipeCategory, detailRecipeTags, detailRecipeIngredients, detailRecipeDirections, detailRecipeNotesContainer, detailRecipeNotes, detailImagePlaceholder;
let editRecipeBtn, deleteRecipeBtn;

const views = ['browseView', 'recipeDetailView', 'recipeFormView'];

// --- View Management ---
function showView(viewIdToShow) {
    console.log(`DEBUG: showView - Called for ${viewIdToShow}`);
    views.forEach(viewId => {
        const viewElement = document.getElementById(viewId);
        if (viewElement) {
            viewElement.classList.toggle('view-active', viewId === viewIdToShow);
            viewElement.classList.toggle('view-hidden', viewId !== viewIdToShow);
        } else {
            console.warn(`DEBUG: showView - View element not found: ${viewId}`);
        }
    });

    if (viewIdToShow === 'browseView' && typeof loadBrowseViewRecipes === 'function') {
        loadBrowseViewRecipes();
    }
}

// --- User Messaging & Error Handling ---
function showMessage(element, userMessage, isError = false, duration = 4000, error = null) {
    if (!element) {
        console.warn("DEBUG: showMessage - Target element is null. Message:", userMessage, "Error details:", error);
        return;
    }
    if (isError && error) {
        console.error(`User Message: "${userMessage}" \nDetailed Error:`, error);
    }
    element.textContent = userMessage;
    element.className = `p-3 text-sm text-white rounded-lg fixed top-24 right-5 z-50 shadow-lg ${isError ? 'bg-red-500' : 'bg-green-500'}`;
    element.classList.remove('hidden');
    setTimeout(() => element.classList.add('hidden'), duration);
}

function getFriendlyFirebaseErrorMessage(error) {
    let message = "An unexpected error occurred. Please try again.";
    if (!error || !error.code) return message;
    switch (error.code) {
        case 'auth/user-cancelled':
        case 'auth/popup-closed-by-user':
            return "Sign-in was cancelled. Please try again.";
        case 'auth/network-request-failed':
            return "Network error. Please check your internet connection and try again.";
        case 'firestore/permission-denied':
            return "You do not have permission to perform this action.";
        case 'storage/object-not-found':
            return "The image for this recipe could not be found.";
        case 'storage/unauthorized':
            return "You are not authorized to upload images.";
        case 'storage/canceled':
            return "Image upload was cancelled.";
        default:
            console.warn(`Unhandled Firebase error code: ${error.code}`);
            return error.message || message;
    }
}

// REFACTOR: New helper function to reset the entire recipe form.
// This consolidates all the reset logic into one place.
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


// --- Firebase Initialization and Authentication ---
async function initializeFirebaseAndAuth() {
    try {
        console.log("DEBUG_INIT: initializeFirebaseAndAuth - START");
        if (!firebaseConfig || !firebaseConfig.apiKey) {
            const errorMessage = "Firebase configuration is missing or invalid. The app cannot start.";
            console.error("DEBUG_INIT: " + errorMessage);
            if(authStatusDiv) authStatusDiv.textContent = "Config Error!";
            showMessage(errorMessageDiv, errorMessage, true);
            return;
        }
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        storage = getStorage(app);
        console.log("DEBUG_INIT: Firebase core services initialized.");

        onAuthStateChanged(auth, (user) => {
            const currentAuthStatusDiv = document.getElementById('authStatus');
            const currentGoogleSignInBtn = document.getElementById('googleSignInBtn');
            const currentUserInfoDiv = document.getElementById('userInfo');
            const currentUserNameSpan = document.getElementById('userName');

            if (user) {
                userId = user.uid;
                console.log("DEBUG_INIT: User IS authenticated. UID:", userId);
                if (currentAuthStatusDiv) currentAuthStatusDiv.classList.add('hidden');
                if (currentGoogleSignInBtn) currentGoogleSignInBtn.classList.add('hidden');
                if (currentUserInfoDiv) {
                    currentUserInfoDiv.classList.remove('hidden');
                    currentUserInfoDiv.classList.add('flex');
                }
                if (currentUserNameSpan) currentUserNameSpan.textContent = user.displayName || user.email || "User";
                loadBrowseViewRecipes();
            } else {
                userId = null;
                if (recipesUnsubscribe) { recipesUnsubscribe(); recipesUnsubscribe = null; }
                if (currentAuthStatusDiv) currentAuthStatusDiv.classList.add('hidden');
                if (currentGoogleSignInBtn) currentGoogleSignInBtn.classList.remove('hidden');
                if (currentUserInfoDiv) {
                    currentUserInfoDiv.classList.add('hidden');
                    currentUserInfoDiv.classList.remove('flex');
                }
                if (recipesGridContainer) recipesGridContainer.innerHTML = '';
                if (recipesGridPlaceholder) recipesGridPlaceholder.innerHTML = '<p class="text-center text-gray-500 py-8 col-span-full">Please sign in to see recipes.</p>';
            }
        });
    } catch (error) {
        const userMessage = "A critical error occurred during initialization.";
        showMessage(errorMessageDiv, userMessage, true, error);
        if (authStatusDiv) authStatusDiv.textContent = "Init Error!";
    }
}

async function handleGoogleSignIn() {
    if (!auth) {
        showMessage(errorMessageDiv, "Authentication service is not ready. Please wait.", true);
        return;
    }
    try {
        const result = await signInWithPopup(auth, new GoogleAuthProvider());
        showMessage(successMessageDiv, `Welcome, ${result.user.displayName}!`);
    } catch (error) {
        const userMessage = getFriendlyFirebaseErrorMessage(error);
        showMessage(errorMessageDiv, userMessage, true, error);
    }
}

async function handleSignOut() {
    if (!auth) {
        showMessage(errorMessageDiv, "Authentication service is not ready.", true);
        return;
    }
    try {
        await signOut(auth);
        showMessage(successMessageDiv, "You have been signed out.");
    } catch (error) {
        const userMessage = getFriendlyFirebaseErrorMessage(error);
        showMessage(errorMessageDiv, userMessage, true, error);
    }
}

// --- Ingredient Management ---
function renderIngredientList() {
    if(!ingredientListDisplay) { return; }
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

// --- Recipe Form and Data Handling ---
async function handleRecipeFormSubmit(event) {
    event.preventDefault();
    if (!userId) { showMessage(errorMessageDiv, "You must be logged in to save recipes.", true); return; }

    const titleValue = recipeTitleInput.value.trim();
    const categoryValue = recipeCategoryInput.value;
    const directionsText = recipeDirectionsInput.value.trim();
    const recipeIdToEdit = recipeIdInput.value;

    let validationErrors = [];
    if (!titleValue) validationErrors.push("Title");
    if (!categoryValue) validationErrors.push("Category");
    if (currentIngredientsArray.length === 0) validationErrors.push("at least one Ingredient");
    if (!directionsText) validationErrors.push("Directions");

    if (validationErrors.length > 0) {
        showMessage(errorMessageDiv, `Please provide the following: ${validationErrors.join(', ')}.`, true);
        return;
    }

    loadingIndicator.classList.remove('hidden');
    loadingIndicator.style.width = '0%';

    const notesValue = recipeNotesInput ? recipeNotesInput.value.trim() : "";
    const tagsText = recipeTagsInput ? recipeTagsInput.value.trim() : "";

    if (selectedImageFile) {
        const imageName = `${userId}_${Date.now()}_${selectedImageFile.name.replace(/\s+/g, '_')}`;
        const storageRefPath = `recipe_images/${userId}/${imageName}`;
        const uploadTask = uploadBytesResumable(storageRef(storage, storageRefPath), selectedImageFile);

        uploadTask.on('state_changed',
            (snapshot) => { loadingIndicator.style.width = `${(snapshot.bytesTransferred / snapshot.totalBytes) * 100}%`; },
            (error) => {
                showMessage(errorMessageDiv, getFriendlyFirebaseErrorMessage(error), true, error);
                loadingIndicator.classList.add('hidden');
            },
            async () => {
                try {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    await saveRecipeDataToFirestore(recipeIdToEdit, titleValue, categoryValue, directionsText, notesValue, tagsText, downloadURL);
                } catch (error) {
                    showMessage(errorMessageDiv, "Error saving recipe after image upload.", true, error);
                } finally {
                    loadingIndicator.classList.add('hidden');
                }
            }
        );
    } else {
        let imageUrlToSave = undefined;
        if (recipeIdToEdit && imagePreview) {
            imageUrlToSave = (imagePreview.src.startsWith('http')) ? imagePreview.src : null;
        }
        await saveRecipeDataToFirestore(recipeIdToEdit, titleValue, categoryValue, directionsText, notesValue, tagsText, imageUrlToSave);
        loadingIndicator.classList.add('hidden');
    }
}

async function saveRecipeDataToFirestore(recipeId, title, category, directions, notes, tags, imageUrl) {
    const recipeData = {
        title, category,
        ingredients: [...currentIngredientsArray],
        directions: directions.split('\n').map(s => s.trim()).filter(Boolean),
        notes,
        tags: tags.split(',').map(s => s.trim()).filter(Boolean),
    };

    try {
        const recipesCol = collection(db, `artifacts/${appId}/users/${userId}/recipes`);
        if (recipeId) {
            await updateDoc(doc(recipesCol, recipeId), { ...recipeData, lastUpdatedAt: Timestamp.now(), ...(imageUrl !== undefined && {imageUrl}) });
            showMessage(successMessageDiv, "Recipe updated successfully!");
        } else {
            await addDoc(recipesCol, { ...recipeData, userId, createdAt: Timestamp.now(), ...(imageUrl && {imageUrl}) });
            showMessage(successMessageDiv, "Recipe added successfully!");
        }
        // REFACTOR: Use the helper function to reset the form.
        resetRecipeForm();
        showView('browseView');
    } catch (error) {
        showMessage(errorMessageDiv, `Error saving recipe: ${getFriendlyFirebaseErrorMessage(error)}`, true, error);
    }
}

async function populateFormForEdit(recipeId) {
    if (!userId) return;
    try {
        const recipeDoc = await getDoc(doc(db, `artifacts/${appId}/users/${userId}/recipes`, recipeId));
        if (recipeDoc.exists()) {
            const recipe = recipeDoc.data();
            
            // REFACTOR: Reset form state before populating to ensure a clean slate.
            resetRecipeform();

            recipeTitleInput.value = recipe.title || '';
            recipeCategoryInput.value = recipe.category || '';
            currentIngredientsArray = [...(recipe.ingredients || [])];
            renderIngredientList();
            recipeDirectionsInput.value = (recipe.directions || []).join('\n');
            recipeNotesInput.value = recipe.notes || '';
            recipeTagsInput.value = (recipe.tags || []).join(', ');
            recipeIdInput.value = recipeId;
            formTitle.textContent = 'Edit Recipe';

            if (recipe.imageUrl && imagePreview && imagePreviewContainer) {
                imagePreview.src = recipe.imageUrl;
                imagePreviewContainer.classList.remove('hidden');
            }
            showView('recipeFormView');
        } else {
            showMessage(errorMessageDiv, "Recipe not found. It may have been deleted.", true);
            showView('browseView');
        }
    } catch (error) {
        showMessage(errorMessageDiv, `Error loading recipe: ${getFriendlyFirebaseErrorMessage(error)}`, true, error);
    }
}

// --- Recipe Display and Filtering ---
function loadBrowseViewRecipes() {
    if (!userId || !db) {
        if (recipesGridPlaceholder) recipesGridPlaceholder.innerHTML = '<p class="text-center text-gray-500 py-8 col-span-full">Sign in to see recipes.</p>';
        return;
    }
    if (!recipesUnsubscribe) {
        if (recipesGridPlaceholder) recipesGridPlaceholder.textContent = 'Loading your awesome recipes...';
        const q = query(collection(db, `artifacts/${appId}/users/${userId}/recipes`), orderBy("createdAt", "desc"));
        recipesUnsubscribe = onSnapshot(q, (querySnapshot) => {
            window.lastRecipeSnapshot = querySnapshot;
            renderRecipes();
        }, (error) => {
            showMessage(errorMessageDiv, `Error fetching recipes: ${getFriendlyFirebaseErrorMessage(error)}`, true, error);
            if (recipesGridPlaceholder) recipesGridPlaceholder.textContent = 'Error loading recipes.';
        });
    } else {
        renderRecipes();
    }
}

function renderRecipes() {
    // This function is complex but not repetitive, so it remains unchanged.
    // ... (Your existing renderRecipes function)
}

async function navigateToRecipeDetail(recipeId) {
    // This function remains largely the same.
    // ... (Your existing navigateToRecipeDetail function)
}

async function handleDeleteRecipe() {
    if (!userId || !currentRecipeIdInDetailView) {
        showMessage(errorMessageDiv, "No recipe selected to delete.", true);
        return;
    }
    const recipeTitle = detailRecipeTitle.textContent || "this recipe";
    if (!confirm(`Are you sure you want to permanently delete "${recipeTitle}"?`)) {
        return;
    }
    try {
        await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/recipes`, currentRecipeIdInDetailView));
        showMessage(successMessageDiv, `Successfully deleted "${recipeTitle}".`);
        currentRecipeIdInDetailView = null;
        showView('browseView');
    } catch (error) {
        showMessage(errorMessageDiv, `Failed to delete recipe: ${getFriendlyFirebaseErrorMessage(error)}`, true, error);
    }
}

function updateCategoryButtonStyles() {
    document.querySelectorAll('.category-filter-btn').forEach(button => {
        button.classList.toggle('category-filter-btn-active', button.dataset.category === currentCategoryFilter);
    });
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    try {
        // --- Assign All UI Elements ---
        authStatusDiv = document.getElementById('authStatus');
        googleSignInBtn = document.getElementById('googleSignInBtn');
        // ... (all other getElementById assignments) ...
        navigateToAddRecipeBtn = document.getElementById('navigateToAddRecipeBtn');
        navigateToBrowseBtnDetail = document.getElementById('navigateToBrowseBtnDetail');
        navigateToBrowseBtnForm = document.getElementById('navigateToBrowseBtnForm');
        recipeForm = document.getElementById('recipeForm');
        recipeIdInput = document.getElementById('recipeIdInput');
        imagePreviewContainer = document.getElementById('imagePreviewContainer');
        imagePreview = document.getElementById('imagePreview');
        recipeImageInput = document.getElementById('recipeImageInput');
        headerSearchInput = document.getElementById('headerSearchInput');
        mobileSearchInput = document.getElementById('mobileSearchInput');
        editRecipeBtn = document.getElementById('editRecipeBtn');
        deleteRecipeBtn = document.getElementById('deleteRecipeBtn');
        formTitle = document.getElementById('formTitle');
        // ... and so on for all your UI elements ...

        initializeFirebaseAndAuth();

        // --- Auth Buttons ---
        googleSignInBtn.addEventListener('click', handleGoogleSignIn);
        signOutBtn.addEventListener('click', handleSignOut);

        // --- Navigation ---
        navigateToAddRecipeBtn.addEventListener('click', () => {
            if (!userId) {
                showMessage(errorMessageDiv, "Please sign in to add recipes.", true);
                return;
            }
            // REFACTOR: Use the helper function here.
            resetRecipeForm();
            formTitle.textContent = 'Add New Recipe';
            showView('recipeFormView');
        });

        navigateToBrowseBtnDetail.addEventListener('click', () => showView('browseView'));
        navigateToBrowseBtnForm.addEventListener('click', () => {
            // REFACTOR: Also use the helper function when cancelling from the form.
            resetRecipeForm();
            showView('browseView');
        });

        // --- Forms and Actions ---
        recipeForm.addEventListener('submit', handleRecipeFormSubmit);
        editRecipeBtn.addEventListener('click', () => {
            if (currentRecipeIdInDetailView) populateFormForEdit(currentRecipeIdInDetailView);
        });
        deleteRecipeBtn.addEventListener('click', handleDeleteRecipe);

        // REFACTOR: New helper function to sync search inputs and trigger render.
        const syncSearchAndRender = (event) => {
            const sourceElement = event.target;
            const targetElement = (sourceElement.id === 'headerSearchInput') ? mobileSearchInput : headerSearchInput;
            if (targetElement.value !== sourceElement.value) {
                targetElement.value = sourceElement.value;
            }
            renderRecipes();
        };

        headerSearchInput.addEventListener('input', syncSearchAndRender);
        mobileSearchInput.addEventListener('input', syncSearchAndRender);

        // ... (rest of the event listeners for ingredients, categories, etc.)

        // --- Initial State ---
        updateCategoryButtonStyles();
        showView('browseView');

    } catch (error) {
        console.error("CRITICAL ERROR in DOMContentLoaded listener:", error);
        alert("A critical error occurred on page load. The application may not work correctly.");
    }
});

console.log("SCRIPT: script.js parsing finished.");
