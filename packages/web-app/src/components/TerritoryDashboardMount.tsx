import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { TerritoryDashboard } from './TerritoryDashboard';

let root: Root | null = null;

export function mountTerritoryDashboard(container: HTMLElement): void {
    if (!root) {
        root = createRoot(container);
    }

    root.render(
        <React.StrictMode>
            <TerritoryDashboard />
        </React.StrictMode>
    );
}

export function unmountTerritoryDashboard(): void {
    if (root) {
        root.unmount();
        root = null;
    }
}
