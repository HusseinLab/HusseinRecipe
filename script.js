// script.js
console.log("SCRIPT: script.js parsing started. Imports are next.");

// Firebase SDK imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    GoogleAuthProvider, // NEW for Google Sign-In
    signInWithPopup,    // NEW for Google Sign-In
    signOut             // NEW for Sign-Out
    // signInAnonymously, // REMOVED - Replaced by Google Sign-In
    // signInWithCustomToken, 
    // setPersistence,      // Persistence is handled by Google Sign-In by default
    // browserLocalPersistence 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    collection, query, orderBy, onSnapshot,
    doc, getDoc, addDoc, updateDoc, deleteDoc,
    Timestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
    getStorage,         // NEW for Image Upload
    ref,                // NEW
    uploadBytesResumable,// NEW
    getDownloadURL      // NEW
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";


console.log("SCRIPT: Firebase SDKs import statements processed.");

// --- Global Variables for Firebase and App State ---
let app;
let auth;
let db;
let storage; // NEW: For Firebase Storage
let userId = null;
let recipesUnsubscribe = null;
let currentRecipeIdInDetailView = null;
window.lastRecipeSnapshot = null; 
let currentIngredientsArray = []; 
let currentCategoryFilter = 'all'; 
let selectedImageFile = null; // NEW: To store the selected image file for upload

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-recipe-app-id';
const firebaseConfig = {
  apiKey: "AIzaSyBiV-BFHLVy0EbKIl9gnt2j-QsLUyvkZvs",
  authDomain: "my-personal-recipe-book-8b55d.firebaseapp.com",
  projectId: "my-personal-recipe-book-8b55d",
  storageBucket: "my-personal-recipe-book-8b55d.appspot.com", // Correct format for SDK
  messagingSenderId: "932879383972",
  appId: "1:932879383972:web:aa977406634fa061485531",
  measurementId: "G-ZWP1BKDXY4"
};
// const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null; // Not used with Google Sign-In

// --- UI Elements (Declared globally, assigned in DOMContentLoaded) ---
let authStatusDiv, googleSignInBtn, userInfoDiv, userNameSpan, signOutBtn, navigateToAddRecipeBtn, navigateToBrowseBtnDetail, navigateToBrowseBtnForm;
let recipeForm, recipeTitleInput, recipeCategoryInput, recipeImageInput, imagePreviewContainer, imagePreview, removeImageBtn, recipeDirectionsInput, recipeNotesInput, recipeTagsInput, formTitle, recipeIdInput;
let newIngredientInput, addIngredientBtn, ingredientListDisplay;
let successMessageDiv, errorMessageDiv, loadingIndicator; // Added loadingIndicator
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
        console.log("DEBUG_INIT: initializeFirebaseAndAuth - Function START");
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
        
        // Persistence is handled by Google Sign-In provider by default
        // await setPersistence(auth, browserLocalPersistence); 
        // console.log("DEBUG_INIT: Firebase persistence set.");

        onAuthStateChanged(auth, async (user) => {
            console.log("DEBUG_INIT: onAuthStateChanged - Fired. User object present:", !!user);
            // Re-fetch UI elements related to auth state as they might be initially hidden
            const currentAuthStatusDiv = document.getElementById('authStatus'); 
            const currentGoogleSignInBtn = document.getElementById('googleSignInBtn');
            const currentUserInfoDiv = document.getElementById('userInfo');
            const currentUserNameSpan = document.getElementById('userName');

            if (user) { // User is signed in (could be from Google, or a remembered session)
                userId = user.uid;
                console.log("DEBUG_INIT: onAuthStateChanged - User IS authenticated. UID:", userId, "Name:", user.displayName, "Email:", user.email);
                
                if (currentAuthStatusDiv) currentAuthStatusDiv.classList.add('hidden'); 
                if (currentGoogleSignInBtn) currentGoogleSignInBtn.classList.add('hidden');
                if (currentUserInfoDiv) {
                    currentUserInfoDiv.classList.remove('hidden');
                    currentUserInfoDiv.classList.add('flex'); // Ensure flex for alignment
                }
                if (currentUserNameSpan) currentUserNameSpan.textContent = user.displayName || user.email || "User"; // Display name or email
                
                if (typeof loadBrowseViewRecipes === 'function') loadBrowseViewRecipes(); 
                else console.error("DEBUG_INIT: (user) loadBrowseViewRecipes not defined!");
            } else { // User is signed out or not yet signed in
                userId = null; 
                currentRecipeIdInDetailView = null; window.lastRecipeSnapshot = null; currentCategoryFilter = 'all'; 
                if(typeof updateCategoryButtonStyles === 'function') updateCategoryButtonStyles();
                else console.warn("DEBUG_INIT: (no user) updateCategoryButtonStyles not defined.");

                console.log("DEBUG_INIT: onAuthStateChanged - User IS NOT authenticated.");
                if (currentAuthStatusDiv) {
                    currentAuthStatusDiv.textContent = ""; // Clear "Initializing" or "Signing in"
                    currentAuthStatusDiv.classList.add('hidden'); // Hide the status paragraph
                }
                if (currentGoogleSignInBtn) currentGoogleSignInBtn.classList.remove('hidden'); // Show Sign-in button
                if (currentUserInfoDiv) {
                    currentUserInfoDiv.classList.add('hidden');
                    currentUserInfoDiv.classList.remove('flex');
                }
                if (currentUserNameSpan) currentUserNameSpan.textContent = '';
                
                if (recipesUnsubscribe) { recipesUnsubscribe(); recipesUnsubscribe = null;}
                if (recipesGridContainer) recipesGridContainer.innerHTML = ''; 
                if (recipesGridPlaceholder) recipesGridPlaceholder.innerHTML = '<p class="text-center text-gray-500 py-8 col-span-full">Please sign in to see recipes.</p>';
                if (headerSearchInput) headerSearchInput.value = ""; if (mobileSearchInput) mobileSearchInput.value = "";
                // No automatic anonymous sign-in anymore
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
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        // This will trigger onAuthStateChanged, which will update UI and load data
        console.log("Google Sign-In successful for user:", result.user.displayName);
    } catch (error) {
        console.error("Google Sign-In Error:", error);
        showMessage(errorMessageDiv, `Google Sign-In Failed: ${error.message} (Code: ${error.code})`, true);
    }
}

// NEW: Handle Sign-Out
async function handleSignOut() {
    console.log("Attempting Sign-Out...");
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
function renderIngredientList() { /* ... (Full function from previous version) ... */ }

// --- Recipe Form and Data Handling ---
async function handleRecipeFormSubmit(event) { 
    event.preventDefault(); 
    if (!userId || !db) { showMessage(errorMessageDiv, "You must be logged in to save recipes.", true); return;  }
    if (!recipeTitleInput || !recipeCategoryInput || !recipeDirectionsInput || !recipeIdInput || !recipeForm) {
        showMessage(errorMessageDiv, "Form error. Please refresh.", true); return;
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

    // Image Upload Logic
    if (selectedImageFile) {
        console.log("Image selected, attempting upload:", selectedImageFile.name);
        const imageName = `${userId}_${Date.now()}_${selectedImageFile.name}`;
        const storageRefPath = `recipe_images/${userId}/${imageName}`; // More organized path
        const imageStorageRef = ref(storage, storageRefPath);
        
        if (loadingIndicator) loadingIndicator.classList.remove('hidden');

        const uploadTask = uploadBytesResumable(imageStorageRef, selectedImageFile);
        
        uploadTask.on('state_changed', 
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                console.log('Upload is ' + progress + '% done');
                if (loadingIndicator) loadingIndicator.style.width = progress + '%';
            }, 
            (error) => {
                console.error("Image upload error:", error);
                showMessage(errorMessageDiv, `Image upload failed: ${error.message} (Code: ${error.code})`, true);
                if (loadingIndicator) { loadingIndicator.classList.add('hidden'); loadingIndicator.style.width = '0%';}
                // Decide if you want to proceed without image or stop
            }, 
            async () => { // Upload completed successfully
                if (loadingIndicator) { loadingIndicator.classList.add('hidden'); loadingIndicator.style.width = '0%';}
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
        // No new image selected, proceed to save recipe data
        // If editing, we need to know if an existing image should be kept or removed.
        // For now, if no new image selected, existing imageUrl (if any) will be preserved by not including it in update.
        // If user clicked "Remove Image", selectedImageFile will be null. We need a way to tell saveRecipeDataToFirestore to remove it.
        let existingImageUrl = null;
        if (recipeIdToEdit && imagePreview && imagePreview.src !== '#' && !imagePreview.src.startsWith('data:')) { // Check if there was an existing image displayed
             // This logic might need refinement if imagePreview.src is not reliably the Firestore URL
            existingImageUrl = imagePreview.src;
        }
        // If selectedImageFile is null AND imagePreview.src is '#', it means user wants to remove existing image or no image was there.
        const finalImageUrl = (selectedImageFile === null && imagePreview && imagePreview.src === '#') ? null : existingImageUrl;

        await saveRecipeDataToFirestore(recipeIdToEdit, titleValue, categoryValue, directionsText, notesValue, tagsText, finalImageUrl);
    }
}

async function saveRecipeDataToFirestore(recipeIdToEdit, title, category, directions, notes, tags, imageUrl) {
    const recipeData = { 
        title: title, category: category, ingredients: [...currentIngredientsArray], 
        directions: directions.split('\n').map(s => s.trim()).filter(s => s),
        notes: notes, tags: tags.split(',').map(s => s.trim()).filter(s => s),
    };

    // Only include imageUrl in the data if it's provided (new upload or existing)
    // If imageUrl is explicitly null (e.g., user removed image), we should handle that.
    if (imageUrl) {
        recipeData.imageUrl = imageUrl;
    } else if (recipeIdToEdit && selectedImageFile === null && imagePreview && imagePreview.src === '#') {
        // This means user explicitly removed an image during edit
        recipeData.imageUrl = null; // Or use FieldValue.delete() for complete removal
    }
    // If imageUrl is null and it's a new recipe, it just won't have the field.
    // If imageUrl is null and it's an edit where no new image was chosen AND old image wasn't removed,
    // we should NOT include imageUrl in recipeData to preserve the existing one.
    // This logic is tricky. For now, if imageUrl is null, it's not added/updated unless explicitly set to null for removal.

    const updateData = { ...recipeData }; // Data to be used for update or add

    try {
        const recipesCollectionPath = `artifacts/${appId}/users/${userId}/recipes`;
        if (recipeIdToEdit) {
            if (imageUrl !== undefined) { // Only update imageUrl if it's explicitly passed (new, removed, or kept)
                 updateData.imageUrl = imageUrl;
            } else {
                // If imageUrl is undefined, it means no new image was selected, and we shouldn't touch existing one.
                // So, we fetch existing recipe to preserve its imageUrl if it exists.
                // This part is getting complex. Let's simplify:
                // If editing, and selectedImageFile is null, we assume user wants to keep existing image.
                // We should only update imageUrl if a new one is provided, or if it's explicitly set to null for removal.
                // The current `imageUrl` passed to this function will be from new upload, or null if no new/removed.
                // This needs to be handled better in populateFormForEdit and handleRecipeFormSubmit.
                // For now:
                if (imageUrl === null && selectedImageFile === null && imagePreview && imagePreview.src !== '#' && !imagePreview.src.startsWith('data:')) {
                    // No new image, and preview shows an existing image, so don't change imageUrl
                    delete updateData.imageUrl; // Don't send imageUrl field for update
                } else {
                    updateData.imageUrl = imageUrl; // This will set it to new URL or null if removed
                }

            }
            updateData.lastUpdatedAt = Timestamp.now();
            const recipeDocRef = doc(db, recipesCollectionPath, recipeIdToEdit);
            await updateDoc(recipeDocRef, updateData);
            showMessage(successMessageDiv, "Recipe updated successfully!");
        } else {
            // Adding new recipe
            if (imageUrl) updateData.imageUrl = imageUrl;
            updateData.userId = userId;
            updateData.createdAt = Timestamp.now();
            await addDoc(collection(db, recipesCollectionPath), updateData);
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
    // ... (ensure form elements are defined) ...
    try {
        const recipeDocRef = doc(db, `artifacts/${appId}/users/${userId}/recipes`, recipeId);
        const docSnap = await getDoc(recipeDocRef);
        if (docSnap.exists()) {
            const recipe = docSnap.data();
            if(recipeTitleInput) recipeTitleInput.value = recipe.title || '';
            if(recipeCategoryInput) recipeCategoryInput.value = recipe.category || '';
            currentIngredientsArray = [...(recipe.ingredients || [])]; 
            renderIngredientList();
            if(newIngredientInput) newIngredientInput.value = ''; 
            if(recipeDirectionsInput) recipeDirectionsInput.value = (recipe.directions || []).join('\n');
            if(recipeNotesInput) recipeNotesInput.value = recipe.notes || '';
            if(recipeTagsInput) recipeTagsInput.value = (recipe.tags || []).join(', ');
            
            if(recipeIdInput) recipeIdInput.value = recipeId; 
            if(formTitle) formTitle.textContent = 'Edit Recipe';

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
function loadBrowseViewRecipes() { /* ... (Full function from previous version) ... */ }
function renderRecipes() { /* ... (Full function from previous version, but needs to use recipe.imageUrl) ... */ }
async function navigateToRecipeDetail(recipeId) { /* ... (Full function from previous version, but needs to use recipe.imageUrl) ... */ }
async function handleDeleteRecipe() { /* ... (Full function from previous version) ... */ }
function updateCategoryButtonStyles() { /* ... (Full function from previous version) ... */ }


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
        loadingIndicator = document.getElementById('loadingIndicator'); // Assign loading indicator
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
                    if (file.size > 5 * 1024 * 1024) { // 5MB limit
                        showMessage(errorMessageDiv, "Image is too large (max 5MB).", true);
                        recipeImageInput.value = ''; // Clear the input
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
        
        // ... (All other existing event listeners for nav, form submit, edit, delete, search, category, ingredients) ...
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
