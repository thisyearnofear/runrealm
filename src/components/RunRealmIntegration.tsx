/**
 * RunRealm Integration Component
 * Shows how to integrate TerritoryDashboard with the main app
 */

import React, { useEffect, useRef, useState } from 'react';
import { RunRealmApp } from '../core/run-realm-app';
import TerritoryDashboard from './TerritoryDashboard';

interface RunRealmIntegrationProps {
  containerId?: string;
  gameMode?: boolean;
  showWalletButton?: boolean;
}

export const RunRealmIntegration: React.FC<RunRealmIntegrationProps> = ({
  containerId = 'mapbox-container',
  gameMode = true,
  showWalletButton = true,
}) => {
  const appRef = useRef<RunRealmApp | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<{ lat: number; lng: number }>({
    lat: 40.7128,
    lng: -74.006, // Default to NYC
  });
  const [selectedTerritory, setSelectedTerritory] = useState<any>(null);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Ensure the map container exists
        if (!document.getElementById(containerId)) {
          const mapContainer = document.createElement('div');
          mapContainer.id = containerId;
          mapContainer.style.cssText = `
            width: 100vw;
            height: 100vh;
            position: relative;
            z-index: 0;
          `;
          document.body.appendChild(mapContainer);
        }

        // Initialize RunRealm app
        appRef.current = RunRealmApp.getInstance();
        await appRef.current.initialize();

        if (gameMode) {
          appRef.current.enableGameMode();
        }

        // Get user's current position
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              setCurrentPosition({
                lat: position.coords.latitude,
                lng: position.coords.longitude,
              });
            },
            (error) => {
              console.warn('Could not get current position:', error);
            }
          );
        }

        setIsInitialized(true);
        console.log('RunRealm integration initialized');
      } catch (error) {
        console.error('Failed to initialize RunRealm:', error);
      }
    };

    initializeApp();

    return () => {
      if (appRef.current) {
        appRef.current.cleanup();
      }
    };
  }, [containerId, gameMode]);

  const handleConnectWallet = async () => {
    if (!appRef.current) return;

    try {
      const wallet = await appRef.current.connectWallet();
      setWalletConnected(true);
      console.log('Wallet connected:', wallet);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    }
  };

  const handleTerritorySelect = (territory: any) => {
    setSelectedTerritory(territory);
    console.log('Territory selected:', territory);
  };

  const handleRouteGenerated = (route: any) => {
    console.log('AI route generated:', route);
    // You could display route details or start navigation here
  };

  return (
    <div className="runrealm-integration">
      {/* Map container will be created programmatically */}

      {/* GameFi UI (Territory Dashboard) */}
      {isInitialized && gameMode && (
        <TerritoryDashboard
          initialPosition={currentPosition}
          gameMode={gameMode}
          onTerritorySelect={handleTerritorySelect}
          onRouteGenerated={handleRouteGenerated}
        />
      )}

      {/* Wallet Connection Button */}
      {showWalletButton && !walletConnected && (
        <div className="wallet-connection-overlay">
          <div className="wallet-panel">
            <h3>🚀 Ready to Earn $REALM?</h3>
            <p>Connect your wallet to start claiming territories and earning rewards!</p>
            <button type="button" className="connect-wallet-btn" onClick={handleConnectWallet}>
              🦊 Connect Wallet
            </button>
          </div>
        </div>
      )}

      {/* Territory Details Modal */}
      {selectedTerritory && (
        <div className="territory-modal-overlay" role="presentation">
          <div
            className="territory-modal"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSelectedTerritory(null);
              }
            }}
            role="dialog"
            tabIndex={-1}
          >
            <div className="modal-header">
              <h3>🗺️ Territory Details</h3>
              <button
                type="button"
                className="close-modal"
                onClick={() => setSelectedTerritory(null)}
              >
                ×
              </button>
            </div>
            <div className="modal-content">
              <div className="territory-info">
                <div>
                  <strong>Geohash:</strong> {selectedTerritory.geohash}
                </div>
                <div>
                  <strong>Difficulty:</strong>{' '}
                  {selectedTerritory.difficulty < 33
                    ? 'Easy'
                    : selectedTerritory.difficulty < 67
                      ? 'Medium'
                      : 'Hard'}
                </div>
                <div>
                  <strong>Estimated Reward:</strong> +{selectedTerritory.estimatedReward} $REALM
                </div>
                <div>
                  <strong>Rarity:</strong>
                  <span className={`rarity-badge ${selectedTerritory.rarity}`}>
                    {selectedTerritory.rarity}
                  </span>
                </div>
                {selectedTerritory.landmarks && selectedTerritory.landmarks.length > 0 && (
                  <div>
                    <strong>Landmarks:</strong>
                    <ul>
                      {selectedTerritory.landmarks.map((landmark: string, i: number) => (
                        <li key={i}>{landmark}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .runrealm-integration {
          position: relative;
          width: 100%;
          height: 100%;
        }

        .wallet-connection-overlay {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 1500;
          pointer-events: all;
        }

        .wallet-panel {
          background: linear-gradient(145deg, rgba(0, 20, 40, 0.95), rgba(0, 30, 60, 0.9));
          border: 2px solid rgba(0, 189, 0, 0.3);
          border-radius: 16px;
          padding: 32px;
          text-align: center;
          max-width: 400px;
          backdrop-filter: blur(10px);
          box-shadow: 0 16px 64px rgba(0, 0, 0, 0.5);
        }

        .wallet-panel h3 {
          color: #00ff88;
          margin: 0 0 16px 0;
          font-size: 24px;
        }

        .wallet-panel p {
          color: rgba(255, 255, 255, 0.9);
          margin: 0 0 24px 0;
          line-height: 1.5;
        }

        .connect-wallet-btn {
          background: linear-gradient(45deg, #00bd00, #00ff88);
          color: white;
          border: none;
          border-radius: 12px;
          padding: 16px 32px;
          font-weight: 700;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.3s ease;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .connect-wallet-btn:hover {
          background: linear-gradient(45deg, #00ff88, #00bd00);
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(0, 189, 0, 0.4);
        }

        .territory-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          z-index: 1600;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .territory-modal {
          background: linear-gradient(145deg, rgba(0, 20, 40, 0.95), rgba(0, 30, 60, 0.9));
          border: 2px solid rgba(0, 189, 0, 0.3);
          border-radius: 12px;
          padding: 24px;
          max-width: 500px;
          width: 100%;
          max-height: 80vh;
          overflow-y: auto;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .modal-header h3 {
          color: #00ff88;
          margin: 0;
          font-size: 20px;
        }

        .close-modal {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.7);
          font-size: 28px;
          cursor: pointer;
          padding: 0;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          transition: all 0.2s ease;
        }

        .close-modal:hover {
          color: #ff4444;
          background: rgba(255, 68, 68, 0.1);
        }

        .territory-info {
          color: white;
        }

        .territory-info > div {
          margin-bottom: 12px;
          font-size: 14px;
        }

        .territory-info strong {
          color: #00ff88;
        }

        .rarity-badge {
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          margin-left: 8px;
        }

        .rarity-badge.common {
          background: rgba(128, 128, 128, 0.3);
          color: #c0c0c0;
        }

        .rarity-badge.uncommon {
          background: rgba(0, 255, 0, 0.3);
          color: #00ff00;
        }

        .rarity-badge.rare {
          background: rgba(0, 100, 255, 0.3);
          color: #0064ff;
        }

        .rarity-badge.epic {
          background: rgba(160, 32, 240, 0.3);
          color: #a020f0;
        }

        .rarity-badge.legendary {
          background: rgba(255, 165, 0, 0.3);
          color: #ffa500;
        }

        .territory-info ul {
          margin: 8px 0 0 16px;
          color: rgba(255, 255, 255, 0.8);
        }

        .territory-info li {
          margin-bottom: 4px;
        }

        @media (max-width: 768px) {
          .wallet-panel {
            margin: 20px;
            padding: 24px;
          }

          .territory-modal {
            margin: 20px;
            padding: 20px;
          }
        }
      `}</style>
    </div>
  );
};

export default RunRealmIntegration;
