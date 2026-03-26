/* ═══════════════════════════════════════════════════════════════════
		 Chimere — Arbre généalogique en bois de cerf
		 Structure JSON : chaque personne a un id, ses infos, et optionnellement
		 fatherId / motherId pour remonter les lignées.
		 Ego = point de départ. Bois DROIT = lignée paternelle, GAUCHE = maternelle.
 ═══════════════════════════════════════════════════════════════════ */
const Chimere = (() => {
		// 1. ÉTAT PRIVÉ
		let DB = { people: {} }; // Sera rempli par le JSON
		let isDataLoaded = false; // Sécurité pour le rendu

		// ══════════════════════════════════════════════════════
		// PARAMÈTRES VISUELS
		// ══════════════════════════════════════════════════════
		const P = {
			// Visage
			faceH:     130,   // demi-hauteur du visage
			faceW:     78,    // demi-largeur du visage
			eyeOffY:   -18,   // Y des yeux par rapport au centre
			eyeOffX:   28,    // X des yeux
			noseLen:   22,    // longueur du nez
			// Bois
			trunkLen:  90,    // longueur du tronc du bois (col du cerf)
			trunkW:    9,     // épaisseur du tronc
			branchDecay: 0.82, //0.68, // facteur de réduction longueur par génération
			widthDecay:  0.75, //0.62, // facteur de réduction épaisseur par génération
			baseLen:   130,   // longueur du 1er segment du bois
			// Angles de base : bois droit part vers la droite-haut, gauche vers gauche-haut
			rightBaseAngle: -Math.PI * 0.22,   // angle initial bois droit (depuis vertical)
			leftBaseAngle:  -Math.PI * 0.78,   // angle initial bois gauche
			forkSpread:  0.38,  // demi-angle de fourche à chaque bifurcation
			// Couleurs
			colFace:    '#c8a060',
			colFaceStroke: '#5a3a18',
			colBoneR:   '#c8a848',  // bois paternel (doré chaud)
			colBoneL:   '#88b878',  // bois maternel (vert doux)
			colUnknown: '#3a3a28',  // ancêtre inconnu / manquant
			colEye:     '#1a1008',
			colLabel:   '#e8d880',
			colSubLabel:'#6a7040',
			colGlow:    'rgba(200,168,72,0.12)',
			nodeSizeMult: 1.8,  // Multiplicateur pour la taille des cercles
			curvature: 0.2,     // Facteur de courbure (0 = droit, 0.5 = très courbé)
			oscSpeed: 0.002, // Vitesse de la respiration
			oscAmp: 0.03     // Amplitude du mouvement
		};

		// ══════════════════════════════════════════════════════
		// ÉTAT RUNTIME
		// ══════════════════════════════════════════════════════
		let canvas, ctx, W, H;
		let cam   = { x:0, y:0, scale:1 };
		let drag  = { on:false, sx:0, sy:0, cx:0, cy:0 };
		let hits  = [];    // [{ id, sx, sy, r }] pour le hit-test
		let hover = null, sel = null;
		let animT = 0;
		
		let userImage = null; // Stockera l'objet Image

		// ══════════════════════════════════════════════════════
		// HELPERS COORDS
		// ══════════════════════════════════════════════════════
		const w2s = (wx, wy) => ({
			x: W/2 + (wx + cam.x) * cam.scale,
			y: H/2 + (wy + cam.y) * cam.scale,
		});
		const s2w = (sx, sy) => ({
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

		// ══════════════════════════════════════════════════════
		// CALCUL DE PROFONDEUR MAX (pour normaliser l'opacité)
		// ══════════════════════════════════════════════════════
		function maxDepth(id, depth=0) {
			const p = DB.people[id];
			if (!p) return depth;
			return Math.max(
				p.fatherId ? maxDepth(p.fatherId, depth+1) : depth,
				p.motherId ? maxDepth(p.motherId, depth+1) : depth
			);
		}

		// ══════════════════════════════════════════════════════
		// DESSIN DU BOIS (récursif)
		// id       : identifiant de la personne représentée par ce segment
		// x1,y1    : point de départ du segment (coords monde)
		// angle    : direction du segment (radians, 0=droite, -PI/2=haut)
		// length   : longueur du segment
		// width    : épaisseur du segment
		// depth    : profondeur actuelle (0=tronc direct)
		// side     : 'R' ou 'L' (pour la couleur de base)
		// isPaternal : true si ce nœud est dans la lignée paternelle
		// ══════════════════════════════════════════════════════
		// Génère un nombre "pseudo-aléatoire" stable
		const stableRandom = (s) => {
			const x = Math.sin(s) * 10000;
			return x - Math.floor(x);
		};

		function drawAntler(id, x1, y1, angle, length, width, depth, side) {
			const person = (id && DB.people[id]) ? DB.people[id] : null;
			const known = !!person;
			const col = known ? (side === 'R' ? P.colBoneR : P.colBoneL) : P.colUnknown;
			const baseAlpha = known ? Math.max(0.1, 0.4 - depth * 0.05) : 0.05;

			const time = Date.now() * P.oscSpeed;
			const sway = Math.sin(time + (depth * 0.5)) * P.oscAmp;
			const animatedAngle = angle + sway;

			const numFibers = known ? 20 : 5; 
			const sStart = w2s(x1, y1);
			
			ctx.save();
			ctx.lineCap = 'round';

			for (let i = 0; i < numFibers; i++) {
				const sideSeed = side === 'R' ? 1000 : 2000;
				const seed = (person ? person.name.length : 1) + i + depth + sideSeed;

				const lengthVar = length * (0.8 + stableRandom(seed + 5) * 0.4);
				const fX2_base = x1 + Math.cos(animatedAngle) * lengthVar;
				const fY2_base = y1 + Math.sin(animatedAngle) * lengthVar;

				const inversion = (depth % 2 === 0) ? -1 : 1;
				const bendDir = (side === 'R' ? -Math.PI / 2 : Math.PI / 2) * inversion;

				const randomShiftMiddle = (stableRandom(seed) - 0.5) * 15 * P.curvature;
				const shiftFinal = (stableRandom(seed + 1) - 0.5) * width * 3.5;

				const midX = x1 + Math.cos(animatedAngle) * lengthVar * 0.5;
				const midY = y1 + Math.sin(animatedAngle) * lengthVar * 0.5;
				
				const fCpX = midX + Math.cos(animatedAngle + bendDir) * (lengthVar * P.curvature) + randomShiftMiddle;
				const fCpY = midY + Math.sin(animatedAngle + bendDir) * (lengthVar * P.curvature) + randomShiftMiddle;
				
				const fX2 = fX2_base + Math.cos(animatedAngle + Math.PI/2) * shiftFinal;
				const fY2 = fY2_base + Math.sin(animatedAngle + Math.PI/2) * shiftFinal;

				const sEnd = w2s(fX2, fY2);
				const scp = w2s(fCpX, fCpY);

				const steps = 12; 
				let lastPoint = { x: sStart.x, y: sStart.y };
				const baseLineWidth = (width * 0.8) * cam.scale;

				for (let t_step = 1; t_step <= steps; t_step++) {
					const t = t_step / steps;
					const currX = (1 - t) * (1 - t) * sStart.x + 2 * (1 - t) * t * scp.x + t * t * sEnd.x;
					const currY = (1 - t) * (1 - t) * sStart.y + 2 * (1 - t) * t * scp.y + t * t * sEnd.y;

					ctx.beginPath();
					ctx.lineWidth = baseLineWidth * Math.max(0.1, (1 - t * 0.9));
					ctx.globalAlpha = baseAlpha * (0.6 + stableRandom(seed + 3) * 0.4) * (1 - t * 0.4);
					ctx.strokeStyle = col;
					ctx.moveTo(lastPoint.x, lastPoint.y);
					ctx.lineTo(currX, currY);
					ctx.stroke();
					lastPoint = { x: currX, y: currY };
				}
			}
			ctx.restore();

			const x2_logic = x1 + Math.cos(animatedAngle) * length;
			const y2_logic = y1 + Math.sin(animatedAngle) * length;
			const sNode = w2s(x2_logic, y2_logic);

			// On ignore P.nodeSize pour le test et on met 10 pixels fixes
			// Si ça marche, tu pourras remettre P.nodeSize * 2 par exemple
			const finalRadius = Math.max(5, (P.nodeSize || 5));;

			// --- DESSIN DU NŒUD CLIQUABLE CORRIGÉ ---
			if (known) {
				// --- DESSIN ET COLLISION ---
				ctx.save();
				ctx.beginPath();
				ctx.arc(sNode.x, sNode.y, finalRadius, 0, Math.PI * 2);
				ctx.fillStyle = col; 
				ctx.globalAlpha = 0.8; 
				ctx.fill();
				ctx.strokeStyle = "white";
				ctx.lineWidth = 1.5;
				ctx.stroke();
				ctx.restore();

				// 2. Enregistrement pour le CLIC
				// IMPORTANT : On utilise les coordonnées MONDE (x2_logic) 
				// et on définit un rayon de clic en unités MONDE cohérent
				hits.push({ 
					id: id, 
					wx: x2_logic, 
					wy: y2_logic, 
					// On met un rayon de collision généreux (ex: 20 unités monde)
					r: 20 
				});
			}
			
			// ENFANTS
			if (known && person.children) {
				drawChildrenNodes(person.children, x2_logic, y2_logic, length, width, baseAlpha, col, id);
			}

			// RÉCURSION
			if (!known || depth > 10) return;
			const nextLen = length * P.branchDecay;
			const nextW = width * P.widthDecay;
			if (nextLen < 5) return;

			const spread = P.forkSpread * (1 + depth * 0.05);
			const fatherAngle = side === 'R' ? animatedAngle + spread * 0.6 : animatedAngle + spread * 0.4;
			const motherAngle = side === 'R' ? animatedAngle - spread * 0.4 : animatedAngle - spread * 0.6;

			drawAntler(person.fatherId, x2_logic, y2_logic, fatherAngle, nextLen, nextW, depth + 1, side);
			drawAntler(person.motherId, x2_logic, y2_logic, motherAngle, nextLen, nextW, depth + 1, side);
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
				const numChildFibers = 8;

				ctx.save();
				for (let j = 0; j < numChildFibers; j++) {
					const cSeed = parentId.length + i + j + level * 50;
					// Éparpillement à l'arrivée uniquement
					const cOffX = (stableRandom(cSeed) - 0.5) * (pW * 2.0);
					const cOffY = (stableRandom(cSeed + 1) - 0.5) * (pW * 2.0);
					const sEnd = w2s(cx + cOffX, cy + cOffY);

					const steps = 8;
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

		function drawTrunk(x1, y1, x2, y2, width, col) {
			const numFibers = 60; // Plus de fibres mais plus fines pour la densité
			const angle = Math.atan2(y2 - y1, x2 - x1);
			const dist = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
			const sc = cam.scale;

			ctx.save();
			ctx.lineCap = 'round';

			for (let i = 0; i < numFibers; i++) {
				const seed = i + (x1 > 0 ? 5000 : 10000);
				
				// --- L'ENTRELACEMENT ---
				// Au lieu d'un éventail, on fait converger les fibres vers le centre par moments
				const wander = Math.sin(i * 0.5) * (width * 0.4); 
				const shiftStart = ((stableRandom(seed) - 0.5) * width * 3.5) + wander;
				const shiftEnd = (stableRandom(seed + 1) - 0.5) * width * 1.5;

				// Points de contrôle pour une courbe en "S" légère (plus naturel)
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

				// --- LE DESSIN EN DÉGRADÉ ---
				// On divise chaque fibre en segments pour faire varier l'alpha (fondu aux pointes)
				const steps = 10;
				let lp = { x: sStart.x, y: sStart.y };
				
				for (let t_step = 1; t_step <= steps; t_step++) {
					const t = t_step / steps;
					// Courbe de Bézier quadratique
					const cx = (1 - t) * (1 - t) * sStart.x + 2 * (1 - t) * t * sCP.x + t * t * sEnd.x;
					const cy = (1 - t) * (1 - t) * sStart.y + 2 * (1 - t) * t * sCP.y + t * t * sEnd.y;

					ctx.beginPath();
					// On diminue l'alpha aux extrémités (0 et 1) pour fondre dans le visage et les bois
					const edgeFade = Math.sin(t * Math.PI); 
					ctx.globalAlpha = (0.02 + stableRandom(seed + 3) * 0.15) * edgeFade;
					ctx.lineWidth = (width * 0.08) * sc;
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

			const o = w2s(0, 0);  // centre en coords écran
			const sc = cam.scale;

			if (userImage) {
				ctx.save();
				ctx.beginPath();

				ctx.ellipse(o.x, o.y, P.faceW * sc, P.faceH * sc, 0, 0, Math.PI * 2);
				ctx.clip();
				
				const aspect = userImage.width / userImage.height;
				const drawH = P.faceH * 2.2 * sc;
				const drawW = drawH * aspect;
				ctx.drawImage(userImage, o.x - drawW/2, o.y - drawH/2, drawW, drawH);
				
				// 3. LA MÉTHODE ALTERNATIVE POUR LE NOIR ET BLANC
				// On dessine un rectangle gris par-dessus avec le mode "color"
				// Cela retire la saturation de tout ce qui est en dessous
				ctx.globalCompositeOperation = 'color';
				ctx.fillStyle = 'gray';
				ctx.fillRect(o.x - drawW/2, o.y - drawH/2, drawW, drawH);
				
				// 4. On remet le mode par défaut et on ajoute un peu de contraste
				ctx.globalCompositeOperation = 'overlay';
				ctx.fillStyle = 'rgba(0,0,0,0.2)'; // Assombrit légèrement pour le look ancien
				ctx.fillRect(o.x - drawW/2, o.y - drawH/2, drawW, drawH);

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
					// ── Bois DROIT = lignée paternelle (Alain Vincent)
					if (egoData.fatherId) {
						const startAngleR = -Math.PI / 2 + (P.forkSpread * 1.5); 
						drawAntler(
							egoData.fatherId,
							attachR.x, attachR.y,
							startAngleR,
							P.baseLen,
							P.trunkW,
							0, 'R'
						);
					}

					// ── Bois GAUCHE = lignée maternelle (Jeanne Martin)
					if (egoData.motherId) {
						const startAngleL = -Math.PI / 2 - (P.forkSpread * 1.5);
						drawAntler(
							egoData.motherId,
							attachL.x, attachL.y,
							startAngleL,
							P.baseLen,
							P.trunkW,
							0, 'L'
						);
					}
					/*
					// ── Label ego au centre
					if (cam.scale > 0.45) {
						const o = w2s(0, 0);
						ctx.save();
						ctx.fillStyle   = '#e8d078';
						ctx.font        = `italic ${Math.max(11, 13 * cam.scale)}px Georgia, serif`;
						ctx.textAlign   = 'center';
						ctx.textBaseline = 'middle';
						ctx.globalAlpha = 0.85;
						ctx.fillText(egoData.name || 'Ego', o.x, o.y + P.faceH * cam.scale * 0.5);
						ctx.restore();
					}
					*/
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
			canvas.addEventListener('mousedown', e => {
				drag.on=true; drag.sx=e.clientX; drag.sy=e.clientY; drag.cx=cam.x; drag.cy=cam.y;
			});
			canvas.addEventListener('mousemove', e => {
				if (drag.on) {
					cam.x = drag.cx + (e.clientX - drag.sx) / cam.scale;
					cam.y = drag.cy + (e.clientY - drag.sy) / cam.scale;
				} else {
					hover = hitTest(e.clientX, e.clientY);
					canvas.style.cursor = hover ? 'pointer' : 'grab';
				}
			});
			canvas.addEventListener('mouseup', e => {
				const moved = Math.hypot(e.clientX-drag.sx, e.clientY-drag.sy);
				drag.on = false;
				if (moved < 5) { sel = hitTest(e.clientX, e.clientY); showPanel(sel); }
			});
			canvas.addEventListener('wheel', e => {
				e.preventDefault();
				cam.scale = Math.min(4, Math.max(0.12, cam.scale * (e.deltaY < 0 ? 1.1 : 0.91)));
			}, { passive:false });
			let td=0;
			canvas.addEventListener('touchstart', e => {
				if (e.touches.length===1) { drag.on=true; drag.sx=e.touches[0].clientX; drag.sy=e.touches[0].clientY; drag.cx=cam.x; drag.cy=cam.y; }
				else if (e.touches.length===2) { drag.on=false; td=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY); }
			});
			canvas.addEventListener('touchmove', e => {
				e.preventDefault();
				if (e.touches.length===1 && drag.on) { cam.x=drag.cx+(e.touches[0].clientX-drag.sx)/cam.scale; cam.y=drag.cy+(e.touches[0].clientY-drag.sy)/cam.scale; }
				else if (e.touches.length===2) { const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY); cam.scale=Math.min(4,Math.max(0.12,cam.scale*d/td)); td=d; }
			}, { passive:false });
			canvas.addEventListener('touchend', ()=>{ drag.on=false; });
			window.addEventListener('resize', resize);

			// Nouveaux écouteurs pour les contrôles
			document.getElementById('slider-spread').addEventListener('input', (e) => {
				P.forkSpread = parseFloat(e.target.value);
			});

			document.getElementById('slider-decay').addEventListener('input', (e) => {
				P.branchDecay = parseFloat(e.target.value);
			});

			document.getElementById('color-right').addEventListener('input', (e) => {
				P.colBoneR = e.target.value;
			});

			document.getElementById('color-left').addEventListener('input', (e) => {
				P.colBoneL = e.target.value;
			});

			document.getElementById('slider-baselen').addEventListener('input', (e) => {
				P.baseLen = parseFloat(e.target.value);
			});

			document.getElementById('slider-width').addEventListener('input', (e) => {
				P.trunkW = parseFloat(e.target.value);
			});
			document.getElementById('slider-curvature').addEventListener('input', (e) => {
				P.curvature = parseFloat(e.target.value);
			});

			document.getElementById('slider-nodesize').addEventListener('input', (e) => {
				P.nodeSizeMult = parseFloat(e.target.value);
			});
			document.getElementById('slider-speed').addEventListener('input', (e) => {
				P.oscSpeed = parseFloat(e.target.value);
			});
		}

		// ══════════════════════════════════════════════════════
		// API PUBLIQUE
		// ══════════════════════════════════════════════════════
		function goToEdit() {
			const urlParams = new URLSearchParams(window.location.search);
			const userId = urlParams.get('u');
			
			if (userId) {
				window.location.href = `edit.html?u=${userId}`;
			} else {
				window.location.href = `edit.html`;
			}
		}
		// Dans ton script Chimère, modifie la fonction handleImage
		async function handleImage(input) {
			if (input.files && input.files[0]) {
				const file = input.files[0];
				const urlParams = new URLSearchParams(window.location.search);
				const userId = urlParams.get('u') || "matthieu_v";

				// 1. Affichage immédiat pour l'utilisateur (Local)
				const reader = new FileReader();
				reader.onload = (e) => {
					const img = new Image();
					img.onload = () => { userImage = img; };
					img.src = e.target.result;
				};
				reader.readAsDataURL(file);

				// 2. Envoi sur Supabase (Cloud)
				console.log("Envoi de la photo sur le cloud...");
				const publicUrl = await db_upload_image(userId, file);

				if (publicUrl) {
					// 3. On enregistre l'URL dans les données de l'Ego
					DB.people[DB.ego].photoUrl = publicUrl;
					
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
		// 1. On identifie l'utilisateur dans l'URL
		const urlParams = new URLSearchParams(window.location.search);
		const userId = urlParams.get('u');
		const btnEdit = document.getElementById('btn-edit');
		// 2. STRATÉGIE DE CHARGEMENT
		if (userId) {
			console.log("Tentative de chargement Cloud pour :", userId);
			const cloudData = await db_load(userId);
			
			if (cloudData) {
				DB = cloudData;
				isDataLoaded = true;
				console.log("Données Cloud chargées.");

				// --- PARTIE 4 : CHARGEMENT DE LA PHOTO ENREGISTRÉE ---
				// On vérifie si l'ego a une photoUrl dans le JSON
				if (DB.people[DB.ego] && DB.people[DB.ego].photoUrl) {
					const img = new Image();
					img.crossOrigin = "anonymous"; // Évite les erreurs de sécurité (CORS) sur le Canvas
					img.onload = () => { 
						userImage = img; 
						console.log("Photo de l'Ego chargée avec succès.");
					};
					img.src = DB.people[DB.ego].photoUrl;
				}

			} else {
				console.warn("Utilisateur inconnu dans le Cloud, chargement du local par défaut.");
				await loadData('./datatrees/genealogie.json');
			}
			if (btnEdit) btnEdit.innerHTML = "✎ Modifier mon arbre";

		} else {
			if (btnEdit) btnEdit.innerHTML = "✨ Créer mon arbre";
			await loadData('./datatrees/genealogie.json');
		}

		// 3. Initialisation classique du Canvas
		canvas = document.getElementById('c');
		if (!canvas) {
			console.error("Canvas introuvable !");
			return;
		}
		ctx = canvas.getContext('2d');
		resize();
		resetView();
		bindEvents();

		// 4. Lancement de la boucle
		requestAnimationFrame(loop);
		}

		return { init, handleImage, resetView, exportPNG, goToEdit, addPerson, rebuild, get DB() { return DB; }, cam, P };
}) ();

window.addEventListener('DOMContentLoaded', Chimere.init);