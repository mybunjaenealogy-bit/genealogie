/** ═══════════════════════════════════════════════════════════════════
 *	 CHIMERE — Arbre généalogique en bois de cerf
 *	 Structure JSON : chaque personne a un id, ses infos, et optionnellement
 *	 fatherId / motherId pour remonter les lignées.
 *	 Ego = point de départ. Bois DROIT = lignée paternelle, GAUCHE = maternelle.
 *  ═══════════════════════════════════════════════════════════════════ */
const Chimere = (() => {
	let DB = { people: {} }; 	// Sera rempli par le JSON
	let isDataLoaded = false; 	// Sécurité pour le rendu
	let isPhotoMode = false; 	// Le mode "Interrupteur"
	// PARAMÈTRES VISUELS
	const P = {
		// Visage
		faceH:     130,   // demi-hauteur du visage
		faceW:     78,    // demi-largeur du visage
		eyeOffY:  -18,    // Y des yeux par rapport au centre
		eyeOffX:   28,    // X des yeux
		noseLen:   22,    // longueur du nez
		// Bois
		trunkW:    9,     // épaisseur du tronc
		branchDecay: 0.68, //0.82, // facteur de réduction longueur par génération
		widthDecay:  0.62, //0.75, // facteur de réduction épaisseur par génération
		baseLen:   50,   // longueur du 1er segment du bois
		nodeSize: 15,
		// Angles de base : bois droit part vers la droite-haut, gauche vers gauche-haut
		forkSpread:  0.68,  // demi-angle de fourche à chaque bifurcation
		// Couleurs
		colFaceStroke: '#5a3a18',
		colBoneR:   '#ffffff',  // bois paternel
		colBoneL:   '#ffffff',  // bois maternel
		colUnknown: '#3a3a28',  // ancêtre inconnu / manquant
		curvature: 0.2,     // Facteur de courbure (0 = droit, 0.5 = très courbé)
		oscSpeed: 0.002, // Vitesse de la respiration
		oscAmp: 0.03     // Amplitude du mouvement
	};
	const ANTLER_THEMES = [
    { name: "doré vert", 									left: "#c8a848", right: "#88b878" }, // Brun / Beige
    { name: "Classique", 									left: "#8b5a2b", right: "#a0785a" }, // Brun / Beige
    { name: "Forêt Noir", 								left: "#1a2a1a", right: "#4a5d23" }, // Vert sombre / Mousse
    { name: "Os et Cendre", 							left: "#d2d2c0", right: "#555555" }, // Ivoire / Gris
    { name: "Aurore", 										left: "#2e4a85", right: "#7b4a8d" }, // Bleu nuit / Violet
    { name: "Feu ancestral", 							left: "#8b0000", right: "#ff8c00" }, // Rouge sang / Orange
    { name: "Glace", 											left: "#a5f2f3", right: "#ffffff" }, // Cyan clair / Blanc
    { name: "icyblue gunMetal", 					left: "#a4d8ff", right: "#35393c" },
    { name: "raspRed deepSpaceBlue", 			left: "#ee005a", right: "#012641" },
    { name: "shadGrey sandClay", 					left: "#272727", right: "#d4aa7d" },
    { name: "elecRose chartreuse", 				left: "#fe00ae", right: "#c1fe1a" },
    { name: "limeCream vintGrape", 				left: "#ddea78", right: "#433455" },
    { name: "celadon chocoPlum", 					left: "#a8d3a8", right: "#553832" },
    { name: "cherryBlossom deepTwilight", left: "#f9a8bb", right: "#1a1265" }
];

	// ÉTAT RUNTIME
	let canvas, ctx, W, H;
	let cam   = { x:0, y:0, scale:1 };
	let drag  = { on:false, sx:0, sy:0, cx:0, cy:0 };
	let hits  = [];    // [{ id, sx, sy, r }] pour le hit-test
	let hover = null, sel = null;
	let animT = 0;
	
	let userImage = null; // Stockera l'objet Image
	let imgTransform = {
	    x: 0,       // Décalage X par rapport au centre du visage
	    y: 0,       // Décalage Y
	    scale: 1.0  // Zoom propre à l'image
	};
	let isTransformingImg = false; // Pour savoir si on drag l'image ou la caméra
	let wheelSaveTimeout;
	// HELPERS COORDS
	const w2s = (wx, wy) => ({ // World to Screen
		x: W/2 + (wx + cam.x) * cam.scale,
		y: H/2 + (wy + cam.y) * cam.scale,
	});
	const s2w = (sx, sy) => ({ // Screen to World
		x: (sx - W/2) / cam.scale - cam.x,
		y: (sy - H/2) / cam.scale - cam.y,
	});

	// 2. LE CHARGEMENT (La clé du problème)
	async function loadData(url) {
		try {
			const response = await fetch(url);
			const json = await response.json();
			DB = json;
			isDataLoaded = true;
			console.log("Données chargées avec succès");
		} catch (err) {
			console.error("Erreur critique au chargement du JSON :", err);
		}
	}

	// CALCUL DE PROFONDEUR MAX (pour normaliser l'opacité)
	function maxDepth(id, depth=0) {
		const p = DB.people[id];
		if (!p) return depth;
		return Math.max(
			p.fatherId ? maxDepth(p.fatherId, depth+1) : depth,
			p.motherId ? maxDepth(p.motherId, depth+1) : depth
		);
	}

	function applyRandomTheme() {
    // 1. Choisir un index au hasard
    const theme = ANTLER_THEMES[Math.floor(Math.random() * ANTLER_THEMES.length)];
    
    // 2. Appliquer aux paramètres de rendu
    P.colBoneL = theme.left;
    P.colBoneR = theme.right;

    // 3. Mettre à jour les sliders/inputs visuels (si présents dans le DOM)
    const inputL = document.getElementById('color-left');
    const inputR = document.getElementById('color-right');
    if (inputL) inputL.value = theme.left;
    if (inputR) inputR.value = theme.right;

    console.log(`Thème appliqué : ${theme.name}`);
	}

	// Génère un nombre "pseudo-aléatoire" stable
	const stableRandom = (s) => {
		const x = Math.sin(s) * 10000;
		return x - Math.floor(x);
	};

	/** DESSIN DU BOIS (récursif)
	 * id       : identifiant de la personne représentée par ce segment
	 * x1,y1    : point de départ du segment (coords monde)
	 * angle    : direction du segment (radians, 0=droite, -PI/2=haut)
	 * length   : longueur du segment
	 * width    : épaisseur du segment
	 * depth    : profondeur actuelle (0=tronc direct)
	 * side     : 'R' ou 'L' (pour la couleur de base)
	 */
	/**
	 * Calcule un point le long d'une trajectoire Concave, affaissée vers le centre.
	 */
	function getSimpleArcPoint(t, pL, pC, pR) {
	    // Interpolation quadratique standard (Bézier)
	    const x = (1 - t)**2 * pL.x + 2 * (1 - t) * t * pC.x + t**2 * pR.x;
	    const y = (1 - t)**2 * pL.y + 2 * (1 - t) * t * pC.y + t**2 * pR.y;
	    return { x, y };
	}

	function drawAntler(id, x1, y1, angle, length, width, depth, side) {
	    const person = (id && DB.people[id]) ? DB.people[id] : null;
	    const known = !!person;
	    const col = known ? (side === 'R' ? P.colBoneR : P.colBoneL) : P.colUnknown;
	    
	    const attenuationFactor = Math.pow(0.72, depth);
	    const baseAlpha = known ? (0.5 * attenuationFactor) : (0.1 * attenuationFactor);
	    const time = Date.now() * P.oscSpeed;
	    const sway = Math.sin(time + (depth * 0.5)) * P.oscAmp;

	    const baseAngleConstraint = (side === 'R' ? 1 : -1) * (P.forkSpread * 0.3);
	    const trunkAngle = angle + baseAngleConstraint + sway; 
	    const animatedAngle = angle + sway;

	    ctx.save();
	    ctx.lineCap = 'round';
	    if (depth > 0) ctx.filter = `saturate(${Math.max(0.5, 1 - depth * 0.5)}) brightness(${Math.max(0.5, 1 - depth * 0.5)})`;

	    // ===================================================================
	    // --- 1. TRONC ET ROSETTE (NIVEAU 0) ---
	    // ===================================================================
	    if (depth === 0) {
	        const baseTrunkLen = 20;
	        const baseTrunkW = width * 1.1;
	        const tx2 = x1 + Math.cos(trunkAngle) * baseTrunkLen;
	        const ty2 = y1 + Math.sin(trunkAngle) * baseTrunkLen;
	        
	        if (typeof drawTrunk === "function") drawTrunk(x1, y1, tx2, ty2, baseTrunkW, col);
	        
	        const rosetteCol = known ? (side === 'R' ? '#FFE8A0' : '#B8E8A8') : P.colUnknown;
	        const rosetteRadius = width * 1.15;
	        const numRosetteFibers = Math.floor(25 * 1.8);

	        for (let r = 0; r < numRosetteFibers; r++) {
	            const seed = r * r + (x1 > 0 ? 7123 : 14321);
	            const rSpread = Math.PI * 1.2; 
	            const rAngle = (animatedAngle - rSpread/2) + (stableRandom(seed) * rSpread);
	            const rDist = (0.6 + stableRandom(seed + 1) * 0.4) * rosetteRadius;
	            const rx = tx2 + Math.cos(rAngle) * rDist;
	            const ry = ty2 + Math.sin(rAngle) * rDist;
	            const sNodeJoin = w2s(tx2, ty2);
	            const sEdge = w2s(rx, ry);
	            const cpX = tx2 + Math.cos(animatedAngle - Math.PI) * (rDist * 0.5);
	            const cpY = ty2 + Math.sin(animatedAngle - Math.PI) * (rDist * 0.5);
	            const sCP_Rosette = w2s(cpX, cpY);

	            let rLastP = { x: sNodeJoin.x, y: sNodeJoin.y };
	            for (let st = 1; st <= 8; st++) {
	                const t = st / 8;
	                const cx = (1-t)**2 * sNodeJoin.x + 2*(1-t)*t * sCP_Rosette.x + t**2 * sEdge.x;
	                const cy = (1-t)**2 * sNodeJoin.y + 2*(1-t)*t * sCP_Rosette.y + t**2 * sEdge.y;
	                ctx.beginPath();
	                ctx.globalAlpha = baseAlpha * (1.2 + stableRandom(seed+2)*0.5) * (1-t);
	                ctx.lineWidth = (width * 0.12) * cam.scale;
	                ctx.strokeStyle = rosetteCol;
	                ctx.moveTo(rLastP.x, rLastP.y); ctx.lineTo(cx, cy); ctx.stroke();
	                rLastP = { x: cx, y: cy };
	            }
	        }
	        x1 = tx2; y1 = ty2;
	    }

	    // ===================================================================
	    // --- 2. FIBRES DE LA BRANCHE PRINCIPALE ---
	    // ===================================================================
	    const sStartAnimated = w2s(x1, y1);
	    const numFibers = known ? 50 : 10;
	    for (let i = 0; i < numFibers; i++) {
	        const sideSeed = side === 'R' ? 1000 : 2000;
	        const seed = (person ? person.id.length : 1) + i + depth + sideSeed;
	        const lengthVar = length * (0.8 + stableRandom(seed + 5) * 0.4);
	        const fX2_base = x1 + Math.cos(animatedAngle) * lengthVar;
	        const fY2_base = y1 + Math.sin(animatedAngle) * lengthVar;
	        const inversion = (depth % 2 === 0) ? -1 : 1;
	        const bendDir = (side === 'R' ? -Math.PI / 2 : Math.PI / 2) * inversion;
	        const midX = x1 + Math.cos(animatedAngle) * lengthVar * 0.5;
	        const midY = y1 + Math.sin(animatedAngle) * lengthVar * 0.5;
	        const fCpX = midX + Math.cos(animatedAngle + bendDir) * (lengthVar * P.curvature) + (stableRandom(seed)-0.5)*15*P.curvature;
	        const fCpY = midY + Math.sin(animatedAngle + bendDir) * (lengthVar * P.curvature) + (stableRandom(seed)-0.5)*15*P.curvature;
	        const shiftFinal = (stableRandom(seed + 1) - 0.5) * width * 3.5;
	        const fX2 = fX2_base + Math.cos(animatedAngle + Math.PI/2) * shiftFinal;
	        const fY2 = fY2_base + Math.sin(animatedAngle + Math.PI/2) * shiftFinal;

	        const sEnd = w2s(fX2, fY2);
	        const scp = w2s(fCpX, fCpY);
	        let lastPoint = { x: sStartAnimated.x, y: sStartAnimated.y };
	        for (let t_step = 1; t_step <= 12; t_step++) {
	            const t = t_step / 12;
	            const currX = (1-t)**2 * sStartAnimated.x + 2*(1-t)*t * scp.x + t**2 * sEnd.x;
	            const currY = (1-t)**2 * sStartAnimated.y + 2*(1-t)*t * scp.y + t**2 * sEnd.y;
	            ctx.beginPath();
	            ctx.lineWidth = (width * 0.8) * cam.scale * Math.max(0.1, (1 - t * 0.9));
	            ctx.globalAlpha = baseAlpha * (0.6 + stableRandom(seed + 3) * 0.4) * (1 - t * 0.4);
	            ctx.strokeStyle = col;
	            ctx.moveTo(lastPoint.x, lastPoint.y); ctx.lineTo(currX, currY); ctx.stroke();
	            lastPoint = { x: currX, y: currY };
	        }
	    }
	    ctx.restore();

	    // ===================================================================
	    // --- 3. LE PALIER DE LA FRATRIE (CONCAVE & EFFILOCHÉ) ---
	    // ===================================================================
	    const x2_logic = x1 + Math.cos(animatedAngle) * length;
	    const y2_logic = y1 + Math.sin(animatedAngle) * length;
	    let recursionX = x2_logic;
	    let recursionY = y2_logic;

	    if (known) {
	        const father = DB.people[person.fatherId];
	        const siblingsIds = (father && father.children) ? father.children : [person.id];
	        const sibSpacing = 35 * cam.scale;
	        const mainIdx = siblingsIds.indexOf(id);
	        const rackWidth = (siblingsIds.length - 1) * sibSpacing;
	        
	        const startX = x2_logic - (mainIdx * sibSpacing) / cam.scale;
	        const endX = startX + rackWidth / cam.scale;
	        const lightCurveOffset = 4 / cam.scale; 
	        
	        const pL = { x: startX, y: y2_logic };
	        const pR = { x: endX, y: y2_logic };
	        const pC = { x: (startX + endX) / 2, y: y2_logic + lightCurveOffset };

	        // --- 1. LE TRAIT DU RÂTEAU (Seulement si plusieurs enfants) ---
	        if (siblingsIds.length > 1) {
	            ctx.beginPath();
	            ctx.lineWidth = (width * 0.15) * cam.scale;
	            ctx.strokeStyle = col;
	            ctx.globalAlpha = baseAlpha * 0.8;
	            let pPrev = w2s(pL.x, pL.y);
	            for (let s = 1; s <= 10; s++) {
	                const t = s / 10;
	                const pLogic = getSimpleArcPoint(t, pL, pC, pR);
	                const sPos = w2s(pLogic.x, pLogic.y);
	                ctx.lineTo(sPos.x, sPos.y); // Plus simple que moveTo/lineTo à chaque fois
	                pPrev = sPos;
	            }
	            ctx.stroke();
	        }

	        // --- 2. DESSIN DES NOEUDS (Pour chaque membre de la fratrie) ---
	        siblingsIds.forEach((sid, idx) => {
	            const tNode = siblingsIds.length > 1 ? idx / (siblingsIds.length - 1) : 0.5;
	            const pNodeBase = getSimpleArcPoint(tNode, pL, pC, pR);
	            const sNodeBottom = w2s(pNodeBase.x, pNodeBase.y);
	            
	            // LA LOGIQUE DE LA TIGE : Uniquement si fratrie > 1
	            let finalNodePos = sNodeBottom;
	            if (siblingsIds.length > 1) {
	                const sNodeTop = { x: sNodeBottom.x, y: sNodeBottom.y + 12 * cam.scale };
	                ctx.beginPath();
	                ctx.lineWidth = 1 * cam.scale;
	                ctx.globalAlpha = baseAlpha * 0.5;
	                ctx.moveTo(sNodeBottom.x, sNodeBottom.y);
	                ctx.lineTo(sNodeTop.x, sNodeTop.y);
	                ctx.stroke();
	                finalNodePos = sNodeTop; // Le cercle sera en haut de la tige
	            }

	            // LE CERCLE (Toujours dessiné)
	            ctx.beginPath();
	            ctx.globalAlpha = baseAlpha * 2.0; // Plus opaque pour être visible
	            ctx.arc(finalNodePos.x, finalNodePos.y, Math.max(4, P.nodeSize || 4), 0, Math.PI * 2);
	            ctx.fillStyle = col;
	            ctx.fill();
	            ctx.strokeStyle = col;
	            ctx.lineWidth = 1 * cam.scale;
	            ctx.stroke();

	            // Zone cliquable
	            hits.push({ 
	                id: sid, 
	                wx: pNodeBase.x, 
	                wy: pNodeBase.y + (siblingsIds.length > 1 ? 12 / cam.scale : 0), 
	                r: 15 
	            });
	        });

	        recursionX = pC.x;
	        recursionY = pC.y;
	    }

	    // ===================================================================
	    // --- 4. RÉCURSION ---
	    // ===================================================================
	    if (!known || depth > 10) return;
	    const nextLen = length * P.branchDecay;
	    const nextW = width * P.widthDecay;
	    if (nextLen < 5) return;
	    const spread = P.forkSpread * (1 + depth * 0.05);
	    drawAntler(person.fatherId, recursionX, recursionY, animatedAngle + spread * 0.5, nextLen, nextW, depth + 1, side);
	    drawAntler(person.motherId, recursionX, recursionY, animatedAngle - spread * 0.5, nextLen, nextW, depth + 1, side);
	}
	/**
	 * Fonction helper pour dessiner les enfants et leurs propres descendants
	 * sous forme de pics vers le bas.
	 */
	function drawChildrenNodes(children, px, py, pLen, pW, pAlpha, col, parentId, level = 1) {
		children.forEach((child, i) => {
			const angleSpread = 0.8;
			// L'angle est basé sur le bas (Math.PI / 2)
			const angle = (Math.PI / 2) + (i - (children.length - 1) / 2) * (angleSpread / Math.max(1, children.length - 1));
			
			const cLen = pLen * (0.3 / level); 
			const cx = px + Math.cos(angle) * cLen;
			const cy = py + Math.sin(angle) * cLen;
			
			const sStart = w2s(px, py);
			const numChildFibers = 24;

			ctx.save();
			for (let j = 0; j < numChildFibers; j++) {
				const cSeed = parentId.length + i + j + level * 50;
				// Éparpillement à l'arrivée uniquement
				const cOffX = (stableRandom(cSeed) - 0.5) * (pW * 2.0);
				const cOffY = (stableRandom(cSeed + 1) - 0.5) * (pW * 2.0);
				const sEnd = w2s(cx + cOffX, cy + cOffY);

				const steps = 16;
				let lastP = { x: sStart.x, y: sStart.y };
				const baseW = (pW * 0.4 / level) * cam.scale;

				for (let t_step = 1; t_step <= steps; t_step++) {
					const t = t_step / steps;
					const currX = sStart.x + (sEnd.x - sStart.x) * t;
					const currY = sStart.y + (sEnd.y - sStart.y) * t;

					ctx.beginPath();
					ctx.lineWidth = baseW * (1 - t * 0.8); // Effilage
					ctx.globalAlpha = pAlpha * 0.4 * (1 - t * 0.3);
					ctx.strokeStyle = col;
					ctx.moveTo(lastP.x, lastP.y);
					ctx.lineTo(currX, currY);
					ctx.stroke();
					lastP = { x: currX, y: currY };
				}
			}
			ctx.restore();

			// Petit nœud de l'enfant
			const sNode = w2s(cx, cy);
			const cR = (1.2 / level) * cam.scale;
			ctx.beginPath();
			ctx.arc(sNode.x, sNode.y, cR, 0, Math.PI * 2);
			ctx.fillStyle = col;
			ctx.fill();

			if (child.children && child.children.length > 0) {
					drawChildrenNodes(child.children, cx, cy, cLen, pW, pAlpha, col, `${parentId}_${i}`, level + 1);
			}
		});
	}

	function drawSiblingsAndouillers(siblingsIds, px, py, angle, length, width, baseAlpha, col) {
	    if (!siblingsIds || siblingsIds.length === 0) return;

	    const numSiblings = siblingsIds.length;
	    // On espace les andouillers le long de la branche parente
	    const stepLength = length / (numSiblings + 1); 
	    const andouillerLength = 15; // Longueur de la pointe (le frère/sœur)
	    const andouillerWidth = width * 0.4;

	    siblingsIds.forEach((siblingId, index) => {
	        // Position le long de la branche
	        const distAlong = stepLength * (index + 1);
	        const attachX = px + Math.cos(angle) * distAlong;
	        const attachY = py + Math.sin(angle) * distAlong;

	        // Angle perpendiculaire à la branche pour la pointe
	        // On alterne gauche/droite pour l'esthétique
	        const sideAngle = (index % 2 === 0) ? angle - Math.PI/2 : angle + Math.PI/2;
	        
	        const endX = attachX + Math.cos(sideAngle) * andouillerLength;
	        const endY = attachY + Math.sin(sideAngle) * andouillerLength;

	        // 1. Dessin de l'andouiller (fibres fines)
	        ctx.beginPath();
	        ctx.lineWidth = andouillerWidth * cam.scale;
	        ctx.strokeStyle = col;
	        ctx.globalAlpha = baseAlpha * 0.7; // Un peu plus discret
	        ctx.moveTo(w2s(attachX, attachY).x, w2s(attachX, attachY).y);
	        ctx.lineTo(w2s(endX, endY).x, w2s(endX, endY).y);
	        ctx.stroke();

	        // 2. Le point final de la fratrie
	        const radius = 3 * cam.scale;
	        ctx.beginPath();
	        ctx.arc(w2s(endX, endY).x, w2s(endX, endY).y, radius, 0, Math.PI * 2);
	        ctx.fillStyle = col;
	        ctx.fill();

	        // Zone de clic pour le frère/sœur
	        hits.push({ id: siblingId, wx: endX, wy: endY, r: 15 });
	    });
	}

	function drawSiblingsRack(person, px, py, width, col, baseAlpha) {
    // On récupère tous les enfants des parents de 'person' pour avoir la fratrie complète
    const father = DB.people[person.fatherId];
    const siblingsIds = father ? father.children : [person.id]; 
    
    const num = siblingsIds.length;
    const spacing = 40; // Espace entre frères/sœurs
    const rackW = (num - 1) * spacing;
    const startX = px - rackW / 2;
    const rackY = py - 20; // Hauteur du palier

    // 1. Barre horizontale
    ctx.beginPath();
    ctx.lineWidth = (width * 0.5) * cam.scale;
    ctx.strokeStyle = col;
    ctx.globalAlpha = baseAlpha;
    const sLeft = w2s(startX, rackY);
    const sRight = w2s(startX + rackW, rackY);
    ctx.moveTo(sLeft.x, sLeft.y);
    ctx.lineTo(sRight.x, sRight.y);
    ctx.stroke();

    // 2. Tiges verticales et nœuds pour chaque membre
    siblingsIds.forEach((sid, i) => {
        const x = startX + i * spacing;
        const sBottom = w2s(x, rackY);
        const sTop = w2s(x, rackY - 10);

        ctx.beginPath();
        ctx.lineWidth = (width * 0.3) * cam.scale;
        ctx.moveTo(sBottom.x, sBottom.y);
        ctx.lineTo(sTop.x, sTop.y);
        ctx.stroke();

        // Nœud de la personne (cercle)
        ctx.beginPath();
        ctx.arc(sTop.x, sTop.y, 5 * cam.scale, 0, Math.PI * 2);
        ctx.fillStyle = (sid === person.id) ? col : "#FFF"; // On surligne l'ancêtre direct
        ctx.fill();
        ctx.stroke();

        hits.push({ id: sid, wx: x, wy: rackY - 10, r: 15 });
    });

    return { centerX: px, centerY: rackY }; // On repart du milieu du râteau pour les parents
}

	function drawTrunk(x1, y1, x2, y2, width, col) {
	const numFibers = 40;
	const angle = Math.atan2(y2 - y1, x2 - x1);
	const sc = cam.scale;

	ctx.save();
	ctx.lineCap = 'round';

	for (let i = 0; i < numFibers; i++) {
		const seed = i + (x1 > 0 ? 5000 : 10000);
		
		const wander = Math.sin(i * 0.5) * (width * 0.4); 
		const shiftStart = ((stableRandom(seed) - 0.5) * width * 2.5) + wander;
		const shiftEnd = (stableRandom(seed + 1) - 0.5) * width * 1.5;

		const midX = (x1 + x2) * 0.5;
		const midY = (y1 + y2) * 0.5;
		const curveAmp = width * 1.2;
		const cpX = midX + Math.cos(angle + Math.PI/2) * ((stableRandom(seed + 2) - 0.5) * curveAmp);
		const cpY = midY + Math.sin(angle + Math.PI/2) * ((stableRandom(seed + 2) - 0.5) * curveAmp);

		const sStart = w2s(
			x1 + Math.cos(angle + Math.PI/2) * shiftStart,
			y1 + Math.sin(angle + Math.PI/2) * shiftStart
		);
		const sEnd = w2s(
			x2 + Math.cos(angle + Math.PI/2) * shiftEnd,
			y2 + Math.sin(angle + Math.PI/2) * shiftEnd
		);
		const sCP = w2s(cpX, cpY);

		const steps = 14; // Augmenté légèrement pour plus de fluidité
		let lp = { x: sStart.x, y: sStart.y };
		
		for (let t_step = 1; t_step <= steps; t_step++) {
			const t = t_step / steps; // t va de 0 à 1
			const cx = (1 - t) * (1 - t) * sStart.x + 2 * (1 - t) * t * sCP.x + t * t * sEnd.x;
			const cy = (1 - t) * (1 - t) * sStart.y + 2 * (1 - t) * t * sCP.y + t * t * sEnd.y;

			ctx.beginPath();
			
			// --- MODIFICATION ICI : ALPHA PROGRESSIF ---
			// t = 0 (crâne) -> alpha proche de 0
			// t = 1 (jonction bois) -> alpha maximum (1.0)
			const rampUp = t; // Progression linéaire
			// On multiplie par un facteur aléatoire pour garder l'aspect fibreux
			ctx.globalAlpha = (0.1 + stableRandom(seed + 3) * 0.5) * rampUp;
			
			// On épaissit un peu la ligne pour éviter le côté "fil de fer"
			ctx.lineWidth = (width * 0.12) * sc; 
			ctx.strokeStyle = col;
			
			ctx.moveTo(lp.x, lp.y);
			ctx.lineTo(cx, cy);
			ctx.stroke();
			lp = { x: cx, y: cy };
		}
	}
	ctx.restore();
	}

	// ══════════════════════════════════════════════════════
	// DESSIN DU VISAGE HUMAIN (stylisé, silhouette)
	// ══════════════════════════════════════════════════════
	function drawFace() {
	    const o = w2s(0, 0);  // Centre du monde (le front/visage)
	    const sc = cam.scale;

	    if (userImage) {
	        ctx.save();
        
	        // 0. SÉCURITÉ : On s'assure d'être en mode de dessin normal
	        ctx.globalCompositeOperation = 'source-over';
	        ctx.globalAlpha = 1.0;

	        // 1. Masque elliptique
	        ctx.beginPath();
	        ctx.ellipse(o.x, o.y, P.faceW * sc, P.faceH * sc, 0, 0, Math.PI * 2);
	        ctx.clip();
	        
	        const aspect = userImage.width / userImage.height;
	        const baseH = P.faceH * 2.2 * sc;
	        const baseW = baseH * aspect;

	        const drawX = o.x - (baseW / 2) + (imgTransform.x * sc);
	        const drawY = o.y - (baseH / 2) + (imgTransform.y * sc);
	        const drawW = baseW * imgTransform.scale;
	        const drawH = baseH * imgTransform.scale;

	        // 2. DESSIN DE L'IMAGE DE BASE
	        ctx.drawImage(userImage, drawX, drawY, drawW, drawH);
	        
	        // 3. PASSAGE EN NOIR ET BLANC (Mode 'color')
	        // On dessine un rectangle gris par-dessus avec le mode 'color'
	        // Ce mode conserve la luminosité de l'image mais prend la couleur du rectangle
	        ctx.globalCompositeOperation = 'color';
	        ctx.fillStyle = "#888888"; 
	        ctx.fillRect(drawX - 5, drawY - 5, drawW + 10, drawH + 10);
	        
	        // 4. AJUSTEMENT DU CONTRASTE (Mode 'multiply')
	        // Pour éviter l'aspect "délavé" et rendre les noirs plus profonds
	        ctx.globalCompositeOperation = 'multiply';
	        ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
	        ctx.fillRect(drawX - 5, drawY - 5, drawW + 10, drawH + 10);

	        // 5. RÉINITIALISATION FINALE
	        ctx.globalCompositeOperation = 'source-over';
	        ctx.restore();
	    } else {
	        // Lueur douce derrière le visage
			const grd = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, P.faceH * 1.4 * sc);
			grd.addColorStop(0,   'rgba(200,160,60,0.10)');
			grd.addColorStop(0.5, 'rgba(180,130,40,0.04)');
			grd.addColorStop(1,   'rgba(0,0,0,0)');
			ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);

			// ── Silhouette du visage (ovale + mâchoire)
			ctx.save();
			ctx.beginPath();
			// Ovale cranien
			ctx.ellipse(o.x, o.y - 10*sc, P.faceW*sc, P.faceH*sc, 0, Math.PI, 0);
			// Mâchoire (légèrement pointue)
			ctx.bezierCurveTo(
				o.x + P.faceW*sc, o.y + P.faceH*0.4*sc,
				o.x + P.faceW*0.35*sc, o.y + P.faceH*0.98*sc,
				o.x, o.y + P.faceH*sc
			);
			ctx.bezierCurveTo(
				o.x - P.faceW*0.35*sc, o.y + P.faceH*0.98*sc,
				o.x - P.faceW*sc, o.y + P.faceH*0.4*sc,
				o.x - P.faceW*sc, o.y - 10*sc
			);
			ctx.closePath();
			ctx.fillStyle = 'rgba(16,12,6,0.82)';
			ctx.fill();
			ctx.strokeStyle = P.colFaceStroke;
			ctx.lineWidth = 1.5 * sc;
			ctx.globalAlpha = 0.55;
			ctx.stroke();
			ctx.restore();

			// ── Yeux (amandes stylisées)
			[[-1, 1]].forEach(() => {
				[-1, 1].forEach(side => {
					const ex = o.x + side * P.eyeOffX * sc;
					const ey = o.y + P.eyeOffY * sc;
					ctx.save();
					ctx.beginPath();
					ctx.ellipse(ex, ey, 10*sc, 5*sc, 0, 0, Math.PI*2);
					ctx.fillStyle = '#0a0806';
					ctx.globalAlpha = 0.9;
					ctx.fill();
					// Iris
					ctx.beginPath();
					ctx.arc(ex, ey, 4*sc, 0, Math.PI*2);
					ctx.fillStyle = side === 1 ? '#8a6020' : '#607040';
					ctx.globalAlpha = 0.8;
					ctx.fill();
					// Reflet
					ctx.beginPath();
					ctx.arc(ex - 1.5*sc, ey - 1.5*sc, 1.2*sc, 0, Math.PI*2);
					ctx.fillStyle = '#ffffff';
					ctx.globalAlpha = 0.4;
					ctx.fill();
					ctx.restore();
				});
			});

			// ── Nez (simple arête)
			ctx.save();
			ctx.beginPath();
			ctx.moveTo(o.x, o.y + P.eyeOffY * sc * 0.5);
			ctx.quadraticCurveTo(o.x + 6*sc, o.y + P.noseLen*sc*0.5, o.x + 4*sc, o.y + P.noseLen*sc);
			ctx.moveTo(o.x, o.y + P.eyeOffY * sc * 0.5);
			ctx.quadraticCurveTo(o.x - 6*sc, o.y + P.noseLen*sc*0.5, o.x - 4*sc, o.y + P.noseLen*sc);
			ctx.strokeStyle = P.colFaceStroke;
			ctx.lineWidth = 1.2 * sc;
			ctx.lineCap = 'round';
			ctx.globalAlpha = 0.45;
			ctx.stroke();
			ctx.restore();

			// ── Bouche (légère courbe)
			ctx.save();
			ctx.beginPath();
			ctx.moveTo(o.x - 18*sc, o.y + 42*sc);
			ctx.quadraticCurveTo(o.x, o.y + 50*sc, o.x + 18*sc, o.y + 42*sc);
			ctx.strokeStyle = P.colFaceStroke;
			ctx.lineWidth = 1.2 * sc;
			ctx.lineCap = 'round';
			ctx.globalAlpha = 0.4;
			ctx.stroke();
			ctx.restore();
	    }
	}

	// ══════════════════════════════════════════════════════
	// RENDU PRINCIPAL
	// ══════════════════════════════════════════════════════
	function render() {
		// 1. SÉCURITÉ : Si les données ne sont pas chargées, on affiche un message ou on attend
		if (!DB || !DB.people || !DB.ego) {
			ctx.fillStyle = "#000";
			ctx.fillRect(0, 0, W, H);
			ctx.fillStyle = "#FFF";
			ctx.fillText("Chargement des racines...", W/2, H/2);
			return; 
		}

		ctx.clearRect(0, 0, W, H);

		// Fond
		const bg = ctx.createLinearGradient(0, 0, 0, H);
		bg.addColorStop(0, '#08090a'); bg.addColorStop(1, '#0d0d08');
		ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

		hits = [];  // reset hit-test

		// ── Visage
		drawFace();

		// ── Points d'attache
		const attachR = { x:  P.faceW * 0.5, y: -P.faceH * 0.55 };
		const attachL = { x: -P.faceW * 0.5, y: -P.faceH * 0.55 };

		// Récupération de l'individu racine (Matthieu Vincent)
		const egoId = DB.ego;
		const egoData = DB.people[egoId];

		if (egoData) {
			// Paramètres du socle osseux osseux
			const baseTrunkLen = 30; // Longueur du petit socle
			const baseTrunkW = P.trunkW * 1.1; // Un peu plus épais à la base

			// --- CÔTÉ DROIT (Paternel) ---
			if (egoData.fatherId) {
				// 1. CALCULS : Nous utilisons UN SEUL angle pour le socle ET la ramure
				const angleR = -Math.PI / 2 + (P.forkSpread * 0.5);
				// 3. DESSIN DE LA RAMURE (La rosette y est ajoutée)
				drawAntler(egoData.fatherId, attachR.x, attachR.y, angleR, P.baseLen * P.branchDecay, P.trunkW, 0, 'R');
			}

			// --- CÔTÉ GAUCHE (Maternel) ---
			if (egoData.motherId) {
				const angleL = -Math.PI / 2 - (P.forkSpread * 0.5);
				drawAntler(egoData.motherId, attachL.x, attachL.y, angleL, P.baseLen * P.branchDecay, P.trunkW, 0, 'L');
			}
			
			// ── Label ego au centre
			if (cam.scale > 0.45) {
				const o = w2s(0, 100);
				ctx.save();
				ctx.fillStyle   = '#e8d078';
				ctx.font        = `italic ${Math.max(11, 13 * cam.scale)}px Georgia, serif`;
				ctx.textAlign   = 'center';
				ctx.textBaseline = 'middle';
				ctx.globalAlpha = 0.85;
				ctx.fillText(egoData.name || 'Ego', o.x, o.y + P.faceH * cam.scale * 0.5);
				ctx.restore();
			}
			
		}

		animT += 0.01;
	}

	// ══════════════════════════════════════════════════════
	// HIT TEST
	// ══════════════════════════════════════════════════════
	function hitTest(ex, ey) {
		const w = s2w(ex, ey);
		for (const h of hits) {
			if (!h.id) continue;
			if (Math.hypot(w.x - h.wx, w.y - h.wy) < h.r + 6) return h.id;
		}
		return null;
	}

	function showPanel(id) {
		const panel = document.getElementById('panel');
		if (!id) { panel.style.display = 'none'; return; }

		let name = "", dates = "", genText = "";

		if (id.startsWith('child_')) {
			const parts = id.split('_'); // [child, parentId, index]
			const parent = DB.people[parts[1]];
			const child = parent.children[parts[2]];
			name = child.name;
			genText = `Enfant de ${parent.name}`;
		} else if (DB.people[id]) {
			const p = DB.people[id];
			name = p.name;
			dates = `${p.birth || ''} ${p.death ? '† ' + p.death : ''}`;
			genText = `Génération -${getGen(id)}`;
		}

		document.getElementById('p-name').textContent = name;
		document.getElementById('p-dates').textContent = dates;
		document.getElementById('p-gen').textContent = genText;
		panel.style.display = 'block';
	}

	function getGen(id, from=DB.ego, depth=0) {
		if (from === id) return depth;
		const p = DB.people[from];
		if (!p) return null;
		const vf = p.fatherId ? getGen(id, p.fatherId, depth+1) : null;
		const vm = p.motherId ? getGen(id, p.motherId, depth+1) : null;
		return vf !== null ? vf : vm;
	}

	

	// ══════════════════════════════════════════════════════
	// INTERACTIONS
	// ══════════════════════════════════════════════════════
	function bindEvents() {
		const btnPhoto = document.getElementById('btn-mode-photo');
		// Toggle du bouton
	    if (btnPhoto) {
		    btnPhoto.addEventListener('click', async () => {
		        isPhotoMode = !isPhotoMode;
		        
		        if (!isPhotoMode) {
		            // ON VIENT DE PASSER SUR OFF : On enregistre enfin
		            console.log("Fin d'édition : sauvegarde des réglages...");
		            await saveImageSettings(); 
		            btnPhoto.innerHTML = "🖼️ Ajuster la photo : OFF";
		            btnPhoto.classList.remove('active');
		        } else {
		            // ON VIENT D'ACTIVER LE MODE
		            btnPhoto.innerHTML = "✅ Valider le placement";
		            btnPhoto.classList.add('active');
		        }
		        
		        canvas.style.cursor = isPhotoMode ? 'move' : 'grab';
		    });
		}
		canvas.addEventListener('mousedown', e => {
	        drag.on = true; 
	        drag.sx = e.clientX; 
	        drag.sy = e.clientY;
	        
	        // Si Shift est enfoncé, on bouge l'image
	        isTransformingImg = isPhotoMode; 
	        
	        drag.cx = isTransformingImg ? imgTransform.x : cam.x;
	        drag.cy = isTransformingImg ? imgTransform.y : cam.y;
	    });

	    canvas.addEventListener('mousemove', e => {
	        if (drag.on) {
	            const dx = (e.clientX - drag.sx) / cam.scale;
	            const dy = (e.clientY - drag.sy) / cam.scale;

	            if (isTransformingImg) {
	                imgTransform.x = drag.cx + dx;
	                imgTransform.y = drag.cy + dy;
	            } else {
	                cam.x = drag.cx + dx;
	                cam.y = drag.cy + dy;
	            }
	        } else {
	            hover = hitTest(e.clientX, e.clientY);
	            canvas.style.cursor = hover ? 'pointer' : (isPhotoMode ? 'move' : 'grab');
	        }
	    });
		canvas.addEventListener('mouseup', e => {
		    const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
		    drag.on = false;
		    // On ne reset pas isTransformingImg ici car on attend le bouton OFF
		    if (moved < 5) { 
		        sel = hitTest(e.clientX, e.clientY); 
		        showPanel(sel); 
		    }
		});
		canvas.addEventListener('wheel', e => {
		    e.preventDefault();
		    if (e.shiftKey || isPhotoMode) {
		        const delta = e.deltaY < 0 ? 1.05 : 0.95;
		        imgTransform.scale = Math.min(5, Math.max(0.2, imgTransform.scale * delta));
		    } else {
		        cam.scale = Math.min(4, Math.max(0.12, cam.scale * (e.deltaY < 0 ? 1.1 : 0.91)));
		    }
		}, { passive: false });
		let td=0;
		canvas.addEventListener('touchstart', e => {
			if (e.touches.length===1) { drag.on=true; drag.sx=e.touches[0].clientX; drag.sy=e.touches[0].clientY; drag.cx=cam.x; drag.cy=cam.y; }
			else if (e.touches.length===2) { drag.on=false; td=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY); }
		});
		canvas.addEventListener('touchmove', e => {
		    e.preventDefault();
		    if (e.touches.length === 1 && drag.on) {
		        // Calcul du déplacement
		        const dx = (e.touches[0].clientX - drag.sx) / cam.scale;
		        const dy = (e.touches[0].clientY - drag.sy) / cam.scale;

		        if (isPhotoMode) {
		            // Déplace la photo si le bouton mode édition est ON
		            imgTransform.x = drag.cx + dx;
		            imgTransform.y = drag.cy + dy;
		        } else {
		            // Déplace la scène par défaut
		            cam.x = drag.cx + dx;
		            cam.y = drag.cy + dy;
		        }
		    }
		    else if (e.touches.length === 2) { 
		        // Pinch-to-zoom (Inchangé, zoome la scène globale)
		        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); 
		        cam.scale = Math.min(4, Math.max(0.12, cam.scale * d / td)); 
		        td = d; 
		    }
		}, { passive: false });
		canvas.addEventListener('touchend', async () => { 
		    if (drag.on && isPhotoMode) {
		        await saveImageSettings();
		    }
		    drag.on = false; 
		});
		window.addEventListener('resize', resize);

		// Nouveaux écouteurs pour les contrôles
		document.getElementById('slider-spread').addEventListener('input', (e) => { P.forkSpread = parseFloat(e.target.value); });
		document.getElementById('slider-decay').addEventListener('input', (e) => { P.branchDecay = parseFloat(e.target.value); });
		document.getElementById('color-right').addEventListener('input', (e) => { P.colBoneR = e.target.value; });
		document.getElementById('color-left').addEventListener('input', (e) => { P.colBoneL = e.target.value; });
		document.getElementById('slider-baselen').addEventListener('input', (e) => { P.baseLen = parseFloat(e.target.value); });
		document.getElementById('slider-width').addEventListener('input', (e) => { P.trunkW = parseFloat(e.target.value); });
		document.getElementById('slider-curvature').addEventListener('input', (e) => { P.curvature = parseFloat(e.target.value); });
		document.getElementById('slider-speed').addEventListener('input', (e) => { P.oscSpeed = parseFloat(e.target.value); });
		document.getElementById('btn-random-theme').addEventListener('click', () => { applyRandomTheme(); });
		document.getElementById('btn-save-all').addEventListener('click', saveFullTree);
	}

	// ══════════════════════════════════════════════════════
	// API PUBLIQUE
	// ══════════════════════════════════════════════════════
	async function saveImageSettings() {
	    const urlParams = new URLSearchParams(window.location.search);
	    const userId = urlParams.get('u');

	    if (userId && DB.people[DB.ego]) {
	        // 1. Mettre à jour l'objet local
	        DB.people[DB.ego].imgSettings = { ...imgTransform };

	        // 2. Envoyer la version complète du JSON au cloud
	        try {
	            await db_save(userId, DB);
	            console.log("Réglages photo synchronisés avec le Cloud.");
	        } catch (err) {
	            console.error("Erreur lors de la sauvegarde auto :", err);
	        }
	    }
	}
	async function saveFullTree() {
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('u');

    if (!userId) {
        alert("Identifiant utilisateur introuvable. Impossible de sauvegarder.");
        return;
    }

    // 1. On injecte les paramètres actuels des bois dans le JSON
    // On crée une copie propre de P pour éviter les références circulaires
    DB.people[DB.ego].treeSettings = { ...P };
    
    // 2. On s'assure que les derniers réglages de la photo sont aussi là
    DB.people[DB.ego].imgSettings = { ...imgTransform };

    // 3. Envoi massif à Supabase
    try {
        const btn = document.getElementById('btn-save-all');
        if(btn) btn.innerHTML = "⌛ Sauvegarde...";
        
        await db_save(userId, DB);
        
        console.log("Arbre et photo sauvegardés avec succès !");
        if(btn) {
            btn.innerHTML = "✅ Sauvegardé !";
            setTimeout(() => btn.innerHTML = "💾 Sauvegarder mon Arbre", 2000);
        }
    } catch (err) {
        console.error("Erreur de sauvegarde :", err);
        alert("Erreur lors de la communication avec le cloud.");
    }
	}
	function goToEdit() {
		const urlParams = new URLSearchParams(window.location.search);
		const userId = urlParams.get('u');
		if (userId) window.location.href = `edit.html?u=${userId}`;
		else 		window.location.href = `edit.html`;
	}
	async function handleImage(input) {
		if (input.files && input.files[0]) {
			const file = input.files[0];
			const urlParams = new URLSearchParams(window.location.search);
			const userId = urlParams.get('u');

			// 1. Affichage immédiat pour l'utilisateur (Local)
			const reader = new FileReader();
			reader.onload = (e) => {
				const img = new Image();
				img.onload = () => { userImage = img; };
				img.crossOrigin = "Anonymous";
				img.src = e.target.result;
			};
			reader.readAsDataURL(file);

			// 2. Envoi sur Supabase (Cloud)
			console.log("Envoi de la photo sur le cloud...");
			const publicUrl = await db_upload_image(userId, file);

			if (publicUrl) {
				// 3. On enregistre l'URL dans les données de l'Ego
				DB.people[DB.ego].photoUrl = publicUrl;
				DB.people[DB.ego].imgSettings = imgTransform;
				// 4. On sauvegarde tout le JSON pour que le lien soit définitif
				await db_save(userId, DB); 
				console.log("Photo enregistrée et liée à l'Ego !");
			}
		}
	}
	function resize() { W=canvas.width=window.innerWidth; H=canvas.height=window.innerHeight; }
	function resetView() { cam = { x:0, y:40, scale:0.92 }; }

	// Ajouter ou mettre à jour un individu à la volée
	// Ex : Chimere.addPerson({ id:'ggf1', name:'Louis Durand', birth:1860, fatherId:null, motherId:null })
	//      puis relier : Chimere.DB.people['fff1'].fatherId = 'ggf1'
	function addPerson(person) { DB.people[person.id] = person; }
	function rebuild() { /* le rendu est continu, rien à reconstruire */ }

	function exportPNG() {
		const a = document.createElement('a');
		a.download = 'chimere-genealogique.png';
		a.href = canvas.toDataURL('image/png'); a.click();
	}

	function loop() { render(); requestAnimationFrame(loop); }
	async function init() {
	    const urlParams = new URLSearchParams(window.location.search);
	    // On utilise UNE SEULE variable cohérente pour toute la fonction
	    let userId = urlParams.get('u'); 
	    const btnEdit = document.getElementById('btn-edit');

	    if (userId) {
	        console.log("Tentative de chargement Cloud pour :", userId);
	        const cloudData = await db_load(userId);
	        
	        if (cloudData) {
	            DB = cloudData;
	            isDataLoaded = true;
	            console.log("Données Cloud chargées.");

	            const ego = DB.people[DB.ego];
	            
	            // --- Restauration des réglages des bois ---
	            if (ego && ego.treeSettings) {
	                Object.assign(P, ego.treeSettings);
	                
	                // Mise à jour visuelle des sliders
	                if(document.getElementById('slider-spread')) document.getElementById('slider-spread').value = P.forkSpread;
	                if(document.getElementById('slider-decay')) document.getElementById('slider-decay').value = P.branchDecay;
	                if(document.getElementById('slider-baselen')) document.getElementById('slider-baselen').value = P.baseLen;
	                if(document.getElementById('slider-width')) document.getElementById('slider-width').value = P.trunkW;
	                if(document.getElementById('slider-curvature')) document.getElementById('slider-curvature').value = P.curvature;
	                if(document.getElementById('slider-speed')) document.getElementById('slider-speed').value = P.oscSpeed;
	                if(document.getElementById('color-right')) document.getElementById('color-right').value = P.colBoneR;
	                if(document.getElementById('color-left')) document.getElementById('color-left').value = P.colBoneL;
	            }

	            // --- CHARGEMENT DE LA PHOTO ---
	            if (ego && ego.photoUrl) {
	                const img = new Image();
	                img.crossOrigin = "anonymous";
	                img.onload = () => { userImage = img; };
	                img.src = ego.photoUrl;
	            }
	            if (ego && ego.imgSettings) imgTransform = ego.imgSettings;

	        } else {
	            console.warn("Utilisateur inconnu, chargement du local.");
	            await loadData('./datatrees/genealogie.json');
	        }
	        if (btnEdit) btnEdit.innerHTML = "✎ Modifier mon arbre";

	    } else {
	        // --- CAS CHIMÈRE ---
	        const randomNumber = Math.floor(1000 + Math.random() * 9000);
	        userId = `chime-${randomNumber}`; // On remplit userId ici aussi

	        urlParams.set('u', userId);
	        const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
	        window.history.replaceState({}, '', newUrl);
	        
	        console.log("Nouvelle entité générée :", userId);

	        if (btnEdit) btnEdit.innerHTML = "✨ Créer mon arbre";
	        await loadData('./datatrees/genealogie.json');
	    }

	    // --- SÉCURITÉ : On s'assure que l'ID existe dans DB.people ---
	    // On utilise userId qui est maintenant défini dans tous les cas
	    if (DB && DB.people && !DB.people[userId]) {
	        DB.people[userId] = {
	            id: userId,
	            name: userId.charAt(0).toUpperCase() + userId.slice(1),
	            fatherId: null,
	            motherId: null,
	            children: []
	        };
	        // Si c'est une nouvelle chimère, on définit souvent cet ID comme l'ego (racine)
	        if (!DB.ego) DB.ego = userId; 
	    }

	    // --- INITIALISATION CANVAS ---
	    canvas = document.getElementById('c');
	    if (!canvas) return;
	    ctx = canvas.getContext('2d');
	    
	    resize();
	    resetView();
	    bindEvents();
	    requestAnimationFrame(loop);
	}

	return { init, handleImage, resetView, exportPNG, goToEdit, addPerson, rebuild, get DB() { return DB; }, cam, P };
}) ();

window.addEventListener('DOMContentLoaded', Chimere.init);
