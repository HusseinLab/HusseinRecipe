// All 'import' statements MUST be at the top level of the module.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, query, orderBy, onSnapshot, doc, getDoc, addDoc, updateDoc, deleteDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

document.addEventListener('DOMContentLoaded', () => {

    console.log("SCRIPT: DOMContentLoaded - Event fired. Initializing application.");

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
        storageBucket: "my-personal-recipe-book-8b55d.firebasestorage.app", // The corrected, working URL
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
    const detailRecipeTagsContainer = document.getElementById('detailRecipeTagsContainer');
    const detailRecipeTags = document.getElementById('detailRecipeTags');
    const detailRecipeIngredients = document.getElementById('detailRecipeIngredients');
    const detailRecipeDirections = document.getElementById('detailRecipeDirections');
    const detailRecipeNotesContainer = document.getElementById('detailRecipeNotesContainer');
    const detailRecipeNotes = document.getElementById('detailRecipeNotes');
    const detailImagePlaceholder = document.getElementById('detailImagePlaceholder');
    const editRecipeBtn = document.getElementById('editRecipeBtn');
    const deleteRecipeBtn = document.getElementById('deleteRecipeBtn');
    const saveRecipeBtn = document.getElementById('saveRecipeBtn');
    const saveBtnSpinner = document.getElementById('saveBtnSpinner');
    const saveBtnText = document.getElementById('saveBtnText');
    const views = ['browseView', 'recipeDetailView', 'recipeFormView'];

    // --- FUNCTION DEFINITIONS ---

    function setSaveButtonLoading(isLoading) {
        if (isLoading) {
            saveRecipeBtn.disabled = true;
            saveBtnSpinner.classList.remove('hidden');
            saveBtnText.textContent = 'Saving...';
        } else {
            saveRecipeBtn.disabled = false;
            saveBtnSpinner.classList.add('hidden');
            saveBtnText.textContent = 'Save Recipe';
        }
    }

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
        element.className = `p-3 text-sm text-white rounded-lg fixed top-24 right-5 z-50 shadow-lg ${isError ? 'bg-red-500' : 'bg-green-500'}`;
        element.classList.remove('hidden');
        
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
            case 'storage/unauthorized': return "You do not have permission to upload this file. Please check storage rules.";
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

    async function handleRecipeFormSubmit(event) {
        event.preventDefault();
        if (!userId) {
            showMessage(errorMessageDiv, "You must be logged in to save recipes.", true);
            return;
        }

        const titleValue = recipeTitleInput.value.trim();
        const categoryValue = recipeCategoryInput.value;
        const directionsText = recipeDirectionsInput.value.trim();
        const recipeIdToEdit = recipeIdInput.value;

        if (!titleValue || !categoryValue || currentIngredientsArray.length === 0 || !directionsText) {
            showMessage(errorMessageDiv, "Title, Category, at least one Ingredient, and Directions are required.", true);
            return;
        }

        setSaveButtonLoading(true);
        loadingIndicator.classList.remove('hidden');
        loadingIndicator.style.width = '0%';

        const notesValue = recipeNotesInput.value.trim();
        const tagsText = recipeTagsInput.value.trim();

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
                    const userMessage = getFriendlyFirebaseErrorMessage(error);
                    showMessage(errorMessageDiv, `Image upload failed: ${userMessage}`, true, error);
                    setSaveButtonLoading(false);
                    loadingIndicator.classList.add('hidden');
                },
                async () => {
                    try {
                        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                        await saveRecipeDataToFirestore(recipeIdToEdit, titleValue, categoryValue, directionsText, notesValue, tagsText, downloadURL);
                    } catch(error) {
                         showMessage(errorMessageDiv, "Error saving recipe data after upload.", true, error);
                         setSaveButtonLoading(false);
                         loadingIndicator.classList.add('hidden');
                    }
                }
            );
        } else {
            try {
                let imageUrlToSave = undefined;
                if (recipeIdToEdit) {
                    imageUrlToSave = (imagePreview.src && imagePreview.src.startsWith('http')) ? imagePreview.src : null;
                }
                await saveRecipeDataToFirestore(recipeIdToEdit, titleValue, categoryValue, directionsText, notesValue, tagsText, imageUrlToSave);
            } catch(error) {
                showMessage(errorMessageDiv, `Error saving recipe: ${getFriendlyFirebaseErrorMessage(error)}`, true, error);
            }
        }
    }
    
    async function saveRecipeDataToFirestore(recipeIdToEdit, title, category, directions, notes, tags, imageUrl) {
        const recipeData = {
            title, category,
            ingredients: [...currentIngredientsArray],
            directions: directions.split('\n').map(s => s.trim()).filter(Boolean),
            notes,
            tags: tags.split(',').map(s => s.trim()).filter(Boolean),
        };
        
        try {
            const recipesCol = collection(db, `artifacts/${appId}/users/${userId}/recipes`);
            if (recipeIdToEdit) {
                const dataToUpdate = { ...recipeData, lastUpdatedAt: Timestamp.now() };
                if (imageUrl !== undefined) dataToUpdate.imageUrl = imageUrl;
                await updateDoc(doc(recipesCol, recipeIdToEdit), dataToUpdate);
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
            throw error;
        } finally {
            setSaveButtonLoading(false);
            loadingIndicator.classList.add('hidden');
        }
    }
    
    function loadBrowseViewRecipes() {
        if (!userId) return;
        if (recipesUnsubscribe) {
            renderRecipes();
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
        
        const skeletonHTML = `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 lg:gap-8">
                ${[...Array(4)].map(() => `
                <div class="bg-white rounded-xl shadow-lg overflow-hidden">
                    <div class="h-48 w-full bg-slate-200 animate-pulse"></div>
                    <div class="p-5">
                        <div class="h-4 w-1/3 bg-slate-200 rounded animate-pulse mb-4"></div>
                        <div class="h-6 w-3/4 bg-slate-200 rounded animate-pulse"></div>
                    </div>
                </div>`).join('')}
            </div>`;

        if (!window.lastRecipeSnapshot || !userId) {
            recipesGridContainer.innerHTML = '';
            recipesGridPlaceholder.style.display = 'block';
            recipesGridPlaceholder.innerHTML = userId ? skeletonHTML : '<p class="text-center text-gray-500 py-8 col-span-full">Please sign in to see recipes.</p>';
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
                
                // =================================================================
                // THIS IS THE CORRECTED CARD CREATION LOGIC
                // =================================================================
                const card = document.createElement('div');
                card.className = 'recipe-card bg-white rounded-xl shadow-lg overflow-hidden cursor-pointer group relative'; // Added relative
                card.dataset.id = recipeId;
                card.addEventListener('click', () => navigateToRecipeDetail(recipeId));

                const imageContainer = document.createElement('div');
                imageContainer.className = 'h-48 w-full recipe-card-image-container';

                const imageHTML = recipe.imageUrl
                    ? `<img src="${recipe.imageUrl}" alt="${recipe.title}" class="recipe-card-image w-full h-full object-cover">`
                    : `<div class="w-full h-full flex items-center justify-center bg-slate-200"><svg class="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>`;
                
                imageContainer.innerHTML = imageHTML;
                
                const contentDiv = document.createElement('div');
                contentDiv.className = 'p-5 flex-grow flex flex-col';

                // This is the original, always-visible text
                const originalContent = document.createElement('div');
                originalContent.className = 'transition-opacity duration-300 group-hover:opacity-0';
                originalContent.innerHTML = `
                    <p class="text-xs font-semibold text-indigo-600 uppercase mb-1">${recipe.category || 'Uncategorized'}</p>
                    <h3 class="text-xl font-bold text-gray-800">${recipe.title || 'Untitled Recipe'}</h3>
                `;

                // This is the white text that appears on hover
                const hoverContent = document.createElement('div');
                hoverContent.className = 'absolute bottom-0 left-0 p-5 text-white transition-opacity duration-300 opacity-0 group-hover:opacity-100 pointer-events-none w-full';
                hoverContent.innerHTML = `
                    <p class="text-xs font-semibold uppercase tracking-wider">${recipe.category || 'Uncategorized'}</p>
                    <h3 class="text-xl font-bold leading-tight">${recipe.title || 'Untitled Recipe'}</h3>
                `;

                contentDiv.appendChild(originalContent);
                card.appendChild(imageContainer);
                card.appendChild(contentDiv);
                card.appendChild(hoverContent); // Append hover text separately to ensure it's on top
                
                recipesGridContainer.appendChild(card);
                // =================================================================
                // END OF CORRECTED CARD CREATION LOGIC
                // =================================================================
            }
        });
        
        if (recipesFound === 0) {
            recipesGridPlaceholder.innerHTML = '<p class="text-center text-gray-500 py-8 col-span-full">No recipes found matching your criteria.</p>';
            recipesGridPlaceholder.style.display = 'block';
        } else {
            recipesGridPlaceholder.style.display = 'none';
        }
    }
    
    async function navigateToRecipeDetail(recipeId) {
        if (!userId) return;
        currentRecipeIdInDetailView = recipeId;
        
        detailRecipeTitle.textContent = 'Loading recipe...';
        detailRecipeCategory.textContent = '';
        detailRecipeTags.innerHTML = '';
        detailRecipeIngredients.innerHTML = '';
        detailRecipeDirections.innerHTML = '';
        detailRecipeNotes.textContent = '';
        detailRecipeNotesContainer.classList.add('view-hidden');
        detailRecipeTagsContainer.classList.add('view-hidden');
        detailImagePlaceholder.innerHTML = `<svg class="w-16 h-16 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>`;
        
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
                
                if (recipe.tags && recipe.tags.length > 0) {
                    detailRecipeTagsContainer.classList.remove('view-hidden');
                    detailRecipeTags.innerHTML = recipe.tags.map(tag => `<span class="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-medium">${tag}</span>`).join('');
                }
                if (recipe.notes && recipe.notes.trim() !== '') {
                    detailRecipeNotesContainer.classList.remove('hidden');
                    detailRecipeNotes.textContent = recipe.notes;
                }
            } else {
                showMessage(errorMessageDiv, "Recipe not found.", true);
                showView('browseView');
            }
        } catch(error) {
            showMessage(errorMessageDiv, getFriendlyFirebaseErrorMessage(error), true, error);
        }
    }
    
    async function populateFormForEdit(recipeId) {
        if (!userId) return;
        try {
            const recipeDocRef = doc(db, `artifacts/${appId}/users/${userId}/recipes`, recipeId);
            const docSnap = await getDoc(recipeDocRef);
            if (docSnap.exists()) {
                const recipe = docSnap.data();
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
                if (recipe.imageUrl) {
                    imagePreview.src = recipe.imageUrl;
                    imagePreviewContainer.classList.remove('hidden');
                }
                showView('recipeFormView');
            } else {
                showMessage(errorMessageDiv, "Recipe data not found for editing.", true);
            }
        } catch (error) {
            showMessage(errorMessageDiv, `Error loading recipe for editing: ${getFriendlyFirebaseErrorMessage(error)}`, true);
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
                if (recipesUnsubscribe) recipesUnsubscribe();
                recipesUnsubscribe = null;
                loadBrowseViewRecipes();
            } else {
                userId = null;
                if (recipesUnsubscribe) recipesUnsubscribe();
                recipesUnsubscribe = null;
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
        
        recipeForm.addEventListener('submit', handleRecipeFormSubmit);
        editRecipeBtn.addEventListener('click', () => {
            if (currentRecipeIdInDetailView) {
                populateFormForEdit(currentRecipeIdInDetailView);
            }
        });
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
        
        document.querySelectorAll('.category-filter-btn').forEach(button => {
            button.addEventListener('click', () => {
                currentCategoryFilter = button.dataset.category;
                updateCategoryButtonStyles();
                renderRecipes();
            });
        });

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
        console.error("CRITICAL ERROR in application startup:", error);
        alert("A critical error occurred on page load. The application may not work correctly. See console for details.");
    }
});
