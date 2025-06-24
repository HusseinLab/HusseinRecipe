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
    getDownloadURL,
    deleteObject // Import for deleting images
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

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
let existingImageUrl = null; // To track the image URL when editing

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

// --- Functions ---
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
function showMessage(element, message, isError = false, duration = 3000) {
    if (!element) return;
    element.textContent = message;
    element.className = 'p-3 text-sm text-white rounded-lg fixed top-24 right-5 z-50 shadow-lg';
    element.classList.add(isError ? 'bg-red-500' : 'bg-green-500');
    element.classList.remove('hidden');
    setTimeout(() => element.classList.add('hidden'), duration);
}
async function initializeFirebaseAndAuth() {
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        storage = getStorage(app);
        console.log("DEBUG_INIT: Firebase core services initialized.");
        onAuthStateChanged(auth, handleAuthStateChange);
    } catch (error) {
        console.error("CRITICAL ERROR in initializeFirebaseAndAuth:", error);
        if (authStatusDiv) authStatusDiv.textContent = "Init Error!";
    }
}
async function handleAuthStateChange(user) {
    if (user) {
        userId = user.uid;
        console.log("AUTH: Signed In. UID:", userId, "Name:", user.displayName);
        updateAuthUI(user);
        loadBrowseViewRecipes();
    } else {
        userId = null;
        console.log("AUTH: Signed Out.");
        updateAuthUI(null);
        if (recipesUnsubscribe) recipesUnsubscribe();
        renderRecipes(); // Render empty state
    }
}
function updateAuthUI(user) {
    if (user) {
        authStatusDiv.classList.add('hidden');
        googleSignInBtn.classList.add('hidden');
        userInfoDiv.classList.remove('hidden');
        userInfoDiv.classList.add('flex');
        userNameSpan.textContent = user.displayName || user.email || "User";
    } else {
        authStatusDiv.classList.add('hidden');
        googleSignInBtn.classList.remove('hidden');
        userInfoDiv.classList.add('hidden');
        userInfoDiv.classList.remove('flex');
        userNameSpan.textContent = '';
    }
}
async function handleGoogleSignIn() { /* ... (Your working implementation) ... */ }
async function handleSignOut() { /* ... (Your working implementation) ... */ }
function renderIngredientList() { /* ... (Your working implementation) ... */ }

// CORRECTED: Image upload and recipe save logic
async function handleRecipeFormSubmit(event) {
    event.preventDefault();
    if (!userId) { showMessage(errorMessageDiv, "You must be logged in to save recipes.", true); return; }

    const titleValue = recipeTitleInput.value.trim();
    const categoryValue = recipeCategoryInput.value;
    const directionsText = recipeDirectionsInput.value.trim();
    const notesValue = recipeNotesInput.value.trim();
    const tagsText = recipeTagsInput.value.trim();
    const recipeIdToEdit = recipeIdInput.value;

    if (!titleValue || !categoryValue || currentIngredientsArray.length === 0 || !directionsText) {
        showMessage(errorMessageDiv, "Title, Category, at least one Ingredient, and Directions are required.", true);
        return;
    }

    loadingIndicator.classList.remove('hidden');
    loadingIndicator.style.width = '10%';

    try {
        let finalImageUrl = existingImageUrl; // Keep existing image by default

        if (selectedImageFile) {
            // New image selected, perform upload
            const imageName = `${userId}_${Date.now()}_${selectedImageFile.name.replace(/\s+/g, '_')}`;
            const storageRefPath = `recipe_images/${userId}/${imageName}`;
            const imageStorageRefInstance = storageRef(storage, storageRefPath);
            
            const uploadTask = uploadBytesResumable(imageStorageRefInstance, selectedImageFile);

            // Wait for the upload to complete to get the download URL
            await new Promise((resolve, reject) => {
                uploadTask.on('state_changed',
                    (snapshot) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        loadingIndicator.style.width = progress + '%';
                    },
                    (error) => {
                        console.error("Upload failed:", error);
                        reject(error);
                    },
                    async () => {
                        finalImageUrl = await getDownloadURL(uploadTask.snapshot.ref);
                        console.log('File available at:', finalImageUrl);
                        resolve();
                    }
                );
            });
        } else if (imagePreview && (imagePreview.src.includes('#') || imagePreview.src === '')) {
            // User removed the existing image
            finalImageUrl = null;
        }

        // Now that the image handling is complete, save all data to Firestore
        await saveRecipeDataToFirestore(recipeIdToEdit, titleValue, categoryValue, directionsText, notesValue, tagsText, finalImageUrl);

    } catch (error) {
        console.error("Error during recipe submission process:", error);
        showMessage(errorMessageDiv, `Failed to save recipe: ${error.message}`, true);
    } finally {
        loadingIndicator.classList.add('hidden');
        loadingIndicator.style.width = '0%';
    }
}

async function saveRecipeDataToFirestore(recipeIdToEdit, title, category, directions, notes, tags, imageUrl) {
    const recipeData = {
        title, category,
        ingredients: currentIngredientsArray,
        directions: directions.split('\n').map(s => s.trim()).filter(s => s),
        notes,
        tags: tags.split(',').map(s => s.trim()).filter(s => s),
    };

    const recipesCollectionPath = `artifacts/${appId}/users/${userId}/recipes`;
    
    if (recipeIdToEdit) {
        const dataToUpdate = { ...recipeData, lastUpdatedAt: Timestamp.now() };
        if (imageUrl !== undefined) { // Update image URL only if a decision was made (new, removed, or kept)
            dataToUpdate.imageUrl = imageUrl;
        }
        await updateDoc(doc(db, recipesCollectionPath, recipeIdToEdit), dataToUpdate);
        showMessage(successMessageDiv, "Recipe updated successfully!");
    } else {
        const dataToSave = { ...recipeData, userId, createdAt: Timestamp.now() };
        if (imageUrl) {
            dataToSave.imageUrl = imageUrl;
        }
        await addDoc(collection(db, recipesCollectionPath), dataToSave);
        showMessage(successMessageDiv, "Recipe added successfully!");
    }
    
    // Reset form and UI state
    if(recipeForm) recipeForm.reset(); 
    currentIngredientsArray = []; renderIngredientList(); 
    recipeIdInput.value = ''; currentRecipeIdInDetailView = null; 
    selectedImageFile = null; existingImageUrl = null;
    if(imagePreview) imagePreview.src = '#';
    if(imagePreviewContainer) imagePreviewContainer.classList.add('hidden');
    if(recipeImageInput) recipeImageInput.value = '';
    
    showView('browseView');
}

async function populateFormForEdit(recipeId) { /* ... (Your working implementation with existingImageUrl set) ... */ }
function loadBrowseViewRecipes() { /* ... (Your working implementation) ... */ }
function renderRecipes() { /* ... (Your working implementation) ... */ }
async function navigateToRecipeDetail(recipeId) { /* ... (Your working implementation) ... */ }
function updateCategoryButtonStyles() { /* ... (Your working implementation) ... */ }

// CORRECTED: This function now deletes from Storage and Firestore
async function handleDeleteRecipe() { 
    if (!userId || !db || !currentRecipeIdInDetailView) {
        showMessage(errorMessageDiv, "No recipe selected or user not logged in.", true);
        return;
    }

    const recipeNameToDelete = detailRecipeTitle.textContent || "this recipe"; 
    if (window.confirm(`Are you sure you want to delete "${recipeNameToDelete}"? This cannot be undone.`)) {
        try {
            const recipeDocRef = doc(db, `artifacts/${appId}/users/${userId}/recipes`, currentRecipeIdInDetailView);
            const docSnap = await getDoc(recipeDocRef);

            if (docSnap.exists()) {
                const recipeData = docSnap.data();
                if (recipeData.imageUrl) {
                    console.log("Recipe has an image, attempting to delete from Storage...");
                    try {
                        const imageRef = storageRef(storage, recipeData.imageUrl);
                        await deleteObject(imageRef);
                        console.log("Image deleted successfully from Storage.");
                    } catch (storageError) {
                        if (storageError.code !== 'storage/object-not-found') {
                            console.error("Error deleting image from Storage:", storageError);
                            showMessage(errorMessageDiv, `Could not delete recipe image. Please try deleting the recipe again.`, true);
                            return; // Stop if image delete fails for a reason other than not found
                        } else {
                            console.warn("Image not found in storage, proceeding to delete Firestore doc.");
                        }
                    }
                }

                await deleteDoc(recipeDocRef);
                showMessage(successMessageDiv, `Recipe "${recipeNameToDelete}" deleted successfully.`);
                
                currentRecipeIdInDetailView = null; 
                showView('browseView'); 
            } else {
                showMessage(errorMessageDiv, "Recipe not found, it may have already been deleted.", true);
                showView('browseView'); 
            }
        } catch (error) {
            showMessage(errorMessageDiv, `Error deleting recipe: ${error.message}`, true);
            console.error("Error deleting recipe:", error);
        }
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => { /* ... (Your working implementation) ... */ });
