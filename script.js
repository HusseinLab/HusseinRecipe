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
    Timestamp,
    FieldValue // Import FieldValue for deleting fields
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
    getStorage,
    ref as storageRef,
    uploadBytesResumable,
    getDownloadURL,
    deleteObject // NEW: Import for deleting images
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
let existingImageUrl = null; // NEW: To track the image URL when editing

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
// (Variables are declared but assigned in DOMContentLoaded)
let authStatusDiv, googleSignInBtn, userInfoDiv, userNameSpan, signOutBtn, navigateToAddRecipeBtn, navigateToBrowseBtnDetail, navigateToBrowseBtnForm;
let recipeForm, recipeTitleInput, recipeCategoryInput, recipeImageInput, imagePreviewContainer, imagePreview, removeImageBtn, recipeDirectionsInput, recipeNotesInput, recipeTagsInput, formTitle, recipeIdInput;
let newIngredientInput, addIngredientBtn, ingredientListDisplay;
let successMessageDiv, errorMessageDiv, loadingIndicator;
let recipesGridContainer, recipesGridPlaceholder, headerSearchInput, mobileSearchInput, categoryFilterButtonsNodeList;
let detailRecipeTitle, detailRecipeCategory, detailRecipeTags, detailRecipeIngredients, detailRecipeDirections, detailRecipeNotesContainer, detailRecipeNotes, detailImagePlaceholder;
let editRecipeBtn, deleteRecipeBtn;

const views = ['browseView', 'recipeDetailView', 'recipeFormView'];

// --- Functions ---
function showView(viewIdToShow) { /* ... Your existing working function ... */ }
function showMessage(element, message, isError = false, duration = 3000) { /* ... Your existing working function ... */ }
async function initializeFirebaseAndAuth() { /* ... Your existing working function ... */ }
async function handleGoogleSignIn() { /* ... Your existing working function ... */ }
async function handleSignOut() { /* ... Your existing working function ... */ }
function renderIngredientList() { /* ... Your existing working function ... */ }

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
        let finalImageUrl = existingImageUrl; // Start with the URL that was there when the form loaded

        // Scenario 1: User selected a new image to upload.
        if (selectedImageFile) {
            console.log("New image selected, starting upload...");
            const imageName = `${userId}_${Date.now()}_${selectedImageFile.name.replace(/\s+/g, '_')}`;
            const storageRefPath = `recipe_images/${userId}/${imageName}`;
            const imageStorageRefInstance = storageRef(storage, storageRefPath);
            
            const uploadTask = uploadBytesResumable(imageStorageRefInstance, selectedImageFile);
            
            // This is a simplified await for the upload to complete.
            // For progress bar, we would use the more complex uploadTask.on() observer.
            await uploadTask; 
            
            finalImageUrl = await getDownloadURL(imageStorageRefInstance);
            console.log("Image upload complete. New URL:", finalImageUrl);
        } else if (imagePreview.src.includes('#') || imagePreview.src === '') {
            // Scenario 2: User explicitly removed an existing image.
            finalImageUrl = null;
        }
        // Scenario 3 (implicit): No new file and existing image preview is still there.
        // `finalImageUrl` already holds the `existingImageUrl`, so no action needed.

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
    
    if (recipeIdToEdit) { // Editing existing recipe
        const dataToUpdate = { ...recipeData, lastUpdatedAt: Timestamp.now() };
        if (imageUrl !== undefined) { 
            dataToUpdate.imageUrl = imageUrl; 
        }
        await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/recipes`, recipeIdToEdit), dataToUpdate);
        showMessage(successMessageDiv, "Recipe updated successfully!");
    } else { // Adding new recipe
        const dataToSave = { ...recipeData, userId, createdAt: Timestamp.now() };
        if (imageUrl) {
            dataToSave.imageUrl = imageUrl;
        }
        await addDoc(collection(db, `artifacts/${appId}/users/${userId}/recipes`), dataToSave);
        showMessage(successMessageDiv, "Recipe added successfully!");
    }
    
    // Reset form and go back to browse view
    if(recipeForm) recipeForm.reset(); 
    currentIngredientsArray = []; 
    renderIngredientList(); 
    recipeIdInput.value = ''; 
    currentRecipeIdInDetailView = null; 
    selectedImageFile = null; 
    existingImageUrl = null;
    if(imagePreview) imagePreview.src = '#';
    if(imagePreviewContainer) imagePreviewContainer.classList.add('hidden');
    if(recipeImageInput) recipeImageInput.value = '';
    
    showView('browseView');
}

async function populateFormForEdit(recipeId) { /* ... (Your working implementation, with one addition) ... */
    selectedImageFile = null; // Reset any lingering file selection
    existingImageUrl = null;  // Reset existing image URL tracker
    // ... rest of your function ...
    if (docSnap.exists()) {
        const recipe = docSnap.data();
        // ... all your field population ...
        if (recipe.imageUrl) {
            existingImageUrl = recipe.imageUrl; // IMPORTANT: Store the existing URL
            imagePreview.src = recipe.imageUrl;
            imagePreviewContainer.classList.remove('hidden');
        } else {
            imagePreviewContainer.classList.add('hidden');
            imagePreview.src = '#';
        }
        // ... rest of your function ...
    }
}

// --- Recipe Display and Filtering ---
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
                // Check if there's an image to delete from Storage
                if (recipeData.imageUrl) {
                    console.log("Recipe has an image, attempting to delete from Storage...");
                    try {
                        const imageRef = storageRef(storage, recipeData.imageUrl); // Get ref from URL
                        await deleteObject(imageRef);
                        console.log("Image deleted successfully from Storage.");
                    } catch (storageError) {
                        console.error("Error deleting image from Storage:", storageError);
                        // Decide if you want to stop the whole process if image delete fails.
                        // For now, we'll log the error and continue to delete the Firestore doc.
                        showMessage(errorMessageDiv, `Could not delete recipe image, but deleting recipe data. Error: ${storageError.code}`, true);
                    }
                }

                // Delete the recipe document from Firestore
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
