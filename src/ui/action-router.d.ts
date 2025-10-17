export type UIAction = 'ai.requestRoute' | 'ai.requestGhostRunner' | 'ai.showRoute' | 'ai.quickPrompt' | 'ai.startRun' | 'territory.toggle';
export declare const AI_DEFAULTS: {
    readonly ROUTE: {
        readonly distance: number | undefined;
        readonly difficulty: number | undefined;
        readonly goals: string[];
    };
    readonly GHOST_RUNNER: {
        readonly difficulty: number;
    };
};
export declare const ActionRouter: {
    dispatch(action: UIAction, payload?: any): void;
};
