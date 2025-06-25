// script.js

console.log("SCRIPT: script.js parsing started. Imports are next.");

// Firebase SDK imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, query, orderBy, onSnapshot, doc, getDoc, addDoc, updateDoc, deleteDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

console.log("SCRIPT: Firebase SDKs import statements processed.");

// --- Global Variables ---
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
let recipesGridContainer, recipesGridPlaceholder, headerSearchInput, mobileSearchInput;
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
        console.warn("DEBUG: showMessage - Target element is null.", { message: userMessage, error });
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
    // This function remains the same
    let message = "An unexpected error occurred. Please try again.";
    if (!error || !error.code) return message;
    switch (error.code) {
        case 'auth/user-cancelled': case 'auth/popup-closed-by-user':
            return "Sign-in was cancelled. Please try again.";
        case 'auth/network-request-failed':
            return "Network error. Please check your internet connection.";
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

// Helper function to reset the entire recipe form.
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
        if (!firebaseConfig || !firebaseConfig.apiKey) {
            throw new Error("Firebase configuration is missing or invalid.");
        }
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        storage = getStorage(app);
        console.log("DEBUG_INIT: Firebase core services initialized.");

        onAuthStateChanged(auth, (user) => {
            // This function remains the same
        });
    } catch (error) {
        showMessage(errorMessageDiv, "A critical error occurred during initialization.", true, error);
        if (authStatusDiv) authStatusDiv.textContent = "Init Error!";
    }
}

// ... (handleGoogleSignIn, handleSignOut, renderIngredientList functions remain the same)

// --- Recipe Form and Data Handling ---
async function handleRecipeFormSubmit(event) {
    // This function remains the same
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
            const dataToUpdate = { ...recipeData, lastUpdatedAt: Timestamp.now() };
            if (imageUrl !== undefined) {
                dataToUpdate.imageUrl = imageUrl;
            }
            await updateDoc(doc(recipesCol, recipeId), dataToUpdate);
            showMessage(successMessageDiv, "Recipe updated successfully!");
        } else {
            const dataToAdd = { ...recipeData, userId, createdAt: Timestamp.now() };
            if (imageUrl) {
                dataToAdd.imageUrl = imageUrl;
            }
            await addDoc(recipesCol, dataToAdd);
            showMessage(successMessageDiv, "Recipe added successfully!");
        }
        resetRecipeForm();
        showView('browseView');
    } catch (error) {
        showMessage(errorMessageDiv, `Error saving recipe: ${getFriendlyFirebaseErrorMessage(error)}`, true, error);
    }
}

async function populateFormForEdit(recipeId) {
    if (!userId) return;
    try {
        const recipeDocRef = doc(db, `artifacts/${appId}/users/${userId}/recipes`, recipeId);
        const docSnap = await getDoc(recipeDocRef);
        if (docSnap.exists()) {
            const recipe = docSnap.data();
            
            // **THE FIX IS HERE**
            // The function name was misspelled as resetRecipeform (lowercase f).
            // Corrected to resetRecipeForm (capital F).
            resetRecipeForm();

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


// ... (loadBrowseViewRecipes, renderRecipes, navigateToRecipeDetail, handleDeleteRecipe, updateCategoryButtonStyles functions remain the same)
// They can be copied from the previous correct version.


// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    try {
        // --- Assign All UI Elements ---
        authStatusDiv = document.getElementById('authStatus');
        googleSignInBtn = document.getElementById('googleSignInBtn');
        userInfoDiv = document.getElementById('userInfo');
        userNameSpan = document.getElementById('userName');
        signOutBtn = document.getElementById('signOutBtn');
        navigateToAddRecipeBtn = document.getElementById('navigateToAddRecipeBtn');
        navigateToBrowseBtnDetail = document.getElementById('navigateToBrowseBtnDetail');
        navigateToBrowseBtnForm = document.getElementById('navigateToBrowseBtnForm');
        recipeForm = document.getElementById('recipeForm');
        recipeTitleInput = document.getElementById('recipeTitleInput');
        recipeCategoryInput = document.getElementById('recipeCategoryInput');
        recipeImageInput = document.getElementById('recipeImageInput');
        imagePreviewContainer = document.getElementById('imagePreviewContainer');
        imagePreview = document.getElementById('imagePreview');
        removeImageBtn = document.getElementById('removeImageBtn');
        recipeDirectionsInput = document.getElementById('recipeDirectionsInput');
        recipeNotesInput = document.getElementById('recipeNotesInput');
        recipeTagsInput = document.getElementById('recipeTagsInput');
        formTitle = document.getElementById('formTitle');
        recipeIdInput = document.getElementById('recipeIdInput');
        newIngredientInput = document.getElementById('newIngredientInput');
        addIngredientBtn = document.getElementById('addIngredientBtn');
        ingredientListDisplay = document.getElementById('ingredientListDisplay');
        successMessageDiv = document.getElementById('successMessage');
        errorMessageDiv = document.getElementById('errorMessage');
        loadingIndicator = document.getElementById('loadingIndicator');
        recipesGridContainer = document.getElementById('recipesGridContainer');
        recipesGridPlaceholder = document.getElementById('recipesGridPlaceholder');
        headerSearchInput = document.getElementById('headerSearchInput');
        mobileSearchInput = document.getElementById('mobileSearchInput');
        detailRecipeTitle = document.getElementById('detailRecipeTitle');
        detailRecipeCategory = document.getElementById('detailRecipeCategory');
        detailRecipeTags = document.getElementById('detailRecipeTags');
        detailRecipeIngredients = document.getElementById('detailRecipeIngredients');
        detailRecipeDirections = document.getElementById('detailRecipeDirections');
        detailRecipeNotesContainer = document.getElementById('detailRecipeNotesContainer');
        detailRecipeNotes = document.getElementById('detailRecipeNotes');
        detailImagePlaceholder = document.getElementById('detailImagePlaceholder');
        editRecipeBtn = document.getElementById('editRecipeBtn');
        deleteRecipeBtn = document.getElementById('deleteRecipeBtn');

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
            resetRecipeForm();
            formTitle.textContent = 'Add New Recipe';
            showView('recipeFormView');
        });

        navigateToBrowseBtnDetail.addEventListener('click', () => showView('browseView'));
        navigateToBrowseBtnForm.addEventListener('click', () => {
            resetRecipeForm();
            showView('browseView');
        });

        // --- Forms and Actions ---
        recipeForm.addEventListener('submit', handleRecipeFormSubmit);
        editRecipeBtn.addEventListener('click', () => {
            if (currentRecipeIdInDetailView) populateFormForEdit(currentRecipeIdInDetailView);
        });
        deleteRecipeBtn.addEventListener('click', handleDeleteRecipe);

        const syncSearchAndRender = (event) => {
            const sourceElement = event.target;
            const targetElement = (sourceElement.id === 'headerSearchInput') ? mobileSearchInput : headerSearchInput;
            if (targetElement && targetElement.value !== sourceElement.value) {
                targetElement.value = sourceElement.value;
            }
            if (typeof renderRecipes === 'function') renderRecipes();
        };

        headerSearchInput.addEventListener('input', syncSearchAndRender);
        mobileSearchInput.addEventListener('input', syncSearchAndRender);

        addIngredientBtn.addEventListener('click', () => {
             const ingredientText = newIngredientInput.value.trim();
             if (ingredientText) {
                 currentIngredientsArray.push(ingredientText);
                 newIngredientInput.value = '';
                 renderIngredientList();
                 newIngredientInput.focus();
             }
         });
         
        document.querySelectorAll('.category-filter-btn').forEach(button => {
            button.addEventListener('click', () => {
                currentCategoryFilter = button.dataset.category;
                updateCategoryButtonStyles();
                renderRecipes();
            });
        });

        // --- Initial State ---
        updateCategoryButtonStyles();
        showView('browseView');

    } catch (error) {
        console.error("CRITICAL ERROR in DOMContentLoaded listener:", error);
        alert("A critical error occurred on page load. The application may not work correctly.");
    }
});

console.log("SCRIPT: script.js parsing finished.");
