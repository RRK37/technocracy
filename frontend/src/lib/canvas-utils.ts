/**
 * Canvas drawing utilities for agents
 */

import { SPEECH_CONFIG, AGENT_CONFIG } from './world';

/**
 * Draw rounded rectangle path
 */
export function drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number,
): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

/**
 * Draw a speech bubble above a position
 */
export function drawSpeechBubble(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    text: string,
    _color?: string,
    _borderColor?: string,
): void {
    const { PADDING, POINTER_SIZE, MAX_WIDTH, FONT_SIZE } = SPEECH_CONFIG;
    const RADIUS = 4;

    ctx.save();
    ctx.font = `${FONT_SIZE}px 'JetBrains Mono', monospace`;

    // Word wrap
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    for (const word of words) {
        const test = currentLine ? `${currentLine} ${word}` : word;
        if (ctx.measureText(test).width > MAX_WIDTH - PADDING * 2) {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = test;
        }
    }
    if (currentLine) lines.push(currentLine);

    const lineHeight = FONT_SIZE + 3;
    const textWidth = Math.min(
        MAX_WIDTH - PADDING * 2,
        Math.max(...lines.map(l => ctx.measureText(l).width)),
    );
    const bubbleW = textWidth + PADDING * 2;
    const bubbleH = lines.length * lineHeight + PADDING * 2;
    const bubbleX = x - bubbleW / 2;
    const bubbleY = y - bubbleH - POINTER_SIZE - 6;

    // Shadow — soft diffuse
    ctx.shadowColor = 'rgba(0, 0, 0, 0.10)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;

    // Bubble body — frosted glass (translucent white)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    drawRoundedRect(ctx, bubbleX, bubbleY, bubbleW, bubbleH, RADIUS);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // Frosted border — subtle white edge
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 0.5;
    drawRoundedRect(ctx, bubbleX, bubbleY, bubbleW, bubbleH, RADIUS);
    ctx.stroke();

    // Pointer — small triangle, same frosted fill
    ctx.beginPath();
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x - 5, bubbleY + bubbleH);
    ctx.lineTo(x + 5, bubbleY + bubbleH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fill();

    // Text — dark, slightly muted for glass feel
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], x, bubbleY + PADDING + i * lineHeight);
    }

    ctx.restore();
}

/**
 * Draw a thought bubble (cloud-shaped) above a position
 */
export function drawThoughtBubble(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    text: string,
): void {
    drawSpeechBubble(ctx, x, y, text);
}

/**
 * Draw a sprite frame from a spritesheet
 */
export function drawSprite(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    frameIndex: number,
    row: number,
    x: number, y: number,
    width: number, height: number,
    cols: number = AGENT_CONFIG.WALK_FRAMES,
    rows: number = AGENT_CONFIG.WALK_ROWS,
): void {
    const frameW = image.width / cols;
    const frameH = image.height / rows;
    const sx = frameIndex * frameW;
    const sy = row * frameH;
    ctx.drawImage(image, sx, sy, frameW, frameH, x - width / 2, y - height / 2, width, height);
}

/**
 * Draw shadow beneath agent
 */
export function drawShadow(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, width: number,
): void {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.ellipse(x, y + 28, width * 0.35, width * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

/**
 * Draw a discussion circle on the ground
 */
export function drawDiscussionCircle(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, radius: number,
): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
    ctx.fill();
    ctx.restore();
}

/**
 * Parse hex color to rgba string
 */
function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

/**
 * Draw a soft radial glow (cluster aura) beneath an agent
 */
export function drawAgentAura(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    color: string,
    opacity: number,
): void {
    const radius = 90;
    const cy = y + 18;
    const gradient = ctx.createRadialGradient(x, cy, 0, x, cy, radius);
    gradient.addColorStop(0,    hexToRgba(color, 0.35));
    gradient.addColorStop(0.15, hexToRgba(color, 0.18));
    gradient.addColorStop(0.4,  hexToRgba(color, 0.07));
    gradient.addColorStop(0.7,  hexToRgba(color, 0.02));
    gradient.addColorStop(1,    hexToRgba(color, 0));
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();
}

/**
 * Draw a fading quadratic arc between two world-space points.
 * When a repel point (cx, cy) is provided the arc bends away from it,
 * so arcs within a discussion group fan outward from the group centre.
 */
export function drawInfluenceArc(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number,
    x2: number, y2: number,
    alpha: number,
    cx?: number, cy?: number,
): void {
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    let nx: number, ny: number;
    if (cx !== undefined && cy !== undefined) {
        // Push the control point away from the group centre
        const awayX = midX - cx;
        const awayY = midY - cy;
        const awayLen = Math.sqrt(awayX * awayX + awayY * awayY);
        if (awayLen > 0.01) {
            nx = awayX / awayLen;
            ny = awayY / awayLen;
        } else {
            // Edge midpoint coincides with centre – fall back to perpendicular
            nx = -dy / len;
            ny = dx / len;
        }
    } else {
        nx = -dy / len;
        ny = dx / len;
    }

    const bulge = len * 0.22;
    const cpX = midX + nx * bulge;
    const cpY = midY + ny * bulge;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cpX, cpY, x2, y2);
    ctx.strokeStyle = `rgba(40,30,20,${alpha.toFixed(3)})`;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
}

/**
 * Draw the world grid
 */
export function drawGrid(
    ctx: CanvasRenderingContext2D,
    worldW: number, worldH: number, gridSize: number = 100,
): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= worldW; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, worldH); ctx.stroke();
    }
    for (let y = 0; y <= worldH; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(worldW, y); ctx.stroke();
    }
    ctx.restore();
}
