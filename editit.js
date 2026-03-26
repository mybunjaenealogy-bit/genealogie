let data = {
	"ego": "ego",
	"people": {
		"ego": { "id": "ego", "name": "Prénom Nom", "birth": null, "death": null, "place": "Ville de naissance", "fatherId": null, "motherId": null, "siblings": [] }
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
/*
viewport.addEventListener('wheel', (e) => {
	e.preventDefault();
	scale *= (e.deltaY > 0 ? 0.9 : 1.1);
	scale = Math.min(Math.max(0.2, scale), 2);
	applyTransform();
}, { passive: false });
*/
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
	if (!id || !data.people[id]) return;
	nodePos[id] = { x, y };
	const p = data.people[id];
	const fw = getSubtreeWidth(p.fatherId);
	const mw = getSubtreeWidth(p.motherId);
	const totalW = fw + mw + GAP_X;
	if (p.fatherId) computeLayout(p.fatherId, x - totalW/2 + fw/2, y - GAP_Y);
	if (p.motherId) computeLayout(p.motherId, x + totalW/2 - mw/2, y - GAP_Y);
}

// --- RENDU ---
function render() {
	const container = document.getElementById('tree-container');
	const canvas = document.getElementById('canvas-bg');
	const ctx = canvas.getContext('2d');
	container.innerHTML = "";
	nodePos = {};

	computeLayout("ego", 5000, 5000);
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
		`;
		container.appendChild(div);

		if (p.fatherId && nodePos[p.fatherId]) drawBezier(ctx, pos, nodePos[p.fatherId]);
		if (p.motherId && nodePos[p.motherId]) drawBezier(ctx, pos, nodePos[p.motherId]);
	});
}

function drawBezier(ctx, childPos, parentPos) {
	const start = { x: childPos.x + CARD_W/2, y: childPos.y };
	const end = { x: parentPos.x + CARD_W/2, y: parentPos.y + CARD_H };
	ctx.beginPath();
	ctx.moveTo(start.x, start.y);
	const cpY = start.y - (GAP_Y / 2.5);
	ctx.bezierCurveTo(start.x, cpY, end.x, cpY, end.x, end.y);
	ctx.strokeStyle = "#cbd5e1";
	ctx.lineWidth = 2.5;
	ctx.stroke();
}

function getInitials(name) {
	if (!name) return "??";
	const words = name.trim().split(/\s+/);
	if (words.length === 1) return words[0].charAt(0).toUpperCase();
	return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}

// --- ACTIONS ---
function addParent(childId, type) {
	const p = data.people[childId];
	const newId = (type === 'father' ? 'f' : 'm') + Math.random().toString(36).substr(2, 5);
	data.people[newId] = { "id": newId, "name": "", "birth": null, "place": "", "fatherId": null, "motherId": null, "siblings": [] };
	if(type === 'father') p.fatherId = newId; else p.motherId = newId;
	render();
}

let editingId = null;
function openModal(id) {
	editingId = id;
	const p = data.people[id];
	document.getElementById('in-name').value = p.name || "";
	document.getElementById('in-birth').value = p.birth || "";
	document.getElementById('in-place').value = p.place || "";
	
	// Gestion du bouton supprimer
	const deleteZone = document.getElementById('delete-zone');
	deleteZone.innerHTML = "";
	if (id !== "ego") {
		const btnDel = document.createElement('button');
		btnDel.className = "btn-danger";
		btnDel.innerText = "Supprimer";
		btnDel.onclick = () => deletePerson(id);
		deleteZone.appendChild(btnDel);
	}
	
	document.getElementById('modal-overlay').style.display = 'flex';
}

function deletePerson(id) {
	if (!confirm("Voulez-vous supprimer cette personne et son ascendance ?")) return;
	
	// 1. Récupérer tous les ancêtres à supprimer récursivement
	function getAllAncestors(pid) {
		let ids = [pid];
		let person = data.people[pid];
		if (person.fatherId) ids = ids.concat(getAllAncestors(person.fatherId));
		if (person.motherId) ids = ids.concat(getAllAncestors(person.motherId));
		return ids;
	}
	
	const toDelete = getAllAncestors(id);
	
	// 2. Nettoyer la référence chez l'enfant
	Object.values(data.people).forEach(p => {
		if (p.fatherId === id) p.fatherId = null;
		if (p.motherId === id) p.motherId = null;
	});

	// 3. Supprimer de l'objet data
	toDelete.forEach(did => delete data.people[did]);
	
	closeModal();
	render();
}

function closeModal() { document.getElementById('modal-overlay').style.display = 'none'; }

function savePerson() {
	const p = data.people[editingId];
	p.name = document.getElementById('in-name').value;
	p.birth = parseInt(document.getElementById('in-birth').value) || null;
	p.place = document.getElementById('in-place').value;
	closeModal(); render();
}

function resetView() {
	scale = 0.8;
	offset.x = window.innerWidth/2 - (5000 * scale) - (CARD_W/2 * scale);
	offset.y = window.innerHeight/2 - (5000 * scale);
	applyTransform();
}

function downloadJSON() {
	const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob); a.download = "genealogie.json"; a.click();
}

// Remplace ta fonction de sauvegarde par celle-ci :
async function saveToDatabase() {
	const userId = window.currentUserId;
	await db_save(userId, data); 
	

	const shareUrl = window.location.origin + "/index.html?u=" + userId;

	// Option B : Proposer une redirection
	if(confirm("Arbre sauvegardé ! Voici votre lien de partage :\n" + shareUrl + "\n\nVoulez-vous voir l'arbre en mode visualisation ?")) {
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
