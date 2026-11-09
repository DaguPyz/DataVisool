/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
export type CircuitBackgroundOptions = {
    hexRadius: number;
    lineHexRadius: number;
    gridColor: string;
    showGrid?: boolean;
    lineColors: string[];
    spawnIntervalMs: number;
    spawnCountMin: number;
    spawnCountMax: number;
    speedMin: number;
    speedMax: number;
    maxAgeMin: number;
    maxAgeMax: number;
    targetLengthMin: number;
    targetLengthMax: number;
    boundsMargin: number;
    centerHexScale: number;
    centerHexStroke: string;
    lineWidth: number;
    headHaloRadius: number;
    headHaloAlpha: number;
    headCoreRadius: number;
    headCoreColor: string;
    gridBreathSpeed: number;
    gridBreathAlphaBase: number;
    gridBreathAlphaAmp: number;
    gridBreathRgb: [number, number, number];
};

export type CircuitBackgroundSize = {
    width: number;
    height: number;
};

export type CircuitBackgroundController = {
    resize: () => void;
    stop: () => void;
};

export function createCircuitBackground(
    canvas: HTMLCanvasElement,
    getSize: () => CircuitBackgroundSize,
    options: CircuitBackgroundOptions
): CircuitBackgroundController {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return {resize: () => {}, stop: () => {}};
    }

    let width = 0;
    let height = 0;
    let centerX = 0;
    let centerY = 0;

    const hexHeight = () => options.hexRadius * 2;
    const hexWidth = () => Math.sqrt(3) * options.hexRadius;
    const vertDist = () => hexHeight() * 0.75;

    interface Point {
        x: number;
        y: number;
    }

    class CircuitLine {
        path: Point[] = [];
        color = '';
        speed = 0;
        state: 'GROWING' | 'RETRACTING' = 'GROWING';
        dead = false;
        headX = 0;
        headY = 0;
        tailX = 0;
        tailY = 0;
        targetX = 0;
        targetY = 0;
        age = 0;
        maxAge = 0;
        targetLength = 0;
        lastAngleDeg = 0;
        historyAngles: number[] = [];

        constructor() {
            this.reset();
        }

        reset() {
            this.state = 'GROWING';
            this.path = [{x: centerX, y: centerY}];
            this.headX = centerX;
            this.headY = centerY;
            this.tailX = centerX;
            this.tailY = centerY;
            this.color = options.lineColors[Math.floor(Math.random() * options.lineColors.length)];
            this.speed = options.speedMin + Math.random() * Math.max(0, options.speedMax - options.speedMin);
            this.age = 0;
            this.maxAge = Math.floor(options.maxAgeMin + Math.random() * Math.max(0, options.maxAgeMax - options.maxAgeMin));
            this.targetLength = options.targetLengthMin + Math.random() * Math.max(0, options.targetLengthMax - options.targetLengthMin);
            const angleDegs = [30, 90, 150, 210, 270, 330];
            const startAngle = angleDegs[Math.floor(Math.random() * angleDegs.length)];
            this.historyAngles = new Array(15).fill(startAngle);
            this.lastAngleDeg = startAngle;
            this.targetX = centerX;
            this.targetY = centerY;
            this.pickNextTarget();
            this.dead = false;
        }

        pickNextTarget() {
            const candidates = [
                this.lastAngleDeg,
                (this.lastAngleDeg + 60) % 360,
                (this.lastAngleDeg - 60 + 360) % 360
            ];
            const stepsAgo = this.historyAngles[0];
            const opposite = (stepsAgo + 180) % 360;
            let validAngles = candidates.filter(a => Math.abs(a - opposite) > 1);
            if (validAngles.length === 0) validAngles = candidates;
            const dir = validAngles[Math.floor(Math.random() * validAngles.length)];
            this.historyAngles.shift();
            this.historyAngles.push(dir);
            this.lastAngleDeg = dir;
            const rad = dir * Math.PI / 180;
            const unitDist = Math.sqrt(3) * options.lineHexRadius;
            const steps = Math.floor(Math.random() * 4) + 2;
            const dist = unitDist * steps;
            const lastPoint = this.path[this.path.length - 1];
            this.targetX = lastPoint.x + Math.cos(rad) * dist;
            this.targetY = lastPoint.y + Math.sin(rad) * dist;
        }

        update() {
            if (this.state === 'GROWING') {
                this.age++;
                const dx = this.targetX - this.headX;
                const dy = this.targetY - this.headY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= this.speed) {
                    this.headX = this.targetX;
                    this.headY = this.targetY;
                    this.path.push({x: this.headX, y: this.headY});
                    if (this.age > this.maxAge ||
                        this.headX < -options.boundsMargin || this.headX > width + options.boundsMargin ||
                        this.headY < -options.boundsMargin || this.headY > height + options.boundsMargin) {
                        this.state = 'RETRACTING';
                    } else {
                        this.pickNextTarget();
                    }
                } else {
                    const angle = Math.atan2(dy, dx);
                    this.headX += Math.cos(angle) * this.speed;
                    this.headY += Math.sin(angle) * this.speed;
                }
            }

            let currentLen = 0;
            const nextNode = this.path.length > 1 ? this.path[1] : {x: this.headX, y: this.headY};
            currentLen += Math.sqrt(Math.pow(nextNode.x - this.tailX, 2) + Math.pow(nextNode.y - this.tailY, 2));
            for (let i = 1; i < this.path.length - 1; i++) {
                const p1 = this.path[i];
                const p2 = this.path[i + 1];
                currentLen += Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
            }
            if (this.path.length > 1) {
                const last = this.path[this.path.length - 1];
                currentLen += Math.sqrt(Math.pow(this.headX - last.x, 2) + Math.pow(this.headY - last.y, 2));
            }

            let shouldMoveTail = false;
            if (this.state === 'RETRACTING') shouldMoveTail = true;
            else if (currentLen > this.targetLength) shouldMoveTail = true;

            if (shouldMoveTail) {
                const dx = nextNode.x - this.tailX;
                const dy = nextNode.y - this.tailY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= this.speed) {
                    this.tailX = nextNode.x;
                    this.tailY = nextNode.y;
                    if (this.path.length > 1) this.path.shift();
                    const dHead = Math.sqrt(Math.pow(this.headX - this.tailX, 2) + Math.pow(this.headY - this.tailY, 2));
                    if (this.state === 'RETRACTING' && dHead < 1) this.dead = true;
                } else {
                    const angle = Math.atan2(dy, dx);
                    this.tailX += Math.cos(angle) * this.speed;
                    this.tailY += Math.sin(angle) * this.speed;
                }
            }
        }

        draw(ctx2: CanvasRenderingContext2D) {
            if (this.path.length < 1) return;

            ctx2.beginPath();
            ctx2.moveTo(this.tailX, this.tailY);
            for (let i = 1; i < this.path.length; i++) {
                ctx2.lineTo(this.path[i].x, this.path[i].y);
            }
            ctx2.lineTo(this.headX, this.headY);

            ctx2.strokeStyle = this.color;
            ctx2.lineWidth = options.lineWidth;
            ctx2.lineCap = 'round';
            ctx2.lineJoin = 'round';
            ctx2.shadowBlur = 10;
            ctx2.shadowColor = this.color;
            ctx2.stroke();
            ctx2.shadowBlur = 0;

            ctx2.beginPath();
            ctx2.arc(this.headX, this.headY, options.headHaloRadius, 0, Math.PI * 2);
            ctx2.globalAlpha = options.headHaloAlpha;
            ctx2.fillStyle = this.color;
            ctx2.fill();
            ctx2.globalAlpha = 1;

            ctx2.beginPath();
            ctx2.arc(this.headX, this.headY, options.headCoreRadius, 0, Math.PI * 2);
            ctx2.fillStyle = options.headCoreColor;
            ctx2.fill();
        }
    }

    const lines: CircuitLine[] = [];
    let lastSpawnTime = 0;
    let animationFrameId = 0;

    const drawHex = (x: number, y: number, r: number, fill: boolean = false, color: string = options.gridColor) => {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (30 + 60 * i) * Math.PI / 180;
            const px = x + r * Math.cos(angle);
            const py = y + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        if (fill) {
            ctx.fillStyle = color;
            ctx.fill();
        } else {
            ctx.strokeStyle = color;
            ctx.stroke();
        }
    };

    const drawGrid = (color: string) => {
        ctx.lineWidth = 1;
        const cols = Math.ceil(width / hexWidth()) + 2;
        const rows = Math.ceil(height / vertDist()) + 2;
        const startCol = -Math.floor(cols / 2);
        const endCol = Math.floor(cols / 2);
        const startRow = -Math.floor(rows / 2);
        const endRow = Math.floor(rows / 2);

        for (let r = startRow; r <= endRow; r++) {
            for (let q = startCol; q <= endCol; q++) {
                let x = options.hexRadius * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r);
                let y = options.hexRadius * (3 / 2 * r);
                x += centerX;
                y += centerY;
                drawHex(x, y, options.hexRadius - 2, false, color);
            }
        }

        ctx.lineWidth = 2;
        drawHex(centerX, centerY, options.hexRadius * options.centerHexScale, false, options.centerHexStroke);
        ctx.lineWidth = 1;
    };

    const resize = () => {
        const s = getSize();
        const nextW = Math.max(1, Math.floor(s.width));
        const nextH = Math.max(1, Math.floor(s.height));
        if (nextW === width && nextH === height) return;
        width = canvas.width = nextW;
        height = canvas.height = nextH;
        centerX = width / 2;
        centerY = height / 2;
    };

    resize();

    const animate = () => {
        ctx.clearRect(0, 0, width, height);
        if (options.showGrid !== false) {
            const t = Date.now() * options.gridBreathSpeed;
            const a = options.gridBreathAlphaBase + Math.sin(t) * options.gridBreathAlphaAmp;
            const [r, g, b] = options.gridBreathRgb;
            drawGrid(`rgba(${r}, ${g}, ${b}, ${a})`);
        }

        const now = Date.now();
        if (now - lastSpawnTime > options.spawnIntervalMs) {
            const span = Math.max(0, options.spawnCountMax - options.spawnCountMin);
            const count = options.spawnCountMin + (span === 0 ? 0 : Math.floor(Math.random() * (span + 1)));
            for (let k = 0; k < count; k++) lines.push(new CircuitLine());
            lastSpawnTime = now;
        }

        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            line.update();
            if (line.dead) lines.splice(i, 1);
            else line.draw(ctx);
        }

        animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    const stop = () => cancelAnimationFrame(animationFrameId);

    return {resize, stop};
}
