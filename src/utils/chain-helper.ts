export class ChainHelper {
  static getSimpleName(chainId: number): string {
    const names = {
      1: 'Ethereum',
      56: 'BSC', 
      137: 'Polygon',
      7001: 'ZetaChain'
    };
    return names[chainId] || `Chain ${chainId}`;
  }

  static getGasEstimate(chainId: number): string {
    const estimates = {
      1: '$5-15',
      56: '$0.20-0.50', 
      137: '$0.01-0.10',
      7001: 'Free*'
    };
    return estimates[chainId] || 'Unknown';
  }

  static shouldRecommendChain(chainId: number): boolean {
    // Recommend cheaper chains for territory claiming
    return [56, 137, 7001].includes(chainId);
  }
}
