/**
 * TerritoryDashboard Component for RunRealm
 * Gamified interface for territory management with AI integration
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameFiUI } from './gamefi-ui';
import { AIService } from '../services/ai-service';
import { Web3Service } from '../services/web3-service';
import { EventBus } from '../core/event-bus';
export const TerritoryDashboard = ({ initialPosition = { lat: 0, lng: 0 }, gameMode = true, onTerritorySelect, onRouteGenerated }) => {
    // Core state
    const [playerStats, setPlayerStats] = useState({
        level: 1,
        totalDistance: 0,
        territoriesOwned: 0,
        realmBalance: 0,
        rank: 0
    });
    const [territories, setTerritories] = useState([]);
    const [activeChallenges, setActiveChallenges] = useState([]);
    const [ghostRunners, setGhostRunners] = useState([]);
    const [selectedTerritory, setSelectedTerritory] = useState(null);
    // UI state
    const [isLoading, setIsLoading] = useState(false);
    const [aiCoachMessage, setAiCoachMessage] = useState('Welcome to RunRealm! Connect your wallet to start claiming territories.');
    const [dashboardVisible, setDashboardVisible] = useState(false);
    const [currentRoute, setCurrentRoute] = useState(null);
    // Service refs
    const gamefiUI = useRef(null);
    const aiService = useRef(null);
    const web3Service = useRef(null);
    const eventBus = useRef(null);
    // Initialize services and UI
    useEffect(() => {
        const initializeServices = async () => {
            try {
                // Initialize services
                gamefiUI.current = GameFiUI.getInstance();
                aiService.current = AIService.getInstance();
                web3Service.current = Web3Service.getInstance();
                eventBus.current = EventBus.getInstance();
                await gamefiUI.current.init();
                if (gameMode) {
                    gamefiUI.current.enableGameFiMode();
                    setDashboardVisible(true);
                }
                // Set up event listeners
                setupEventListeners();
                console.log('TerritoryDashboard initialized');
            }
            catch (error) {
                console.error('Failed to initialize TerritoryDashboard:', error);
            }
        };
        initializeServices();
        return () => {
            if (gamefiUI.current) {
                gamefiUI.current.cleanup();
            }
        };
    }, [gameMode]);
    // Set up event listeners
    const setupEventListeners = useCallback(() => {
        if (!eventBus.current)
            return;
        // Territory events
        eventBus.current.on('territory:claimRequested', handleTerritoryClaimRequest);
        eventBus.current.on('territory:claimed', handleTerritoryClaimedSuccess);
        eventBus.current.on('game:challengeStarted', handleTerritoryContest);
        // AI events
        eventBus.current.on('ai:routeRequested', handleAIRouteRequest);
        eventBus.current.on('ghost:ready', handleGhostReady);
        eventBus.current.on('ghost:progress', handleGhostProgress);
        eventBus.current.on('ai:routeSuggested', handleCoachMessage);
        // Web3 events
        eventBus.current.on('web3:walletConnected', handleWalletConnected);
        eventBus.current.on('web3:transactionConfirmed', handleTransactionCompleted);
        // Run tracking events
        eventBus.current.on('run:started', handleRunStarted);
        eventBus.current.on('run:pointAdded', handleRunProgress);
        eventBus.current.on('run:cleared', handleRunCompleted);
    }, []);
    // Event handlers
    const handleTerritoryClaimRequest = useCallback(async () => {
        if (!selectedTerritory || !web3Service.current)
            return;
        setIsLoading(true);
        try {
            // const txHash = await web3Service.current.claimTerritory(
            //   selectedTerritory.geohash,
            //   selectedTerritory.estimatedReward
            // );
            const txHash = '0x123456789'; // Mock transaction hash
            if (gamefiUI.current) {
                gamefiUI.current.showRewardNotification(`🔄 Territory claim pending... (${txHash.slice(0, 8)}...)`, 'info');
            }
        }
        catch (error) {
            console.error('Territory claim failed:', error);
            if (gamefiUI.current) {
                gamefiUI.current.showRewardNotification('❌ Territory claim failed. Try again.', 'warning');
            }
        }
        finally {
            setIsLoading(false);
        }
    }, [selectedTerritory]);
    const handleTerritoryClaimedSuccess = useCallback((data) => {
        const newTerritory = {
            geohash: data.geohash,
            owner: data.owner,
            claimedAt: new Date(),
            lastActivity: new Date(),
            difficulty: data.difficulty || 50,
            estimatedReward: data.estimatedReward || 25,
            rarity: data.rarity || 'common',
            landmarks: data.landmarks || [],
            contestable: false,
            isOwned: true
        };
        setTerritories(prev => [...prev, newTerritory]);
        setPlayerStats(prev => ({
            ...prev,
            territoriesOwned: prev.territoriesOwned + 1,
            realmBalance: prev.realmBalance + newTerritory.estimatedReward
        }));
        if (gamefiUI.current) {
            gamefiUI.current.updatePlayerStats({
                territoriesOwned: playerStats.territoriesOwned + 1,
                realmBalance: playerStats.realmBalance + newTerritory.estimatedReward
            });
        }
    }, [playerStats]);
    const handleTerritoryContest = useCallback((data) => {
        const challenge = {
            id: data.challengeId,
            challenger: data.challenger,
            territory: data.territoryId,
            timeRemaining: data.timeLimit || 3600000, // 1 hour default
            reward: data.reward || 50
        };
        setActiveChallenges(prev => [...prev, challenge]);
        if (gamefiUI.current) {
            gamefiUI.current.showRewardNotification(`⚔️ Territory "${data.territoryId}" is under attack!`, 'warning');
        }
    }, []);
    const handleAIRouteRequest = useCallback(async (data) => {
        if (!aiService.current)
            return;
        setIsLoading(true);
        try {
            const routeProps = {
                startPoint: data.currentLocation || initialPosition,
                goalType: data.goals?.exploration ? 'exploration' : 'efficiency',
                distance: 2000, // 2km default
                difficulty: 50,
                estimatedReward: 35,
                landmarks: []
            };
            // Generate AI route using the AI service
            // const aiRoute = await aiService.current.generateOptimalRoute({
            //   startLocation: routeProps.startPoint,
            //   preferences: {
            //     distance: routeProps.distance,
            //     difficulty: 'medium',
            //     goals: [routeProps.goalType]
            //   }
            // });
            const aiRoute = null; // Mock AI route
            if (aiRoute) {
                routeProps.landmarks = aiRoute.keyPoints?.map((p) => p.name || 'Unknown') || [];
                routeProps.estimatedReward = Math.floor(aiRoute.estimatedReward || routeProps.estimatedReward);
            }
            setCurrentRoute(routeProps);
            if (onRouteGenerated) {
                onRouteGenerated(routeProps);
            }
            if (gamefiUI.current) {
                gamefiUI.current.updateCoachMessage(`🗺️ Perfect route found! ${routeProps.distance}m with ${routeProps.landmarks.length} landmarks. Estimated: +${routeProps.estimatedReward} $REALM`);
                gamefiUI.current.showRewardNotification(`📍 AI Route Generated: ${routeProps.distance}m exploration route`, 'info');
            }
        }
        catch (error) {
            console.error('AI route generation failed:', error);
            if (gamefiUI.current) {
                gamefiUI.current.updateCoachMessage('🤖 Oops! Route generation failed. Try again or explore manually.');
            }
        }
        finally {
            setIsLoading(false);
        }
    }, [initialPosition, onRouteGenerated]);
    const handleGhostReady = useCallback((data) => {
        const ghost = data.runner;
        setGhostRunners(prev => [...prev, ghost]);
        const mapService = window.RunRealm?.services?.mapService;
        const animationService = window.RunRealm?.services?.animationService;
        if (mapService && ghost.route) {
            mapService.drawGhostRoute(ghost.route);
        }
        if (animationService) {
            animationService.startGhostAnimation(ghost);
        }
        if (gamefiUI.current) {
            gamefiUI.current.showRewardNotification(`👻 ${ghost.name} has started running! Race against them to claim territories first.`, 'info');
            gamefiUI.current.updateCoachMessage(`👻 Ghost Runner spawned! They'll compete for nearby territories. Better get moving!`);
        }
    }, []);
    const handleGhostProgress = useCallback((data) => {
        setGhostRunners(prev => prev.map(ghost => {
            if (ghost.id === data.ghostId) {
                return { ...ghost, progress: data.progress };
            }
            return ghost;
        }));
    }, []);
    const handleCoachMessage = useCallback((data) => {
        const message = data.reasoning || 'AI Coach message';
        setAiCoachMessage(message);
        if (gamefiUI.current) {
            gamefiUI.current.updateCoachMessage(message);
        }
    }, []);
    const handleWalletConnected = useCallback((data) => {
        setPlayerStats(prev => ({ ...prev, realmBalance: data.balance || 0 }));
        if (gamefiUI.current) {
            gamefiUI.current.updatePlayerStats({ realmBalance: data.balance || 0 });
            gamefiUI.current.updateCoachMessage('🎉 Wallet connected! Start running to claim your first territory and earn $REALM tokens.');
        }
    }, []);
    const handleTransactionCompleted = useCallback((data) => {
        if (data.type === 'territory_claim') {
            // Transaction completed successfully
            if (gamefiUI.current) {
                gamefiUI.current.showRewardNotification(`✅ Territory claimed successfully! +${data.reward || 25} $REALM`, 'success');
            }
        }
    }, []);
    const handleRunStarted = useCallback(() => {
        if (gamefiUI.current) {
            gamefiUI.current.updateCoachMessage('🏃‍♂️ Great! You\'re running. Keep going to discover and claim new territories!');
        }
    }, []);
    const handleRunProgress = useCallback((data) => {
        const distance = data.totalDistance || 0;
        setPlayerStats(prev => ({ ...prev, totalDistance: distance }));
        if (gamefiUI.current) {
            gamefiUI.current.updatePlayerStats({ totalDistance: distance });
        }
        // Show territory preview if near a territory
        if (data.nearTerritory) {
            const territoryPreview = {
                geohash: data.nearTerritory.geohash,
                difficulty: Math.random() * 100,
                estimatedReward: Math.floor(20 + Math.random() * 60),
                rarity: generateRarity(),
                landmarks: data.nearTerritory.landmarks || ['Park', 'Bridge']
            };
            setSelectedTerritory({
                ...territoryPreview,
                owner: '',
                claimedAt: new Date(),
                lastActivity: new Date(),
                contestable: true,
                isOwned: false
            });
            if (gamefiUI.current) {
                gamefiUI.current.showTerritoryPreview(territoryPreview);
            }
            if (onTerritorySelect) {
                onTerritorySelect({
                    ...territoryPreview,
                    owner: '',
                    claimedAt: new Date(),
                    lastActivity: new Date(),
                    contestable: true,
                    isOwned: false
                });
            }
        }
    }, [onTerritorySelect]);
    const handleRunCompleted = useCallback((data) => {
        const distance = data.totalDistance || 0;
        const timeSpent = data.duration || 0;
        const averageSpeed = distance > 0 ? (distance / timeSpent) * 3600 : 0; // m/h
        // Calculate level progression
        const newLevel = Math.floor(distance / 10000) + 1; // Level up every 10km
        const leveledUp = newLevel > playerStats.level;
        setPlayerStats(prev => ({
            ...prev,
            level: Math.max(prev.level, newLevel),
            totalDistance: distance
        }));
        if (gamefiUI.current) {
            gamefiUI.current.updatePlayerStats({
                level: Math.max(playerStats.level, newLevel),
                totalDistance: distance
            });
            if (leveledUp) {
                gamefiUI.current.showRewardNotification(`🎉 Level Up! You're now level ${newLevel}. +${newLevel * 10} $REALM bonus!`, 'success');
            }
            gamefiUI.current.updateCoachMessage(`🏁 Run completed! ${Math.floor(distance)}m in ${Math.floor(timeSpent / 60)}min. ${leveledUp ? 'Level up!' : 'Keep going!'}`);
        }
    }, [playerStats.level]);
    // Helper functions
    const generateRarity = () => {
        const rand = Math.random();
        if (rand < 0.6)
            return 'common';
        if (rand < 0.8)
            return 'uncommon';
        if (rand < 0.92)
            return 'rare';
        if (rand < 0.99)
            return 'epic';
        return 'legendary';
    };
    // Component UI (minimal - mostly handled by GameFi UI)
    if (!dashboardVisible) {
        return null;
    }
    return (<div className="territory-dashboard-root">
      {/* Mobile-specific territory panel overlay */}
      <div className="mobile-territory-overlay" style={{ display: 'none' }}>
        {selectedTerritory && (<div className="mobile-territory-panel">
            <div className="territory-header">
              <h3>🗺️ {selectedTerritory.geohash}</h3>
              <button className="close-mobile-panel" onClick={() => setSelectedTerritory(null)}>
                ×
              </button>
            </div>
            <div className="territory-details">
              <div className="difficulty">
                Difficulty: {selectedTerritory.difficulty < 33 ? 'Easy' :
                selectedTerritory.difficulty < 67 ? 'Medium' : 'Hard'}
              </div>
              <div className="reward">
                Reward: +{selectedTerritory.estimatedReward} $REALM
              </div>
              <div className="rarity">
                Rarity: {selectedTerritory.rarity}
              </div>
            </div>
            <div className="territory-actions">
              <button className="claim-btn" onClick={() => handleTerritoryClaimRequest()} disabled={isLoading}>
                {isLoading ? '⏳ Claiming...' : '⚡ Claim Territory'}
              </button>
            </div>
          </div>)}
      </div>

      {/* Debug info (only in development) */}
      {process.env.NODE_ENV === 'development' && (<div className="dashboard-debug" style={{
                position: 'fixed',
                top: '10px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.8)',
                color: 'white',
                padding: '8px',
                borderRadius: '4px',
                fontSize: '12px',
                zIndex: 2000,
                pointerEvents: 'none'
            }}>
          Territories: {territories.length} | Challenges: {activeChallenges.length} | 
          Ghosts: {ghostRunners.filter(g => g.active).length} | Level: {playerStats.level}
        </div>)}

      <style>{`
        .territory-dashboard-root {
          position: relative;
          width: 100%;
          height: 100%;
        }

        .mobile-territory-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          z-index: 1500;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .mobile-territory-panel {
          background: linear-gradient(145deg, rgba(0, 20, 40, 0.95), rgba(0, 30, 60, 0.9));
          border: 2px solid rgba(0, 189, 0, 0.3);
          border-radius: 12px;
          padding: 20px;
          max-width: 400px;
          width: 100%;
        }

        .territory-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .territory-header h3 {
          color: #00ff88;
          margin: 0;
        }

        .close-mobile-panel {
          background: none;
          border: none;
          color: white;
          font-size: 24px;
          cursor: pointer;
        }

        .territory-details {
          margin-bottom: 20px;
          color: white;
        }

        .territory-details > div {
          margin-bottom: 8px;
          font-size: 14px;
        }

        .claim-btn {
          background: linear-gradient(45deg, #00bd00, #00ff88);
          color: white;
          border: none;
          border-radius: 8px;
          padding: 12px 20px;
          font-weight: 600;
          cursor: pointer;
          width: 100%;
          transition: all 0.2s ease;
        }

        .claim-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .claim-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 20px rgba(0, 189, 0, 0.3);
        }

        @media (max-width: 768px) {
          .mobile-territory-overlay {
            display: block;
          }
        }
      `}</style>
    </div>);
};
export default TerritoryDashboard;
