/**
 * World configuration and constants
 */

export const WORLD_CONFIG = {
    WIDTH: 2000,
    HEIGHT: 1200,
    NUM_AGENTS: 70, // Configurable: how many agents to spawn
} as const;

export const AGENT_CONFIG = {
    WIDTH: 64,
    HEIGHT: 64,
    HITBOX_RADIUS: 10,
    SPEED: 0.5,
    ANIMATION_SPEED: 0.2,
    DIRECTION_CHANGE_CHANCE: 0.01,
    WALK_FRAMES: 9,    // walk spritesheet: 9 columns
    WALK_ROWS: 4,      // 4 direction rows
    IDLE_FRAMES: 2,    // idle spritesheet: 2 columns
    IDLE_ROWS: 4,      // 4 direction rows
} as const;

export const SPEECH_CONFIG = {
    DURATION_MS: 5000,
    PADDING: 10,
    BORDER_RADIUS: 8,
    POINTER_SIZE: 8,
    MAX_WIDTH: 200,
    FONT_SIZE: 11,
} as const;

export const CAMERA_CONFIG = {
    MIN_ZOOM: 0.3,
    MAX_ZOOM: 4,
    ZOOM_SENSITIVITY: 0.001,
    DEFAULT_ZOOM: 1,
} as const;

export const DISCUSSION_CONFIG = {
    CIRCLE_RADIUS: 42,       // radius of the discussion circle (0.7x)
    MIN_GROUP_SIZE: 2,
    MAX_GROUP_SIZE: 6,
    PROXIMITY_THRESHOLD: 200, // distance for "nearby" agents
    SPEECH_DELAY_MS: 2000,    // delay between speakers
} as const;
