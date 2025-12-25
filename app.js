/* ==============================================
   CONFIGURATION
   ============================================== */
// !!! IMPORTANT: USER MUST FILL THESE IN !!!
const SUPABASE_URL = 'https://ajpvmjwtimvgxigknxit.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_9ZWXQNhBCd2Svtek_uiwGw_hjZYEmqU';

// Cloudinary
const CLOUDINARY_CLOUD_NAME = 'dvqzhgw1o';
const CLOUDINARY_UPLOAD_PRESET = 'jospia'; // Unsigned preset

/* ==============================================
   STATE & CONSTANTS
   ============================================== */
let seminaristes = []; // Local cache
const DORTOIRS_FRERES = ["IMAM MÂLIK IBN ANAS", "IMAM ASH-SHÂFI‘Î", "IMAM AHMAD IBN HANBAL", "IMAM ABÛ HANÎFA"];
const DORTOIRS_SOEURS = ["MARYAM BINT ‘IMRÂN", "ASSYA BINT MUZAHIM", "KHADÎJAH BINT KHUWAYLID", "FÂTIMA AZ-ZAHRÂ"];
const GROUPE_HARAKAS_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

// Fallback for local dev if keys not set
const USE_LOCAL_STORAGE = (!SUPABASE_URL || SUPABASE_URL.includes('YOUR_'));
const DB_KEY = 'jospia_v2_local_db';

/* ==============================================
   INIT
   ============================================== */
const supabaseClient = (typeof supabase !== 'undefined' && typeof supabase.createClient === 'function' && !USE_LOCAL_STORAGE)
    ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    await loadData();
    routeTo('dashboard');

    if (USE_LOCAL_STORAGE) {
        showToast('Mode Local (Pas de Supabase configuré)', 'warning');
    } else {
        showToast('Connecté à Supabase', 'success');
        subscribeToRealtime();
    }

    // Bind sidebar clicks
    document.querySelectorAll('[data-route]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            const route = el.dataset.route;
            // Handle active state
            document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
            el.classList.add('active');
            routeTo(route);
        });
    });
}

/* ==============================================
   DATA LAYER (Supabase + LocalStorage Fallback)
   ============================================== */
/* ==============================================
   DATA LAYER (Supabase + LocalStorage Fallback)
   ============================================== */
async function loadData() {
    if (USE_LOCAL_STORAGE) {
        const stored = localStorage.getItem(DB_KEY);
        seminaristes = stored ? JSON.parse(stored) : [];
    } else {
        try {
            const { data, error } = await supabaseClient.from('seminaristes').select('*');
            if (error) {
                if (error.code === 'PGRST205' || (error.message && error.message.includes('relation "public.seminaristes" does not exist'))) {
                    showToast('ERREUR: Table "seminaristes" introuvable dans Supabase. Exécutez le script SQL.', 'error');
                } else {
                    throw error;
                }
            }
            seminaristes = data || [];
        } catch (err) {
            console.error('Supabase load error:', err);
            if (!err.code) showToast('Erreur chargement données', 'error');
        }
    }
}

async function saveData(newItem, isUpdate = false) {
    // Logic: Ensure derived fields (niveau etc) are set before saving
    newItem = ensureDerivedFields(newItem);

    if (USE_LOCAL_STORAGE) {
        if (isUpdate) {
            const index = seminaristes.findIndex(s => s.matricule === newItem.matricule);
            if (index >= 0) seminaristes[index] = newItem;
        } else {
            seminaristes.push(newItem);
        }
        localStorage.setItem(DB_KEY, JSON.stringify(seminaristes));
        return newItem;
    } else {
        // Supabase
        try {
            const { data, error } = await supabaseClient
                .from('seminaristes')
                .upsert(newItem)
                .select();
            if (error) {
                if (error.code === 'PGRST205' || (error.message && error.message.includes('relation "public.seminaristes" does not exist'))) {
                    showToast('ERREUR: Table manquante. Allez dans Supabase SQL Editor.', 'error');
                    throw new Error('Table missing');
                }
                throw error;
            }
            // Refresh local cache
            await loadData();
            return data[0];
        } catch (err) {
            console.error('Supabase save error:', err);
            if (err.message !== 'Table missing') showToast('Erreur sauvegarde', 'error');
            throw err;
        }
    }
}

async function deleteData(matricule) {
    if (USE_LOCAL_STORAGE) {
        seminaristes = seminaristes.filter(s => s.matricule !== matricule);
        localStorage.setItem(DB_KEY, JSON.stringify(seminaristes));
    } else {
        try {
            const { error } = await supabaseClient.from('seminaristes').delete().eq('matricule', matricule);
            if (error) throw error;
            await loadData();
        } catch (err) {
            console.error('Delete error', err);
            showToast('Erreur suppression', 'error');
        }
    }
}

async function deleteAllData() {
    if (!confirm('ATTENTION: Vous allez supprimer TOUS les séminaristes.\n\nCette action est IRRÉVERSIBLE.\n\nVoulez-vous vraiment continuer ?')) return;

    // Seconde confirmation
    if (!prompt('Pour confirmer, tapez "SUPPRIMER" en majuscules :') === 'SUPPRIMER') {
        showToast('Suppression annulée', 'info');
        return;
    }

    if (USE_LOCAL_STORAGE) {
        seminaristes = [];
        localStorage.removeItem(DB_KEY);
        showToast('Toutes les données ont été effacées', 'success');
        renderDashboard();
    } else {
        try {
            // Suppression via Supabase (nécessite une condition qui couvre tout, ex: matricule non vide)
            const { error } = await supabaseClient.from('seminaristes').delete().neq('matricule', '000000');
            if (error) throw error;

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
    if (!supabaseClient) return;

    supabaseClient
        .channel('public:seminaristes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'seminaristes' }, (payload) => {
            console.log('Realtime Change:', payload);
            const { eventType, new: newRecord, old: oldRecord } = payload;

            if (eventType === 'INSERT') {
                // Check uniqueness to avoid duplicates if this client triggered the insert
                if (!seminaristes.find(s => s.matricule === newRecord.matricule)) {
                    seminaristes.push(newRecord);
                    showToast(`Nouvelle entrée: ${newRecord.prenom} ${newRecord.nom}`, 'info');
                }
            } else if (eventType === 'UPDATE') {
                const index = seminaristes.findIndex(s => s.matricule === newRecord.matricule);
                if (index !== -1) {
                    seminaristes[index] = newRecord;
                } else {
                    // Falls back to adding if for some reason we didn't have it
                    seminaristes.push(newRecord);
                }
            } else if (eventType === 'DELETE') {
                seminaristes = seminaristes.filter(s => s.matricule !== oldRecord.matricule);
            }

            // Refresh current view if applicable
            refreshCurrentView();
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                showToast('Synchro en direct active 🟢', 'success');
            }
            if (status === 'CHANNEL_ERROR') {
                showToast('Erreur synchro (Check Dashboard) 🔴', 'error');
                console.error('Realtime channel error');
            }
            if (status === 'TIMED_OUT') {
                showToast('Synchro lente... 🟠', 'warning');
            }
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

    if (USE_LOCAL_STORAGE) {
        seminaristes = [...seminaristes, ...prepared];
        localStorage.setItem(DB_KEY, JSON.stringify(seminaristes));
    } else {
        try {
            const { error } = await supabaseClient.from('seminaristes').insert(prepared);
            if (error) throw error;
            await loadData();
        } catch (err) {
            console.error('Batch import error', err);
            showToast(`Erreur import: ${err.message || err.details}`, 'error');
        }
    }
}

/* ==============================================
   BUSINESS LOGIC
   ============================================== */
function getLastMatriculeId() {
    let maxId = 0;
    const prefix = '25-JOS';
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
        s.matricule = '25-JOS' + next.toString().padStart(3, '0');
    }

    // 2. Genre normalization
    s.genre = (s.genre && s.genre.toUpperCase().startsWith('F')) ? 'F' : 'M';

    // 3. Niveau logic
    const note = parseFloat(s.note);
    s.niveau = 'NIVEAU PRIMAIRE'; // default
    if (!isNaN(note)) {
        if (note > 14) s.niveau = 'NIVEAU UNIVERSITAIRE';
        else if (note > 9) s.niveau = 'NIVEAU SECONDAIRE';
    }

    // 4. Dortoir / Halaqa automation (only if missing)
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

async function uploadImage(file) {
    if (!file) return null;

    // Local fallback
    if (!CLOUDINARY_CLOUD_NAME.includes('YOUR_LOADING') && CLOUDINARY_CLOUD_NAME !== 'YOUR_CLOUD_NAME_HERE') {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

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
            pageTitle.innerText = 'Niveaux par Genre';
            renderLevelsByGenre();
            break;
        case 'dortoirs':
            pageTitle.innerText = 'Dortoirs';
            renderGroupList('dortoir', [...DORTOIRS_FRERES, ...DORTOIRS_SOEURS]);
            break;
        case 'harakas':
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

    const html = `
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
    
    <div class="table-card">
      <div class="table-header">
        <h4>Derniers ajouts</h4>
        <button class="btn btn-primary btn-sm" onclick="routeTo('all')">Voir tout</button>
      </div>
      ${generateTableHTML(seminaristes.slice(-5).reverse())}
    </div>

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
      <td>${s.niveau ? s.niveau.replace('NIVEAU ', '') : '-'}</td>
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
            <th>Niveau</th>
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

          <div class="grid-form" style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; margin-bottom:1rem;">
            <div class="form-group">
              <label class="form-label">Age</label>
              <input type="number" id="f_age" class="form-control" value="${data?.age || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Note</label>
              <input type="number" step="0.1" id="f_note" class="form-control" value="${data?.note !== undefined ? data.note : '10'}">
            </div>
            <div class="form-group">
              <label class="form-label">Genre</label>
              <select id="f_genre" class="form-select">
                <option value="M" ${data?.genre === 'M' ? 'selected' : ''}>M</option>
                <option value="F" ${data?.genre === 'F' ? 'selected' : ''}>F</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Contact</label>
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
              ${data?.photo_url ? `<img src="${data.photo_url}" style="height:60px;border-radius:4px">` : ''}
            </div>
          </div>
          
          <hr style="border:0; border-top:1px solid var(--border); margin: 2rem 0;">

          <div style="display:flex; gap:1rem; justify-content:flex-end">
            <button type="button" class="btn btn-outline" onclick="routeTo('all')">Annuler</button>
            ${isEdit ? `<button type="button" class="btn btn-outline" style="color:var(--danger);border-color:var(--danger)" onclick="handleDelete('${data.matricule}')">Supprimer</button>` : ''}
            <button type="submit" class="btn btn-primary">${isEdit ? 'Mettre à jour' : 'Enregistrer'}</button>
          </div>
        </form>
      </div>
    </div>
  `;
    view.innerHTML = h;

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

            let photoUrl = data?.photo_url || '';

            if (fileToUpload) {
                const uploaded = await uploadImage(fileToUpload);
                if (uploaded) photoUrl = uploaded;
            }

            const payload = {
                matricule: data?.matricule || null,
                nom: document.getElementById('f_nom').value,
                prenom: document.getElementById('f_prenom').value,
                age: document.getElementById('f_age').value,
                note: document.getElementById('f_note').value,
                genre: document.getElementById('f_genre').value,
                contact: document.getElementById('f_contact').value,
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
                delete preserved.genre;
                delete preserved.contact;
                delete preserved.photo_url;

                Object.assign(payload, preserved);
            }

            await saveData(payload, isEdit);
            showToast('Enregistré avec succès', 'success');
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
    <a href="#" class="list-item" onclick='routeTo("filtered_multi", { filters: ${JSON.stringify(g.filters)}, title: "${g.title}" })'>
        <div style="display:flex; align-items:center; gap:0.5rem">
            <i class="${g.icon}"></i>
            <span>${g.title}</span>
        </div>
      <span class="badge">${g.count}</span>
    </a>
  `).join('');

    view.innerHTML = `<div class="list-group" style="max-width:600px">${listHtml}</div>`;
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
        <div class="table-header"><h4>Exporter</h4></div>
        <div style="padding:2rem">
          <p class="form-label" style="margin-bottom:1rem">Télécharger la liste complète.</p>
          <button class="btn btn-accent" onclick="exportExcel(seminaristes)">Exporter tout (.xlsx)</button>
          
          <hr style="margin: 1.5rem 0; border: 0; border-top: 1px solid var(--border);">
          
          <p class="form-label" style="margin-bottom:1rem">Télécharger les photos (pour les badges).</p>
          <button class="btn btn-primary" onclick="exportImages()">Exporter Photos (.zip)</button>
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
}

function exportExcel(data) {
    if (!data || data.length === 0) return showToast('Rien à exporter', 'warning');
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Export");
    XLSX.writeFile(wb, "seminaristes_export.xlsx");
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


/* ==============================================
   HELPERS
   ============================================== */
function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${msg}</span><i class="ri-close-line" style="cursor:pointer" onclick="this.parentElement.remove()"></i>`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}
