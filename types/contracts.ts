// Generated contract interfaces will go here
export interface TerritoryNFT {
  mint(to: string, tokenId: string, metadata: string): Promise<void>;
  transferFrom(from: string, to: string, tokenId: string): Promise<void>;
  ownerOf(tokenId: string): Promise<string>;
}

export interface RealmToken {
  transfer(to: string, amount: number): Promise<void>;
  balanceOf(address: string): Promise<number>;
  approve(spender: string, amount: number): Promise<void>;
}

export interface TerritoryManager {
  claimTerritory(geohash: string, metadata: string): Promise<string>;
  challengeTerritory(tokenId: string): Promise<void>;
  resolveChallenge(challengeId: string): Promise<void>;
}