// firebase.js
import { initializeApp }   from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth }         from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore }    from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage }      from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { marked }          from "https://cdn.jsdelivr.net/npm/marked@4.3.0/lib/marked.esm.js";

const firebaseConfig = {
        apiKey: "AIzaSyBiV-BFHLVy0EbKIl9gnt2j-QsLUyvkZvs",
        authDomain: "my-personal-recipe-book-8b55d.firebaseapp.com",
        projectId: "my-personal-recipe-book-8b55d",
        storageBucket: "my-personal-recipe-book-8b55d.firebasestorage.app",
        messagingSenderId: "932879383972",
        appId: "1:932879383972:web:aa977406634fa061485531",
        measurementId: "G-ZWP1BKDXY4"
};
const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const db      = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage, marked };
