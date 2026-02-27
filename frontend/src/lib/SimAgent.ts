/**
 * SimAgent – animated agent on the canvas
 * Handles movement, sprite animation, state transitions for discussions
 */

import {
    Direction,
    AgentState,
    type MoveDirection,
    moveDirectionToSpriteRow,
    type CharacterData,
} from '@/src/types/agent';
import { WORLD_CONFIG, AGENT_CONFIG, DISCUSSION_CONFIG } from './world';
import { drawSprite, drawShadow, drawSpeechBubble, drawThoughtBubble } from './canvas-utils';

const EIGHT_DIRS: MoveDirection[] = [
    'up', 'up-right', 'right', 'down-right',
    'down', 'down-left', 'left', 'up-left',
];

const DIR_VECTORS: Record<MoveDirection, { dx: number; dy: number }> = {
    'up': { dx: 0, dy: -1 },
    'up-right': { dx: 0.71, dy: -0.71 },
    'right': { dx: 1, dy: 0 },
    'down-right': { dx: 0.71, dy: 0.71 },
    'down': { dx: 0, dy: 1 },
    'down-left': { dx: -0.71, dy: 0.71 },
    'left': { dx: -1, dy: 0 },
    'up-left': { dx: -0.71, dy: -0.71 },
};

function pickRandom8Dir(): MoveDirection {
    return EIGHT_DIRS[Math.floor(Math.random() * EIGHT_DIRS.length)];
}

export class SimAgent {
    // Identity
    id: string;
    data: CharacterData;

    // Position & movement
    x: number;
    y: number;
    vx: number = 0;
    vy: number = 0;
    moveDir: MoveDirection = 'down';

    // Animation
    frameIndex: number = 0;
    spriteRow: Direction = Direction.DOWN;
    tickCount: number = 0;

    // State
    state: AgentState = AgentState.WANDERING;

    // Bubbles
    thoughtText: string = '';
    thoughtTimer: number = 0;
    speechText: string = '';
    speechTimer: number = 0;

    // Discussion target
    discussionTargetX: number = 0;
    discussionTargetY: number = 0;
    discussionCenterX: number = 0;
    discussionCenterY: number = 0;

    // Sprites
    walkImage: HTMLImageElement | null = null;
    walkLoaded: boolean = false;
    idleImage: HTMLImageElement | null = null;
    idleLoaded: boolean = false;

    constructor(data: CharacterData, x: number, y: number) {
        this.id = `character_${String(data.id).padStart(4, '0')}`;
        this.data = data;
        this.x = x;
        this.y = y;

        // Random initial direction
        this.setRandomDirection();
        this.loadSprites();
    }

    /** Load walk and idle spritesheets */
    private loadSprites(): void {
        // Walk sprite
        this.walkImage = new Image();
        this.walkImage.crossOrigin = 'anonymous';
        this.walkImage.onload = () => { this.walkLoaded = true; };
        this.walkImage.onerror = () => { this.walkLoaded = false; };
        this.walkImage.src = this.data.sprites.walk.url;

        // Idle sprite
        this.idleImage = new Image();
        this.idleImage.crossOrigin = 'anonymous';
        this.idleImage.onload = () => { this.idleLoaded = true; };
        this.idleImage.onerror = () => { this.idleLoaded = false; };
        this.idleImage.src = this.data.sprites.idle.url;
    }

    /** Pick a random 8-direction and set velocity */
    setRandomDirection(): void {
        this.moveDir = pickRandom8Dir();
        const v = DIR_VECTORS[this.moveDir];
        this.vx = v.dx * AGENT_CONFIG.SPEED;
        this.vy = v.dy * AGENT_CONFIG.SPEED;
        this.spriteRow = moveDirectionToSpriteRow(this.moveDir);
    }

    /** Main update tick */
    update(): void {
        this.updateTimers();

        switch (this.state) {
            case AgentState.WANDERING:
            case AgentState.THINKING:
                this.moveWander();
                this.animateWalk();
                break;

            case AgentState.WALKING_TO_DISCUSSION:
                this.moveToTarget();
                this.animateWalk();
                break;

            case AgentState.IDLE:
            case AgentState.DISCUSSING:
            case AgentState.TALKING:
                // Stand still, idle animation
                this.animateIdle();
                break;
        }
    }

    /** Decrement bubble timers */
    private updateTimers(): void {
        const dt = 16.67; // ~60fps
        if (this.thoughtTimer > 0) {
            this.thoughtTimer -= dt;
            if (this.thoughtTimer <= 0) this.thoughtText = '';
        }
        if (this.speechTimer > 0) {
            this.speechTimer -= dt;
            if (this.speechTimer <= 0) this.speechText = '';
        }
    }

    /** Wander: random direction changes, bounce off walls */
    private moveWander(): void {
        this.x += this.vx;
        this.y += this.vy;

        // Bounce off boundaries
        if (this.x < 0 || this.x > WORLD_CONFIG.WIDTH) {
            this.vx *= -1;
            this.x = Math.max(0, Math.min(WORLD_CONFIG.WIDTH, this.x));
            this.updateDirFromVelocity();
        }
        if (this.y < 0 || this.y > WORLD_CONFIG.HEIGHT) {
            this.vy *= -1;
            this.y = Math.max(0, Math.min(WORLD_CONFIG.HEIGHT, this.y));
            this.updateDirFromVelocity();
        }

        // Random direction change
        if (Math.random() < AGENT_CONFIG.DIRECTION_CHANGE_CHANCE) {
            this.setRandomDirection();
        }
    }

    /** Walk toward discussion target */
    private moveToTarget(): void {
        const dx = this.discussionTargetX - this.x;
        const dy = this.discussionTargetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 3) {
            this.x = this.discussionTargetX;
            this.y = this.discussionTargetY;
            this.vx = 0;
            this.vy = 0;
            this.state = AgentState.DISCUSSING;
            this.facePoint(this.discussionCenterX, this.discussionCenterY);
            return;
        }

        const speed = AGENT_CONFIG.SPEED * 1.5;
        this.vx = (dx / dist) * speed;
        this.vy = (dy / dist) * speed;
        this.x += this.vx;
        this.y += this.vy;
        this.updateDirFromVelocity();
    }

    /** Determine MoveDirection from current velocity */
    private updateDirFromVelocity(): void {
        const angle = Math.atan2(this.vy, this.vx);
        // Map angle to 8 directions
        const idx = Math.round(((angle + Math.PI) / (Math.PI * 2)) * 8) % 8;
        // angle=0 is right, going clockwise
        const map: MoveDirection[] = ['left', 'up-left', 'up', 'up-right', 'right', 'down-right', 'down', 'down-left'];
        this.moveDir = map[idx];
        this.spriteRow = moveDirectionToSpriteRow(this.moveDir);
    }

    /** Face a point */
    facePoint(px: number, py: number): void {
        const dx = px - this.x;
        const dy = py - this.y;
        if (Math.abs(dx) > Math.abs(dy)) {
            this.spriteRow = dx > 0 ? Direction.RIGHT : Direction.LEFT;
        } else {
            this.spriteRow = dy > 0 ? Direction.DOWN : Direction.UP;
        }
    }

    /** Walk animation frame cycling */
    private animateWalk(): void {
        this.tickCount += AGENT_CONFIG.ANIMATION_SPEED;
        if (this.tickCount >= 1) {
            this.tickCount = 0;
            this.frameIndex = (this.frameIndex + 1) % AGENT_CONFIG.WALK_FRAMES;
        }
    }

    /** Idle animation (slower) */
    private animateIdle(): void {
        this.tickCount += AGENT_CONFIG.ANIMATION_SPEED * 0.3;
        if (this.tickCount >= 1) {
            this.tickCount = 0;
            this.frameIndex = (this.frameIndex + 1) % AGENT_CONFIG.IDLE_FRAMES;
        }
    }

    /** Show a thought bubble */
    showThought(text: string, durationMs: number = 5000): void {
        this.thoughtText = text;
        this.thoughtTimer = durationMs;
    }

    /** Show a speech bubble (for discussions) */
    showSpeech(text: string, durationMs: number = 4000): void {
        this.speechText = text;
        this.speechTimer = durationMs;
    }

    /** Start walking to a discussion position */
    walkToDiscussion(targetX: number, targetY: number, centerX: number, centerY: number): void {
        this.discussionTargetX = targetX;
        this.discussionTargetY = targetY;
        this.discussionCenterX = centerX;
        this.discussionCenterY = centerY;
        this.state = AgentState.WALKING_TO_DISCUSSION;
    }

    /** Return to wandering */
    resetToWandering(): void {
        this.state = AgentState.WANDERING;
        this.speechText = '';
        this.speechTimer = 0;
        this.setRandomDirection();
    }

    /** Draw this agent */
    draw(ctx: CanvasRenderingContext2D): void {
        const w = AGENT_CONFIG.WIDTH;
        const h = AGENT_CONFIG.HEIGHT;

        // Shadow
        drawShadow(ctx, this.x, this.y, w);

        // Choose sprite based on state
        const isMoving = this.state === AgentState.WANDERING
            || this.state === AgentState.THINKING
            || this.state === AgentState.WALKING_TO_DISCUSSION;

        if (isMoving && this.walkLoaded && this.walkImage) {
            drawSprite(ctx, this.walkImage, this.frameIndex, this.spriteRow, this.x, this.y, w, h,
                AGENT_CONFIG.WALK_FRAMES, AGENT_CONFIG.WALK_ROWS);
        } else if (this.idleLoaded && this.idleImage) {
            drawSprite(ctx, this.idleImage, this.frameIndex, this.spriteRow, this.x, this.y, w, h,
                AGENT_CONFIG.IDLE_FRAMES, AGENT_CONFIG.IDLE_ROWS);
        }

        // Name label
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.data.name || `Agent ${this.data.id}`, this.x, this.y + h / 2 + 12);
        ctx.restore();

        // Thought bubble (thinking state)
        if (this.thoughtText) {
            drawThoughtBubble(ctx, this.x, this.y - h / 2, this.thoughtText);
        }

        // Speech bubble (discussion)
        if (this.speechText) {
            drawSpeechBubble(ctx, this.x, this.y - h / 2 - (this.thoughtText ? 40 : 0), this.speechText);
        }
    }
}
