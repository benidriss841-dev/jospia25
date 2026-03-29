/* ==============================================
   CONFIGURATION
   ============================================== */
// !!! IMPORTANT: USER MUST FILL THESE IN !!!
const firebaseConfig = {
    apiKey: "AIzaSyCLacVDPeWpRPwhE6tzJOLaoxSIuRYmBNk",
    authDomain: "serfan-961a4.firebaseapp.com",
    projectId: "serfan-961a4",
    storageBucket: "serfan-961a4.firebasestorage.app",
    messagingSenderId: "744180827763",
    appId: "1:744180827763:web:a0cd3cdc9b8d47e589cc06",
    measurementId: "G-5STG5E494X"
};

// Cloudinary
const CLOUDINARY_CLOUD_NAME = 'dvqzhgw1o';
const CLOUDINARY_UPLOAD_PRESET = 'serfan'; // Unsigned preset

/* ==============================================
   STATE & CONSTANTS
   ============================================== */
let seminaristes = []; // Local cache
const DORTOIRS_FRERES = ["IMAM MÂLIK IBN ANAS", "IMAM ASH-SHÂFI‘Î", "IMAM AHMAD IBN HANBAL", "IMAM ABÛ HANÎFA", "IMAM AL-BOUKHARI"];
const DORTOIRS_SOEURS = ["MARYAM BINT ‘IMRÂN", "ASSYA BINT MUZAHIM", "KHADÎJAH BINT KHUWAYLID", "FÂTIMA AZ-ZAHRÂ", "AÏCHA BINT ABI BAKR"];
const GROUPE_HARAKAS_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

// Initialize Firebase Globals
let db = null;
let USE_FIREBASE = false;

if (typeof firebase !== 'undefined') {
    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        USE_FIREBASE = true;
        console.log('Firebase: Initialisation réussie (Firestore prêt)');
    } catch (e) {
        console.error('Firebase: Erreur initialisation', e);
    }
} else {
    console.warn('Firebase: La bibliothèque est introuvable (Mode Local)');
}

// Fallback for local dev if keys not set
const USE_LOCAL_STORAGE = (!USE_FIREBASE);
const DB_KEY = 'serfan_v2_local_db';

// Authentication
const ADMIN_PASSWORD = 'benfou2007';
let currentUserRole = sessionStorage.getItem('userRole') || null; // 'admin' or 'user'

// ... Firebase init moved up ...

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    console.log('App: Initialisation...');

    // Handle sidebar toggle on mobile
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.querySelector('.sidebar');
    if (mobileMenuBtn) {
        mobileMenuBtn.onclick = () => {
            console.log('Mobile Menu: Toggle');
            sidebar.classList.toggle('mobile-open');
        };
    }

    // Check authentication first
    if (!currentUserRole) {
        showLoginModal();
        return;
    }

    await loadData();
    updateUIForRole();

    // Route based on role
    if (currentUserRole === 'admin') {
        routeTo('dashboard');
    } else {
        // Regular users go directly to add page
        routeTo('add');
    }

    if (!USE_FIREBASE) {
        showToast('Mode Local (Pas de Firebase configuré)', 'warning');
    } else {
        showToast('Connecté à Firebase', 'success');
        subscribeToRealtime();
    }

    // Bind sidebar clicks
    document.querySelectorAll('[data-route]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            const route = el.dataset.route;

            // Close sidebar on mobile after clicking
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('mobile-open');
            }

            // Check if route requires admin
            if (el.dataset.adminOnly === 'true' && currentUserRole !== 'admin') {
                showToast('Accès réservé aux administrateurs', 'error');
                return;
            }

            // Handle active state
            document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
            el.classList.add('active');
            routeTo(route);
        });
    });
}

/* ==============================================
   DATA LAYER (Firebase + LocalStorage Fallback)
   ============================================== */
async function loadData() {
    if (!USE_FIREBASE) {
        const stored = localStorage.getItem(DB_KEY);
        seminaristes = stored ? JSON.parse(stored) : [];
    } else {
        try {
            const snapshot = await db.collection('seminaristes').get();
            seminaristes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (err) {
            console.error('Firebase load error:', err);
            showToast('Erreur chargement données', 'error');
        }
    }
    // Enrich with photo URLs based on matricule
    seminaristes = seminaristes.map(s => ({ ...s, photo_url: s.photo_url || getPhotoUrl(s.matricule) }));
}

async function saveData(newItem, isUpdate = false) {
    if (!newItem) return;

    // Ensure matricule is set
    newItem = ensureDerivedFields(newItem);
    const matricule = newItem.matricule;

    if (!USE_FIREBASE) {
        if (isUpdate) {
            const index = seminaristes.findIndex(s => s.matricule === matricule);
            if (index >= 0) seminaristes[index] = newItem;
        } else {
            seminaristes.push(newItem);
        }
        localStorage.setItem(DB_KEY, JSON.stringify(seminaristes));
        return newItem;
    } else {
        try {
            console.log('Firebase: Tentative de setDoc sur', matricule, newItem);
            // On s'assure que le matricule n'est pas vide pour l'ID du document
            if (!matricule) throw new Error('Matricule manquant');

            await db.collection('seminaristes').doc(matricule).set(newItem);
            console.log('Firebase: Succès pour', matricule);

            await loadData();
            return newItem;
        } catch (err) {
            console.error('Firebase save error details:', err);
            // S'il s'agit d'un problème de droits, err.code sera 'permission-denied'
            let msg = 'Erreur technique';
            if (err.code === 'permission-denied') msg = 'Permission refusée (Vérifiez les règles Firestore)';
            else if (err.message) msg = err.message;

            showToast('Erreur sauvegarde: ' + msg, 'error');
            throw err;
        }
    }
}

async function getDataByMatricule(matricule) {
    if (!USE_FIREBASE) {
        return seminaristes.find(s => s.matricule === matricule);
    } else {
        try {
            const doc = await db.collection('seminaristes').doc(matricule).get();
            return doc.exists ? { id: doc.id, ...doc.data() } : null;
        } catch (err) {
            console.error('Firebase get error:', err);
            return null;
        }
    }
}

async function deleteData(matricule) {
    if (!USE_FIREBASE) {
        seminaristes = seminaristes.filter(s => s.matricule !== matricule);
        localStorage.setItem(DB_KEY, JSON.stringify(seminaristes));
    } else {
        try {
            await db.collection('seminaristes').doc(matricule).delete();
            await loadData();
        } catch (err) {
            console.error('Delete error', err);
            showToast('Erreur suppression', 'error');
        }
    }
}

async function deleteAllData() {
    if (!confirm('ATTENTION: Vous allez supprimer TOUS les séminaristes.\n\nCette action est IRRÉVERSIBLE.\n\nVoulez-vous vraiment continuer ?')) return;

    if (prompt('Pour confirmer, tapez "SUPPRIMER" en majuscules :') !== 'SUPPRIMER') {
        showToast('Suppression annulée', 'info');
        return;
    }

    if (!USE_FIREBASE) {
        seminaristes = [];
        localStorage.removeItem(DB_KEY);
        showToast('Toutes les données ont été effacées', 'success');
        renderDashboard();
    } else {
        try {
            const snapshot = await db.collection('seminaristes').get();
            const batch = db.batch();
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();

            await loadData();
            showToast('Base de données vidée avec succès', 'success');
            renderDashboard();
        } catch (err) {
            console.error('Delete ALL error', err);
            showToast('Erreur lors de la suppression totale', 'error');
        }
    }
}

function subscribeToRealtime() {
    if (!db) return;

    db.collection('seminaristes').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const data = change.doc.data();
            const matricule = change.doc.id;

            if (change.type === "added") {
                if (!seminaristes.find(s => s.matricule === matricule)) {
                    seminaristes.push({ id: change.doc.id, ...data });
                    // showToast(`Nouvelle entrée: ${data.prenom} ${data.nom}`, 'info');
                }
            }
            if (change.type === "modified") {
                const index = seminaristes.findIndex(s => s.matricule === matricule);
                if (index !== -1) {
                    seminaristes[index] = { id: change.doc.id, ...data };
                }
            }
            if (change.type === "removed") {
                seminaristes = seminaristes.filter(s => s.matricule !== matricule);
            }
        });
        refreshCurrentView();
    }, (error) => {
        console.error("Realtime error:", error);
        showToast('Erreur synchro en direct', 'error');
    });
}

// Helper to refresh UI without full reload
function refreshCurrentView() {
    // Determine current logical route based on UI state or just re-render last known
    // Simple heuristic: look at active nav link
    const activeLink = document.querySelector('.nav-link.active');
    if (activeLink) {
        const route = activeLink.dataset.route;
        // Re-trigger routing to refresh data display
        if (route === 'dashboard') renderDashboard();
        else if (route === 'all') renderTable(seminaristes);
        else if (route === 'search') {
            // Re-trigger search if input has value
            const term = document.getElementById('searchInput')?.value;
            if (term && term.length >= 2) {
                const matches = seminaristes.filter(s =>
                    (s.nom && s.nom.toLowerCase().includes(term.toLowerCase())) ||
                    (s.prenom && s.prenom.toLowerCase().includes(term.toLowerCase())) ||
                    (s.matricule && s.matricule.toLowerCase().includes(term.toLowerCase()))
                );
                document.getElementById('searchResults').innerHTML = generateTableHTML(matches);
            }
        }
        else if (route === 'levels') renderLevelsByGenre();
        else if (route === 'dortoirs') renderGroupList('dortoir', [...DORTOIRS_FRERES, ...DORTOIRS_SOEURS]);
        else if (route === 'harakas') {
            const allH = new Set([...seminaristes.map(s => s.halaqa).filter(Boolean), ...DORTOIRS_FRERES, ...DORTOIRS_SOEURS]);
            renderGroupList('halaqa', Array.from(allH));
        }
        // 'add'/'edit' forms might be disrupted by auto-refresh, so we skip or handle carefully. 
        // For now, we don't auto-refresh forms to avoid wiping user input.
    }
}

async function batchImport(rows) {
    let baseId = getLastMatriculeId();
    // Ensure fields
    const prepared = rows.map((r, i) => {
        // Pre-assign matricule if missing to ensure uniqueness in batch
        if (!r.matricule) {
            baseId++;
            r.matricule = '25-JOS' + baseId.toString().padStart(3, '0');
        }
        return ensureDerivedFields(r);
    });

    if (!USE_FIREBASE) {
        seminaristes = [...seminaristes, ...prepared];
        localStorage.setItem(DB_KEY, JSON.stringify(seminaristes));
    } else {
        try {
            const batch = db.batch();
            prepared.forEach(p => {
                const docRef = db.collection('seminaristes').doc(p.matricule);
                batch.set(docRef, p);
            });
            await batch.commit();
            await loadData();
        } catch (err) {
            console.error('Batch import error', err);
            showToast(`Erreur import: ${err.message}`, 'error');
        }
    }
}

/* ==============================================
   BUSINESS LOGIC
   ============================================== */
function getLastMatriculeId() {
    let maxId = 0;
    const prefix = '26-SERF';
    seminaristes.forEach(s => {
        if (s.matricule && s.matricule.startsWith(prefix)) {
            const num = parseInt(s.matricule.replace(prefix, ''), 10);
            if (!isNaN(num) && num > maxId) maxId = num;
        }
    });
    return maxId;
}

function ensureDerivedFields(s) {
    // 1. Matricule if missing
    if (!s.matricule) {
        const next = getLastMatriculeId() + 1;
        s.matricule = '26-SERF' + next.toString().padStart(3, '0');
    }

    // 2. Data Type Safety & Defaults
    // Coerce to number, handling empty strings and nulls
    const parseOrZero = (val) => {
        if (val === undefined || val === null || val === '') return 0;
        const n = Number(val);
        return isNaN(n) ? 0 : n;
    };

    // Note Admission
    s.note = parseOrZero(s.note);

    // Test Sortie (Default 0)
    s.test_sortie = parseOrZero(s.test_sortie);

    // Note Conduite (Default 16)
    if (s.note_conduite === undefined || s.note_conduite === null || s.note_conduite === '') {
        s.note_conduite = 16;
    } else {
        s.note_conduite = Number(s.note_conduite);
        if (isNaN(s.note_conduite)) s.note_conduite = 16; // Fallback if invalid
    }

    // 3. Genre normalization
    s.genre = (s.genre && s.genre.toUpperCase().startsWith('F')) ? 'F' : 'M';

    // 4. Niveau logic (uses s.note which is now a Number)
    s.niveau = 'NIVEAU PRIMAIRE'; // default
    if (s.note > 10) s.niveau = 'NIVEAU UNIVERSITAIRE';
    else if (s.note > 6) s.niveau = 'NIVEAU SECONDAIRE';

    // 5. Dortoir / Halaqa automation (only if missing)
    const isFem = (s.genre === 'F');
    const dList = isFem ? DORTOIRS_SOEURS : DORTOIRS_FRERES;

    if (!s.dortoir || !dList.includes(s.dortoir)) {
        // Random assignment
        s.dortoir = dList[Math.floor(Math.random() * dList.length)];
    }

    if (!s.halaqa) {
        // Simple logic: matches dortoir name for now, or random
        const hList = isFem ? DORTOIRS_SOEURS : DORTOIRS_FRERES; // Reusing logic from orig code where halaqa ~ dorms
        s.halaqa = hList[Math.floor(Math.random() * hList.length)];
    }

    return s;
}

async function uploadImage(file, matricule) {
    if (!file) return null;

    // Local fallback
    if (!CLOUDINARY_CLOUD_NAME.includes('YOUR_LOADING') && CLOUDINARY_CLOUD_NAME !== 'YOUR_CLOUD_NAME_HERE') {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        // Force deterministic public_id based on matricule if provided
        if (matricule) {
            formData.append('public_id', matricule);
        }

        try {
            const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            return data.secure_url;
        } catch (e) {
            console.error('Cloudinary upload failed', e);
            showToast('Echec upload photo', 'error');
            return null;
        }
    } else {
        // Only return local base64 if Cloudinary not set
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
    }
}

// Helper to get photo URL based on matricule
// Helper to get photo URL based on matricule
function getPhotoUrl(matricule) {
    if (!matricule) return '';
    // Default to local folder which user just populated
    return `photos/${matricule}.jpg`;
}


/* ==============================================
   ROUTING & RENDERERS
   ============================================== */
const view = document.getElementById('view');
const pageTitle = document.getElementById('pageTitle');

function routeTo(route, param = null) {
    view.innerHTML = '';
    window.scrollTo(0, 0);

    switch (route) {
        case 'dashboard':
            pageTitle.innerText = 'Tableau de bord';
            renderDashboard();
            break;
        case 'all':
            pageTitle.innerText = 'Tous les séminaristes';
            renderTable(seminaristes);
            break;
        case 'search':
            pageTitle.innerText = 'Recherche';
            renderSearch();
            break;
        case 'add':
            pageTitle.innerText = 'Ajouter Séminariste';
            renderForm();
            break;
        case 'edit':
            pageTitle.innerText = 'Modifier Séminariste';
            const item = seminaristes.find(s => s.matricule === param);
            if (item) renderForm(item);
            else showToast('Introuvable', 'error');
            break;
        case 'levels':
            if (currentUserRole !== 'admin') {
                showToast('Accès réservé aux administrateurs', 'error');
                routeTo('dashboard');
                return;
            }
            pageTitle.innerText = 'Niveaux par Genre';
            renderLevelsByGenre();
            break;
        case 'dortoirs':
            if (currentUserRole !== 'admin') {
                showToast('Accès réservé aux administrateurs', 'error');
                routeTo('dashboard');
                return;
            }
            pageTitle.innerText = 'Dortoirs';
            renderGroupList('dortoir', [...DORTOIRS_FRERES, ...DORTOIRS_SOEURS]);
            break;
        case 'harakas':
            if (currentUserRole !== 'admin') {
                showToast('Accès réservé aux administrateurs', 'error');
                routeTo('dashboard');
                return;
            }
            pageTitle.innerText = 'Harakas';
            // Get unique harakas from current data + defaults
            const allH = new Set([...seminaristes.map(s => s.halaqa).filter(Boolean), ...DORTOIRS_FRERES, ...DORTOIRS_SOEURS]);
            renderGroupList('halaqa', Array.from(allH));
            break;

        case 'import':
            pageTitle.innerText = 'Import / Export';
            renderImportExport();
            break;
        case 'filtered':
            // param is {key, value}
            pageTitle.innerText = `${param.value}`;
            const filtered = seminaristes.filter(s => s[param.key] === param.value);
            renderTable(filtered, true); // true = show back button
            break;
        case 'filtered_multi':
            // param is { filters: {key: val, ...}, title: '...' }
            pageTitle.innerText = param.title;
            const multipass = seminaristes.filter(s => {
                for (let k in param.filters) {
                    if (s[k] !== param.filters[k]) return false;
                }
                return true;
            });
            renderTable(multipass, true);
            break;
        default:
            renderDashboard();
    }
}

// 1. Dashboard
function renderDashboard() {
    const total = seminaristes.length;
    const levels = {
        'NIVEAU PRIMAIRE': 0,
        'NIVEAU SECONDAIRE': 0,
        'NIVEAU UNIVERSITAIRE': 0
    };
    seminaristes.forEach(s => {
        if (levels[s.niveau] !== undefined) levels[s.niveau]++;
    });

    let html = '';

    // Statistics cards - Admin only
    if (currentUserRole === 'admin') {
        html += `
        <div class="grid-dashboard">
          <div class="stats-card highlight">
            <span class="label">Total Inscrits</span>
            <span class="value">${total}</span>
          </div>
          <div class="stats-card">
            <span class="label">Primaire</span>
            <span class="value">${levels['NIVEAU PRIMAIRE']}</span>
          </div>
          <div class="stats-card">
            <span class="label">Secondaire</span>
            <span class="value">${levels['NIVEAU SECONDAIRE']}</span>
          </div>
          <div class="stats-card">
            <span class="label">Universitaire</span>
            <span class="value">${levels['NIVEAU UNIVERSITAIRE']}</span>
          </div>
        </div>
        `;
    }

    html += `
    <div class="table-card">
      <div class="table-header">
        <h4>Derniers ajouts</h4>
        <button class="btn btn-primary btn-sm" onclick="routeTo('all')">Voir tout</button>
      </div>
      ${generateTableHTML(seminaristes.slice(-5).reverse())}
    </div>
    `;

    // Delete All button - Admin only
    if (currentUserRole === 'admin') {
        html += `
        <div class="table-card" style="margin-top: 1rem; border-color: var(--danger);">
            <div class="table-header" style="background-color: #fee2e2;">
                <h4 style="color: var(--danger);">Zone de Danger</h4>
            </div>
            <div style="padding: 1.5rem; display: flex; align-items: center; justify-content: space-between;">
                <p style="margin: 0; color: var(--danger);">Supprimer toutes les données de l'application.</p>
                <button class="btn btn-outline" style="color: var(--danger); border-color: var(--danger);" onclick="deleteAllData()">
                    <i class="ri-delete-bin-line"></i> Tout Supprimer
                </button>
            </div>
        </div>
        `;
    }

    view.innerHTML = html;
}

// 2. Table
function renderTable(data, showBack = false) {
    let html = '';
    if (showBack) {
        html += `<button class="btn btn-outline btn-sm mb-3" onclick="routeTo('dashboard')">← Retour</button>`;
    }

    html += `
    <div class="table-card">
      <div class="table-header">
        <h4>Liste (${data.length})</h4>
        <button class="btn btn-accent btn-sm" onclick="exportExcel(seminaristes)">Exporter Excel</button>
      </div>
      ${generateTableHTML(data)}
    </div>
  `;
    view.innerHTML = html;
}

function generateTableHTML(list) {
    if (!list || list.length === 0) return '<div style="padding:2rem;text-align:center;color:#666">Aucune donnée</div>';

    const rows = list.map(s => `
    <tr>
      <td>
        ${s.photo_url
            ? `<img src="${s.photo_url}" class="thumb" alt="photo">`
            : `<div class="thumb" style="background:#eee;display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:bold">${getInitials(s.prenom, s.nom)}</div>`
        }
      </td>
      <td><strong>${s.nom}</strong> ${s.prenom}</td>
      <td><span style="font-family:monospace;background:#f1f5f9;padding:2px 6px;border-radius:4px">${s.matricule}</span></td>
      <td>${s.sous_comite || '-'}</td>
      <td>${s.dortoir || '-'}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="routeTo('edit', '${s.matricule}')">Gérer</button>
      </td>
    </tr>
  `).join('');

    return `
    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th style="width:60px">Img</th>
            <th>Nom Complet</th>
            <th>Matricule</th>
            <th>Sous-Comité</th>
            <th>Dortoir</th>
            <th style="width:100px">Action</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// 3. Form (Add/Edit)
function renderForm(data = null) {
    const isEdit = !!data;
    const h = `
    <div class="table-card" style="max-width: 800px; margin:0 auto;">
      <div class="table-header">
        <h4>${isEdit ? 'Modifier' : 'Nouveau Séminariste'}</h4>
      </div>
      <div style="padding: 2rem;">
        <form id="seminaristForm" class="row-form">
          <!-- Hidden ID if needed -->
          ${isEdit ? `<input type="hidden" id="editMatricule" value="${data.matricule}">` : ''}

          <div class="grid-form" style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom:1rem;">
            <div class="form-group">
              <label class="form-label">Nom</label>
              <input type="text" id="f_nom" class="form-control" value="${data?.nom || ''}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Prénom</label>
              <input type="text" id="f_prenom" class="form-control" value="${data?.prenom || ''}" required>
            </div>
          </div>

          <div class="grid-form" style="display:grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom:1rem;">
            <div class="form-group">
              <label class="form-label">Age</label>
              <input type="number" id="f_age" class="form-control" value="${data?.age || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Note (Admission)</label>
              <input type="number" step="0.1" id="f_note" class="form-control" value="${data?.note !== undefined ? data.note : '10'}">
            </div>
            <div class="form-group">
                <label class="form-label">Test Sortie</label>
                <input type="number" step="0.1" id="f_test_sortie" class="form-control" value="${data?.test_sortie !== undefined ? data.test_sortie : '0'}">
            </div>
            <div class="form-group">
                <label class="form-label">Conduite (/20)</label>
                <input type="number" step="0.1" id="f_note_conduite" class="form-control" value="${data?.note_conduite !== undefined ? data.note_conduite : '16'}">
            </div>
          <div class="grid-form" style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom:1rem;">
            <div class="form-group">
                <label class="form-label">Sous Comité (*)</label>
                <select id="f_sous_comite" class="form-select" required>
                    <option value="">-- Sélectionner --</option>
                    ${['Abobo1', 'Abobo2', 'Abobo3', 'Abobo4', 'Anyama1', 'Anyama2', 'Nangui abrogoua'].map(c => `
                        <option value="${c}" ${data?.sous_comite === c ? 'selected' : ''}>${c}</option>
                    `).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Quartier</label>
                <input type="text" id="f_quartier" class="form-control" value="${data?.quartier || ''}">
            </div>
          </div>

          <div class="grid-form" style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom:1rem;">
            <div class="form-group">
                <label class="form-label">Nom d'un parent</label>
                <input type="text" id="f_nom_parent" class="form-control" value="${data?.nom_parent || ''}">
            </div>
            <div class="form-group">
                <label class="form-label">Contact parent</label>
                <input type="text" id="f_contact_parent" class="form-control" value="${data?.contact_parent || ''}">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Contact Séminariste</label>
            <input type="text" id="f_contact" class="form-control" value="${data?.contact || ''}">
          </div>

          <div class="form-group">
            <label class="form-label">Photo</label>
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap">
                <input type="file" id="f_photo" accept="image/*" class="form-control" style="flex:1">
                <button type="button" class="btn btn-primary" id="btnStartCamera"><i class="ri-camera-line"></i> Camera</button>
            </div>
            
            <!-- Camera UI (Hidden by default) -->
            <div id="cameraContainer" style="display:none; flex-direction:column; gap:0.5rem; margin-top:0.5rem; background:#000; padding:0.5rem; border-radius:8px;">
                <video id="cameraVideo" autoplay playsinline style="width:100%; max-height:300px; object-fit:cover; border-radius:4px; transform: scaleX(-1);"></video>
                <div style="display:flex; justify-content:center; gap:1rem;">
                    <button type="button" class="btn btn-primary" id="btnSwitchCamera"><i class="ri-camera-switch-line"></i></button>
                    <button type="button" class="btn btn-danger" id="btnCapture"><i class="ri-camera-lens-line"></i> Capturer</button>
                    <button type="button" class="btn btn-outline" style="color:white; border-color:white" id="btnStopCamera">Fermer</button>
                </div>
            </div>

            <div id="preview" style="margin-top:0.5rem">
              ${data?.photo_url ? `
                <div style="display:flex; align-items:center; gap:1rem;">
                    <img src="${data.photo_url}" style="height:60px;border-radius:4px; border:1px solid var(--border)">
                    <button type="button" class="btn btn-outline btn-sm" style="color:var(--danger); border-color:var(--danger)" id="btnDeletePhoto">
                        <i class="ri-delete-bin-line"></i> Supprimer photo
                    </button>
                </div>
              ` : ''}
            </div>
            <input type="hidden" id="f_existing_photo" value="${data?.photo_url || ''}">
          </div>
          
          <hr style="border:0; border-top:1px solid var(--border); margin: 2rem 0;">

          <div style="display:flex; gap:1rem; justify-content:flex-end">
            <button type="button" class="btn btn-outline" onclick="routeTo('all')">Annuler</button>
            ${isEdit ? `<button type="button" class="btn btn-accent" onclick="generateReceiptPDF(${JSON.stringify(data).replace(/"/g, '&quot;')})"><i class="ri-file-pdf-line"></i> Télécharger Reçu</button>` : ''}
            ${isEdit ? `<button type="button" class="btn btn-outline" style="color:var(--danger);border-color:var(--danger)" onclick="handleDelete('${data.matricule}')">Supprimer</button>` : ''}
            <button type="submit" class="btn btn-primary">${isEdit ? 'Mettre à jour' : 'Enregistrer'}</button>
          </div>
        </form>
      </div>
    </div>
  `;
    view.innerHTML = h;

    // Delete Photo Handler
    const btnDelPhoto = document.getElementById('btnDeletePhoto');
    if (btnDelPhoto) {
        btnDelPhoto.onclick = () => {
            if (confirm('Voulez-vous vraiment supprimer la photo actuelle ? (Nécessite de sauvegarder ensuite)')) {
                document.getElementById('preview').innerHTML = '';
                document.getElementById('f_existing_photo').value = '';
            }
        };
    }

    // Camera variables
    let stream = null;
    let capturedFile = null;
    let currentFacingMode = 'user'; // 'user' or 'environment'

    const btnStart = document.getElementById('btnStartCamera');
    const btnStop = document.getElementById('btnStopCamera');
    const btnSwitch = document.getElementById('btnSwitchCamera');
    const btnCapture = document.getElementById('btnCapture');
    const video = document.getElementById('cameraVideo');
    const container = document.getElementById('cameraContainer');
    const preview = document.getElementById('preview');

    async function startCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: currentFacingMode }
            });
            video.srcObject = stream;
            // Mirror only if self-facing
            video.style.transform = (currentFacingMode === 'user') ? 'scaleX(-1)' : 'scaleX(1)';
            container.style.display = 'flex';
            btnStart.style.display = 'none';
        } catch (err) {
            console.error(err);
            showToast('Impossible d\'accéder à la caméra', 'error');
        }
    }

    btnStart.onclick = () => {
        currentFacingMode = 'user';
        startCamera();
    };

    const stopStream = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        video.srcObject = null;
        container.style.display = 'none';
        btnStart.style.display = 'block';
    };

    btnStop.onclick = stopStream;

    btnSwitch.onclick = () => {
        currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
        startCamera();
    };

    btnCapture.onclick = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');

        // Mirror effect only for selfie
        if (currentFacingMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0);

        // Convert to file
        canvas.toBlob(blob => {
            const fileName = `capture_${Date.now()}.jpg`;
            capturedFile = new File([blob], fileName, { type: 'image/jpeg' });

            // Show preview
            preview.innerHTML = `<img src="${URL.createObjectURL(blob)}" style="height:100px;border-radius:4px;border:2px solid var(--primary)"> <div class="small text-success">Photo capturée !</div>`;
            stopStream();
        }, 'image/jpeg', 0.8);
    };

    document.getElementById('seminaristForm').onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const oldText = btn.innerText;
        btn.innerText = 'Sauvegarde...';
        btn.disabled = true;

        try {
            // Priority: Captured Camera File > File Input
            const fileInput = document.getElementById('f_photo').files[0];
            const fileToUpload = capturedFile || fileInput;

            // Use the hidden field value (which might have been cleared by delete button)
            let photoUrl = document.getElementById('f_existing_photo').value;

            if (fileToUpload) {
                const matricule = data?.matricule || null;
                const uploaded = await uploadImage(fileToUpload, matricule);
                if (uploaded) photoUrl = uploaded;
            }

            const payload = {
                matricule: data?.matricule || null,
                nom: document.getElementById('f_nom').value,
                prenom: document.getElementById('f_prenom').value,
                age: document.getElementById('f_age').value,
                note: document.getElementById('f_note').value,
                test_sortie: document.getElementById('f_test_sortie').value,
                note_conduite: document.getElementById('f_note_conduite').value,
                genre: document.getElementById('f_genre').value,
                contact: document.getElementById('f_contact').value,
                sous_comite: document.getElementById('f_sous_comite').value,
                quartier: document.getElementById('f_quartier').value,
                nom_parent: document.getElementById('f_nom_parent').value,
                contact_parent: document.getElementById('f_contact_parent').value,
                photo_url: photoUrl
            };

            // Merge with existing data to keep fields like dortoir/halaqa
            if (data) {
                const preserved = { ...data };
                // Remove fields we want to overwrite from the form
                delete preserved.nom;
                delete preserved.prenom;
                delete preserved.age;
                delete preserved.note;
                delete preserved.test_sortie;
                delete preserved.note_conduite;
                delete preserved.genre;
                delete preserved.contact;
                delete preserved.sous_comite;
                delete preserved.quartier;
                delete preserved.nom_parent;
                delete preserved.contact_parent;
                delete preserved.photo_url;

                Object.assign(payload, preserved);
            }

            console.log('Save: Tentative d\'appel saveData avec payload:', payload);
            await saveData(payload, isEdit);
            console.log('Save: saveData terminé avec succès');
            showToast('Enregistré avec succès', 'success');

            // Propose to download receipt after saving
            setTimeout(async () => {
                if (confirm('✅ Séminariste enregistré avec succès!\n\nVoulez-vous télécharger le reçu d\'inscription maintenant ?')) {
                    try {
                        // Ensure we have the complete data with matricule
                        const savedData = isEdit ? payload : await getDataByMatricule(payload.matricule);
                        if (savedData && typeof generateReceiptPDF === 'function') {
                            await generateReceiptPDF(savedData);
                        } else {
                            showToast('Impossible de générer le reçu', 'error');
                        }
                    } catch (err) {
                        console.error('Error generating receipt:', err);
                        showToast('Erreur lors de la génération du reçu', 'error');
                    }
                }
            }, 500);

            routeTo('all');
        } catch (err) {
            console.error(err);
            showToast('Erreur lors de la sauvegarde', 'error');
        } finally {
            btn.innerText = oldText;
            btn.disabled = false;
        }
    };
}

async function handleDelete(matricule) {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce séminariste ?')) {
        await deleteData(matricule);
        showToast('Supprimé', 'success');
        routeTo('all');
    }
}


// 4. Search
function renderSearch() {
    view.innerHTML = `
    <div class="table-card">
      <div style="padding:1.5rem">
        <input type="text" id="searchInput" class="form-control" placeholder="Rechercher par nom, prénom ou matricule..." style="max-width:400px">
      </div>
      <div id="searchResults"></div>
    </div>
  `;
    document.getElementById('searchInput').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        if (term.length < 2) {
            document.getElementById('searchResults').innerHTML = '';
            return;
        }
        const matches = seminaristes.filter(s =>
            (s.nom && s.nom.toLowerCase().includes(term)) ||
            (s.prenom && s.prenom.toLowerCase().includes(term)) ||
            (s.matricule && s.matricule.toLowerCase().includes(term))
        );
        document.getElementById('searchResults').innerHTML = generateTableHTML(matches);
    });
}

// 5. Group Lists
function renderGroupList(key, items) {
    const counts = {};
    seminaristes.forEach(s => {
        const val = s[key] || 'Autre';
        counts[val] = (counts[val] || 0) + 1;
    });

    const listHtml = items.map(item => `
    <a href="#" class="list-item" onclick="routeTo('filtered', {key:'${key}', value:'${item}'})">
      <span>${item}</span>
      <span class="badge">${counts[item] || 0}</span>
    </a>
  `).join('');

    view.innerHTML = `<div class="list-group" style="max-width:600px">${listHtml}</div>`;
}

function renderLevelsByGenre() {
    const levels = ['NIVEAU PRIMAIRE', 'NIVEAU SECONDAIRE', 'NIVEAU UNIVERSITAIRE'];
    const groups = [];

    levels.forEach(lvl => {
        // Count M
        const countM = seminaristes.filter(s => s.niveau === lvl && s.genre === 'M').length;
        groups.push({
            title: `${lvl} - FRÈRES`,
            filters: { niveau: lvl, genre: 'M' },
            count: countM,
            icon: 'ri-men-line'
        });

        // Count F
        const countF = seminaristes.filter(s => s.niveau === lvl && s.genre === 'F').length;
        groups.push({
            title: `${lvl} - SOEURS`,
            filters: { niveau: lvl, genre: 'F' },
            count: countF,
            icon: 'ri-women-line'
        });
    });

    const listHtml = groups.map(g => `
    <div class="list-item" style="display:flex; justify-content:space-between; align-items:center; padding:1rem;">
        <a href="#" style="flex:1; display:flex; align-items:center; gap:0.5rem; text-decoration:none; color:inherit;" onclick='routeTo("filtered_multi", { filters: ${JSON.stringify(g.filters)}, title: "${g.title}" })'>
            <i class="${g.icon}"></i>
            <span>${g.title}</span>
            <span class="badge">${g.count}</span>
        </a>
        <div style="display:flex; gap:0.5rem; margin-left:1rem;">
            <button class="btn btn-outline btn-sm" onclick="exportRankedExcel(seminaristes.filter(s => s.niveau === '${g.filters.niveau}' && s.genre === '${g.filters.genre}'), '${g.title.toLowerCase().replace(/\s+/g, '_')}_rang.xlsx')">
                <i class="ri-file-excel-line"></i> Excel (Rang)
            </button>
            <button class="btn btn-outline btn-sm" onclick="exportWord(seminaristes.filter(s => s.niveau === '${g.filters.niveau}' && s.genre === '${g.filters.genre}'), '${g.title.toLowerCase().replace(/\s+/g, '_')}.docx')">
                <i class="ri-file-word-line"></i> Word
            </button>
            <button class="btn btn-outline btn-sm" onclick="exportAllReceiptsPDF(seminaristes.filter(s => s.niveau === '${g.filters.niveau}' && s.genre === '${g.filters.genre}'), '${g.title}')">
                <i class="ri-file-pdf-line"></i> Reçus
            </button>
        </div>
    </div>
  `).join('');

    view.innerHTML = `<div class="list-group" style="max-width:800px">${listHtml}</div>`;
}

// 6. Import
function renderImportExport() {
    view.innerHTML = `
    <div class="grid-form" style="display:grid; grid-template-columns:1fr 1fr; gap:2rem;">
      <div class="table-card">
        <div class="table-header"><h4>Importer Excel</h4></div>
        <div style="padding:2rem">
          <p class="form-label" style="margin-bottom:1rem">Sélectionnez un fichier .xlsx contenant les colonnes Nom, Prenom, Age, Note, Genre.</p>
          <input type="file" id="importFile" accept=".xlsx, .xls" class="form-control mb-3">
          <button class="btn btn-primary" id="btnImport">Lancer l'import</button>
        </div>
      </div>
      
      <div class="table-card">
        <div class="table-header"><h4><i class="ri-image-add-line"></i> Importer Photos</h4></div>
        <div style="padding:2rem">
          <p class="form-label" style="margin-bottom:1rem">
            Sélectionnez plusieurs photos. Le nom de chaque fichier doit correspondre au <strong>matricule</strong> du séminariste.<br>
            <small style="color: var(--muted)">Ex: 26-SERF001.jpg, 26-SERF002.png, etc.</small>
          </p>
          <input type="file" id="importPhotos" accept="image/*" multiple class="form-control mb-3">
          <button class="btn btn-primary" id="btnImportPhotos">
            <i class="ri-upload-2-line"></i> Importer les photos
          </button>
          <div id="photoImportProgress" style="margin-top:1rem; display:none;">
            <div style="background:#e5e7eb; border-radius:4px; height:8px; overflow:hidden;">
              <div id="photoProgressBar" style="background:var(--primary); height:100%; width:0%; transition: width 0.3s;"></div>
            </div>
            <p id="photoProgressText" style="margin-top:0.5rem; font-size:0.875rem; color:var(--muted)"></p>
          </div>
        </div>
      </div>
      
      <div class="table-card">
        <div class="table-header"><h4>Exporter</h4></div>
        <div style="padding:2rem">
          <p class="form-label" style="margin-bottom:1rem">Télécharger la liste complète.</p>
          <button class="btn btn-accent" onclick="exportExcel(seminaristes)">Exporter tout (.xlsx)</button>
          
          <hr style="margin: 1.5rem 0; border: 0; border-top: 1px solid var(--border);">
          
          <p class="form-label" style="margin-bottom:1rem">Télécharger les photos (pour les badges).</p>
          <button class="btn btn-primary" onclick="exportImages()">Exporter Photos (.zip)</button>
          
          <hr style="margin: 1.5rem 0; border: 0; border-top: 1px solid var(--border);">
          
          <p class="form-label" style="margin-bottom:1rem">Télécharger les photos par niveau.</p>
          <div style="display:flex; flex-direction:column; gap:0.5rem;">
            <button class="btn btn-outline" onclick="exportImagesByLevel('NIVEAU PRIMAIRE')">
              <i class="ri-download-line"></i> Primaire (${seminaristes.filter(s => s.niveau === 'NIVEAU PRIMAIRE' && s.photo_url).length})
            </button>
            <button class="btn btn-outline" onclick="exportImagesByLevel('NIVEAU SECONDAIRE')">
              <i class="ri-download-line"></i> Secondaire (${seminaristes.filter(s => s.niveau === 'NIVEAU SECONDAIRE' && s.photo_url).length})
            </button>
            <button class="btn btn-outline" onclick="exportImagesByLevel('NIVEAU UNIVERSITAIRE')">
              <i class="ri-download-line"></i> Universitaire (${seminaristes.filter(s => s.niveau === 'NIVEAU UNIVERSITAIRE' && s.photo_url).length})
            </button>
          </div>
          
          <hr style="margin: 1.5rem 0; border: 0; border-top: 1px solid var(--border);">
          
          <p class="form-label" style="margin-bottom:1rem">Télécharger les listes Excel par niveau.</p>
          <div style="display:flex; flex-direction:column; gap:0.5rem;">
            <button class="btn btn-outline" onclick="exportExcel(seminaristes.filter(s => s.niveau === 'NIVEAU PRIMAIRE'), 'primaire.xlsx')">
              <i class="ri-file-excel-line"></i> Liste Primaire (${seminaristes.filter(s => s.niveau === 'NIVEAU PRIMAIRE').length})
            </button>
            <button class="btn btn-outline" onclick="exportExcel(seminaristes.filter(s => s.niveau === 'NIVEAU SECONDAIRE'), 'secondaire.xlsx')">
              <i class="ri-file-excel-line"></i> Liste Secondaire (${seminaristes.filter(s => s.niveau === 'NIVEAU SECONDAIRE').length})
            </button>
            <button class="btn btn-outline" onclick="exportExcel(seminaristes.filter(s => s.niveau === 'NIVEAU UNIVERSITAIRE'), 'universitaire.xlsx')">
              <i class="ri-file-excel-line"></i> Liste Universitaire (${seminaristes.filter(s => s.niveau === 'NIVEAU UNIVERSITAIRE').length})
            </button>
          </div>
          
          <hr style="margin: 1.5rem 0; border: 0; border-top: 1px solid var(--border);">
          
          <p class="form-label" style="margin-bottom:1rem">Télécharger les tableaux Word par niveau.</p>
          <div style="display:flex; flex-direction:column; gap:0.5rem;">
            <button class="btn btn-outline" onclick="exportWord(seminaristes.filter(s => s.niveau === 'NIVEAU PRIMAIRE'), 'primaire.docx')">
              <i class="ri-file-word-line"></i> Tableau Primaire (${seminaristes.filter(s => s.niveau === 'NIVEAU PRIMAIRE').length})
            </button>
            <button class="btn btn-outline" onclick="exportWord(seminaristes.filter(s => s.niveau === 'NIVEAU SECONDAIRE'), 'secondaire.docx')">
              <i class="ri-file-word-line"></i> Tableau Secondaire (${seminaristes.filter(s => s.niveau === 'NIVEAU SECONDAIRE').length})
            </button>
            <button class="btn btn-outline" onclick="exportWord(seminaristes.filter(s => s.niveau === 'NIVEAU UNIVERSITAIRE'), 'universitaire.docx')">
              <i class="ri-file-word-line"></i> Tableau Universitaire (${seminaristes.filter(s => s.niveau === 'NIVEAU UNIVERSITAIRE').length})
            </button>
          </div>
          
          <hr style="margin: 1.5rem 0; border: 0; border-top: 1px solid var(--border);">
          
          <p class="form-label" style="margin-bottom:1rem">Télécharger les reçus PDF par niveau.</p>
          <div style="display:flex; flex-direction:column; gap:0.5rem;">
            <button class="btn btn-outline" onclick="exportAllReceiptsPDF(seminaristes.filter(s => s.niveau === 'NIVEAU PRIMAIRE'), 'Primaire')">
              <i class="ri-file-pdf-line"></i> Reçus Primaire (${seminaristes.filter(s => s.niveau === 'NIVEAU PRIMAIRE').length})
            </button>
            <button class="btn btn-outline" onclick="exportAllReceiptsPDF(seminaristes.filter(s => s.niveau === 'NIVEAU SECONDAIRE'), 'Secondaire')">
              <i class="ri-file-pdf-line"></i> Reçus Secondaire (${seminaristes.filter(s => s.niveau === 'NIVEAU SECONDAIRE').length})
            </button>
            <button class="btn btn-outline" onclick="exportAllReceiptsPDF(seminaristes.filter(s => s.niveau === 'NIVEAU UNIVERSITAIRE'), 'Universitaire')">
              <i class="ri-file-pdf-line"></i> Reçus Universitaire (${seminaristes.filter(s => s.niveau === 'NIVEAU UNIVERSITAIRE').length})
            </button>
          </div>
        </div>
      </div>

      <!-- Zone Danger -->
      <div class="table-card" style="grid-column: 1 / -1; border: 1px solid var(--danger);">
        <div class="table-header" style="background-color: #fee2e2;">
            <h4 style="color: var(--danger);">Zone de Danger</h4>
        </div>
        <div style="padding:2rem">
          <p class="form-label" style="margin-bottom:1rem; color:var(--danger)">
            Cette action supprimera DÉFINITIVEMENT tous les séminaristes enregistrés.<br>
            Il est recommandé de faire un export avant de procéder.
          </p>
          <button class="btn btn-outline" style="color:var(--danger); border-color:var(--danger);" onclick="deleteAllData()">
            <i class="ri-delete-bin-line"></i> TOUT SUPPRIMER
          </button>
        </div>
      </div>
    </div>
  `;

    document.getElementById('btnImport').onclick = async () => {
        const f = document.getElementById('importFile').files[0];
        if (!f) return showToast('Sélectionner un fichier', 'warning');

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(sheet);

                // Map keys
                const rows = json.map(row => {
                    // Flexible key matching
                    const getVal = (keys) => {
                        for (let k of keys) if (row[k]) return row[k];
                        return '';
                    };

                    // Helper to safely parse numbers
                    const getNum = (keys) => {
                        const val = getVal(keys);
                        if (val === '' || val === null || val === undefined) return null;
                        const num = Number(val);
                        return isNaN(num) ? null : num;
                    };

                    return {
                        nom: getVal(['Nom', 'nom', 'NOM']),
                        prenom: getVal(['Prenom', 'prenom', 'PRENOM']),
                        age: getNum(['Age', 'age']),
                        note: getNum(['Note', 'note']),
                        test_sortie: getNum(['Test Sortie', 'test_sortie', 'TS']),
                        note_conduite: getNum(['Conduite', 'note_conduite', 'NC']),
                        genre: getVal(['Genre', 'genre', 'Sexe']),
                        contact: getVal(['Contact', 'contact'])
                    };
                }).filter(r => r.nom && r.prenom);

                if (rows.length > 0) {
                    await batchImport(rows);
                    showToast(`${rows.length} entrées importées`, 'success');
                    routeTo('all');
                } else {
                    showToast('Aucune donnée valide trouvée', 'warning');
                }

            } catch (err) {
                console.error(err);
                showToast('Erreur lecture fichier', 'error');
            }
        };
        reader.readAsArrayBuffer(f);
    };


    // Photo Import Handler
    document.getElementById('btnImportPhotos').onclick = async () => {
        const files = document.getElementById('importPhotos').files;
        if (!files || files.length === 0) return showToast('Sélectionnez des photos', 'warning');

        const progressDiv = document.getElementById('photoImportProgress');
        const progressBar = document.getElementById('photoProgressBar');
        const progressText = document.getElementById('photoProgressText');
        const btn = document.getElementById('btnImportPhotos');

        progressDiv.style.display = 'block';
        btn.disabled = true;

        let successCount = 0;
        let infoLog = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const name = file.name; // e.g., "25-JOS001.jpg"
            const matricule = name.split('.')[0]; // "25-JOS001"

            // Update UI
            const percent = Math.round(((i) / files.length) * 100);
            progressBar.style.width = `${percent}%`;
            progressText.innerText = `Traitement : ${name} (${i + 1}/${files.length})`;

            // Find Seminariste
            const seminariste = seminaristes.find(s => s.matricule === matricule);

            if (seminariste) {
                try {
                    // Upload logic
                    const url = await uploadImage(file, matricule);
                    if (url) {
                        seminariste.photo_url = url;
                        await saveData(seminariste, true); // true = update existing
                        successCount++;
                    } else {
                        infoLog.push(`Échec upload: ${name}`);
                    }
                } catch (e) {
                    console.error(e);
                    infoLog.push(`Erreur sauvegarde: ${name}`);
                }
            } else {
                infoLog.push(`Introuvable: ${matricule}`);
            }
        }

        // Final UI update
        progressBar.style.width = '100%';
        progressText.innerText = 'Terminé.';
        btn.disabled = false;

        if (successCount > 0) {
            showToast(`${successCount} photos importées avec succès`, 'success');
            // Refresh cache/UI if needed
            await loadData();
        }

        if (infoLog.length > 0) {
            // Show errors in alert or console for now
            console.warn('Import Photos Report:', infoLog);
            alert(`Rapport d'importation:\n\nSuccès: ${successCount}\nNon traités: ${infoLog.length}\n\nDétails:\n${infoLog.slice(0, 10).join('\n')}${infoLog.length > 10 ? '\n...' : ''}`);
        }
    };
}

function exportExcel(data, filename = "seminaristes_export.xlsx") {
    if (!data || data.length === 0) return showToast('Rien à exporter', 'warning');
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Export");
    XLSX.writeFile(wb, filename);
}

// Specialized export with Ranking
function exportRankedExcel(data, filename) {
    if (!data || data.length === 0) return showToast('Rien à exporter', 'warning');

    // 1. Calculate Averages and Prepare Data
    const processed = data.map(s => {
        const n1 = parseFloat(s.note) || 0;
        const n2 = parseFloat(s.test_sortie) || 0;
        const n3 = parseFloat(s.note_conduite) || 0;
        const avg = (n1 + n2 + n3) / 3;

        return {
            ...s,
            _avg: avg
        };
    });

    // 2. Sort by Average DESC
    processed.sort((a, b) => b._avg - a._avg);

    // 3. Map to Final Columns with Rank
    const exportData = processed.map((s, index) => {
        const r = index + 1;
        const rankStr = (r === 1) ? '1er' : `${r}ème`;

        return {
            'Rang': rankStr,
            'Nom': s.nom,
            'Prénom': s.prenom,
            'Matricule': s.matricule,
            'Niveau': s.niveau,
            'Dortoir': s.dortoir,
            'Halaqa': s.halaqa,
            'Note Admission': s.note,
            'Test Sortie': s.test_sortie,
            'Conduite': s.note_conduite,
            'Moyenne': s._avg.toFixed(2),
            'Contact': s.contact
        };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);

    // Auto-width adjustment (basic estimation)
    const wscols = Object.keys(exportData[0]).map(k => ({ wch: 15 }));
    wscols[1] = { wch: 20 }; // Nom
    wscols[2] = { wch: 20 }; // Prenom
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Classement");
    XLSX.writeFile(wb, filename);
}

async function exportImages() {
    if (!seminaristes || seminaristes.length === 0) return showToast('Aucun séminariste', 'warning');

    const withPhotos = seminaristes.filter(s => s.photo_url);
    if (withPhotos.length === 0) return showToast('Aucune photo trouvée', 'warning');

    const zip = new JSZip();
    let count = 0;
    const btn = event.target; // Get button if possible
    const oldText = btn.innerText;
    btn.innerText = 'Préparation...';
    btn.disabled = true;

    try {
        const promises = withPhotos.map(async (s) => {
            try {
                // If it's a data URL (base64)
                if (s.photo_url.startsWith('data:')) {
                    const base64Data = s.photo_url.split(',')[1];
                    zip.file(`${s.matricule}.jpg`, base64Data, { base64: true });
                    count++;
                } else {
                    // It's a remote URL
                    const response = await fetch(s.photo_url);
                    if (response.ok) {
                        const blob = await response.blob();
                        zip.file(`${s.matricule}.jpg`, blob);
                        count++;
                    }
                }
            } catch (err) {
                console.warn(`Failed to load image for ${s.matricule}`, err);
            }
        });

        await Promise.all(promises);

        if (count === 0) throw new Error('Aucune image n\'a pu être traitée');

        const content = await zip.generateAsync({ type: "blob" });
        const url = window.URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = "photos_export.zip";
        a.click();
        window.URL.revokeObjectURL(url);

        showToast(`${count} photos exportées`, 'success');

    } catch (err) {
        console.error('Export zip failed', err);
        showToast('Erreur lors de l\'export des photos', 'error');
    } finally {
        btn.innerText = oldText;
        btn.disabled = false;
    }
}

async function exportImagesByLevel(niveau) {
    if (!seminaristes || seminaristes.length === 0) return showToast('Aucun séminariste', 'warning');

    // Filter by level
    const byLevel = seminaristes.filter(s => s.niveau === niveau && s.photo_url);
    if (byLevel.length === 0) return showToast(`Aucune photo trouvée pour ${niveau}`, 'warning');

    const zip = new JSZip();
    let count = 0;
    const btn = event.target; // Get button if possible
    const oldText = btn.innerText;
    btn.innerText = 'Préparation...';
    btn.disabled = true;

    try {
        const promises = byLevel.map(async (s) => {
            try {
                // If it's a data URL (base64)
                if (s.photo_url.startsWith('data:')) {
                    const base64Data = s.photo_url.split(',')[1];
                    zip.file(`${s.matricule}.jpg`, base64Data, { base64: true });
                    count++;
                } else {
                    // It's a remote URL
                    const response = await fetch(s.photo_url);
                    if (response.ok) {
                        const blob = await response.blob();
                        zip.file(`${s.matricule}.jpg`, blob);
                        count++;
                    }
                }
            } catch (err) {
                console.warn(`Failed to load image for ${s.matricule}`, err);
            }
        });

        await Promise.all(promises);

        if (count === 0) throw new Error('Aucune image n\'a pu être traitée');

        const content = await zip.generateAsync({ type: "blob" });
        const url = window.URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        // Create filename based on level
        const levelName = niveau.replace('NIVEAU ', '').toLowerCase();
        a.download = `photos_${levelName}.zip`;
        a.click();
        window.URL.revokeObjectURL(url);

        showToast(`${count} photos exportées pour ${niveau}`, 'success');

    } catch (err) {
        console.error('Export zip failed', err);
        showToast('Erreur lors de l\'export des photos', 'error');
    } finally {
        btn.innerText = oldText;
        btn.disabled = false;
    }
}


async function exportWord(data, filename = "seminaristes.docx") {
    if (!data || data.length === 0) return showToast('Rien à exporter', 'warning');

    // Check if docx library is loaded
    if (typeof docx === 'undefined') {
        showToast('Bibliothèque Word non chargée', 'error');
        return;
    }

    const btn = event?.target;
    if (btn) {
        const oldText = btn.innerText;
        btn.innerText = 'Génération...';
        btn.disabled = true;
    }

    try {
        // Helper function to fetch image and convert to base64
        async function getImageBuffer(url) {
            try {
                // If it's already a data URL
                if (url.startsWith('data:')) {
                    const base64 = url.split(',')[1];
                    const binary = atob(base64);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) {
                        bytes[i] = binary.charCodeAt(i);
                    }
                    return bytes;
                }

                // Fetch from URL
                const response = await fetch(url);
                if (!response.ok) throw new Error('Failed to fetch image');
                const blob = await response.blob();
                const arrayBuffer = await blob.arrayBuffer();
                return new Uint8Array(arrayBuffer);
            } catch (err) {
                console.warn('Failed to load image:', url, err);
                return null;
            }
        }

        // Create table rows
        const tableRows = [
            // Header row
            new docx.TableRow({
                children: [
                    new docx.TableCell({
                        children: [new docx.Paragraph({
                            children: [new docx.TextRun({ text: "Matricule", bold: true, color: "FFFFFF" })]
                        })],
                        shading: { fill: "3B82F6" },
                    }),
                    new docx.TableCell({
                        children: [new docx.Paragraph({
                            children: [new docx.TextRun({ text: "Nom", bold: true, color: "FFFFFF" })]
                        })],
                        shading: { fill: "3B82F6" },
                    }),
                    new docx.TableCell({
                        children: [new docx.Paragraph({
                            children: [new docx.TextRun({ text: "Prénom", bold: true, color: "FFFFFF" })]
                        })],
                        shading: { fill: "3B82F6" },
                    }),
                    new docx.TableCell({
                        children: [new docx.Paragraph({
                            children: [new docx.TextRun({ text: "Photo", bold: true, color: "FFFFFF" })]
                        })],
                        shading: { fill: "3B82F6" },
                    }),
                ],
                tableHeader: true,
            })
        ];

        // Add data rows
        for (const s of data) {
            const cells = [];

            // Matricule
            cells.push(new docx.TableCell({
                children: [new docx.Paragraph({ text: s.matricule || '' })],
            }));

            // Nom
            cells.push(new docx.TableCell({
                children: [new docx.Paragraph({ text: s.nom || '' })],
            }));

            // Prénom
            cells.push(new docx.TableCell({
                children: [new docx.Paragraph({ text: s.prenom || '' })],
            }));

            // Photo
            if (s.photo_url) {
                try {
                    const imageBuffer = await getImageBuffer(s.photo_url);
                    if (imageBuffer) {
                        cells.push(new docx.TableCell({
                            children: [
                                new docx.Paragraph({
                                    children: [
                                        new docx.ImageRun({
                                            data: imageBuffer,
                                            transformation: {
                                                width: 60,
                                                height: 80,
                                            },
                                        })
                                    ],
                                })
                            ],
                        }));
                    } else {
                        cells.push(new docx.TableCell({
                            children: [new docx.Paragraph({ text: '(Photo indisponible)' })],
                        }));
                    }
                } catch (err) {
                    console.warn('Error adding image:', err);
                    cells.push(new docx.TableCell({
                        children: [new docx.Paragraph({ text: '(Erreur photo)' })],
                    }));
                }
            } else {
                cells.push(new docx.TableCell({
                    children: [new docx.Paragraph({ text: '(Aucune photo)' })],
                }));
            }

            tableRows.push(new docx.TableRow({ children: cells }));
        }

        // Create the document
        const doc = new docx.Document({
            sections: [{
                properties: {},
                children: [
                    new docx.Paragraph({
                        text: "Liste des Séminaristes",
                        heading: docx.HeadingLevel.HEADING_1,
                        spacing: { after: 200 },
                    }),
                    new docx.Table({
                        rows: tableRows,
                        width: {
                            size: 100,
                            type: docx.WidthType.PERCENTAGE,
                        },
                    }),
                ],
            }],
        });

        // Generate and download
        const blob = await docx.Packer.toBlob(doc);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);

        showToast(`Document Word généré: ${filename}`, 'success');

    } catch (err) {
        console.error('Export Word failed', err);
        showToast('Erreur lors de la génération du document Word', 'error');
    } finally {
        if (btn) {
            btn.innerText = oldText;
            btn.disabled = false;
        }
    }
}


/* ==============================================
   AUTHENTICATION
   ============================================== */
function showLoginModal() {
    const modal = document.createElement('div');
    modal.id = 'loginModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:9999;';

    modal.innerHTML = `
        <div style="background:white;padding:2rem;border-radius:12px;max-width:400px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.3);">
            <h2 style="margin:0 0 1.5rem 0;color:#1e293b;text-align:center;">SERFAN - Connexion</h2>
            <form id="loginForm">
                <div style="margin-bottom:1rem;">
                    <label style="display:block;margin-bottom:0.5rem;color:#475569;font-weight:500;">Rôle</label>
                    <select id="roleSelect" class="form-select" style="width:100%;padding:0.75rem;border:1px solid #cbd5e1;border-radius:6px;font-size:1rem;">
                        <option value="user">Utilisateur</option>
                        <option value="admin">Administrateur</option>
                    </select>
                </div>
                <div id="passwordField" style="margin-bottom:1.5rem;display:none;">
                    <label style="display:block;margin-bottom:0.5rem;color:#475569;font-weight:500;">Mot de passe</label>
                    <input type="password" id="passwordInput" class="form-control" placeholder="Entrez le mot de passe admin" style="width:100%;padding:0.75rem;border:1px solid #cbd5e1;border-radius:6px;font-size:1rem;">
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%;padding:0.75rem;font-size:1rem;">Se connecter</button>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    const roleSelect = document.getElementById('roleSelect');
    const passwordField = document.getElementById('passwordField');
    const passwordInput = document.getElementById('passwordInput');

    roleSelect.addEventListener('change', () => {
        if (roleSelect.value === 'admin') {
            passwordField.style.display = 'block';
            passwordInput.required = true;
        } else {
            passwordField.style.display = 'none';
            passwordInput.required = false;
            passwordInput.value = '';
        }
    });

    document.getElementById('loginForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const role = roleSelect.value;
        const password = passwordInput.value;

        if (role === 'admin') {
            if (password === ADMIN_PASSWORD) {
                currentUserRole = 'admin';
                sessionStorage.setItem('userRole', 'admin');
                modal.remove();
                showToast('Connecté en tant qu\'administrateur', 'success');
                initApp();
            } else {
                showToast('Mot de passe incorrect', 'error');
                passwordInput.value = '';
                passwordInput.focus();
            }
        } else {
            currentUserRole = 'user';
            sessionStorage.setItem('userRole', 'user');
            modal.remove();
            showToast('Connecté en tant qu\'utilisateur', 'success');
            initApp();
        }
    });
}

function logout() {
    currentUserRole = null;
    sessionStorage.removeItem('userRole');
    location.reload();
}

function updateUIForRole() {
    // Hide admin-only menu items for non-admin users
    document.querySelectorAll('[data-admin-only="true"]').forEach(el => {
        if (currentUserRole !== 'admin') {
            el.style.display = 'none';
        } else {
            el.style.display = '';
        }
    });

    // Hide entire nav groups for non-admin users (except the group containing 'Nouveau')
    if (currentUserRole !== 'admin') {
        document.querySelectorAll('.nav-group').forEach((group, index) => {
            // Keep only the first nav-group (Menu) which contains 'Nouveau'
            // Hide 'Filtres' (index 1) and 'Données' (index 2)
            if (index === 1 || index === 2) {
                group.style.display = 'none';
            }
        });
    } else {
        // Show all groups for admin
        document.querySelectorAll('.nav-group').forEach(group => {
            group.style.display = '';
        });
    }

    // Update user profile display
    const userProfile = document.querySelector('.user-profile span');
    if (userProfile) {
        userProfile.textContent = currentUserRole === 'admin' ? 'Admin' : 'Utilisateur';
    }

    // Add logout button if not exists
    const avatar = document.querySelector('.avatar');
    if (avatar && !avatar.onclick) {
        avatar.style.cursor = 'pointer';
        avatar.title = 'Cliquez pour vous déconnecter';
        avatar.onclick = () => {
            if (confirm('Voulez-vous vous déconnecter ?')) {
                logout();
            }
        };
    }
}

/* ==============================================
   HELPERS
   ============================================== */
function getInitials(prenom, nom) {
    const p = (prenom || '').trim();
    const n = (nom || '').trim();
    return ((p[0] || '') + (n[0] || '')).toUpperCase();
}

function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${msg}</span><i class="ri-close-line" style="cursor:pointer" onclick="this.parentElement.remove()"></i>`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}
