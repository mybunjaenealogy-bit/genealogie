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
	function getFullSiblings(id) {
	    const p = DB.people[id];
	    if (!p || (!p.fatherId && !p.motherId)) return [];
	    return Object.keys(DB.people).filter(otherId => {
	        if (otherId === id) return false;
	        const o = DB.people[otherId];
	        return o.fatherId === p.fatherId && o.motherId === p.motherId && p.fatherId !== null;
	    });
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
	    //if (depth > 0) ctx.filter = `saturate(${Math.max(0.5, 1 - depth * 0.5)}) brightness(${Math.max(0.5, 1 - depth * 0.5)})`;

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
	        ctx.beginPath();
	        ctx.strokeStyle = col;
	        for (let t_step = 1; t_step <= 12; t_step++) {
	            const t = t_step / 12;
	            const currX = (1-t)**2 * sStartAnimated.x + 2*(1-t)*t * scp.x + t**2 * sEnd.x;
	            const currY = (1-t)**2 * sStartAnimated.y + 2*(1-t)*t * scp.y + t**2 * sEnd.y;
	            
	            ctx.lineWidth = (width * 0.8) * cam.scale * Math.max(0.1, (1 - t * 0.9));
	            ctx.globalAlpha = baseAlpha * (0.6 + stableRandom(seed + 3) * 0.4) * (1 - t * 0.4);
	            
	            ctx.moveTo(lastPoint.x, lastPoint.y); ctx.lineTo(currX, currY); 
	            lastPoint = { x: currX, y: currY };
	        }
	        ctx.stroke();
	    }
	    ctx.restore();

	    // --- 3. RENDU DES FRATRIES ET DESCENDANCES INCOMPLÈTES ---
		const x2_logic = x1 + Math.cos(animatedAngle) * length;
		const y2_logic = y1 + Math.sin(animatedAngle) * length;

		if (known) {
		    // A. FRATRIE COMPLÈTE (S'agglutine autour de l'individu pivot)
		    const fullSibs = getFullSiblings(id);
		    const satellites = fullSibs.filter(sid => DB.people[sid]?.isClustered);
		    
		    if (satellites.length > 0) {
		        // Ces cercles gravitent autour du pivot (x2_logic, y2_logic)
		        drawFullSiblingCluster(satellites, x2_logic, y2_logic, animatedAngle, baseAlpha, col);
		    }

		    // B. ENFANTS DE FRATRIE INCOMPLÈTE (Trait + Cercle depuis le pivot)
		    const allChildren = getChildren(id);
		    const incompleteChildren = allChildren.filter(cid => {
		        const child = DB.people[cid];
		        // On considère incomplète si un des parents est null ou si c'est un demi-frère de la lignée
		        return ((!child.fatherId || !child.motherId) && child.isClustered);
		    });

		    if (incompleteChildren.length > 0) {
		        // Ces enfants partent du pivot (x2_logic, y2_logic) vers l'extérieur
		        drawIncompleteChildren(incompleteChildren, x2_logic, y2_logic, animatedAngle, baseAlpha, col);
		    }

		    // C. LE CERCLE PIVOT (L'individu lui-même)
		    drawMainNode(id, x2_logic, y2_logic, col, baseAlpha);
		}

	    // ===================================================================
	    // --- 4. RÉCURSION ---
	    // ===================================================================
	    if (!known || depth > 10) return;
	    const nextLen = length * P.branchDecay;
	    const nextW = width * P.widthDecay;
	    if (nextLen < 5) return;
	    const spread = P.forkSpread * (1 + depth * 0.05);
	    drawAntler(person.fatherId, x2_logic, y2_logic, animatedAngle + spread * 0.5, nextLen, nextW, depth + 1, side);
	    drawAntler(person.motherId, x2_logic, y2_logic, animatedAngle - spread * 0.5, nextLen, nextW, depth + 1, side);
	}
	function drawIncompleteChildren(childIds, px, py, angle, baseAlpha, col) {
	    childIds.forEach((cid, i) => {
	        const seed = cid.length + i;
	        const sideAngle = angle + (i % 2 === 0 ? 1.8 : -1.8);
	        const dist = 40 / cam.scale; // Longueur de l'andouiller

	        const targetX = px + Math.cos(sideAngle) * dist;
	        const targetY = py + Math.sin(sideAngle) * dist;
	        
	        // --- RENDU FIBREUX (Échevelé) ---
	        const numFibres = 6; // Nombre de brins par andouiller
	        for (let f = 0; f < numFibres; f++) {
	            const fSeed = seed + f * 0.1;
	            ctx.beginPath();
	            ctx.lineWidth = (0.3 + stableRandom(fSeed) * 0.5) * cam.scale;
	            ctx.strokeStyle = col;
	            ctx.globalAlpha = baseAlpha * 0.4;

	            let curX = px;
	            let curY = py;
	            const steps = 8; // Nombre de segments pour la courbure

	            const sPosStart = w2s(curX, curY);
	            ctx.moveTo(sPosStart.x, sPosStart.y);

	            for (let s = 1; s <= steps; s++) {
	                const t = s / steps;
	                // Interpolation linéaire vers la cible
	                let nextX = px + (targetX - px) * t;
	                let nextY = py + (targetY - py) * t;

	                // AJOUT DE LA COURBURE / EFFET ÉCHEVELÉ
	                // On ajoute un décalage perpendiculaire qui augmente avec t
	                const wobble = Math.sin(t * Math.PI) * (stableRandom(fSeed + s) - 0.5) * 8 / cam.scale;
	                const perpAngle = sideAngle + Math.PI / 2;
	                
	                nextX += Math.cos(perpAngle) * wobble;
	                nextY += Math.sin(perpAngle) * wobble;

	                const sPos = w2s(nextX, nextY);
	                ctx.lineTo(sPos.x, sPos.y);
	            }
	            ctx.stroke();
	        }

	        // --- LE CERCLE DE L'ENFANT (au bout des fibres) ---
	        const sFinalPos = w2s(targetX, targetY);
	        ctx.beginPath();
	        ctx.arc(sFinalPos.x, sFinalPos.y, (P.nodeSize * 0.6) * cam.scale, 0, Math.PI * 2);
	        ctx.fillStyle = "#bdc3c7"; 
	        ctx.globalAlpha = baseAlpha;
	        ctx.fill();

	        hits.push({ id: cid, wx: targetX, wy: targetY, r: 10 });
	    });
	}
	function drawFullSiblingCluster(sibIds, px, py, angle, baseAlpha, col) {
	    sibIds.forEach((sid, idx) => {
	        const seed = sid.length + idx;
	        const dist = (P.nodeSize * 1.1) / cam.scale; // Très proche pour l'agglutinement
	        const ang = angle + (idx + 1) * (Math.PI * 2 / (sibIds.length + 1));
	        
	        const sx = px + Math.cos(ang) * dist;
	        const sy = py + Math.sin(ang) * dist;
	        const sPos = w2s(sx, sy);

	        ctx.beginPath();
	        ctx.arc(sPos.x, sPos.y, (P.nodeSize * 0.7) * cam.scale, 0, Math.PI * 2);
	        ctx.fillStyle = col;
	        ctx.globalAlpha = baseAlpha * 1.2;
	        ctx.fill();
	        
	        // Optionnel : petit trait vers le centre du pivot
	        hits.push({ id: sid, wx: sx, wy: sy, r: 10 });
	    });
	}
	function getChildren(parentId) {
	    if (!parentId) return [];
	    // On filtre toutes les personnes de la DB dont le père OU la mère est parentId
	    return Object.keys(DB.people).filter(id => {
	        const p = DB.people[id];
	        return p.fatherId === parentId || p.motherId === parentId;
	    });
	}
	// Gestion cercle principal
	function drawMainNode(id, wx, wy, col, baseAlpha) {
	    const sPos = w2s(wx, wy);
	    const radius = (P.nodeSize || 10) * cam.scale;

	    ctx.save();
	    ctx.beginPath();
	    ctx.arc(sPos.x, sPos.y, radius, 0, Math.PI * 2);
	    
	    // Remplissage avec la couleur de la branche
	    ctx.fillStyle = col;
	    ctx.globalAlpha = Math.min(1.0, baseAlpha * 2.0);
	    ctx.fill();

	    // Contour blanc pour détacher le cercle du fond et des fibres
	    ctx.lineWidth = 2 * cam.scale;
	    ctx.strokeStyle = "#ffffff";
	    ctx.globalAlpha = baseAlpha;
	    ctx.stroke();
	    
	    ctx.restore();

	    // Ajout à la liste des zones cliquables (hit-test)
	    hits.push({ 
	        id: id, 
	        wx: wx, 
	        wy: wy, 
	        r: radius / cam.scale // r en coordonnées monde pour la précision
	    });
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
	        //ctx.ellipse(o.x, o.y, P.faceW * sc, P.faceH * sc, 0, 0, Math.PI * 2);
	        //ctx.clip();
	        
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
	        ctx.fillRect(drawX, drawY, drawW, drawH);
	        
	        // 4. AJUSTEMENT DU CONTRASTE (Mode 'multiply')
	        // Pour éviter l'aspect "délavé" et rendre les noirs plus profonds
	        ctx.globalCompositeOperation = 'multiply';
	        ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
	        ctx.fillRect(drawX, drawY, drawW, drawH);

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
		const egoData = DB.people[DB.ego];
		// 3. SÉCURITÉ CIBLÉE sur les bois uniquement
		if (!DB || !DB.people || !DB.ego || !DB.people[DB.ego]) {
		    ctx.save();
		    ctx.fillStyle = "white";
		    ctx.font = "20px Georgia";
		    ctx.textAlign = "center";
		    ctx.globalAlpha = 0.6;
		    ctx.fillText("Portez votre arbre généalogique", W/2, H/2 - 40);
		    ctx.font = "14px Arial";
		    ctx.fillText("Bienvenue dans une expérience généa-chimèrique,", W/2, H/2 - 10);
		    ctx.fillText("cliquez sur 'Créer mon arbre' pour commencer.", W/2, H/2 + 10);
		    ctx.restore();
		}
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

			if (!egoData.fatherId && !egoData.motherId && !userImage) {
			    ctx.save();
			    ctx.fillStyle = "white";
			    ctx.font = "20px Georgia";
			    ctx.textAlign = "center";
			    ctx.globalAlpha = 0.6;
			    ctx.fillText("Portez votre arbre généalogique", W/2, H/2 - 40);
			    ctx.font = "14px Arial";
			    ctx.fillText("Bienvenue dans une expérience généa-chimèrique,", W/2, H/2 - 10);
			    ctx.fillText("cliquez sur 'Créer mon arbre' pour commencer.", W/2, H/2 + 10);
			    ctx.restore();
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
	    const w = s2w(ex, ey); // Conversion écran -> monde
	    // On boucle à l'envers pour cliquer sur l'élément le plus "en haut" visuellement
	    for (let i = hits.length - 1; i >= 0; i--) {
	        const h = hits[i];
	        if (!h.id) continue;
	        // On compare la distance dans le monde avec le rayon stocké
	        const dist = Math.hypot(w.x - h.wx, w.y - h.wy);
	        if (dist < h.r + (2 / cam.scale)) return h.id; 
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
		document.getElementById('node-size').addEventListener('input', (e) => {
		    const val = parseFloat(e.target.value);
		    P.nodeSize = val;
		    document.getElementById('node-size-val').textContent = val;
		    // render(); // Appelle ta fonction de rendu si elle n'est pas déjà dans une boucle d'animation
		});
		const btnPhoto = document.getElementById('btn-mode-photo');
		// Toggle du bouton
	    if (btnPhoto) {
		    btnPhoto.addEventListener('click', async () => {
		        isPhotoMode = !isPhotoMode;
		        
		        if (!isPhotoMode) {
		            // ON VIENT DE PASSER SUR OFF : On enregistre enfin
		            console.log("Fin d'édition : sauvegarde des réglages...");
		            btnPhoto.innerHTML = "⌛ Synchronisation...";
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
		    // On utilise Alt pour l'image, ou le mode photo exclusif
		    if (e.altKey) { 
		        const delta = e.deltaY < 0 ? 1.05 : 0.95;
		        imgTransform.scale = Math.min(5, Math.max(0.2, imgTransform.scale * delta));
		    } else {
		        // Zoom classique de la caméra
		        const zoomSpeed = e.deltaY < 0 ? 1.1 : 0.91;
		        cam.scale = Math.min(4, Math.max(0.12, cam.scale * zoomSpeed));
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

	function exportPNG() {
		const a = document.createElement('a');
		a.download = 'chimere-genealogique.png';
		a.href = canvas.toDataURL('image/png'); a.click();
	}

	function loop() { render(); requestAnimationFrame(loop); }
	async function init() {
	    const urlParams = new URLSearchParams(window.location.search);
	    let userId = urlParams.get('u'); 
	    const btnEdit = document.getElementById('btn-edit');

	    if (userId) {
	        const cloudData = await db_load(userId);
	        
	        if (cloudData) {
	            DB = cloudData;
	            // CRUCIAL : On s'assure que l'ego est bien celui de l'URL
    			if(DB.ego !== userId) DB.ego = userId;
	            isDataLoaded = true;
	            console.log("Données Cloud chargées.");
	            const userData = DB.people[userId];
	            
	            // --- Restauration des réglages des bois ---
	            if (userData && userData.treeSettings) {
	                Object.assign(P, userData.treeSettings);
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
	            if (userData && userData.photoUrl) {
	                const img = new Image();
	                img.crossOrigin = "anonymous";
	                img.onload = () => { userImage = img; };
	                img.src = userData.photoUrl;
	            }
	            if (userData && userData.imgSettings) imgTransform = userData.imgSettings;
	            if (btnEdit) btnEdit.innerHTML = "✎ Modifier mon arbre";


	        } else {
	        	// CAS : L'ID est dans l'URL mais n'existe pas encore sur le Cloud
	            DB = {
	                "ego": userId,
	                "people": { [userId]: { "id": userId, "name": "Prénom Nom", "birth": null, "death": null, "place": "Lieu", "fatherId": null, "motherId": null, "children": [], "order": null }
	                }
	            };
	            isDataLoaded = true;
	            if (btnEdit) btnEdit.innerHTML = "✨ Créer mon arbre";
	        }
	        

	    } else {
	        // CAS : Pas d'ID du tout dans l'URL (Nouvelle Chimère)
	        const randomNumber = Math.floor(1000 + Math.random() * 9000);
	        userId = `chime-${randomNumber}`; // On remplit userId ici aussi
	        urlParams.set('u', userId);
	        window.history.replaceState({}, '', `${window.location.pathname}?${urlParams.toString()}`);
	        
		    DB = {
	            "ego": userId,
	            "people": {
	                [userId]: { "id": userId, "name": "Nouvel Arbre", "fatherId": null, "motherId": null, "children": [] }
	            }
	        };
	        isDataLoaded = true;
	        if (btnEdit) btnEdit.innerHTML = "✨ Créer mon arbre";
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

	return { init, handleImage, resetView, exportPNG, goToEdit, get DB() { return DB; }, cam, P };
}) ();

window.addEventListener('DOMContentLoaded', Chimere.init);

/**
 * Fin du code. 
 */ 