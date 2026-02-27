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
    color: string = 'white',
    borderColor: string = '#333',
): void {
    const { PADDING, BORDER_RADIUS, POINTER_SIZE, MAX_WIDTH, FONT_SIZE } = SPEECH_CONFIG;

    ctx.save();
    ctx.font = `${FONT_SIZE}px 'Inter', sans-serif`;

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

    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;

    // Bubble body
    ctx.fillStyle = color;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, bubbleX, bubbleY, bubbleW, bubbleH, BORDER_RADIUS);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.stroke();

    // Pointer
    ctx.beginPath();
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x - POINTER_SIZE, bubbleY + bubbleH);
    ctx.lineTo(x + POINTER_SIZE, bubbleY + bubbleH);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.stroke();

    // Text
    ctx.fillStyle = '#1a1a2e';
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
    drawSpeechBubble(ctx, x, y, text, '#f0f0ff', '#8888cc');
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
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
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
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= worldW; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, worldH); ctx.stroke();
    }
    for (let y = 0; y <= worldH; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(worldW, y); ctx.stroke();
    }
    ctx.restore();
}
