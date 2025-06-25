// script.js

console.log("SCRIPT: script.js parsing started. Imports are next.");

// Firebase SDK imports

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

import {
getAuth,
onAuthStateChanged,
GoogleAuthProvider,
signInWithPopup,
signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import {
getFirestore,
collection, query, orderBy, onSnapshot,
doc, getDoc, addDoc, updateDoc, deleteDoc,
Timestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
getStorage,
ref as storageRef,
uploadBytesResumable,
getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

console.log("SCRIPT: Firebase SDKs import statements processed.");

// --- Global Variables for Firebase and App State ---

let app;
let auth;
let db;
let storage;
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
    // This function remains the same
    console.log(`DEBUG: showView - Called for ${viewIdToShow}`);
    views.forEach(viewId => {
        const viewElement = document.getElementById(viewId);
        if (viewElement) {
            if (viewId === viewIdToShow) {
                viewElement.classList.remove('view-hidden');
                viewElement.classList.add('view-active');
            } else {
                viewElement.classList.remove('view-active');
                viewElement.classList.add('view-hidden');
            }
        } else {
            console.warn(`DEBUG: showView - View element not found: ${viewId}`);
        }
    });

    if (viewIdToShow === 'browseView') {
        if (userId && db) {
            if (typeof loadBrowseViewRecipes === 'function') loadBrowseViewRecipes();
        } else if (window.lastRecipeSnapshot) {
             if (typeof renderRecipes === 'function') renderRecipes();
        } else {
             if (typeof renderRecipes === 'function') renderRecipes();
        }
    }
}


// --- ENHANCEMENT: More robust and informative user messaging ---
function showMessage(element, userMessage, isError = false, duration = 4000, error = null) {
    if (!element) {
        console.warn("DEBUG: showMessage - Target element is null. Message:", userMessage, "Error details:", error);
        return;
    }
    // ENHANCEMENT: Log the detailed error for debugging purposes if it's provided.
    if (isError && error) {
        console.error(`User Message: "${userMessage}" \nDetailed Error:`, error);
    }

    element.textContent = userMessage;
    element.classList.remove('hidden');
    element.className = 'p-3 text-sm text-white rounded-lg fixed top-24 right-5 z-50 shadow-lg';
    if (isError) {
        element.classList.add('bg-red-500');
        element.classList.remove('bg-green-500');
    } else {
        element.classList.add('bg-green-500');
        element.classList.remove('bg-red-500');
    }
    setTimeout(() => { element.classList.add('hidden'); }, duration);
}

// --- ENHANCEMENT: Helper function to translate Firebase errors into user-friendly messages ---
function getFriendlyFirebaseErrorMessage(error) {
    let message = "An unexpected error occurred. Please try again.";
    if (error && error.code) {
        switch (error.code) {
            case 'auth/user-cancelled':
            case 'auth/popup-closed-by-user':
                message = "Sign-in was cancelled. Please try again.";
                break;
            case 'auth/network-request-failed':
                message = "Network error. Please check your internet connection and try again.";
                break;
            case 'firestore/permission-denied':
                message = "You do not have permission to perform this action.";
                break;
            case 'storage/object-not-found':
                message = "The image for this recipe could not be found.";
                break;
            case 'storage/unauthorized':
                 message = "You are not authorized to upload images.";
                 break;
            case 'storage/canceled':
                 message = "Image upload was cancelled.";
                 break;
            default:
                // For other specific errors, you can add more cases here.
                // We'll fallback to the default message for unhandled codes.
                console.warn(`Unhandled Firebase error code: ${error.code}`);
                // Fallback to a more generic message but still better than the default technical one
                if (error.message) {
                    message = `An error occurred: ${error.message}`;
                }
        }
    }
    return message;
}


// --- Firebase Initialization and Authentication ---

async function initializeFirebaseAndAuth() {
    try {
        console.log("DEBUG_INIT: initializeFirebaseAndAuth - START");
        if (!authStatusDiv) { console.error("DEBUG_INIT: authStatusDiv is NULL at start!"); return; }
        authStatusDiv.textContent = "Initializing...";
        if (!firebaseConfig || !firebaseConfig.apiKey) {
            const errorMessage = "Firebase configuration is missing or invalid. The app cannot start.";
            console.error("DEBUG_INIT: " + errorMessage);
            authStatusDiv.textContent = "Config Error!";
            // ENHANCEMENT: Use the new showMessage function for critical init errors
            showMessage(errorMessageDiv, errorMessage, true);
            return;
        }
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        storage = getStorage(app);
        console.log("DEBUG_INIT: Firebase core services initialized.");

        onAuthStateChanged(auth, async (user) => {
            console.log("DEBUG_INIT: onAuthStateChanged - Fired. User object present:", !!user);
            const currentAuthStatusDiv = document.getElementById('authStatus');
            const currentGoogleSignInBtn = document.getElementById('googleSignInBtn');
            const currentUserInfoDiv = document.getElementById('userInfo');
            const currentUserNameSpan = document.getElementById('userName');

            if (user) {
                userId = user.uid;
                console.log("DEBUG_INIT: onAuthStateChanged - User IS authenticated. UID:", userId);
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
                currentRecipeIdInDetailView = null; window.lastRecipeSnapshot = null; currentCategoryFilter = 'all';
                updateCategoryButtonStyles();
                console.log("DEBUG_INIT: onAuthStateChanged - User IS NOT authenticated.");
                if (currentAuthStatusDiv) currentAuthStatusDiv.classList.add('hidden');
                if (currentGoogleSignInBtn) currentGoogleSignInBtn.classList.remove('hidden');
                if (currentUserInfoDiv) {
                    currentUserInfoDiv.classList.add('hidden');
                    currentUserInfoDiv.classList.remove('flex');
                }
                if (currentUserNameSpan) currentUserNameSpan.textContent = '';
                if (recipesUnsubscribe) { recipesUnsubscribe(); recipesUnsubscribe = null; }
                if (recipesGridContainer) recipesGridContainer.innerHTML = '';
                if (recipesGridPlaceholder) recipesGridPlaceholder.innerHTML = '<p class="text-center text-gray-500 py-8 col-span-full">Please sign in to see recipes.</p>';
                if (headerSearchInput) headerSearchInput.value = ""; if (mobileSearchInput) mobileSearchInput.value = "";
            }
        });
        console.log("DEBUG_INIT: onAuthStateChanged listener attached.");
    } catch (error) {
        const userMessage = "A critical error occurred during initialization.";
        // ENHANCEMENT: Use the new messaging system for better feedback
        showMessage(errorMessageDiv, userMessage, true, error);
        if (authStatusDiv) authStatusDiv.textContent = "Init Error!";
    }
}

async function handleGoogleSignIn() {
    console.log("Attempting Google Sign-In...");
    if (!auth) {
        showMessage(errorMessageDiv, "Authentication service is not ready. Please wait a moment.", true);
        return;
    }
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        console.log("Google Sign-In successful for user:", result.user.displayName);
        showMessage(successMessageDiv, `Welcome, ${result.user.displayName}!`);
    } catch (error) {
        // ENHANCEMENT: Use the friendly error message helper
        const userMessage = getFriendlyFirebaseErrorMessage(error);
        showMessage(errorMessageDiv, userMessage, true, error);
    }
}

async function handleSignOut() {
    console.log("Attempting Sign-Out...");
    if (!auth) {
        showMessage(errorMessageDiv, "Authentication service is not ready.", true);
        return;
    }
    try {
        await signOut(auth);
        console.log("User signed out successfully.");
        showMessage(successMessageDiv, "You have been signed out.");
    } catch (error) {
        // ENHANCEMENT: Use the friendly error message helper
        const userMessage = getFriendlyFirebaseErrorMessage(error);
        showMessage(errorMessageDiv, userMessage, true, error);
    }
}

// --- Ingredient Management ---
function renderIngredientList() {
    // This function remains the same
    if(!ingredientListDisplay) { return; }
    ingredientListDisplay.innerHTML = '';
    currentIngredientsArray.forEach((ingredient, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'flex items-center justify-between bg-gray-100 p-2 pl-3 rounded-md text-sm';
        const textSpan = document.createElement('span'); textSpan.textContent = ingredient; itemDiv.appendChild(textSpan);
        const removeBtn = document.createElement('button'); removeBtn.type = 'button'; removeBtn.innerHTML = '&times;';
        removeBtn.className = 'ml-2 text-red-500 hover:text-red-700 font-bold text-lg leading-none px-1';
        removeBtn.title = 'Remove ingredient';
        removeBtn.addEventListener('click', () => { currentIngredientsArray.splice(index, 1); renderIngredientList(); });
        itemDiv.appendChild(removeBtn); ingredientListDisplay.appendChild(itemDiv);
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

    // ENHANCEMENT: More specific form validation
    let validationErrors = [];
    if (!titleValue) validationErrors.push("Title");
    if (!categoryValue) validationErrors.push("Category");
    if (currentIngredientsArray.length === 0) validationErrors.push("at least one Ingredient");
    if (!directionsText) validationErrors.push("Directions");

    if (validationErrors.length > 0) {
        const errorMessage = `Please provide the following required fields: ${validationErrors.join(', ')}.`;
        showMessage(errorMessageDiv, errorMessage, true);
        return;
    }

    loadingIndicator.classList.remove('hidden');
    loadingIndicator.style.width = '0%';

    const notesValue = recipeNotesInput ? recipeNotesInput.value.trim() : "";
    const tagsText = recipeTagsInput ? recipeTagsInput.value.trim() : "";

    if (selectedImageFile) {
        const imageName = `${userId}_${Date.now()}_${selectedImageFile.name.replace(/\s+/g, '_')}`;
        const storageRefPath = `recipe_images/${userId}/${imageName}`;
        const imageStorageRefInstance = storageRef(storage, storageRefPath);
        const uploadTask = uploadBytesResumable(imageStorageRefInstance, selectedImageFile);

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                loadingIndicator.style.width = progress + '%';
            },
            (error) => {
                // ENHANCEMENT: Use the friendly error message helper for upload errors
                const userMessage = getFriendlyFirebaseErrorMessage(error);
                showMessage(errorMessageDiv, userMessage, true, error);
                loadingIndicator.classList.add('hidden');
                loadingIndicator.style.width = '0%';
            },
            async () => {
                loadingIndicator.style.width = '100%'; // Show completion before hiding
                try {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    console.log('File available at', downloadURL);
                    await saveRecipeDataToFirestore(recipeIdToEdit, titleValue, categoryValue, directionsText, notesValue, tagsText, downloadURL);
                } catch (error) {
                    const userMessage = "Error saving recipe after image upload.";
                    showMessage(errorMessageDiv, userMessage, true, error);
                } finally {
                    loadingIndicator.classList.add('hidden');
                    loadingIndicator.style.width = '0%';
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


async function saveRecipeDataToFirestore(recipeIdToEdit, title, category, directions, notes, tags, imageUrl) {
    const recipeData = {
        title: title, category: category, ingredients: [...currentIngredientsArray],
        directions: directions.split('\n').map(s => s.trim()).filter(s => s),
        notes: notes, tags: tags.split(',').map(s => s.trim()).filter(s => s),
    };

    let dataToSave = { ...recipeData };

    if (recipeIdToEdit) {
        dataToSave.lastUpdatedAt = Timestamp.now();
        if (imageUrl !== undefined) { dataToSave.imageUrl = imageUrl; }
    } else {
        if (imageUrl) dataToSave.imageUrl = imageUrl;
        dataToSave.userId = userId;
        dataToSave.createdAt = Timestamp.now();
    }

    try {
        const recipesCollectionPath = `artifacts/${appId}/users/${userId}/recipes`;
        if (recipeIdToEdit) {
            const recipeDocRef = doc(db, recipesCollectionPath, recipeIdToEdit);
            await updateDoc(recipeDocRef, dataToSave);
            showMessage(successMessageDiv, "Recipe updated successfully!");
        } else {
            await addDoc(collection(db, recipesCollectionPath), dataToSave);
            showMessage(successMessageDiv, "Recipe added successfully!");
        }

        if(recipeForm) recipeForm.reset();
        currentIngredientsArray = []; renderIngredientList();
        recipeIdInput.value = ''; currentRecipeIdInDetailView = null;
        selectedImageFile = null;
        if(imagePreview) imagePreview.src = '#';
        if(imagePreviewContainer) imagePreviewContainer.classList.add('hidden');
        if(recipeImageInput) recipeImageInput.value = '';

        showView('browseView');
    } catch (error) {
        // ENHANCEMENT: Use the friendly error message helper
        const userMessage = getFriendlyFirebaseErrorMessage(error);
        showMessage(errorMessageDiv, `Error saving recipe: ${userMessage}`, true, error);
    }
}

async function populateFormForEdit(recipeId) {
    if (!userId || !db || !recipeId) return;

    try {
        const recipeDocRef = doc(db, `artifacts/${appId}/users/${userId}/recipes`, recipeId);
        const docSnap = await getDoc(recipeDocRef);
        if (docSnap.exists()) {
            const recipe = docSnap.data();
            recipeTitleInput.value = recipe.title || '';
            recipeCategoryInput.value = recipe.category || '';
            currentIngredientsArray = [...(recipe.ingredients || [])];
            renderIngredientList();
            recipeDirectionsInput.value = (recipe.directions || []).join('\n');
            recipeNotesInput.value = recipe.notes || '';
            recipeTagsInput.value = (recipe.tags || []).join(', ');
            recipeIdInput.value = recipeId;
            formTitle.textContent = 'Edit Recipe';

            selectedImageFile = null;
            if (recipe.imageUrl && imagePreview && imagePreviewContainer) {
                imagePreview.src = recipe.imageUrl;
                imagePreviewContainer.classList.remove('hidden');
            } else if (imagePreviewContainer) {
                imagePreviewContainer.classList.add('hidden');
                if(imagePreview) imagePreview.src = '#';
            }
            if(recipeImageInput) recipeImageInput.value = '';

            showView('recipeFormView');
        } else {
            showMessage(errorMessageDiv, "Recipe not found. It may have been deleted.", true);
            showView('browseView'); // Go back to browse view if recipe is gone
        }
    } catch (error) {
        // ENHANCEMENT: Use the friendly error message helper
        const userMessage = getFriendlyFirebaseErrorMessage(error);
        showMessage(errorMessageDiv, `Error loading recipe: ${userMessage}`, true, error);
    }
}


// --- Recipe Display and Filtering ---
function loadBrowseViewRecipes() {
    if (!userId || !db) {
        if (recipesGridPlaceholder) recipesGridPlaceholder.innerHTML = '<p class="text-center text-gray-500 py-8 col-span-full">Sign in to load recipes.</p>';
        return;
    }
    if (!recipesUnsubscribe) {
        console.log("FUNC: loadBrowseViewRecipes - Setting up Firestore listener for user:", userId);
        if (recipesGridPlaceholder) recipesGridPlaceholder.textContent = 'Loading your awesome recipes...';

        const recipesCollectionPath = `artifacts/${appId}/users/${userId}/recipes`;
        const q = query(collection(db, recipesCollectionPath), orderBy("createdAt", "desc"));
        recipesUnsubscribe = onSnapshot(q, (querySnapshot) => {
            console.log("FUNC: onSnapshot - Firestore snapshot received. Docs count:", querySnapshot.size);
            window.lastRecipeSnapshot = querySnapshot;
            renderRecipes();
        }, (error) => {
            // ENHANCEMENT: Use the friendly error message helper for real-time listener errors
            const userMessage = getFriendlyFirebaseErrorMessage(error);
            showMessage(errorMessageDiv, `Error fetching recipes: ${userMessage}`, true, error);
            window.lastRecipeSnapshot = null;
            if (recipesGridPlaceholder) recipesGridPlaceholder.textContent = 'Error loading recipes. Please check your connection and refresh.';
        });
    } else {
        renderRecipes();
    }
}

// renderRecipes function is long and doesn't require error handling changes, so it's omitted for brevity.
// You can keep your existing renderRecipes function.
function renderRecipes() {
    const querySnapshot = window.lastRecipeSnapshot;
    console.log("FUNC: renderRecipes. UserID:", userId, "Snapshot available:", !!querySnapshot);

    if (!recipesGridContainer || !recipesGridPlaceholder) {
        console.error("FUNC: renderRecipes - recipesGridContainer or recipesGridPlaceholder is null!");
        return;
    }
    if (!querySnapshot && userId) {
        recipesGridContainer.innerHTML = '';
        recipesGridPlaceholder.textContent = 'Loading recipes...';
        recipesGridPlaceholder.style.display = 'block';
        return;
    }
    if (!userId) {
        recipesGridContainer.innerHTML = '';
        recipesGridPlaceholder.textContent = 'Please sign in to see recipes.';
        recipesGridPlaceholder.style.display = 'block';
        return;
    }

    recipesGridContainer.innerHTML = '';
    let currentSearchTerm = "";
    if (headerSearchInput && headerSearchInput.value) { currentSearchTerm = headerSearchInput.value.toLowerCase().trim(); }
    else if (mobileSearchInput && mobileSearchInput.value) { currentSearchTerm = mobileSearchInput.value.toLowerCase().trim(); }

    let recipesFound = 0;
    querySnapshot.forEach((docSnap) => {
        const recipe = docSnap.data();
        const recipeId = docSnap.id;
        if (currentCategoryFilter !== 'all' && recipe.category !== currentCategoryFilter) return;
        let match = (currentSearchTerm === "") ||
            (recipe.title && recipe.title.toLowerCase().includes(currentSearchTerm)) ||
            (recipe.category && recipe.category.toLowerCase().includes(currentSearchTerm)) ||
            (recipe.tags && recipe.tags.some(tag => tag.toLowerCase().includes(currentSearchTerm)));
        if (match) {
            recipesFound++;
            const card = document.createElement('div');
            card.className = 'bg-white rounded-xl shadow-lg overflow-hidden transform hover:scale-105 transition-transform duration-300 ease-in-out cursor-pointer flex flex-col group';
            card.setAttribute('data-id', recipeId);
            card.addEventListener('click', () => navigateToRecipeDetail(recipeId));

            const imageDiv = document.createElement('div');
            imageDiv.className = 'h-48 w-full bg-slate-200 flex items-center justify-center text-slate-400 text-sm relative overflow-hidden group-hover:shadow-inner';
            if (recipe.imageUrl) {
                imageDiv.innerHTML = `<img src="${recipe.imageUrl}" alt="${recipe.title}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110">`;
            } else {
                imageDiv.innerHTML = `<svg class="w-12 h-12 text-slate-300 group-hover:scale-110 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>`;
            }
            imageDiv.innerHTML += `<div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-opacity duration-300"></div>`;

            const contentDiv = document.createElement('div');
            contentDiv.className = 'p-5 flex-grow flex flex-col';
            let tagsHTML = (recipe.tags && recipe.tags.length > 0) ? `<div class="mt-3 flex flex-wrap gap-2">${recipe.tags.map(tag => `<span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full font-medium">${tag}</span>`).join('')}</div>` : '';
            let ingredientsSnippet = (recipe.ingredients && recipe.ingredients.length > 0) ? `<ul class="text-xs text-gray-600 mt-2 mb-3 space-y-0.5">${recipe.ingredients.slice(0, 3).map(ing => `<li>- ${ing.length > 30 ? ing.substring(0,27)+'...' : ing}</li>`).join('')}${recipe.ingredients.length > 3 ? '<li class="text-gray-400">...more</li>' : ''}</ul>` : '';
            contentDiv.innerHTML = `<div><p class="text-xs font-semibold text-orange-500 uppercase tracking-wider mb-1">${recipe.category}</p><h3 class="text-xl font-bold text-gray-800 mb-2 leading-tight group-hover:text-orange-600 transition-colors">${recipe.title}</h3>${ingredientsSnippet}</div><div class="mt-auto pt-2"> ${tagsHTML}</div>`;

            card.appendChild(imageDiv);
            card.appendChild(contentDiv);
            recipesGridContainer.appendChild(card);
        }
    });
    recipesGridPlaceholder.style.display = recipesFound > 0 ? 'none' : 'block';
    if (recipesFound === 0) {
        recipesGridPlaceholder.innerHTML = (currentSearchTerm !== "" || currentCategoryFilter !== 'all') ? `<p class="text-center text-gray-500 py-8 col-span-full">No recipes found matching your criteria.</p>` :
             `<div class="text-center py-10 col-span-full"><svg class="mx-auto h-16 w-16 text-slate-300" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg><h3 class="mt-4 text-lg font-semibold text-gray-800">No recipes yet!</h3><p class="mt-2 text-sm text-gray-500">Time to add your culinary masterpieces.</p><div class="mt-6"><button type="button" id="emptyStateAddRecipeBtnGrid" class="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors whitespace-nowrap w-full sm:w-auto"><svg class="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>Add Your First Recipe</button></div></div>`;
            const emptyStateBtn = document.getElementById('emptyStateAddRecipeBtnGrid');
            if(emptyStateBtn && !emptyStateBtn.getAttribute('listenerAttached')) {
                emptyStateBtn.setAttribute('listenerAttached', 'true');
                emptyStateBtn.addEventListener('click', () => {
                    if (formTitle) formTitle.textContent = 'Add New Recipe';
                    if (recipeForm) recipeForm.reset();
                    if (recipeIdInput) recipeIdInput.value = '';
                    currentIngredientsArray = []; renderIngredientList();
                    showView('recipeFormView');
                });
            }
        }
}


async function navigateToRecipeDetail(recipeId) {
    // This function remains largely the same but uses better error messaging
    console.log("FUNC: navigateToRecipeDetail for", recipeId);
    currentRecipeIdInDetailView = recipeId;
    if (!userId || !db) return;

    // Clear previous details
    detailRecipeTitle.textContent = 'Loading recipe...';
    // ... (rest of the clearing logic)

    showView('recipeDetailView');
    try {
        const recipeDocRef = doc(db, `artifacts/${appId}/users/${userId}/recipes`, recipeId);
        const docSnap = await getDoc(recipeDocRef);
        if (docSnap.exists()) {
            const recipe = docSnap.data();
            // ... (rest of the data population logic)
            detailRecipeTitle.textContent = recipe.title;
            detailRecipeCategory.textContent = recipe.category;

            if (recipe.imageUrl && detailImagePlaceholder) {
                detailImagePlaceholder.innerHTML = `<img src="${recipe.imageUrl}" alt="${recipe.title}" class="w-full h-full object-cover rounded-lg">`;
            }

            detailRecipeIngredients.innerHTML = '';
            (recipe.ingredients || []).forEach(ing => { const li = document.createElement('li'); li.textContent = ing; detailRecipeIngredients.appendChild(li); });
            detailRecipeDirections.innerHTML = '';
            (recipe.directions || []).forEach(dir => { const li = document.createElement('li'); li.textContent = dir; detailRecipeDirections.appendChild(li); });

            detailRecipeTags.innerHTML = '';
            if (recipe.tags && recipe.tags.length > 0) {
                if(document.getElementById('detailRecipeTagsContainer')) document.getElementById('detailRecipeTagsContainer').classList.remove('view-hidden');
                recipe.tags.forEach(tagStr => { const span = document.createElement('span'); span.className = 'bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-medium'; span.textContent = tagStr; detailRecipeTags.appendChild(span); });
            } else {
                if(document.getElementById('detailRecipeTagsContainer')) document.getElementById('detailRecipeTagsContainer').classList.add('view-hidden');
            }
            if (recipe.notes && recipe.notes.trim() !== '') {
                detailRecipeNotes.textContent = recipe.notes;
                if(detailRecipeNotesContainer) detailRecipeNotesContainer.classList.remove('view-hidden');
            } else {
                detailRecipeNotes.textContent = '';
                if(detailRecipeNotesContainer) detailRecipeNotesContainer.classList.add('view-hidden');
            }

        } else {
            showMessage(errorMessageDiv, "Sorry, that recipe could not be found.", true);
            currentRecipeIdInDetailView = null;
            showView('browseView');
        }
    } catch (error) {
        // ENHANCEMENT: Use the friendly error message helper
        const userMessage = getFriendlyFirebaseErrorMessage(error);
        showMessage(errorMessageDiv, `Error fetching recipe: ${userMessage}`, true, error);
        currentRecipeIdInDetailView = null;
    }
}


// --- ENHANCEMENT: Implement handleDeleteRecipe with confirmation and error handling ---
async function handleDeleteRecipe() {
    if (!userId || !currentRecipeIdInDetailView) {
        showMessage(errorMessageDiv, "No recipe selected to delete.", true);
        return;
    }

    // ENHANCEMENT: Add a confirmation dialog before deleting.
    const recipeTitle = detailRecipeTitle.textContent || "this recipe";
    if (!confirm(`Are you sure you want to permanently delete "${recipeTitle}"? This action cannot be undone.`)) {
        return; // User cancelled the action
    }

    try {
        console.log(`Attempting to delete recipe: ${currentRecipeIdInDetailView}`);
        const recipeDocRef = doc(db, `artifacts/${appId}/users/${userId}/recipes`, currentRecipeIdInDetailView);
        await deleteDoc(recipeDocRef);

        showMessage(successMessageDiv, `Successfully deleted "${recipeTitle}".`);
        currentRecipeIdInDetailView = null;
        showView('browseView'); // Go back to the browse view after deletion

    } catch (error) {
        // ENHANCEMENT: Use the friendly error message helper
        const userMessage = getFriendlyFirebaseErrorMessage(error);
        showMessage(errorMessageDiv, `Failed to delete recipe: ${userMessage}`, true, error);
    }
}


function updateCategoryButtonStyles() {
    // This function remains the same
    if (!categoryFilterButtonsNodeList || categoryFilterButtonsNodeList.length === 0) {
        categoryFilterButtonsNodeList = document.querySelectorAll('.category-filter-btn');
    }
    categoryFilterButtonsNodeList.forEach(button => {
        if (button.dataset.category === currentCategoryFilter) {
            button.classList.add('category-filter-btn-active');
        } else {
            button.classList.remove('category-filter-btn-active');
        }
    });
}


// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("SCRIPT: DOMContentLoaded - Event fired.");
    try {
        // Assign UI elements
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
        categoryFilterButtonsNodeList = document.querySelectorAll('.category-filter-btn');
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

        if (googleSignInBtn) googleSignInBtn.addEventListener('click', handleGoogleSignIn);
        if (signOutBtn) signOutBtn.addEventListener('click', handleSignOut);

        // ENHANCEMENT: Add file type validation for image uploads
        if (recipeImageInput) {
            recipeImageInput.addEventListener('change', (event) => {
                const file = event.target.files[0];
                if (file) {
                    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
                    if (!allowedTypes.includes(file.type)) {
                        showMessage(errorMessageDiv, "Invalid file type. Please select a JPEG, PNG, or WEBP image.", true);
                        recipeImageInput.value = '';
                        return;
                    }
                    if (file.size > 5 * 1024 * 1024) {
                        showMessage(errorMessageDiv, "Image is too large (max 5MB).", true);
                        recipeImageInput.value = '';
                        return;
                    }
                    selectedImageFile = file;
                    const reader = new FileReader();
                    reader.onload = (e) => { imagePreview.src = e.target.result; }
                    reader.readAsDataURL(file);
                    imagePreviewContainer.classList.remove('hidden');
                }
            });
        }
        if (removeImageBtn) {
            removeImageBtn.addEventListener('click', () => {
                selectedImageFile = null;
                if(recipeImageInput) recipeImageInput.value = '';
                if (imagePreview) imagePreview.src = '#';
                if (imagePreviewContainer) imagePreviewContainer.classList.add('hidden');
            });
        }

        // ... rest of the event listeners ...
        if (navigateToAddRecipeBtn) {
            navigateToAddRecipeBtn.addEventListener('click', () => {
                if (!userId) { showMessage(errorMessageDiv, "Please sign in to add recipes.", true); return; }
                if (formTitle) formTitle.textContent = 'Add New Recipe';
                if (recipeForm) recipeForm.reset();
                if (recipeIdInput) recipeIdInput.value = '';
                currentIngredientsArray = [];
                if(typeof renderIngredientList === 'function') renderIngredientList();
                selectedImageFile = null;
                if(imagePreview) imagePreview.src = '#';
                if(imagePreviewContainer) imagePreviewContainer.classList.add('hidden');
                if(recipeImageInput) recipeImageInput.value = '';
                showView('recipeFormView');
            });
        }

        if (navigateToBrowseBtnDetail) navigateToBrowseBtnDetail.addEventListener('click', () => showView('browseView'));
        if (navigateToBrowseBtnForm) {
            navigateToBrowseBtnForm.addEventListener('click', () => {
                showView('browseView');
            });
        }
        if (recipeForm) recipeForm.addEventListener('submit', handleRecipeFormSubmit);
        if (editRecipeBtn) editRecipeBtn.addEventListener('click', () => {
            if (currentRecipeIdInDetailView) populateFormForEdit(currentRecipeIdInDetailView);
        });
        if (deleteRecipeBtn) deleteRecipeBtn.addEventListener('click', handleDeleteRecipe); // This now works!

        if (headerSearchInput) headerSearchInput.addEventListener('input', () => { if(mobileSearchInput) mobileSearchInput.value = headerSearchInput.value; renderRecipes(); });
        if (mobileSearchInput) mobileSearchInput.addEventListener('input', () => { if(headerSearchInput) headerSearchInput.value = mobileSearchInput.value; renderRecipes(); });

        if (addIngredientBtn) {
            addIngredientBtn.addEventListener('click', () => {
                const ingredientText = newIngredientInput.value.trim();
                if (ingredientText) {
                    currentIngredientsArray.push(ingredientText);
                    newIngredientInput.value = '';
                    renderIngredientList();
                    newIngredientInput.focus();
                }
            });
        }
        if (newIngredientInput) {
            newIngredientInput.addEventListener('keypress', function(event) {
                if (event.key === 'Enter') { event.preventDefault(); if (addIngredientBtn) addIngredientBtn.click(); }
            });
        }
        if (categoryFilterButtonsNodeList) {
            categoryFilterButtonsNodeList.forEach(button => {
                button.addEventListener('click', () => {
                    currentCategoryFilter = button.dataset.category;
                    updateCategoryButtonStyles();
                    renderRecipes();
                });
            });
        }

        updateCategoryButtonStyles();
        showView('browseView');

    } catch (error) {
        console.error("CRITICAL ERROR in DOMContentLoaded listener:", error);
        // ENHANCEMENT: Use a more reliable way to show an error if the DOM is messed up.
        alert("A critical error occurred on page load. The application may not work correctly. Please check the console for details.");
        const ad = document.getElementById('authStatus');
        if(ad) ad.textContent = "Page Load Error!";
    }
});

console.log("SCRIPT: script.js parsing finished.");
