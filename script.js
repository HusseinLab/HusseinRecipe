console.log("SCRIPT: script.js parsing started. Imports are next.");

// Firebase SDK imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    GoogleAuthProvider, // NEW
    signInWithPopup,    // NEW
    signOut             // NEW
    // signInAnonymously, // REMOVED
    // signInWithCustomToken, // REMOVED
    // setPersistence,      // REMOVED
    // browserLocalPersistence 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    collection, query, orderBy, onSnapshot,
    doc, getDoc, addDoc, updateDoc, deleteDoc,
    Timestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
    getStorage,         // NEW
    ref as storageRef,  // NEW - aliased
    uploadBytesResumable,// NEW
    getDownloadURL      // NEW
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";


console.log("SCRIPT: Firebase SDKs import statements processed.");

// --- Global Variables for Firebase and App State ---
let app;
let auth;
let db;
let storage; // NEW
let userId = null;
let recipesUnsubscribe = null;
let currentRecipeIdInDetailView = null;
window.lastRecipeSnapshot = null; 
let currentIngredientsArray = []; 
let currentCategoryFilter = 'all'; 
let selectedImageFile = null; // NEW

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-recipe-app-id';
const firebaseConfig = {
  apiKey: "AIzaSyBiV-BFHLVy0EbKIl9gnt2j-QsLUyvkZvs",
  authDomain: "my-personal-recipe-book-8b55d.firebaseapp.com",
  projectId: "my-personal-recipe-book-8b55d",
  storageBucket: "my-personal-recipe-book-8b55d.appspot.com", // Standard format for storage bucket
  messagingSenderId: "932879383972",
  appId: "1:932879383972:web:aa977406634fa061485531",
  measurementId: "G-ZWP1BKDXY4"
};
// const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null; // Not used

// --- UI Elements (Declared globally, assigned in DOMContentLoaded) ---
let authStatusDiv, googleSignInBtn, userInfoDiv, userNameSpan, signOutBtn, navigateToAddRecipeBtn, navigateToBrowseBtnDetail, navigateToBrowseBtnForm;
let recipeForm, recipeTitleInput, recipeCategoryInput, recipeImageInput, imagePreviewContainer, imagePreview, removeImageBtn, recipeDirectionsInput, recipeNotesInput, recipeTagsInput, formTitle, recipeIdInput;
let newIngredientInput, addIngredientBtn, ingredientListDisplay;
let successMessageDiv, errorMessageDiv, loadingIndicator;
let recipesGridContainer, recipesGridPlaceholder, headerSearchInput, mobileSearchInput, categoryFilterButtonsNodeList;
let detailRecipeTitle, detailRecipeCategory, detailRecipeTags, detailRecipeIngredients, detailRecipeDirections, detailRecipeNotesContainer, detailRecipeNotes, detailImagePlaceholder;
let editRecipeBtn, deleteRecipeBtn;

const views = ['browseView', 'recipeDetailView', 'recipeFormView']; 

// --- Function to Show/Hide Views ---
function showView(viewIdToShow) {
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
            else console.error("DEBUG: showView - loadBrowseViewRecipes not defined!");
        } else if (window.lastRecipeSnapshot) { 
             if (typeof renderRecipes === 'function') renderRecipes(); 
             else console.error("DEBUG: showView - renderRecipes not defined!");
        } else {
             if (typeof renderRecipes === 'function') renderRecipes(); 
        }
    }
}

// Helper function for messages
function showMessage(element, message, isError = false, duration = 3000) { 
    if (!element) { console.warn("DEBUG: showMessage - Target element is null. Message:", message); return; }
    element.textContent = message;
    element.classList.remove('hidden');
    element.className = 'p-3 text-sm text-white rounded-lg fixed top-24 right-5 z-50 shadow-lg'; 
    if (isError) { element.classList.add('bg-red-500'); element.classList.remove('bg-green-500'); } 
    else { element.classList.add('bg-green-500'); element.classList.remove('bg-red-500'); }
    setTimeout(() => { element.classList.add('hidden'); }, duration);
}

// --- Firebase Initialization and Authentication ---
async function initializeFirebaseAndAuth() { 
    try {
        console.log("DEBUG_INIT: initializeFirebaseAndAuth - START");
        if (!authStatusDiv) { console.error("DEBUG_INIT: authStatusDiv is NULL at start!"); return; }
        authStatusDiv.textContent = "Initializing...";
        if (!firebaseConfig || !firebaseConfig.apiKey) { 
            console.error("DEBUG_INIT: Firebase config error!"); authStatusDiv.textContent = "Config Error!"; return; 
        }
        app = initializeApp(firebaseConfig); 
        auth = getAuth(app); 
        db = getFirestore(app);
        storage = getStorage(app); // Initialize Firebase Storage
        console.log("DEBUG_INIT: Firebase core services initialized (app, auth, db, storage).");
        
        onAuthStateChanged(auth, async (user) => {
            console.log("DEBUG_INIT: onAuthStateChanged - Fired. User object present:", !!user);
            // Re-fetch UI elements related to auth state as they might be initially hidden
            const currentAuthStatusDiv = document.getElementById('authStatus'); 
            const currentGoogleSignInBtn = document.getElementById('googleSignInBtn');
            const currentUserInfoDiv = document.getElementById('userInfo');
            const currentUserNameSpan = document.getElementById('userName');

            if (!currentAuthStatusDiv || !currentGoogleSignInBtn || !currentUserInfoDiv || !currentUserNameSpan) {
                console.error("DEBUG_INIT: One or more auth UI elements are null inside onAuthStateChanged!");
            }

            if (user) { 
                userId = user.uid;
                console.log("DEBUG_INIT: onAuthStateChanged - User IS authenticated. UID:", userId, "Name:", user.displayName, "Email:", user.email);
                
                if (currentAuthStatusDiv) currentAuthStatusDiv.classList.add('hidden'); 
                if (currentGoogleSignInBtn) currentGoogleSignInBtn.classList.add('hidden');
                if (currentUserInfoDiv) {
                    currentUserInfoDiv.classList.remove('hidden');
                    currentUserInfoDiv.classList.add('flex'); 
                }
                if (currentUserNameSpan) currentUserNameSpan.textContent = user.displayName || user.email || "User";
                
                if (typeof loadBrowseViewRecipes === 'function') loadBrowseViewRecipes(); 
            } else { 
                userId = null; 
                currentRecipeIdInDetailView = null; window.lastRecipeSnapshot = null; currentCategoryFilter = 'all'; 
                if(typeof updateCategoryButtonStyles === 'function') updateCategoryButtonStyles();

                console.log("DEBUG_INIT: onAuthStateChanged - User IS NOT authenticated.");
                if (currentAuthStatusDiv) currentAuthStatusDiv.classList.add('hidden'); 
                if (currentGoogleSignInBtn) currentGoogleSignInBtn.classList.remove('hidden'); 
                if (currentUserInfoDiv) {
                    currentUserInfoDiv.classList.add('hidden');
                    currentUserInfoDiv.classList.remove('flex');
                }
                if (currentUserNameSpan) currentUserNameSpan.textContent = '';
                
                if (recipesUnsubscribe) { recipesUnsubscribe(); recipesUnsubscribe = null;}
                if (recipesGridContainer) recipesGridContainer.innerHTML = ''; 
                if (recipesGridPlaceholder) recipesGridPlaceholder.innerHTML = '<p class="text-center text-gray-500 py-8 col-span-full">Please sign in to see recipes.</p>';
                if (headerSearchInput) headerSearchInput.value = ""; if (mobileSearchInput) mobileSearchInput.value = "";
            }
        });
        console.log("DEBUG_INIT: onAuthStateChanged listener attached.");
    } catch (error) {
        console.error("DEBUG_INIT: CRITICAL ERROR in initializeFirebaseAndAuth:", error);
        if (authStatusDiv) authStatusDiv.textContent = "Init Error!";
    }
}

// NEW: Handle Google Sign-In
async function handleGoogleSignIn() {
    console.log("Attempting Google Sign-In...");
    if (!auth) { console.error("Google Sign-In: Firebase Auth not initialized."); return; }
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        console.log("Google Sign-In successful for user:", result.user.displayName);
        // onAuthStateChanged will handle UI updates and data loading
    } catch (error) {
        console.error("Google Sign-In Error:", error);
        showMessage(errorMessageDiv, `Google Sign-In Failed: ${error.message} (Code: ${error.code})`, true);
    }
}

// NEW: Handle Sign-Out
async function handleSignOut() {
    console.log("Attempting Sign-Out...");
    if (!auth) { console.error("Sign-Out: Firebase Auth not initialized."); return; }
    try {
        await signOut(auth);
        console.log("User signed out successfully.");
        // onAuthStateChanged will handle UI updates and clearing data
    } catch (error) {
        console.error("Sign-Out Error:", error);
        showMessage(errorMessageDiv, `Sign-Out Failed: ${error.message}`, true);
    }
}


// --- Ingredient Management Functions ---
function renderIngredientList() { 
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
    if (!userId || !db) { showMessage(errorMessageDiv, "You must be logged in to save recipes.", true); return;  }
    if (!recipeTitleInput || !recipeCategoryInput || !recipeDirectionsInput || !recipeIdInput || !recipeForm || !loadingIndicator) {
        showMessage(errorMessageDiv, "Form error or loading indicator missing. Please refresh.", true); return; 
    }
    const titleValue = recipeTitleInput.value.trim(); 
    const categoryValue = recipeCategoryInput.value;
    const directionsText = recipeDirectionsInput.value.trim();
    const notesValue = recipeNotesInput ? recipeNotesInput.value.trim() : "";
    const tagsText = recipeTagsInput ? recipeTagsInput.value.trim() : "";
    const recipeIdToEdit = recipeIdInput.value; 

    if (!titleValue || !categoryValue || currentIngredientsArray.length === 0 || !directionsText) { 
        showMessage(errorMessageDiv, "Title, Category, at least one Ingredient, and Directions are required.", true); return; 
    }

    loadingIndicator.classList.remove('hidden'); 
    loadingIndicator.style.width = '0%'; // Reset progress

    if (selectedImageFile) {
        console.log("Image selected, attempting upload:", selectedImageFile.name);
        const imageName = `${userId}_${Date.now()}_${selectedImageFile.name.replace(/\s+/g, '_')}`; 
        const storageRefPath = `recipe_images/${userId}/${imageName}`; 
        const imageStorageRefInstance = storageRef(storage, storageRefPath); 
        
        const uploadTask = uploadBytesResumable(imageStorageRefInstance, selectedImageFile);
        
        uploadTask.on('state_changed', 
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                console.log('Upload is ' + progress + '% done');
                loadingIndicator.style.width = progress + '%'; 
            }, 
            (error) => {
                console.error("Image upload error:", error);
                showMessage(errorMessageDiv, `Image upload failed: ${error.message}`, true);
                loadingIndicator.classList.add('hidden'); loadingIndicator.style.width = '0%';
            }, 
            async () => { 
                loadingIndicator.classList.add('hidden'); loadingIndicator.style.width = '0%';
                try {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    console.log('File available at', downloadURL);
                    await saveRecipeDataToFirestore(recipeIdToEdit, titleValue, categoryValue, directionsText, notesValue, tagsText, downloadURL);
                } catch (error) {
                    console.error("Error getting download URL or saving recipe data:", error);
                    showMessage(errorMessageDiv, "Error saving recipe after image upload.", true);
                }
            }
        );
    } else {
        let imageUrlToSave = undefined; 
        if (recipeIdToEdit) { 
            if (imagePreview && imagePreview.src === '#') { 
                imageUrlToSave = null; 
            } else if (imagePreview && !imagePreview.src.startsWith('data:') && imagePreview.src !== '#') {
                imageUrlToSave = imagePreview.src; 
            }
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
        if (imageUrl !== undefined) { 
            dataToSave.imageUrl = imageUrl; 
        }
    } else { 
        if (imageUrl) dataToSave.imageUrl = imageUrl;
        dataToSave.userId = userId;
        dataToSave.createdAt = Timestamp.now();
    }

    try {
        const recipesCollectionPath = `artifacts/${appId}/users/${userId}/recipes`;
        console.log("Saving recipe data to Firestore. Path:", recipesCollectionPath, "Data:", dataToSave);
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
        console.error("Error saving recipe to Firestore: ", error);
        showMessage(errorMessageDiv, `Error saving recipe: ${error.message}`, true);
    }
}


async function populateFormForEdit(recipeId) { 
    if (!userId || !db || !recipeId) { return; }
    if (!recipeTitleInput || !recipeCategoryInput || !newIngredientInput || !recipeDirectionsInput || !recipeNotesInput || !recipeTagsInput || !recipeIdInput || !formTitle || !imagePreview || !imagePreviewContainer || !recipeImageInput) { 
        console.error("populateFormForEdit: One or more critical form UI elements are null.");
        return;
    }
    try {
        const recipeDocRef = doc(db, `artifacts/${appId}/users/${userId}/recipes`, recipeId);
        const docSnap = await getDoc(recipeDocRef);
        if (docSnap.exists()) {
            const recipe = docSnap.data();
            recipeTitleInput.value = recipe.title || '';
            recipeCategoryInput.value = recipe.category || '';
            currentIngredientsArray = [...(recipe.ingredients || [])]; 
            renderIngredientList();
            newIngredientInput.value = ''; 
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
            showMessage(errorMessageDiv, "Recipe data not found for editing.", true);
        }
    } catch (error) {
        showMessage(errorMessageDiv, `Error loading recipe for editing: ${error.message}`, true);
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
            console.error("FUNC: onSnapshot - Error fetching recipes: ", error);
            window.lastRecipeSnapshot = null; 
            if (recipesGridPlaceholder) recipesGridPlaceholder.textContent = 'Error loading recipes. Please try again.';
            showMessage(errorMessageDiv, `Error fetching recipes: ${error.message}`, true);
        });
    } else {
        renderRecipes();
    }
}

function renderRecipes() {
    const querySnapshot = window.lastRecipeSnapshot;
    console.log("FUNC: renderRecipes. UserID:", userId, "Snapshot available:", !!querySnapshot); 

    if (!recipesGridContainer || !recipesGridPlaceholder) { 
        console.error("FUNC: renderRecipes - recipesGridContainer or recipesGridPlaceholder is null!"); return; 
    }
    if (!querySnapshot && userId) { 
        recipesGridContainer.innerHTML = ''; 
        recipesGridPlaceholder.textContent = 'Loading recipes...';
        recipesGridPlaceholder.style.display = 'block';
        return;
    }
    if(!userId) { 
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

            const imageDiv = document.createElement('div'); // Changed variable name for clarity
            imageDiv.className = 'h-48 w-full bg-slate-200 flex items-center justify-center text-slate-400 text-sm relative overflow-hidden group-hover:shadow-inner';
            if (recipe.imageUrl) {
                imageDiv.innerHTML = `<img src="${recipe.imageUrl}" alt="${recipe.title}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110">`;
            } else {
                imageDiv.innerHTML = `<svg class="w-12 h-12 text-slate-300 group-hover:scale-110 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>`;
            }
            imageDiv.innerHTML += `<div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-opacity duration-300"></div>`;
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'p-5 flex-grow flex flex-col'; 
            let tagsHTML = (recipe.tags && recipe.tags.length > 0) ? `<div class="mt-3 flex flex-wrap gap-2">${recipe.tags.map(tag => `<span class="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-medium">${tag}</span>`).join('')}</div>` : '';
            let ingredientsSnippet = (recipe.ingredients && recipe.ingredients.length > 0) ? `<ul class="text-xs text-gray-600 mt-2 mb-3 space-y-0.5">${recipe.ingredients.slice(0, 3).map(ing => `<li>- ${ing.length > 30 ? ing.substring(0,27)+'...' : ing}</li>`).join('')}${recipe.ingredients.length > 3 ? '<li class="text-gray-400">...more</li>' : ''}</ul>` : '';
            contentDiv.innerHTML = `<div><p class="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">${recipe.category}</p><h3 class="text-xl font-bold text-gray-800 mb-2 leading-tight group-hover:text-indigo-600 transition-colors">${recipe.title}</h3>${ingredientsSnippet}</div><div class="mt-auto pt-2"> ${tagsHTML}</div>`;
            
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
                    selectedImageFile = null; 
                    if(imagePreview) imagePreview.src = '#';
                    if(imagePreviewContainer) imagePreviewContainer.classList.add('hidden');
                    if(recipeImageInput) recipeImageInput.value = '';
                    showView('recipeFormView');
                });
            }
        }
    }

async function navigateToRecipeDetail(recipeId) { 
    console.log("FUNC: navigateToRecipeDetail for", recipeId); 
    currentRecipeIdInDetailView = recipeId; 
    if (!userId || !db) { return; }
    if (!detailRecipeTitle || !detailRecipeCategory || !detailRecipeTags || !detailRecipeIngredients || !detailRecipeDirections || !detailRecipeNotesContainer || !detailRecipeNotes || !document.getElementById('detailRecipeTagsContainer') || !detailImagePlaceholder) {
        console.error("FUNC: navigateToRecipeDetail - Detail view elements not properly initialized."); return;
    }
    detailRecipeTitle.textContent = 'Loading recipe...';
    detailRecipeCategory.textContent = '';
    detailRecipeTags.innerHTML = '';
    detailRecipeIngredients.innerHTML = '';
    detailRecipeDirections.innerHTML = '';
    detailRecipeNotes.textContent = '';
    detailRecipeNotesContainer.classList.add('view-hidden');
    const detailTagsContainer = document.getElementById('detailRecipeTagsContainer');
    if(detailTagsContainer) detailTagsContainer.classList.add('view-hidden'); 
    
    detailImagePlaceholder.innerHTML = `<svg class="w-16 h-16 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>`;

    showView('recipeDetailView'); 
    try {
        const recipeDocRef = doc(db, `artifacts/${appId}/users/${userId}/recipes`, recipeId);
        const docSnap = await getDoc(recipeDocRef);
        if (docSnap.exists()) {
            const recipe = docSnap.data();
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
                if(detailTagsContainer) detailTagsContainer.classList.remove('view-hidden');
                recipe.tags.forEach(tagStr => { const span = document.createElement('span'); span.className = 'bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-medium'; span.textContent = tagStr; detailRecipeTags.appendChild(span); });
            } else { 
                if(detailTagsContainer) detailTagsContainer.classList.add('view-hidden');
            }
            if (recipe.notes && recipe.notes.trim() !== '') {
                detailRecipeNotes.textContent = recipe.notes;
                if(detailRecipeNotesContainer) detailRecipeNotesContainer.classList.remove('view-hidden');
            } else {
                detailRecipeNotes.textContent = ''; 
                if(detailRecipeNotesContainer) detailRecipeNotesContainer.classList.add('view-hidden');
            }
        } else {
            detailRecipeTitle.textContent = 'Recipe not found.';
            showMessage(errorMessageDiv, "Sorry, couldn't find that recipe.", true);
            currentRecipeIdInDetailView = null; 
        }
    } catch (error) {
        detailRecipeTitle.textContent = 'Error loading recipe.';
        showMessage(errorMessageDiv, `Error fetching recipe: ${error.message}`, true);
        currentRecipeIdInDetailView = null; 
    }
}

async function handleDeleteRecipe() { /* ... (Keep existing function body) ... */ }
function updateCategoryButtonStyles() { /* ... (Keep existing function body) ... */ }


// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("SCRIPT: DOMContentLoaded - Event fired. Assigning UI elements.");
    try {
        // Assign ALL UI elements
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

        if (!authStatusDiv || !googleSignInBtn || !userInfoDiv || !signOutBtn) { 
            console.error("DOM_LOAD_ERROR: Critical auth UI elements missing!"); return; 
        }
        
        initializeFirebaseAndAuth(); 

        if (googleSignInBtn) googleSignInBtn.addEventListener('click', handleGoogleSignIn);
        if (signOutBtn) signOutBtn.addEventListener('click', handleSignOut);

        if (recipeImageInput) {
            recipeImageInput.addEventListener('change', (event) => {
                const file = event.target.files[0];
                if (file) {
                    if (file.size > 5 * 1024 * 1024) { 
                        showMessage(errorMessageDiv, "Image is too large (max 5MB).", true);
                        recipeImageInput.value = ''; 
                        return;
                    }
                    selectedImageFile = file; 
                    if (imagePreview && imagePreviewContainer) {
                        const reader = new FileReader();
                        reader.onload = (e) => { imagePreview.src = e.target.result; }
                        reader.readAsDataURL(file);
                        imagePreviewContainer.classList.remove('hidden');
                    }
                } else {
                    selectedImageFile = null;
                    if (imagePreview && imagePreviewContainer) {
                        imagePreview.src = '#';
                        imagePreviewContainer.classList.add('hidden');
                    }
                }
            });
        } 
        if (removeImageBtn) {
            removeImageBtn.addEventListener('click', () => {
                selectedImageFile = null;
                if(recipeImageInput) recipeImageInput.value = ''; 
                if (imagePreview && imagePreviewContainer) {
                    imagePreview.src = '#'; 
                    imagePreviewContainer.classList.add('hidden');
                }
            });
        }

        if (navigateToAddRecipeBtn) { 
            navigateToAddRecipeBtn.addEventListener('click', () => {
                if (!userId) { showMessage(errorMessageDiv, "Please sign in to add recipes.", true); return; }
                if (formTitle) formTitle.textContent = 'Add New Recipe';
                if (recipeForm) recipeForm.reset();
                if (recipeIdInput) recipeIdInput.value = ''; 
                currentIngredientsArray = []; 
                if(typeof renderIngredientList === 'function') renderIngredientList();
                if(newIngredientInput) newIngredientInput.value = '';
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
                if (recipeForm) recipeForm.reset(); 
                if (recipeIdInput) recipeIdInput.value = ''; 
                currentIngredientsArray = []; 
                if(typeof renderIngredientList === 'function') renderIngredientList();
                selectedImageFile = null; 
                if(imagePreview) imagePreview.src = '#';
                if(imagePreviewContainer) imagePreviewContainer.classList.add('hidden');
                if(recipeImageInput) recipeImageInput.value = '';
                showView('browseView');
            });
        }
        if (recipeForm) recipeForm.addEventListener('submit', handleRecipeFormSubmit); 
        if (editRecipeBtn) editRecipeBtn.addEventListener('click', () => { 
            if (currentRecipeIdInDetailView && typeof populateFormForEdit === 'function') populateFormForEdit(currentRecipeIdInDetailView);
            else showMessage(errorMessageDiv, "No recipe selected to edit.", true);
        });
        if (deleteRecipeBtn) deleteRecipeBtn.addEventListener('click', handleDeleteRecipe); 
        
        const syncSearchAndRender = () => {
            if (typeof renderRecipes === 'function') renderRecipes();
        };
        if (headerSearchInput) {
            headerSearchInput.addEventListener('input', () => {
                if (mobileSearchInput && document.activeElement !== mobileSearchInput) mobileSearchInput.value = headerSearchInput.value;
                syncSearchAndRender();
            });
        }
        if (mobileSearchInput) {
            mobileSearchInput.addEventListener('input', () => {
                if (headerSearchInput && document.activeElement !== headerSearchInput) headerSearchInput.value = mobileSearchInput.value;
                syncSearchAndRender();
            });
        }

        if (addIngredientBtn) { 
            addIngredientBtn.addEventListener('click', () => {
                if (!newIngredientInput) return;
                const ingredientText = newIngredientInput.value.trim();
                if (ingredientText) {
                    currentIngredientsArray.push(ingredientText);
                    newIngredientInput.value = ''; 
                    if(typeof renderIngredientList === 'function') renderIngredientList();
                    newIngredientInput.focus(); 
                }
            });
        }
        if (newIngredientInput) { 
            newIngredientInput.addEventListener('keypress', function(event) {
                if (event.key === 'Enter') { event.preventDefault(); if (addIngredientBtn) addIngredientBtn.click(); }
            });
        }
        if (categoryFilterButtonsNodeList && categoryFilterButtonsNodeList.length > 0) {
            categoryFilterButtonsNodeList.forEach(button => {
                button.addEventListener('click', () => {
                    currentCategoryFilter = button.dataset.category;
                    console.log("EVENT: Category filter changed to:", currentCategoryFilter);
                    if(typeof updateCategoryButtonStyles === 'function') updateCategoryButtonStyles();
                    if(typeof renderRecipes === 'function') renderRecipes(); 
                });
            });
        } else { console.warn("EVENT: No category filter buttons found for class .category-filter-btn");}
        
        console.log("SCRIPT: DOMContentLoaded - Event listeners setup complete. Setting initial view.");
        if(typeof updateCategoryButtonStyles === 'function') updateCategoryButtonStyles(); 
        showView('browseView'); 

    } catch (error) {
        console.error("CRITICAL ERROR in DOMContentLoaded listener:", error);
        alert("A critical error occurred on page load. Check console: " + error.message);
        const ad = document.getElementById('authStatus'); 
        if(ad) ad.textContent = "Page Load Error!";
    }
});
console.log("SCRIPT: script.js parsing finished.");
