/** Direction enum — 4 cardinal for sprite rows, 8 for movement */
export enum Direction {
    UP = 0,
    LEFT = 1,
    DOWN = 2,
    RIGHT = 3,
}

/** The 8-direction movement mapped to nearest cardinal for sprite row */
export type MoveDirection =
    | 'up' | 'up-right' | 'right' | 'down-right'
    | 'down' | 'down-left' | 'left' | 'up-left';

export function moveDirectionToSpriteRow(dir: MoveDirection): Direction {
    switch (dir) {
        case 'up':
        case 'up-left':
        case 'up-right':
            return Direction.UP;
        case 'down':
        case 'down-left':
        case 'down-right':
            return Direction.DOWN;
        case 'left':
            return Direction.LEFT;
        case 'right':
            return Direction.RIGHT;
    }
}

/** Agent visual / AI states */
export enum AgentState {
    WANDERING = 'WANDERING',
    IDLE = 'IDLE',
    THINKING = 'THINKING',
    WALKING_TO_DISCUSSION = 'WALKING_TO_DISCUSSION',
    DISCUSSING = 'DISCUSSING',
    TALKING = 'TALKING',  // currently speaking in discussion
}

/** Character data as loaded from all-characters.json */
export interface CharacterData {
    id: number;
    gender: 'male' | 'female';
    description: string;
    name: string;
    persona: string;
    attributes: {
        skin_color: string;
        hair_color: string;
        hair_style: string;
        shirt_color: string;
        leg_color: string;
        leg_type: 'pants' | 'leggings';
        shoe_color: string;
    };
    sprites: {
        idle: { url: string; generated: string; layers: string[] };
        walk: { url: string; generated: string; layers: string[] };
        sit: { url: string; generated: string; layers: string[] };
    };
}

export interface CharactersJSON {
    version: string;
    totalCharacters: number;
    generatedAt: string;
    characters: Record<string, CharacterData>;
}

/** Runtime agent state for the store */
export interface AgentRuntime {
    id: string;           // e.g. "character_0001"
    data: CharacterData;
    trace: string[];      // accumulated reasoning entries
    answer: string;       // current answer (overwritten each think)
    thoughtBubble: string;
    conversationBubble: string;
}

/** Theme cluster for results */
export interface ThemeCluster {
    label: string;
    count: number;
    agentIds: string[];
    sentiment?: 'positive' | 'negative' | 'neutral';
}

/** A saved question + results */
export interface QuestionHistory {
    id: string;
    user_id: string;
    question: string;
    clustered_results: {
        themes: ThemeCluster[];
        total_agents: number;
    };
    created_at: string;
}

/** A stored user memory */
export interface UserMemory {
    id: string;
    user_id: string;
    memory: string;
    source_question: string;
    created_at: string;
}

/** Discussion group */
export interface DiscussionGroup {
    agentIds: string[];
    centerX: number;
    centerY: number;
    conversationLog: string[];
    currentSpeakerIndex: number;
    completed: boolean;
}
