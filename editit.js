let data = {
	"ego": "ego",
	"people": {
		"ego": { "id": "ego", "name": "Prénom Nom", "birth": null, "death": null, "place": "Ville de naissance", "fatherId": null, "motherId": null, "children": [] }
	}
};

const workspace = document.getElementById('workspace');
const viewport = document.getElementById('viewport');
let offset = { x: 0, y: 0 };
let scale = 1;
let isDragging = false;
let startMouse = { x: 0, y: 0 };

// --- NAVIGATION ---
viewport.addEventListener('mousedown', (e) => {
	if(e.target.closest('.person-card')) return;
	isDragging = true;
	startMouse = { x: e.clientX - offset.x, y: e.clientY - offset.y };
});
window.addEventListener('mousemove', (e) => {
	if (!isDragging) return;
	offset.x = e.clientX - startMouse.x;
	offset.y = e.clientY - startMouse.y;
	applyTransform();
});
window.addEventListener('mouseup', () => isDragging = false);

function applyTransform() { workspace.style.transform = `translate(${offset.x}px, ${offset.y}px) scale(${scale})`; }

// --- LAYOUT ---
const CARD_W = 260;
const CARD_H = 110;
const GAP_X = 60;
const GAP_Y = 220;

function getSubtreeWidth(id) {
	if (!id || !data.people[id]) return CARD_W;
	const p = data.people[id];
	if (!p.fatherId && !p.motherId) return CARD_W;
	const fw = getSubtreeWidth(p.fatherId);
	const mw = getSubtreeWidth(p.motherId);
	return Math.max(CARD_W, fw + mw + GAP_X);
}

let nodePos = {};
function computeLayout(id, x, y) {
    if (!id || !data.people[id] || nodePos[id]) return;
    
    // On marque la position AVANT de descendre pour éviter les boucles infinies
    nodePos[id] = { x, y };
    const p = data.people[id];

    // 1. Remonter aux parents
    const fw = getSubtreeWidth(p.fatherId);
    const mw = getSubtreeWidth(p.motherId);
    const totalW = fw + mw + GAP_X;
    
    if (p.fatherId) computeLayout(p.fatherId, x - totalW/2 + fw/2, y - GAP_Y);
    if (p.motherId) computeLayout(p.motherId, x + totalW/2 - mw/2, y - GAP_Y);

    // 2. Descendre aux enfants
    if (p.children && p.children.length > 0) {
        const childCount = p.children.length;
        // On centre la fratrie sous le parent
        const totalChildW = (childCount - 1) * (CARD_W + GAP_X);
        p.children.forEach((cId, i) => {
            const cx = x - totalChildW/2 + (i * (CARD_W + GAP_X));
            computeLayout(cId, cx, y + GAP_Y);
        });
    }
}

// --- RENDU ---
function render() {
	const container = document.getElementById('tree-container');
	const canvas = document.getElementById('canvas-bg');
	const ctx = canvas.getContext('2d');
	container.innerHTML = "";
	nodePos = {};

	computeLayout(data.ego, 5000, 5000);
	canvas.width = 10000; canvas.height = 10000;
	ctx.clearRect(0, 0, 10000, 10000);

	Object.keys(nodePos).forEach(id => {
		const p = data.people[id];
		const initials = getInitials(p.name);
		const pos = nodePos[id];
		const div = document.createElement('div');
		div.className = "person-card";
		div.style.left = pos.x + "px";
		div.style.top = pos.y + "px";
		div.onclick = () => openModal(id);
		
		div.innerHTML = `
			<div class="card-header-btns">
				<button class="btn-mini" ${p.fatherId ? 'disabled' : ''} onclick="event.stopPropagation(); addParent('${id}', 'father')">+ Père</button>
				<button class="btn-mini" ${p.motherId ? 'disabled' : ''} onclick="event.stopPropagation(); addParent('${id}', 'mother')">+ Mère</button>
			</div>
			<div class="avatar-row">
				<div class="avatar" style="font-size: 14px; font-weight: bold; background: #eef2ff; border: 1px solid #d0d7de;">
					${initials}
				</div>
				<div>
					<div style="font-weight:bold">${p.name || 'Nom ?'}</div>
					<div style="font-size:12px; color:#666">${p.birth || ''} ${p.place || ''}</div>
				</div>
			</div>
			<div class="card-footer-btns" style="text-align:center; margin-top:8px; border-top:1px solid #eee; padding-top:4px;">
				<button class="btn-mini" onclick="event.stopPropagation(); addChild('${id}')">+ Enfant</button>
			</div>
		`;
		container.appendChild(div);

		// --- DESSIN UNIQUE (Style descendant, mais déclenché par l'enfant) ---
		// On ne dessine QUE depuis l'enfant vers ses parents. 
		// Ainsi, chaque lien est tracé une seule fois.

		if (p.fatherId && nodePos[p.fatherId]) {
		    // On utilise drawBezierChild mais en passant le parent en premier
		    drawBezierChild(ctx, nodePos[p.fatherId], pos); 
		}

		if (p.motherId && nodePos[p.motherId]) {
		    // On utilise drawBezierChild mais en passant le parent en premier
		    drawBezierChild(ctx, nodePos[p.motherId], pos);
		}
	});
}

function drawBezierChild(ctx, parentPos, childPos) {
    const start = { x: parentPos.x + CARD_W/2, y: parentPos.y + CARD_H };
    const end = { x: childPos.x + CARD_W/2, y: childPos.y };
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    const cpY = start.y + (GAP_Y / 2.5);
    ctx.bezierCurveTo(start.x, cpY, end.x, cpY, end.x, end.y);
    ctx.strokeStyle = "#94a3b8";
    ctx.stroke();
}

function getInitials(name) {
	if (!name) return "??";
	const words = name.trim().split(/\s+/);
	if (words.length === 1) return words[0].charAt(0).toUpperCase();
	return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}

// --- ACTIONS MODIFIÉES ---

function addParent(childId, type) {
	const p = data.people[childId];
	const newId = (type === 'father' ? 'f' : 'm') + Math.random().toString(36).substr(2, 5);
	
	data.people[newId] = { 
		"id": newId, "name": "", "birth": null, "place": "", 
		"fatherId": null, "motherId": null, "children": [childId] 
	};

	if(type === 'father') p.fatherId = newId; else p.motherId = newId;
	render();
}

function addChild(parentId) {
    const parent = data.people[parentId];
    if (!parent) return;

    const newId = 'c' + Math.random().toString(36).substr(2, 5);
    
    // 1. Déterminer si le parent est un père ou une mère pour pré-remplir l'enfant
    let fId = parentId.startsWith('f') ? parentId : null;
    let mId = parentId.startsWith('m') ? parentId : null;
    if (!fId && !mId) fId = parentId; // Cas par défaut pour l'ego

    // 2. Créer l'objet de l'enfant
    data.people[newId] = { 
        "id": newId, 
        "name": "Nouvel Enfant", 
        "birth": null, 
        "place": "", 
        "fatherId": fId, 
        "motherId": mId, 
        "children": [] 
    };
    
    // 3. ENREGISTRER LE LIEN SUR LE PARENT IMMÉDIATEMENT
    if (!parent.children) parent.children = [];
    if (!parent.children.includes(newId)) {
        parent.children.push(newId);
    }

    // 4. CHERCHER LE CONJOINT (Optionnel mais recommandé pour ton râteau)
    // Si le parent a déjà d'autres enfants, on lie le nouvel enfant au même conjoint
    const existingSiblingId = parent.children.find(id => id !== newId);
    if (existingSiblingId && data.people[existingSiblingId]) {
        const sibling = data.people[existingSiblingId];
        const conjointId = (fId === parentId) ? sibling.motherId : sibling.fatherId;
        
        if (conjointId && data.people[conjointId]) {
            // On lie l'enfant au conjoint
            if (fId === parentId) data.people[newId].motherId = conjointId;
            else data.people[newId].fatherId = conjointId;

            // On ajoute l'enfant à la liste du conjoint
            if (!data.people[conjointId].children) data.people[conjointId].children = [];
            if (!data.people[conjointId].children.includes(newId)) {
                data.people[conjointId].children.push(newId);
            }
        }
    }

    // 5. Rendre et ouvrir la modal
    render();
    openModal(newId);
}

let editingId = null;
function openModal(id) {
    editingId = id;
    const p = data.people[id];

    // Champs classiques
    document.getElementById('in-name').value = p.name || "";
    document.getElementById('in-birth').value = p.birth || "";
    document.getElementById('in-place').value = p.place || "";
    document.getElementById('in-death').value = p.death || "";

    // --- GESTION DES SÉLECTEURS DE PARENTS ---
    const fatherSelect = document.getElementById('in-father');
    const motherSelect = document.getElementById('in-mother');

    // On réinitialise les listes avec une option vide
    let fatherOptions = '<option value="">-- Choisir le père --</option>';
    let motherOptions = '<option value="">-- Choisir la mère --</option>';

    // On parcourt toutes les personnes pour remplir les options
    Object.values(data.people).sort((a, b) => (a.name || "").localeCompare(b.name || "")).forEach(person => {
        // On évite que la personne soit son propre parent (boucle infinie)
        if (person.id !== id) {
            const displayName = person.name ? person.name : "Sans nom (" + person.id + ")";
            
            fatherOptions += `<option value="${person.id}" ${p.fatherId === person.id ? 'selected' : ''}>${displayName}</option>`;
            motherOptions += `<option value="${person.id}" ${p.motherId === person.id ? 'selected' : ''}>${displayName}</option>`;
        }
    });

    fatherSelect.innerHTML = fatherOptions;
    motherSelect.innerHTML = motherOptions;

    // Gestion du bouton supprimer
    const deleteZone = document.getElementById('delete-zone');
    deleteZone.innerHTML = "";
    if (id !== data.ego) {
        const btnDel = document.createElement('button');
        btnDel.className = "btn-danger";
        btnDel.innerText = "Supprimer";
        btnDel.onclick = () => deletePerson(id);
        deleteZone.appendChild(btnDel);
    }

    document.getElementById('modal-overlay').style.display = 'flex';
}

function deletePerson(id) {
	if (!confirm("Voulez-vous supprimer cette personne ?")) return;
	
	// Nettoyage des références chez les autres
	Object.values(data.people).forEach(p => {
		if (p.fatherId === id) p.fatherId = null;
		if (p.motherId === id) p.motherId = null;
		if (p.children) p.children = p.children.filter(cid => cid !== id);
	});

	delete data.people[id];
	closeModal();
	render();
}

function closeModal() { document.getElementById('modal-overlay').style.display = 'none'; }

function savePerson() {
    const p = data.people[editingId];
    
    // Anciens parents pour nettoyage
    const oldFatherId = p.fatherId;
    const oldMotherId = p.motherId;

    // Récupération des nouvelles valeurs
    p.name = document.getElementById('in-name').value;
    p.birth = parseInt(document.getElementById('in-birth').value) || null;
    p.place = document.getElementById('in-place').value;
    p.death = parseInt(document.getElementById('in-death').value) || null;
    p.fatherId = document.getElementById('in-father').value || null;
    p.motherId = document.getElementById('in-mother').value || null;

    // --- LOGIQUE DE MISE À JOUR DES LIENS ENFANTS ---
    
    // 1. Nettoyer les anciens parents (si le parent a changé)
    if (oldFatherId && oldFatherId !== p.fatherId) {
        data.people[oldFatherId].children = data.people[oldFatherId].children.filter(cid => cid !== editingId);
    }
    if (oldMotherId && oldMotherId !== p.motherId) {
        data.people[oldMotherId].children = data.people[oldMotherId].children.filter(cid => cid !== editingId);
    }

    // 2. Ajouter l'enfant chez les nouveaux parents
    if (p.fatherId) {
        const f = data.people[p.fatherId];
        if (!f.children) f.children = [];
        if (!f.children.includes(editingId)) f.children.push(editingId);
    }
    if (p.motherId) {
        const m = data.people[p.motherId];
        if (!m.children) m.children = [];
        if (!m.children.includes(editingId)) m.children.push(editingId);
    }

    closeModal(); 
    render();
}

function resetView() {
	scale = 0.8;
	offset.x = window.innerWidth/2 - (5000 * scale);
	offset.y = window.innerHeight/2 - (5000 * scale);
	applyTransform();
}

function downloadJSON() {
	const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob); a.download = "genealogie.json"; a.click();
}

async function saveToDatabase() {
	const userId = window.currentUserId;
	await db_save(userId, data); 
	
	const currentPath = window.location.pathname;
	const newPath = currentPath.replace("edit.html", "index.html");

	const shareUrl = window.location.protocol + "//" + window.location.host + newPath + "?u=" + userId;
	
	if(confirm("Arbre sauvegardé ! Voici votre lien de partage :\n" + shareUrl + "\nVoulez-vous voir l'arbre en mode visualisation ?")) {
		window.location.href = shareUrl;
	}
}

window.onload = async () => {
	// 1. On regarde s'il y a un utilisateur dans l'URL, sinon on prend "matthieu_v"
	const urlParams = new URLSearchParams(window.location.search);
	let userId = urlParams.get('u'); 
	
	// SI NOUVEL ARBRE (Pas d'ID dans l'URL)
	if (!userId) {
		// On génère un ID court et aléatoire (ex: tree-a1b2c3)
		userId = "chime-" + Math.random().toString(36).substring(2, 9);
		
		// On l'ajoute à l'URL proprement pour que l'utilisateur puisse copier le lien
		const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?u=' + userId;
		console.log(`window.location.host: ${window.location.host} && window.location.pathname: ${window.location.pathname}`)
		window.history.pushState({ path: newUrl }, '', newUrl);
		
		console.log("Nouvel identifiant généré :", userId);
	}

	// On garde cet ID en mémoire pour la sauvegarde plus tard
	window.currentUserId = userId; 

	const cloudData = await db_load(userId);

	if (cloudData) {
		data = cloudData; 
		console.log("Données chargées pour : " + userId);
	} else console.log("Nouvel arbre pour : " + userId);
	
	render(); 
	resetView();
};
