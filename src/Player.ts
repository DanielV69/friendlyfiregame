import { SpeechBubble } from "./SpeechBubble";
import { Entity } from './Entity';
import { Game } from "./game";
import {
    PIXEL_PER_METER, GRAVITY, MAX_PLAYER_SPEED, PLAYER_ACCELERATION, PLAYER_JUMP_HEIGHT,
    PLAYER_IDLE_ANIMATION, PLAYER_RUNNING_ANIMATION
} from "./constants";
import { NPC } from './NPC';
import { loadImage } from "./graphics";
import { Sprites } from "./Sprites";

enum SpriteIndex {
    IDLE0 = 0,
    IDLE1 = 1,
    IDLE2 = 2,
    IDLE3 = 3,
    WALK0 = 4,
    WALK1 = 5,
    WALK2 = 6,
    WALK3 = 7,
    JUMP = 8,
    FALL = 9
}

export class Player extends Entity {
    private flying = false;
    private direction = 1;
    private spriteIndex = SpriteIndex.IDLE0;
    private sprites!: Sprites;
    private moveLeft: boolean = false;
    private moveRight: boolean = false;
    private moveX = 0;
    private moveY = 0;
    private debug = false;

    private interactionRange = 35;
    private closestNPC: NPC | null = null;
    public activeSpeechBubble: SpeechBubble | null = null;
    public isInDialog = false;

    public constructor(game: Game, x: number, y: number) {
        super(game, x, y, 0.5 * PIXEL_PER_METER, 1.85 * PIXEL_PER_METER);
        document.addEventListener("keydown", event => this.handleKeyDown(event));
        document.addEventListener("keyup", event => this.handleKeyUp(event));
    }

    public async load(): Promise<void> {
         this.sprites = new Sprites(await loadImage("sprites/main.png"), 4, 3);
    }

    private handleKeyDown(event: KeyboardEvent) {
        if (event.key === "ArrowRight" && !this.isInDialog) {
            this.direction = 1;
            this.moveRight = true;
        } else if (event.key === "ArrowLeft" && !this.isInDialog) {
            this.direction = -1;
            this.moveLeft = true;
        }
        if (event.key === "Enter") {
            if (this.closestNPC && this.closestNPC.hasDialog) {
                this.closestNPC.startDialog();
            }
        }
        if (event.key === " " && !event.repeat && !this.flying && !this.isInDialog) {
            this.moveY = Math.sqrt(2 * PLAYER_JUMP_HEIGHT * GRAVITY);
        }
    }

    private handleKeyUp(event: KeyboardEvent) {
        if (event.key === "ArrowRight") {
            this.moveRight = false;
        } else if (event.key === "ArrowLeft") {
            this.moveLeft = false;
        }
    }

    draw(ctx: CanvasRenderingContext2D): void {
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = "red";
        ctx.translate(this.x, -this.y);
        if (this.debug) {
            ctx.strokeRect(-this.width / 2, -this.height, this.width, this.height);
        }
        if (this.direction < 0) {
            ctx.scale(-1, 1);
        }
        this.sprites.draw(ctx, this.spriteIndex, 1.2);
        ctx.restore();

        if (this.closestNPC && this.closestNPC.hasDialog) {
            this.drawDialogTip(ctx);
        }
    }

    drawDialogTip(ctx: CanvasRenderingContext2D): void {
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = "white";
        ctx.strokeText("press 'Enter' to talk", this.x - (this.width / 2), -this.y + 20);
        ctx.restore();
        this.activeSpeechBubble?.draw(ctx, this.x, this.y + 30);
    }

    /**
     * If given coordinate collides with the world then the first free Y coordinate above is returned. This can
     * be used to unstuck an object after a new position was set.
     *
     * @param x - X coordinate of current position.
     * @param y - Y coordinate of current position.
     * @return The Y coordinate of the ground below the given coordinate.
     */
    private pullOutOfGround(): number {
        let pulled = 0;
        const world = this.game.world;
        const height = world.getHeight();
        while (this.y < height && world.collidesWith(this.x, this.y)) {
            pulled++;
            this.y++;
        }
        return pulled;
    }

    /**
     * If given coordinate collides with the world then the first free Y coordinate above is returned. This can
     * be used to unstuck an object after a new position was set.
     *
     * @param x - X coordinate of current position.
     * @param y - Y coordinate of current position.
     * @return The Y coordinate of the ground below the given coordinate.
     */
    private pullOutOfCeiling(): number {
        let pulled = 0;
        const world = this.game.world;
        while (this.y > 0 && world.collidesWith(this.x, this.y + this.height)) {
            pulled++;
            this.y--;
        }
        return pulled;
    }

    private pullOutOfWall(): number {
        let pulled = 0;
        const world = this.game.world;
        if (this.direction > 0) {
            while (world.collidesWithVerticalLine(this.x + this.width / 2, this.y + this.height * 3 / 4, this.height / 2)) {
                this.x--;
                pulled++;
            }
        } else {
            while (world.collidesWithVerticalLine(this.x - this.width / 2, this.y + this.height * 3 / 4, this.height / 2)) {
                this.x++;
                pulled++;
            }
        }
        return pulled;
    }

    update(dt: number): void {
        const world = this.game.world;

        // Move the player
        this.x += this.moveX * PIXEL_PER_METER * dt;
        this.y += this.moveY * PIXEL_PER_METER * dt;

        // Check collision with the environment and correct player position and movement
        if (this.pullOutOfGround() !== 0 || this.pullOutOfCeiling() !== 0) {
            this.moveY = 0;
        }
        if (this.pullOutOfWall() !== 0) {
            this.moveX = 0;
        }

        // Player dropping down when there is no ground below
        if (world.collidesWith(this.x, this.y - 1) === 0) {
            this.moveY -= GRAVITY * dt;
        } else {
            this.moveY = 0;
        }

        // Player moving right
        if (this.moveRight) {
            this.moveX = Math.min(MAX_PLAYER_SPEED, this.moveX + PLAYER_ACCELERATION * dt);
        } else if (this.moveLeft) {
            this.moveX = Math.max(-MAX_PLAYER_SPEED, this.moveX - PLAYER_ACCELERATION * dt);
        } else {
            if (this.moveX > 0) {
                this.moveX = Math.max(0, this.moveX - PLAYER_ACCELERATION * dt);
            } else {
                this.moveX = Math.min(0, this.moveX + PLAYER_ACCELERATION * dt);
            }
        }

        // Set sprite index depending on movement
        if (this.moveX === 0 && this.moveY === 0) {
            this.spriteIndex = getSpriteIndex(SpriteIndex.IDLE0, PLAYER_IDLE_ANIMATION);
            this.flying = false;
        } else {
            if (this.moveY > 0) {
                this.spriteIndex = SpriteIndex.JUMP;
                this.flying = true;
            } else if (this.moveY < 0 && this.y - world.getGround(this.x, this.y) > 10) {
                this.spriteIndex = SpriteIndex.FALL;
                this.flying = true;
            } else {
                this.spriteIndex = getSpriteIndex(SpriteIndex.WALK0, PLAYER_RUNNING_ANIMATION);
                this.flying = false;
            }
        }

        // check for npc in interactionRange
        const closestEntity = this.getClosestEntityInRange(this.interactionRange);
        if (closestEntity instanceof NPC) {
            this.closestNPC = closestEntity;
        } else {
            this.closestNPC = null;
        }
    }
}

function getSpriteIndex(startIndex: number, delays: number[]): number {
    const duration = delays.reduce((duration, delay) => duration + delay, 0);
    let time = Date.now() % duration;
    return startIndex + delays.findIndex(value => (time -= value) <= 0);
}
