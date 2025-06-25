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

// --- UI Elements (will be assigned in DOMContentLoaded) ---
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
    views.forEach(viewId => {
        const viewElement = document.getElementById(viewId);
        if (viewElement) {
            viewElement.classList.toggle('view-active', viewId === viewIdToShow);
            viewElement.classList.toggle('view-hidden', viewId !== viewIdToShow);
        }
    });
    if (viewIdToShow === 'browseView') {
        loadBrowseViewRecipes();
    }
}

// --- User Messaging & Error Handling ---
function showMessage(element, userMessage, isError = false, duration = 4000, error = null) {
    if (!element) return;
    if (isError && error) console.error(`User Message: "${userMessage}" \nDetailed Error:`, error);
    element.textContent = userMessage;
    element.className = `p-3 text-sm text-white rounded-lg fixed top-24 right-5 z-50 shadow-lg ${isError ? 'bg-red-500' : 'bg-green-500'}`;
    element.classList.remove('hidden');
    setTimeout(() => element.classList.add('hidden'), duration);
}

function getFriendlyFirebaseErrorMessage(error) {
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

// --- Refactored Helper Functions ---
function resetRecipeForm() {
    if (recipeForm) recipeForm.reset();
    if (recipeIdInput) recipeIdInput.value = '';
    currentIngredientsArray = [];
    renderIngredientList();
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
            const currentAuthStatusDiv = document.getElementById('authStatus');
            const currentGoogleSignInBtn = document.getElementById('googleSignInBtn');
            const currentUserInfoDiv = document.getElementById('userInfo');
            const currentUserNameSpan = document.getElementById('userName');

            if (user) {
                userId = user.uid;
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
        showMessage(errorMessageDiv, "A critical error occurred during initialization.", true, error);
        if (authStatusDiv) authStatusDiv.textContent = "Init Error!";
    }
}

async function handleGoogleSignIn() {
    if (!auth) { showMessage(errorMessageDiv, "Auth service not ready.", true); return; }
    try {
        const result = await signInWithPopup(auth, new GoogleAuthProvider());
        showMessage(successMessageDiv, `Welcome, ${result.user.displayName}!`);
    } catch (error) {
        showMessage(errorMessageDiv, getFriendlyFirebaseErrorMessage(error), true, error);
    }
}

async function handleSignOut() {
    if (!auth) { showMessage(errorMessageDiv, "Auth service not ready.", true); return; }
    try {
        await signOut(auth);
        showMessage(successMessageDiv, "You have been signed out.");
    } catch (error) {
        showMessage(errorMessageDiv, getFriendlyFirebaseErrorMessage(error), true, error);
    }
}

// --- Ingredient Management ---
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

// --- Recipe Form and Data Handling ---
async function handleRecipeFormSubmit(event) {
    event.preventDefault();
    if (!userId) { showMessage(errorMessageDiv, "You must be logged in.", true); return; }

    const titleValue = recipeTitleInput.value.trim();
    const categoryValue = recipeCategoryInput.value;
    const directionsText = recipeDirectionsInput.value.trim();
    const recipeIdToEdit = recipeIdInput.value;

    let validationErrors = ["Title", "Category", "at least one Ingredient", "Directions"].filter(field => {
        if (field === "Title") return !titleValue;
        if (field === "Category") return !categoryValue;
        if (field === "at least one Ingredient") return currentIngredientsArray.length === 0;
        if (field === "Directions") return !directionsText;
        return false;
    });

    if (validationErrors.length > 0) {
        showMessage(errorMessageDiv, `Please provide: ${validationErrors.join(', ')}.`, true);
        return;
    }

    loadingIndicator.classList.remove('hidden');
    loadingIndicator.style.width = '0%';

    const notesValue = recipeNotesInput.value.trim();
    const tagsText = recipeTagsInput.value.trim();

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
                    showMessage(errorMessageDiv, "Error getting image URL.", true, error);
                } finally {
                    loadingIndicator.classList.add('hidden');
                }
            }
        );
    } else {
        let imageUrlToSave = (recipeIdToEdit && imagePreview.src.startsWith('http')) ? imagePreview.src : null;
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
            const dataToUpdate = { ...recipeData, lastUpdatedAt: Timestamp.now() };
            if (imageUrl !== undefined) dataToUpdate.imageUrl = imageUrl;
            await updateDoc(doc(recipesCol, recipeId), dataToUpdate);
            showMessage(successMessageDiv, "Recipe updated successfully!");
        } else {
            const dataToAdd = { ...recipeData, userId, createdAt: Timestamp.now() };
            if (imageUrl) dataToAdd.imageUrl = imageUrl;
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
        const recipeDoc = await getDoc(doc(db, `artifacts/${appId}/users/${userId}/recipes`, recipeId));
        if (recipeDoc.exists()) {
            const recipe = recipeDoc.data();
            resetRecipeForm(); // Reset first
            recipeTitleInput.value = recipe.title || '';
            recipeCategoryInput.value = recipe.category || '';
            currentIngredientsArray = [...(recipe.ingredients || [])];
            renderIngredientList();
            recipeDirectionsInput.value = (recipe.directions || []).join('\n');
            recipeNotesInput.value = recipe.notes || '';
            recipeTagsInput.value = (recipe.tags || []).join(', ');
            recipeIdInput.value = recipeId;
            formTitle.textContent = 'Edit Recipe';
            if (recipe.imageUrl) {
                imagePreview.src = recipe.imageUrl;
                imagePreviewContainer.classList.remove('hidden');
            }
            showView('recipeFormView');
        } else {
            showMessage(errorMessageDiv, "Recipe not found.", true);
            showView('browseView');
        }
    } catch (error) {
        showMessage(errorMessageDiv, `Error loading recipe: ${getFriendlyFirebaseErrorMessage(error)}`, true, error);
    }
}

// --- Recipe Display and Filtering ---
function loadBrowseViewRecipes() {
    if (!userId) { return; }
    if (!recipesUnsubscribe) {
        const q = query(collection(db, `artifacts/${appId}/users/${userId}/recipes`), orderBy("createdAt", "desc"));
        recipesUnsubscribe = onSnapshot(q,
            (querySnapshot) => {
                window.lastRecipeSnapshot = querySnapshot;
                renderRecipes();
            },
            (error) => {
                showMessage(errorMessageDiv, `Error fetching recipes: ${getFriendlyFirebaseErrorMessage(error)}`, true, error);
                recipesGridPlaceholder.textContent = 'Error loading recipes.';
            }
        );
    } else {
        renderRecipes();
    }
}

function renderRecipes() {
    if (!recipesGridContainer || !recipesGridPlaceholder) return;
    if (!userId) {
        recipesGridPlaceholder.innerHTML = 'Please sign in to see recipes.';
        recipesGridPlaceholder.style.display = 'block';
        recipesGridContainer.innerHTML = '';
        return;
    }
    if (!window.lastRecipeSnapshot) {
        recipesGridPlaceholder.innerHTML = 'Loading recipes...';
        recipesGridPlaceholder.style.display = 'block';
        recipesGridContainer.innerHTML = '';
        return;
    }
    
    recipesGridContainer.innerHTML = '';
    const searchTerm = (headerSearchInput.value || "").toLowerCase().trim();
    let recipesFound = 0;

    window.lastRecipeSnapshot.forEach((docSnap) => {
        const recipe = docSnap.data();
        const recipeId = docSnap.id;

        if (currentCategoryFilter !== 'all' && recipe.category !== currentCategoryFilter) return;

        const isMatch = searchTerm === "" ||
            (recipe.title && recipe.title.toLowerCase().includes(searchTerm)) ||
            (recipe.category && recipe.category.toLowerCase().includes(searchTerm)) ||
            (recipe.tags && recipe.tags.some(tag => tag.toLowerCase().includes(searchTerm)));

        if (isMatch) {
            recipesFound++;
            const card = document.createElement('div');
            // Card creation logic remains the same...
            card.className = 'bg-white rounded-xl shadow-lg overflow-hidden transform hover:scale-105 transition-transform duration-300 ease-in-out cursor-pointer flex flex-col group';
            card.setAttribute('data-id', recipeId);
            card.addEventListener('click', () => navigateToRecipeDetail(recipeId));
            const imageDiv = document.createElement('div');
            imageDiv.className = 'h-48 w-full bg-slate-200 flex items-center justify-center';
            if (recipe.imageUrl) {
                imageDiv.innerHTML = `<img src="${recipe.imageUrl}" alt="${recipe.title}" class="w-full h-full object-cover">`;
            } else {
                imageDiv.innerHTML = `<svg class="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>`;
            }
            const contentDiv = document.createElement('div');
            contentDiv.className = 'p-5 flex-grow flex flex-col';
            contentDiv.innerHTML = `<p class="text-xs font-semibold text-indigo-600 uppercase mb-1">${recipe.category}</p><h3 class="text-xl font-bold text-gray-800">${recipe.title}</h3>`;
            card.appendChild(imageDiv);
            card.appendChild(contentDiv);
            recipesGridContainer.appendChild(card);
        }
    });

    recipesGridPlaceholder.style.display = recipesFound > 0 ? 'none' : 'block';
    if (recipesFound === 0) {
        recipesGridPlaceholder.innerHTML = searchTerm || currentCategoryFilter !== 'all' ? `No recipes found matching your criteria.` : `No recipes yet. Click "Add New Recipe" to start!`;
    }
}

async function navigateToRecipeDetail(recipeId) {
    if (!userId) return;
    currentRecipeIdInDetailView = recipeId;
    
    // Clear previous details
    detailRecipeTitle.textContent = 'Loading...';
    detailRecipeCategory.textContent = '';
    detailRecipeIngredients.innerHTML = '';
    detailRecipeDirections.innerHTML = '';
    detailRecipeNotes.textContent = '';
    detailRecipeNotesContainer.classList.add('view-hidden');
    detailImagePlaceholder.innerHTML = `<svg class="w-16 h-16 text-slate-300 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>`;

    showView('recipeDetailView');
    try {
        const docSnap = await getDoc(doc(db, `artifacts/${appId}/users/${userId}/recipes`, recipeId));
        if (docSnap.exists()) {
            const recipe = docSnap.data();
            detailRecipeTitle.textContent = recipe.title;
            detailRecipeCategory.textContent = recipe.category;
            if (recipe.imageUrl) {
                detailImagePlaceholder.innerHTML = `<img src="${recipe.imageUrl}" alt="${recipe.title}" class="w-full h-full object-cover rounded-lg">`;
            }
            detailRecipeIngredients.innerHTML = (recipe.ingredients || []).map(ing => `<li>${ing}</li>`).join('');
            detailRecipeDirections.innerHTML = (recipe.directions || []).map(dir => `<li>${dir}</li>`).join('');
            if (recipe.notes) {
                detailRecipeNotes.textContent = recipe.notes;
                detailRecipeNotesContainer.classList.remove('view-hidden');
            }
        } else {
            showMessage(errorMessageDiv, "Recipe not found.", true);
            showView('browseView');
        }
    } catch (error) {
        showMessage(errorMessageDiv, `Error fetching recipe: ${getFriendlyFirebaseErrorMessage(error)}`, true, error);
    }
}

async function handleDeleteRecipe() {
    if (!userId || !currentRecipeIdInDetailView) return;
    const recipeTitle = detailRecipeTitle.textContent || "this recipe";
    if (!confirm(`Are you sure you want to permanently delete "${recipeTitle}"?`)) return;
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

        // --- Initialize App ---
        initializeFirebaseAndAuth();

        // --- Attach Event Listeners ---
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

        recipeForm.addEventListener('submit', handleRecipeFormSubmit);
        editRecipeBtn.addEventListener('click', () => { if (currentRecipeIdInDetailView) populateFormForEdit(currentRecipeIdInDetailView); });
        deleteRecipeBtn.addEventListener('click', handleDeleteRecipe);

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

        addIngredientBtn.addEventListener('click', () => {
            const ingredientText = newIngredientInput.value.trim();
            if (ingredientText) {
                currentIngredientsArray.push(ingredientText);
                newIngredientInput.value = '';
                renderIngredientList();
                newIngredientInput.focus();
            }
        });

        newIngredientInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                addIngredientBtn.click();
            }
        });
        
        document.querySelectorAll('.category-filter-btn').forEach(button => {
            button.addEventListener('click', () => {
                currentCategoryFilter = button.dataset.category;
                updateCategoryButtonStyles();
                renderRecipes();
            });
        });

        recipeImageInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
            if (!allowedTypes.includes(file.type)) {
                showMessage(errorMessageDiv, "Invalid file type. Please use JPEG, PNG, or WEBP.", true);
                recipeImageInput.value = '';
                return;
            }
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                showMessage(errorMessageDiv, "Image is too large (max 5MB).", true);
                recipeImageInput.value = '';
                return;
            }
            selectedImageFile = file;
            const reader = new FileReader();
            reader.onload = (e) => { imagePreview.src = e.target.result; }
            reader.readAsDataURL(file);
            imagePreviewContainer.classList.remove('hidden');
        });

        removeImageBtn.addEventListener('click', () => {
            selectedImageFile = null;
            recipeImageInput.value = '';
            imagePreview.src = '#';
            imagePreviewContainer.classList.add('hidden');
        });

        // --- Initial State ---
        updateCategoryButtonStyles();
        showView('browseView');

    } catch (error) {
        console.error("CRITICAL ERROR in DOMContentLoaded listener:", error);
        alert("A critical error occurred on page load. The application may not work correctly. See console for details.");
    }
});

console.log("SCRIPT: script.js parsing finished.");
