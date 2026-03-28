/** 
 * YGGDRASIL ENGINE - ASCENDANCE PURE
 * Focus : Tronc de la personne + Racines (Parents) uniquement.
 */

const Yggdrasil = {
    get canvas() { return document.getElementById('bonsaiCanvas'); },
    get ctx() { return this.canvas.getContext('2d'); },

    state: {
        config: {
            PIXELS_PER_YEAR: 15, 
            currentYear: 2026,
            colors: {
                trunk: ["#8D6E63", "#D7B98E", "#E3C9A6"],
                leaves: ["#50A3A2", "#77BDB1", "#96CAB8", "#EBF0E6"],
                root: "#3E2723"
            }
        },
        data: null,
        camera: { x: 0, y: 0, zoom: 0.8, isDragging: false, lastMouse: { x: 0, y: 0 } }
    },

    init: async function(userId) {
        const cloudData = await db_load(userId); 
        if (cloudData) {
            this.state.data = cloudData;
            document.getElementById('tree-title').innerText = "Ascendance de " + userId;
            this.state.camera.x = window.innerWidth / 2;
            this.state.camera.y = window.innerHeight * 0.7; // On baisse la caméra pour voir monter l'arbre
            this.setupNavigation();
            this.render();
        }
    },

    setupNavigation: function() {
        const canvas = this.canvas;
        const cam = this.state.camera;
        window.addEventListener('resize', () => { 
            canvas.width = window.innerWidth; canvas.height = window.innerHeight; 
            this.render(); 
        });
        canvas.addEventListener('mousedown', (e) => { 
            cam.isDragging = true; cam.lastMouse = { x: e.clientX, y: e.clientY }; 
        });
        window.addEventListener('mousemove', (e) => {
            if (!cam.isDragging) return;
            cam.x += e.clientX - cam.lastMouse.x;
            cam.y += e.clientY - cam.lastMouse.y;
            cam.lastMouse = { x: e.clientX, y: e.clientY };
            this.render();
        });
        window.addEventListener('mouseup', () => cam.isDragging = false);
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const factor = Math.pow(1.1, -e.deltaY / 150);
            cam.zoom = Math.min(Math.max(0.1, cam.zoom * factor), 3);
            this.render();
        }, { passive: false });
    },

    render: function() {
        const ctx = this.ctx;
        const cam = this.state.camera;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.save();
        ctx.translate(cam.x, cam.y);
        ctx.scale(cam.zoom, cam.zoom);

        if (this.state.data && this.state.data.ego) {
            // On lance uniquement la remontée généalogique
            this.drawPerson(this.state.data.ego, 0, 0, 0, 1);
        }
        ctx.restore();
    },

    /**
     * drawPerson : Dessine le tronc et descend vers les parents.
     * AUCUN appel aux enfants ici.
     */
    drawPerson: function(personId, x, y, angle = 0, scale = 1) {
        const p = this.state.data.people[personId];
        if (!p) return;

        // 1. DESSIN DU TRONC (Représente la vie de la personne)
        const birth = p.birth || 1980;
        const death = p.death || 2026;
        const height = Math.max(50, (death - birth) * this.state.config.PIXELS_PER_YEAR) * scale;
        
        // Calcul du sommet (où se trouve le nom et les feuilles)
        const targetX = x + Math.sin(angle) * (height * 0.4);
        const targetY = y - height;

        // Rendu du tronc avec courbe quadratique
        this.state.config.colors.trunk.forEach((color, i) => {
            this.ctx.save();
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = (18 - (i * 4)) * scale;
            this.ctx.lineCap = "round";
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            this.ctx.quadraticCurveTo(x + (Math.sin(angle) * 30 * scale), y - height/2, targetX, targetY);
            this.ctx.stroke();
            this.ctx.restore();
        });

        // 2. FEUILLAGE ET NOM (Au sommet du tronc)
        this.drawLeafCloud(targetX, targetY, 40 * scale);
        this.drawLabel(targetX, targetY - 15, p.name, "white", scale);

        // 3. ASCENDANTS (On descend vers les parents depuis la BASE du tronc)
        const parents = [p.fatherId, p.motherId].filter(Boolean);
        parents.forEach((parentId, i) => {
            const side = i === 0 ? -1 : 1;
            // Écartement horizontal plus large pour éviter les chevauchements
            const rx = x + (side * 300 * scale);
            const ry = y + (200 * scale);
            
            // Racine courbe (Bézier)
            this.ctx.save();
            this.ctx.strokeStyle = this.state.config.colors.root;
            this.ctx.lineWidth = 6 * scale;
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            this.ctx.bezierCurveTo(x, y + 80 * scale, rx, ry - 80 * scale, rx, ry);
            this.ctx.stroke();
            this.ctx.restore();

            // Récursion vers le parent
            this.drawPerson(parentId, rx, ry, side * 0.1, scale * 0.85);
        });
    },

    drawLeafCloud: function(x, y, radius) {
        this.state.config.colors.leaves.forEach((color, i) => {
            this.ctx.save();
            this.ctx.fillStyle = color;
            this.ctx.shadowBlur = 8 / this.state.camera.zoom;
            this.ctx.shadowColor = "rgba(0,0,0,0.4)";
            this.ctx.shadowOffsetX = i * 1.5; this.ctx.shadowOffsetY = i * 1.5;
            this.ctx.beginPath();
            for (let j = 0; j < 6; j++) {
                const a = (j / 6) * Math.PI * 2;
                this.ctx.arc(x + Math.cos(a) * (radius * 0.5), y + Math.sin(a) * (radius * 0.5), radius / 2, 0, Math.PI * 2);
            }
            this.ctx.fill();
            this.ctx.restore();
        });
    },

    drawLabel: function(x, y, text, color, scale) {
        const ctx = this.ctx;
        ctx.fillStyle = color;
        ctx.font = `bold ${Math.max(11, 13 * scale)}px Inter`;
        ctx.textAlign = "center";
        // Petit contour pour la lisibilité
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 4;
        ctx.fillText(text.toUpperCase(), x, y);
    }
};