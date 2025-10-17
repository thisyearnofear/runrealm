/**
 * TerritoryDashboard Component for RunRealm
 * Gamified interface for territory management with AI integration
 */
import React from 'react';
interface Territory {
    geohash: string;
    owner: string;
    claimedAt: Date;
    lastActivity: Date;
    difficulty: number;
    estimatedReward: number;
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
    landmarks: string[];
    contestable: boolean;
    isOwned: boolean;
}
interface AIRouteProps {
    startPoint: {
        lat: number;
        lng: number;
    };
    goalType: 'exploration' | 'competition' | 'efficiency';
    distance: number;
    difficulty: number;
    estimatedReward: number;
    landmarks: string[];
}
export interface TerritoryDashboardProps {
    initialPosition?: {
        lat: number;
        lng: number;
    };
    gameMode?: boolean;
    onTerritorySelect?: (territory: Territory) => void;
    onRouteGenerated?: (route: AIRouteProps) => void;
}
export declare const TerritoryDashboard: React.FC<TerritoryDashboardProps>;
export default TerritoryDashboard;
