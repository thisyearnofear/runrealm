/**
 * GameService - GameFi mechanics and progression system
 * CLEAN: Centralized game logic separated from UI concerns
 * ENHANCEMENT FIRST: Extends existing BaseService patterns
 */
import { BaseService } from "../core/base-service";
export declare class GameService extends BaseService {
    constructor();
    protected onInitialize(): Promise<void>;
    startGame(): Promise<void>;
    endGame(): Promise<void>;
    updatePlayerStats(stats: any): Promise<void>;
    claimReward(reward: any): Promise<void>;
}
